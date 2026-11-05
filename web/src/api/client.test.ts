import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeState, record, seasonsList, taipei } from '../testing/fixtures';
import { ApiRequestError, createApiClient, withinBudget } from './client';

const NOW = taipei('2026-10-30T10:00:00');
const budget = { timeoutMs: 15_000, retryDelayMs: 1_000 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fakeFetch(...responses: Array<Response | Error>) {
  const fn = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fn.mockRejectedValueOnce(response);
    else fn.mockResolvedValueOnce(response);
  }
  return fn;
}

const signal = () => new AbortController().signal;

describe('API client', () => {
  it('組出季別端點的網址，去掉 base 結尾的斜線，且不使用快取', async () => {
    const fetchImpl = fakeFetch(
      jsonResponse(seasonsList('season-1')),
      jsonResponse(makeState({ serverNow: NOW })),
    );
    const api = createApiClient('https://api.example.test/', fetchImpl);
    await api.getSeasons(signal());
    await api.getState('season-1', signal());
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/api/seasons',
      'https://api.example.test/api/seasons/season-1/state',
    ]);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
  });

  it('回傳通過檢查的 state', async () => {
    const state = makeState({ serverNow: NOW, records: [record('2026-10-28', true, false, 'n')] });
    const api = createApiClient('', fakeFetch(jsonResponse(state)));
    await expect(api.getState('season-1', signal())).resolves.toEqual(state);
  });

  it.each([
    ['缺欄位', { seasonId: 'season-1' }],
    ['seasonId 不符', makeState({ serverNow: NOW, seasonId: 'season-2' })],
    ['daysElapsed 為負數', { ...makeState({ serverNow: NOW }), daysElapsed: -1 }],
    [
      '記錄的 note 不是字串',
      { ...makeState({ serverNow: NOW }), records: [{ date: '2026-10-28' }] },
    ],
  ])('state 格式不符時視為失敗：%s', async (_label, body) => {
    const api = createApiClient('', fakeFetch(jsonResponse(body)));
    await expect(api.getState('season-1', signal())).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('季別清單為空時視為失敗', async () => {
    const api = createApiClient('', fakeFetch(jsonResponse({ seasons: [] })));
    await expect(api.getSeasons(signal())).rejects.toMatchObject({ kind: 'invalid-response' });
  });

  it('讀出錯誤代碼（§7.8）', async () => {
    const api = createApiClient(
      '',
      fakeFetch(jsonResponse({ error: { code: 'DATA_FILE_ERROR', message: 'x' } }, 500)),
    );
    const error = await api.getState('season-1', signal()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ kind: 'http', status: 500, code: 'DATA_FILE_ERROR' });
    expect((error as ApiRequestError).retryable).toBe(false);
  });

  it('不認得的錯誤代碼與非 JSON 的錯誤回應，code 為 null', async () => {
    const api = createApiClient(
      '',
      fakeFetch(
        jsonResponse({ error: { code: 'SOMETHING_ELSE' } }, 500),
        new Response('Bad Gateway', { status: 502 }),
      ),
    );
    await expect(api.getState('season-1', signal())).rejects.toMatchObject({ code: null });
    const error = (await api
      .getState('season-1', signal())
      .catch((e: unknown) => e)) as ApiRequestError;
    expect(error).toMatchObject({ status: 502, code: null });
    expect(error.retryable).toBe(true);
  });

  it('網路錯誤可以重試', async () => {
    const api = createApiClient('', fakeFetch(new TypeError('Failed to fetch')));
    const error = (await api.getSeasons(signal()).catch((e: unknown) => e)) as ApiRequestError;
    expect(error.kind).toBe('network');
    expect(error.retryable).toBe(true);
  });
});

describe('withinBudget（FR-11 的 15 秒、冷啟動重試）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('502 與網路錯誤會在預算內重試，成功就回傳', async () => {
    const task = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockRejectedValueOnce(new ApiRequestError('http', 502))
      .mockRejectedValueOnce(new ApiRequestError('network'))
      .mockResolvedValueOnce('ok');
    const result = withinBudget(task, budget);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(result).resolves.toBe('ok');
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('不可重試的錯誤立即丟出', async () => {
    const task = vi.fn().mockRejectedValue(new ApiRequestError('http', 500, 'DATA_FILE_ERROR'));
    await expect(withinBudget(task, budget)).rejects.toMatchObject({ code: 'DATA_FILE_ERROR' });
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('一直失敗時，第 15 秒判定逾時', async () => {
    const task = vi.fn().mockRejectedValue(new ApiRequestError('network'));
    const result = withinBudget(task, budget).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(await Promise.race([result, Promise.resolve('pending')])).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ kind: 'timeout' });
  });

  it('請求一直沒有回應時，第 15 秒中止並判定逾時', async () => {
    let aborted = false;
    const task = (s: AbortSignal) =>
      new Promise<never>((_resolve, reject) => {
        s.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const result = withinBudget(task, budget).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toMatchObject({ kind: 'timeout' });
    expect(aborted).toBe(true);
  });
});
