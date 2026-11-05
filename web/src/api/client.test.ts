import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeState, record, seasonsList, taipei } from '../testing/fixtures';
import { ApiRequestError, createApiClient, once, withinBudget } from './client';

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

describe('寫入與驗證（§7.4～7.7）', () => {
  // 密語在執行時產生，不寫死（CLAUDE.md §3.4）
  const passphrase = `t-${crypto.randomUUID()}`;
  const input = { proposed: true, executed: false, note: null };

  it('PUT 帶 Bearer 密語與 JSON body，回傳通過檢查的記錄', async () => {
    const saved = record('2026-10-29', true, false, '');
    const fetchImpl = fakeFetch(jsonResponse(saved));
    const api = createApiClient('https://api.example.test', fetchImpl);
    await expect(
      api.putRecord('season-1', '2026-10-29', input, passphrase, signal()),
    ).resolves.toEqual(saved);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/api/seasons/season-1/records/2026-10-29');
    expect(init).toMatchObject({
      method: 'PUT',
      headers: { Authorization: `Bearer ${passphrase}`, 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(init!.body as string)).toEqual({
      proposed: true,
      executed: false,
      note: null,
    });
  });

  it('密語不會出現在網址與錯誤訊息', async () => {
    const fetchImpl = fakeFetch(
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'x' } }, 401),
    );
    const api = createApiClient('', fetchImpl);
    const error = (await api.checkAuth(passphrase, signal()).catch((e: unknown) => e)) as Error;
    expect(String(fetchImpl.mock.calls[0]![0])).not.toContain(passphrase);
    expect(error.message).not.toContain(passphrase);
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHORIZED', method: 'POST' });
  });

  it('auth/check 回 204 時 resolve；DELETE 回 204 時 resolve', async () => {
    const fetchImpl = fakeFetch(
      new Response(null, { status: 204 }),
      new Response(null, { status: 204 }),
    );
    const api = createApiClient('', fetchImpl);
    await expect(api.checkAuth(passphrase, signal())).resolves.toBeUndefined();
    await expect(
      api.deleteRecord('season-1', '2026-10-29', passphrase, signal()),
    ).resolves.toBeUndefined();
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'DELETE']);
  });

  it('export 回傳資料檔內容', async () => {
    const api = createApiClient('', fakeFetch(jsonResponse({ schemaVersion: 1 })));
    const blob = await api.exportSeason('season-1', passphrase, signal());
    expect(JSON.parse(await blob.text())).toEqual({ schemaVersion: 1 });
  });
});

describe('D-40 只有 GET 自動重試', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const passphrase = `t-${crypto.randomUUID()}`;

  it.each([502, 503, 504])('GET 的 %i 可以重試', (status) => {
    expect(new ApiRequestError('http', status, null, 'GET').retryable).toBe(true);
  });

  it.each(['PUT', 'DELETE', 'POST'] as const)(
    '%s 的 502／503／504 與網路錯誤都不可重試',
    (method) => {
      for (const status of [502, 503, 504]) {
        expect(new ApiRequestError('http', status, null, method).retryable).toBe(false);
      }
      expect(new ApiRequestError('network', null, null, method).retryable).toBe(false);
    },
  );

  it.each([
    [
      'PUT',
      (api: ReturnType<typeof createApiClient>, s: AbortSignal) =>
        api.putRecord(
          'season-1',
          '2026-10-29',
          { proposed: true, executed: false, note: null },
          passphrase,
          s,
        ),
    ],
    [
      'DELETE',
      (api: ReturnType<typeof createApiClient>, s: AbortSignal) =>
        api.deleteRecord('season-1', '2026-10-29', passphrase, s),
    ],
    [
      'POST auth/check',
      (api: ReturnType<typeof createApiClient>, s: AbortSignal) => api.checkAuth(passphrase, s),
    ],
  ])('%s 失敗時即使放進 withinBudget 也只送出一次', async (_label, call) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('Bad Gateway', { status: 502 }));
    const api = createApiClient('', fetchImpl);
    const result = withinBudget<unknown>((s) => call(api, s), budget).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toMatchObject({ kind: 'http', status: 502 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('once() 逾時時中止並丟出 timeout，不重試', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const api = createApiClient('', fetchImpl);
    const result = once(
      (s) => api.deleteRecord('season-1', '2026-10-29', passphrase, s),
      15_000,
      'DELETE',
    ).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toMatchObject({ kind: 'timeout', method: 'DELETE' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
