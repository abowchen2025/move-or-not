import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, type ApiClient } from '../api/client';
import type { SeasonState } from '../api/types';
import { appConfig } from '../config';
import { makeState, record, seasonsList, taipei } from '../testing/fixtures';
import { ServerClock } from '../time/server-clock';
import { SyncController, type FallbackSeason, type Snapshot } from './controller';

const DAY = 86_400_000;
const FALLBACK: FallbackSeason[] = [
  { id: 'season-1', startDate: '2026-10-13', countInclusive: false },
  { id: 'season-2', startDate: '2026-10-20', countInclusive: false },
];

/** 可控制的假伺服器：時間、記錄、是否連得上。 */
class FakeServer {
  serverNow = taipei('2026-10-30T10:00:00');
  seasons = ['season-1', 'season-2'];
  records = [record('2026-10-28', true, false, 'n')];
  down = false;
  failure: ApiRequestError = new ApiRequestError('network');

  readonly getSeasons = vi.fn(async () => {
    if (this.down) throw this.failure;
    return seasonsList(...this.seasons).seasons;
  });

  readonly getState = vi.fn(async (seasonId: string): Promise<SeasonState> => {
    if (this.down) throw this.failure;
    return makeState({ serverNow: this.serverNow, records: this.records, seasonId });
  });

  get api(): ApiClient {
    return { getSeasons: this.getSeasons, getState: this.getState };
  }
}

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';

  setVisibility(state: DocumentVisibilityState) {
    this.visibilityState = state;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

function setup(
  options: {
    requested?: string | null;
    stories?: string[];
    server?: FakeServer;
    /** 訪客時鐘比伺服器快多少毫秒 */
    localSkewMs?: number;
  } = {},
) {
  const server = options.server ?? new FakeServer();
  vi.setSystemTime(server.serverNow + (options.localSkewMs ?? 0));
  const document = new FakeDocument();
  const snapshots: Snapshot[] = [];
  const dropSeasonParam = vi.fn();
  const stories = new Set(options.stories ?? ['season-1', 'season-2']);
  const clock = new ServerClock();
  const controller = new SyncController({
    api: server.api,
    clock,
    localNow: () => Date.now(),
    fallbackSeasons: FALLBACK,
    requestedSeason: options.requested ?? null,
    hasStory: (id) => stories.has(id),
    dropSeasonParam,
    config: appConfig,
    document: document as unknown as Document,
    onChange: (snapshot) => snapshots.push(snapshot),
  });
  /** 讓伺服器時間與訪客時鐘一起前進 */
  const advance = async (ms: number) => {
    server.serverNow += ms;
    await vi.advanceTimersByTimeAsync(ms);
  };
  return { server, document, controller, clock, snapshots, dropSeasonParam, advance };
}

function lastReady(snapshots: Snapshot[]) {
  const last = snapshots.at(-1);
  if (last?.kind !== 'ready') throw new Error(`最後的狀態是 ${last?.kind}`);
  return last;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('載入流程（D-22-k）', () => {
  it('先取季別清單，再取最新一季的 state', async () => {
    const { controller, server, snapshots } = setup();
    controller.start();
    expect(snapshots[0]).toEqual({ kind: 'loading', seasonId: 'season-2' });
    await vi.advanceTimersByTimeAsync(0);
    expect(server.getSeasons).toHaveBeenCalledTimes(1);
    expect(server.getState).toHaveBeenCalledWith('season-2', expect.anything());
    expect(lastReady(snapshots).state.daysElapsed).toBe(17);
    controller.stop();
  });

  it('?season= 有效時用它，網址不變', async () => {
    const { controller, server, dropSeasonParam } = setup({ requested: 'season-1' });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.getState).toHaveBeenCalledWith('season-1', expect.anything());
    expect(dropSeasonParam).not.toHaveBeenCalled();
    controller.stop();
  });

  it('D-22-l ?season= 無效時改顯示最新一季，並移除網址參數', async () => {
    const { controller, server, dropSeasonParam } = setup({ requested: 'season-9' });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.getState).toHaveBeenCalledWith('season-2', expect.anything());
    expect(dropSeasonParam).toHaveBeenCalledTimes(1);
    controller.stop();
  });

  it('D-22-k 前端缺少該季的劇本時顯示錯誤，不取 state', async () => {
    const { controller, server, snapshots } = setup({ stories: ['season-1'] });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshots.at(-1)).toEqual({ kind: 'unavailable', seasonId: 'season-2' });
    expect(server.getState).not.toHaveBeenCalled();
    controller.stop();
  });
});

describe('§4.1-3 offset', () => {
  it('AC-03 訪客時鐘快一天：校正後的時間等於伺服器時間，不會誤判跨日', async () => {
    const { controller, server, snapshots } = setup({ localSkewMs: DAY });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(lastReady(snapshots).state.today).toBe('2026-10-30');
    await vi.advanceTimersByTimeAsync(10_000);
    // 每秒的跨日檢查用校正後的時間，不會因為訪客時鐘是隔天而重新抓取
    expect(server.getState).toHaveBeenCalledTimes(1);
    controller.stop();
  });
});

describe('§4.1-4、FR-10 定期校正與資料同步', () => {
  it('每 60 秒重新抓一次 state（D-22-a）', async () => {
    const { controller, server, advance } = setup();
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    await advance(59_999);
    expect(server.getState).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(server.getState).toHaveBeenCalledTimes(2);
    await advance(60_000);
    expect(server.getState).toHaveBeenCalledTimes(3);
    // 定期更新只取 state，不重取季別清單
    expect(server.getSeasons).toHaveBeenCalledTimes(1);
    controller.stop();
  });

  it('新資料在下一次輪詢時套用到畫面', async () => {
    const { controller, server, snapshots, advance } = setup();
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    server.records = [...server.records, record('2026-10-29', true, false, 'm')];
    await advance(60_000);
    expect(lastReady(snapshots).state.records).toHaveLength(2);
    controller.stop();
  });

  it('分頁回到前景時立即抓取，進入背景時不抓', async () => {
    const { controller, server, document } = setup();
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    document.setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(0);
    expect(server.getState).toHaveBeenCalledTimes(1);
    document.setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(server.getState).toHaveBeenCalledTimes(2);
    controller.stop();
  });

  it('每次取得 state 都重新校正 offset', async () => {
    const { controller, server, clock, advance } = setup();
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(clock.offsetMs).toBe(0);
    // 訪客電腦的時鐘被往回調了 1 小時：下一次輪詢後 offset 跟著修正
    server.serverNow += 3_600_000;
    await advance(60_000);
    expect(clock.offsetMs).toBe(3_600_000);
    expect(clock.now()).toBe(server.serverNow);
    controller.stop();
  });

  it('stop() 之後不再抓取', async () => {
    const { controller, server, document } = setup();
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    controller.stop();
    document.setVisibility('visible');
    await vi.advanceTimersByTimeAsync(180_000);
    expect(server.getState).toHaveBeenCalledTimes(1);
  });

  it('FR-10 不使用 localStorage', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem, getItem: vi.fn(), removeItem: vi.fn() });
    const { controller, advance } = setup();
    controller.start();
    await advance(120_000);
    controller.stop();
    expect(setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('§4.3 跨日即時更新', () => {
  it('台灣 00:00 一到，每秒的檢查就重新抓 state，天數 +1、今日狀態重置', async () => {
    const server = new FakeServer();
    server.serverNow = taipei('2026-10-30T23:59:58');
    server.records = [record('2026-10-30', true, false, 'n')];
    const { controller, snapshots, advance } = setup({ server });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(lastReady(snapshots).state).toMatchObject({ today: '2026-10-30', daysElapsed: 17 });
    expect(lastReady(snapshots).state.todayRecord).not.toBeNull();

    await advance(1_000);
    expect(server.getState).toHaveBeenCalledTimes(1);
    await advance(1_000);
    expect(server.getState).toHaveBeenCalledTimes(2);
    expect(lastReady(snapshots).state).toMatchObject({
      today: '2026-10-31',
      daysElapsed: 18,
      todayRecord: null,
    });
    controller.stop();
  });

  it('訪客在洛杉磯（TZ 不同）也是以台灣 00:00 為準', async () => {
    // 這個檔案會在三個 TZ 各跑一次（scripts/test-tz.mjs）
    const server = new FakeServer();
    server.serverNow = taipei('2026-10-31T23:59:59');
    const { controller, snapshots, advance } = setup({ server });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    await advance(1_000);
    expect(lastReady(snapshots).state.today).toBe('2026-11-01');
    controller.stop();
  });

  it('跨日時的抓取失敗，不會每秒重抓，等下一次定期更新', async () => {
    const server = new FakeServer();
    server.serverNow = taipei('2026-10-30T23:59:59');
    const { controller, advance } = setup({ server });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    server.down = true;
    // 跨日觸發一次更新，這次更新在 15 秒內重試後判定失敗
    await advance(1_000 + 15_000);
    const calls = server.getState.mock.calls.length;
    await advance(40_000);
    expect(server.getState).toHaveBeenCalledTimes(calls);
    controller.stop();
  });
});

describe('D-06 定期更新連續失敗', () => {
  it('第 1、2 次失敗保留畫面並標示，第 3 次才切到錯誤畫面；恢復後回到正常', async () => {
    const { controller, server, snapshots, advance } = setup();
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    const firstState = lastReady(snapshots).state;

    server.down = true;
    // 每次更新在 15 秒內重試，仍失敗才算一次
    await advance(60_000 + 15_000);
    expect(lastReady(snapshots)).toMatchObject({ syncFailing: true, state: firstState });
    await advance(60_000);
    expect(lastReady(snapshots)).toMatchObject({ syncFailing: true, state: firstState });
    await advance(60_000);
    expect(snapshots.at(-1)?.kind).toBe('fallback');

    server.down = false;
    await advance(60_000);
    expect(lastReady(snapshots).syncFailing).toBe(false);
    controller.stop();
  });

  it('中間成功一次就重新計數', async () => {
    const { controller, server, snapshots, advance } = setup();
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    server.down = true;
    await advance(120_000);
    server.down = false;
    await advance(60_000);
    expect(lastReady(snapshots).syncFailing).toBe(false);
    server.down = true;
    await advance(120_000);
    expect(snapshots.at(-1)?.kind).toBe('ready');
    controller.stop();
  });
});

describe('§4.1-5 退路模式', () => {
  it('初次載入在 15 秒內一直失敗 → 退路模式，季別依打包的清單，時間用訪客時鐘', async () => {
    const server = new FakeServer();
    server.down = true;
    const { controller, snapshots } = setup({ server, localSkewMs: DAY });
    controller.start();
    await vi.advanceTimersByTimeAsync(14_999);
    expect(snapshots.at(-1)?.kind).toBe('loading');
    await vi.advanceTimersByTimeAsync(1);
    expect(snapshots.at(-1)).toMatchObject({
      kind: 'fallback',
      seasonId: 'season-2',
      season: FALLBACK[1],
      errorCode: null,
    });
    // 退路模式不使用 offset：localNow 就是訪客時鐘
    const last = snapshots.at(-1);
    expect(last?.kind === 'fallback' && last.localNow).toBe(Date.now());
    controller.stop();
  });

  it('不可重試的錯誤（例如 500）立即進入退路模式並帶出錯誤代碼', async () => {
    const server = new FakeServer();
    server.down = true;
    server.failure = new ApiRequestError('http', 500, 'DATA_FILE_ERROR');
    const { controller, snapshots } = setup({ server });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshots.at(-1)).toMatchObject({ kind: 'fallback', errorCode: 'DATA_FILE_ERROR' });
    controller.stop();
  });

  it('D-32 ?season= 在打包的清單中就用它', async () => {
    const server = new FakeServer();
    server.down = true;
    const { controller, snapshots, dropSeasonParam } = setup({ server, requested: 'season-1' });
    controller.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(snapshots.at(-1)).toMatchObject({ kind: 'fallback', seasonId: 'season-1' });
    expect(dropSeasonParam).not.toHaveBeenCalled();
    controller.stop();
  });

  it('D-32 ?season= 不在打包的清單中 → 清單最後一筆，並移除網址參數', async () => {
    const server = new FakeServer();
    server.down = true;
    const { controller, snapshots, dropSeasonParam } = setup({ server, requested: 'season-9' });
    controller.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(snapshots.at(-1)).toMatchObject({ kind: 'fallback', seasonId: 'season-2' });
    expect(dropSeasonParam).toHaveBeenCalledTimes(1);
    controller.stop();
  });

  it('載入成功後才進入退路模式時，沿用原本顯示的季別', async () => {
    const { controller, server, snapshots, advance } = setup({ requested: 'season-1' });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    server.down = true;
    // 第 3 次失敗：第 180 秒的更新重試到第 195 秒
    await advance(195_000);
    expect(snapshots.at(-1)).toMatchObject({ kind: 'fallback', seasonId: 'season-1' });
    controller.stop();
  });

  it('退路模式中台灣日期改變時，每秒的檢查會更新天數的基準時間', async () => {
    const server = new FakeServer();
    server.down = true;
    server.serverNow = taipei('2026-10-30T23:59:40');
    const { controller, snapshots, advance } = setup({ server });
    controller.start();
    await advance(15_000);
    const before = snapshots.at(-1);
    expect(before?.kind).toBe('fallback');
    await advance(10_000);
    const after = snapshots.at(-1);
    expect(after?.kind === 'fallback' && after.localNow).toBeGreaterThanOrEqual(
      taipei('2026-10-31T00:00:00'),
    );
    controller.stop();
  });

  it('FR-11 重試：顯示讀取中，成功後回到正常畫面', async () => {
    const server = new FakeServer();
    server.down = true;
    const { controller, snapshots } = setup({ server });
    controller.start();
    await vi.advanceTimersByTimeAsync(15_000);
    server.down = false;
    const retried = controller.retry();
    expect(snapshots.at(-1)?.kind).toBe('loading');
    await retried;
    expect(lastReady(snapshots).seasonId).toBe('season-2');
    controller.stop();
  });

  it('退路模式中的定期更新恢復連線後，自動回到正常畫面', async () => {
    const server = new FakeServer();
    server.down = true;
    const { controller, snapshots, advance } = setup({ server });
    controller.start();
    await advance(15_000);
    server.down = false;
    await advance(60_000);
    expect(snapshots.at(-1)?.kind).toBe('ready');
    controller.stop();
  });
});
