/**
 * Playwright 共用工具：以 page.route 模擬 API，並控制「伺服器時間」與瀏覽器時鐘（PLAN §4.4）。
 */
import type { Page } from '@playwright/test';
import type { RecordDto } from '../src/api/types';
import { getStory } from '../src/stories';
import { makeState, seasonsList } from '../src/testing/fixtures';

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
  readonly requests: string[] = [];

  constructor(serverNow: number) {
    this.serverNow = serverNow;
  }

  statePaths(): string[] {
    return this.requests.filter((path) => path.endsWith('/state'));
  }

  async install(page: Page): Promise<void> {
    await page.route(`${MOCK_API_BASE}/**`, async (route) => {
      const { pathname } = new URL(route.request().url());
      this.requests.push(pathname);
      if (this.down) return route.abort('connectionrefused');
      const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
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
  options: { browserNow: number; path?: string; waitFor?: 'ready' | 'none' },
): Promise<void> {
  await page.clock.install({ time: options.browserNow });
  await api.install(page);
  await page.goto(options.path ?? '');
  if ((options.waitFor ?? 'ready') === 'ready') {
    await page.locator('#today:not([hidden])').waitFor();
  }
}
