/**
 * 讀取 API 的 client（SRS §7.2、§7.3、FR-11、D-22-k）。
 * 一次讀取有整段的時間預算；預算內遇到網路錯誤或 502／503／504 會自動重試
 * （Railway 冷啟動時第一個請求可能回 502，PLAN §5 第 5c 項）。
 */
import { API_ERROR_CODES, type ApiErrorCode } from './error-codes';
import { parseSeasons, parseState, type SeasonState, type SeasonSummary } from './types';

export type ApiFailureKind = 'network' | 'http' | 'invalid-response' | 'timeout';

const RETRYABLE_STATUS = new Set([502, 503, 504]);

export class ApiRequestError extends Error {
  constructor(
    readonly kind: ApiFailureKind,
    readonly status: number | null = null,
    readonly code: ApiErrorCode | null = null,
  ) {
    super(`API ${kind}${status === null ? '' : ` ${status}`}${code ? ` ${code}` : ''}`);
    this.name = 'ApiRequestError';
  }

  get retryable(): boolean {
    return this.kind === 'network' || (this.status !== null && RETRYABLE_STATUS.has(this.status));
  }
}

export interface ApiClient {
  getSeasons(signal: AbortSignal): Promise<SeasonSummary[]>;
  getState(seasonId: string, signal: AbortSignal): Promise<SeasonState>;
}

function errorCodeOf(body: unknown): ApiErrorCode | null {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return API_ERROR_CODES.find((known) => known === code) ?? null;
}

export function createApiClient(
  baseUrl: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): ApiClient {
  const base = baseUrl.replace(/\/+$/, '');

  async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new ApiRequestError('network');
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch (error) {
      if (signal.aborted) throw error;
      if (response.ok) throw new ApiRequestError('invalid-response', response.status);
    }
    if (!response.ok) throw new ApiRequestError('http', response.status, errorCodeOf(body));
    return body;
  }

  return {
    async getSeasons(signal) {
      const seasons = parseSeasons(await getJson('/api/seasons', signal));
      if (!seasons) throw new ApiRequestError('invalid-response', 200);
      return seasons;
    },
    async getState(seasonId, signal) {
      const path = `/api/seasons/${encodeURIComponent(seasonId)}/state`;
      const state = parseState(await getJson(path, signal));
      if (!state || state.seasonId !== seasonId) throw new ApiRequestError('invalid-response', 200);
      return state;
    },
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}

/**
 * 在 timeoutMs 內執行 task；可重試的錯誤隔 retryDelayMs 再試，超過時間丟出 timeout。
 * 不可重試的錯誤（例如 500 DATA_FILE_ERROR）立即丟出。
 */
export async function withinBudget<T>(
  task: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs: number; retryDelayMs: number },
): Promise<T> {
  const controller = new AbortController();
  const { signal } = controller;
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    for (;;) {
      try {
        return await task(signal);
      } catch (error) {
        if (signal.aborted) throw new ApiRequestError('timeout');
        if (!(error instanceof ApiRequestError) || !error.retryable) throw error;
      }
      await sleep(options.retryDelayMs, signal);
      if (signal.aborted) throw new ApiRequestError('timeout');
    }
  } finally {
    clearTimeout(timer);
  }
}
