/**
 * 資料載入與同步（SRS §4.1-3～§4.1-5、§4.3、FR-10、FR-11、D-04、D-06、D-22-a、D-22-k、D-32）。
 *
 * - 載入：先 GET /api/seasons 決定季別，再取該季 state；兩段合計一個時間預算。
 * - 同步：每 60 秒、分頁回到前景時重新抓 state；每秒用校正後的時間檢查台灣日期，改變時立即重新抓。
 * - 失敗：初次載入失敗直接進入退路模式；載入成功後，定期更新連續失敗達設定次數才進入退路模式。
 * - 退路模式：季別依打包的清單判斷，天數用訪客時鐘換算台灣日期；之後的定期更新會嘗試恢復。
 */
import { ApiRequestError, withinBudget, type ApiClient } from '../api/client';
import type { ApiErrorCode } from '../api/error-codes';
import type { SeasonState } from '../api/types';
import type { AppConfig } from '../config';
import { chooseSeason } from '../season/resolve';
import type { ServerClock } from '../time/server-clock';
import { taipeiDate } from '../time/taipei';
import type seasons from 'virtual:seasons-config';

export type FallbackSeason = (typeof seasons)[number];

export type Snapshot =
  | { kind: 'loading'; seasonId: string }
  | { kind: 'ready'; seasonId: string; state: SeasonState; syncFailing: boolean }
  | {
      kind: 'fallback';
      seasonId: string;
      season: FallbackSeason;
      /** 訪客時鐘的現在（退路模式不使用 offset，§4.1-5） */
      localNow: number;
      errorCode: ApiErrorCode | null;
    }
  /** 季別存在，但前端沒有這一季的劇本（D-22-k） */
  | { kind: 'unavailable'; seasonId: string };

export interface SyncOptions {
  api: ApiClient;
  clock: ServerClock;
  localNow: () => number;
  fallbackSeasons: readonly FallbackSeason[];
  /** 網址的 `?season=`；沒有時為 null */
  requestedSeason: string | null;
  hasStory: (seasonId: string) => boolean;
  /** 移除網址中無效的 `?season=`（D-22-l） */
  dropSeasonParam: () => void;
  config: Pick<
    AppConfig,
    | 'pollIntervalMs'
    | 'dayCheckIntervalMs'
    | 'loadTimeoutMs'
    | 'retryDelayMs'
    | 'maxConsecutiveSyncFailures'
  >;
  document: Document;
  onChange: (snapshot: Snapshot) => void;
}

export class SyncController {
  #snapshot: Snapshot;
  #requested: string | null;
  #failures = 0;
  #inFlight = false;
  /** 已經為哪一個台灣日期觸發過跨日更新，避免每秒重複抓取 */
  #rolloverRequestedFor: string | null = null;
  #timers: ReturnType<typeof setInterval>[] = [];
  readonly #onVisibility = () => {
    if (this.options.document.visibilityState === 'visible') void this.refresh();
  };

  constructor(private readonly options: SyncOptions) {
    this.#requested = options.requestedSeason;
    this.#snapshot = { kind: 'loading', seasonId: this.#fallbackChoice().seasonId };
  }

  get snapshot(): Snapshot {
    return this.#snapshot;
  }

  start(): void {
    const { config, document } = this.options;
    this.#emit(this.#snapshot);
    this.#timers.push(
      setInterval(() => void this.refresh(), config.pollIntervalMs),
      setInterval(() => this.#checkDay(), config.dayCheckIntervalMs),
    );
    document.addEventListener('visibilitychange', this.#onVisibility);
    void this.#load(true);
  }

  stop(): void {
    for (const timer of this.#timers) clearInterval(timer);
    this.#timers = [];
    this.options.document.removeEventListener('visibilitychange', this.#onVisibility);
  }

  /** FR-11 的「重試」：顯示讀取中並重新載入。 */
  retry(): Promise<void> {
    return this.#load(true);
  }

  /** 定期更新、回到前景與跨日時呼叫。 */
  refresh(): Promise<void> {
    return this.#snapshot.kind === 'ready' ? this.#refreshState() : this.#load(false);
  }

  #emit(snapshot: Snapshot): void {
    this.#snapshot = snapshot;
    this.options.onChange(snapshot);
  }

  #budget() {
    const { loadTimeoutMs, retryDelayMs } = this.options.config;
    return { timeoutMs: loadTimeoutMs, retryDelayMs };
  }

  /** 退路模式的季別：依打包的清單判斷（D-32）。 */
  #fallbackChoice() {
    return chooseSeason(
      this.#requested,
      this.options.fallbackSeasons.map((season) => season.id),
    );
  }

  async #load(showLoading: boolean): Promise<void> {
    if (this.#inFlight) return;
    this.#inFlight = true;
    const { api, hasStory } = this.options;
    if (showLoading) this.#emit({ kind: 'loading', seasonId: this.#snapshot.seasonId });
    try {
      const { choice, state } = await withinBudget(async (signal) => {
        const list = await api.getSeasons(signal);
        const choice = chooseSeason(
          this.#requested,
          list.map((season) => season.id),
        );
        // 缺少劇本時不必再取 state（D-22-k）
        const state = hasStory(choice.seasonId)
          ? await api.getState(choice.seasonId, signal)
          : null;
        return { choice, state };
      }, this.#budget());
      this.#settleParam(choice);
      if (state) this.#applyState(state);
      else this.#emit({ kind: 'unavailable', seasonId: choice.seasonId });
    } catch (error) {
      this.#enterFallback(error);
    } finally {
      this.#inFlight = false;
    }
  }

  async #refreshState(): Promise<void> {
    if (this.#inFlight || this.#snapshot.kind !== 'ready') return;
    this.#inFlight = true;
    const current = this.#snapshot;
    try {
      const state = await withinBudget(
        (signal) => this.options.api.getState(current.seasonId, signal),
        this.#budget(),
      );
      this.#applyState(state);
    } catch (error) {
      // 偶發失敗保留畫面與 offset，連續失敗達設定次數才切到錯誤畫面（D-06）
      this.#failures += 1;
      if (this.#failures >= this.options.config.maxConsecutiveSyncFailures) {
        this.#enterFallback(error);
      } else {
        this.#emit({ ...current, syncFailing: true });
      }
    } finally {
      this.#inFlight = false;
    }
  }

  #settleParam(choice: { seasonId: string; dropParam: boolean }): void {
    if (choice.dropParam) this.options.dropSeasonParam();
    // 之後一律沿用已決定的季別
    this.#requested = choice.seasonId;
  }

  #applyState(state: SeasonState): void {
    this.options.clock.calibrate(state.serverNow);
    this.#failures = 0;
    this.#rolloverRequestedFor = null;
    this.#emit({ kind: 'ready', seasonId: state.seasonId, state, syncFailing: false });
  }

  #enterFallback(error: unknown): void {
    this.#failures = 0;
    const choice = this.#fallbackChoice();
    this.#settleParam(choice);
    const season = this.options.fallbackSeasons.find((s) => s.id === choice.seasonId);
    if (!season || !this.options.hasStory(choice.seasonId)) {
      this.#emit({ kind: 'unavailable', seasonId: choice.seasonId });
      return;
    }
    this.#emit({
      kind: 'fallback',
      seasonId: season.id,
      season,
      localNow: this.options.localNow(),
      errorCode: error instanceof ApiRequestError ? error.code : null,
    });
  }

  /** 每秒檢查台灣日期是否改變（§4.3）。 */
  #checkDay(): void {
    const snapshot = this.#snapshot;
    if (snapshot.kind === 'ready') {
      const day = taipeiDate(this.options.clock.now());
      if (day !== snapshot.state.today && day !== this.#rolloverRequestedFor) {
        this.#rolloverRequestedFor = day;
        void this.#refreshState();
      }
    } else if (snapshot.kind === 'fallback') {
      const now = this.options.localNow();
      if (taipeiDate(now) !== taipeiDate(snapshot.localNow))
        this.#emit({ ...snapshot, localNow: now });
    }
  }
}
