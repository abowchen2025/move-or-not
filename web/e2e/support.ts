/**
 * Playwright 共用工具：以 page.route 模擬 API，並控制「伺服器時間」與瀏覽器時鐘（PLAN §4.4）。
 */
import type { Page } from '@playwright/test';
import type { RecordDto } from '../src/api/types';
import { getStory } from '../src/stories';
import { makeState, seasonsList, taipeiIso, START_DATE } from '../src/testing/fixtures';
import { taipeiDate } from '../src/time/taipei';

export interface ApiCall {
  method: string;
  path: string;
  /** Authorization 標頭是否為正確的密語（不記錄密語本身） */
  authorized: boolean;
  body: unknown;
}

/** 建置時的假 API 位址；所有對它的請求都由 MockApi 回應 */
export const MOCK_API_BASE = 'http://api.e2e.test';

export const story = getStory('season-1')!;

export class MockApi {
  /** 伺服器的現在（epoch 毫秒），與瀏覽器時鐘分開控制 */
  serverNow: number;
  records: RecordDto[] = [];
  seasons = ['season-1'];
  /** 連不上（模擬服務關閉） */
  down = false;
  /** 回應這個 HTTP 狀態碼（模擬伺服器錯誤） */
  failStatus: number | null = null;
  /** 只讓寫入請求（PUT、DELETE）回這個狀態碼（D-40） */
  writeFailStatus: number | null = null;
  /** false：PUT 成功但不保存（同一天反覆送出時不會出現覆蓋確認） */
  persist = true;
  /**
   * 正確的管理密語：每個測試在執行時隨機產生，不寫死在程式碼裡（CLAUDE.md §3.4）。
   * 驗證失敗 5 次後一律回 429（D-25）。
   */
  readonly passphrase = `e2e-${crypto.randomUUID()}`;
  authFailures = 0;
  readonly requests: string[] = [];
  readonly calls: ApiCall[] = [];

  constructor(serverNow: number) {
    this.serverNow = serverNow;
  }

  statePaths(): string[] {
    return this.requests.filter((path) => path.endsWith('/state'));
  }

  /** 寫入相關的請求（不含讀取 state） */
  writes(method?: string): ApiCall[] {
    return this.calls.filter(
      (call) => call.method !== 'GET' && (method === undefined || call.method === method),
    );
  }

  /** 依 D-25 檢查密語：回傳錯誤時的回應內容，正確時為 null */
  #auth(header: string | undefined): { status: number; code: string } | null {
    if (this.authFailures >= 5) return { status: 429, code: 'TOO_MANY_ATTEMPTS' };
    if (header === `Bearer ${this.passphrase}`) return null;
    this.authFailures += 1;
    return { status: 401, code: 'UNAUTHORIZED' };
  }

  async install(page: Page): Promise<void> {
    await page.route(`${MOCK_API_BASE}/**`, async (route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());
      const method = request.method();
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Cache-Control': 'no-store',
      };
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
      this.requests.push(pathname);
      const authHeader = request.headers()['authorization'];
      const body: unknown = request.postData() ? JSON.parse(request.postData()!) : null;
      this.calls.push({
        method,
        path: pathname,
        authorized: authHeader === `Bearer ${this.passphrase}`,
        body,
      });
      if (this.down) return route.abort('connectionrefused');
      const error = (status: number, code: string) =>
        route.fulfill({ status, headers, json: { error: { code, message: 'x' } } });

      if (method !== 'GET' || pathname.endsWith('/export')) {
        const denied = this.#auth(authHeader);
        if (denied) return error(denied.status, denied.code);
        if (pathname === '/api/auth/check') return route.fulfill({ status: 204, headers });
        if (pathname.endsWith('/export')) {
          return route.fulfill({
            headers: { ...headers, 'Content-Disposition': 'attachment; filename="season-1.json"' },
            json: { schemaVersion: 1, seasonId: 'season-1', records: this.records },
          });
        }
        if (this.writeFailStatus !== null) return error(this.writeFailStatus, 'INTERNAL_ERROR');
        const write = /^\/api\/seasons\/([^/]+)\/records\/([^/]+)$/.exec(pathname);
        if (!write) return error(404, 'SEASON_NOT_FOUND');
        const date = decodeURIComponent(write[2]!);
        const existing = this.records.find((r) => r.date === date);
        if (method === 'DELETE') {
          if (!existing) return error(404, 'RECORD_NOT_FOUND');
          this.records = this.records.filter((r) => r !== existing);
          return route.fulfill({ status: 204, headers });
        }
        const today = taipeiDate(this.serverNow);
        if (date < START_DATE || date > today) return error(422, 'INVALID_DATE');
        const input = body as { proposed: boolean; executed: boolean; note: string | null };
        if (input.executed && !input.proposed) return error(422, 'EXECUTED_REQUIRES_PROPOSED');
        const saved: RecordDto = {
          date,
          proposed: input.proposed,
          executed: input.executed,
          note: input.note ?? existing?.note ?? '',
          updatedAt: taipeiIso(this.serverNow),
        };
        if (this.persist) {
          this.records = [...this.records.filter((r) => r.date !== date), saved];
        }
        return route.fulfill({ headers, json: saved });
      }

      if (this.failStatus !== null) {
        return route.fulfill({
          status: this.failStatus,
          headers,
          json: { error: { code: 'INTERNAL_ERROR', message: 'x' } },
        });
      }
      if (pathname === '/api/seasons') {
        return route.fulfill({ headers, json: seasonsList(...this.seasons) });
      }
      const match = /^\/api\/seasons\/([^/]+)\/state$/.exec(pathname);
      if (match && this.seasons.includes(match[1]!)) {
        const state = makeState({
          serverNow: this.serverNow,
          records: this.records,
          seasonId: match[1]!,
        });
        return route.fulfill({ headers, json: state });
      }
      return route.fulfill({
        status: 404,
        headers,
        json: { error: { code: 'SEASON_NOT_FOUND', message: 'x' } },
      });
    });
  }
}

/** 安裝假時鐘、模擬 API，打開頁面並等到第一次讀取完成。 */
export async function openPage(
  page: Page,
  api: MockApi,
  options: {
    browserNow: number;
    path?: string;
    waitFor?: 'ready' | 'none';
    /** true：時鐘在載入前就暫停，之後只隨 runFor 前進（不受機器負載影響） */
    paused?: boolean;
  },
): Promise<void> {
  await page.clock.install({ time: options.browserNow });
  if (options.paused) await page.clock.pauseAt(options.browserNow + 1_000);
  await api.install(page);
  await page.goto(options.path ?? '');
  if ((options.waitFor ?? 'ready') === 'ready') {
    await page.locator('#today:not([hidden])').waitFor();
  }
}

/** 在頁面載入前放入已驗證的密語（模擬同一分頁先前已通過驗證）。 */
export async function presetSession(page: Page, passphrase: string): Promise<void> {
  await page.addInitScript((value) => {
    sessionStorage.setItem('admin-passphrase', value);
  }, passphrase);
}

/** 在密語輸入框輸入並送出（用鍵盤，不寫進任何畫面以外的地方）。 */
export async function submitPassphrase(page: Page, value: string): Promise<void> {
  const dialog = page.locator('.passphrase-dialog');
  await dialog.locator('input[type="password"]').fill(value);
  await dialog.locator('[data-action="confirm"]').click();
}
