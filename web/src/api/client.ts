/**
 * API client（SRS §7、FR-11、D-22-k、D-40）。
 *
 * - 讀取（GET）：一次讀取有整段的時間預算；預算內遇到網路錯誤或 502／503／504 會自動重試
 *   （Railway 冷啟動時第一個請求可能回 502，PLAN §5 第 5c 項）。
 * - 寫入與驗證（PUT、DELETE、POST /api/auth/check）一律不自動重試（D-40）：
 *   ApiRequestError 只有 method 為 GET 時才可能 retryable。
 * - 密語只放在 Authorization 標頭，不會出現在網址、錯誤訊息或 console（CLAUDE.md §3.4）。
 */
import { API_ERROR_CODES, type ApiErrorCode } from './error-codes';
import {
  isRecordDto,
  parseSeasons,
  parseState,
  type RecordDto,
  type SeasonState,
  type SeasonSummary,
} from './types';

export type ApiFailureKind = 'network' | 'http' | 'invalid-response' | 'timeout';
export type HttpMethod = 'GET' | 'PUT' | 'DELETE' | 'POST';

const RETRYABLE_STATUS = new Set([502, 503, 504]);

export class ApiRequestError extends Error {
  constructor(
    readonly kind: ApiFailureKind,
    readonly status: number | null = null,
    readonly code: ApiErrorCode | null = null,
    readonly method: HttpMethod = 'GET',
  ) {
    super(`API ${method} ${kind}${status === null ? '' : ` ${status}`}${code ? ` ${code}` : ''}`);
    this.name = 'ApiRequestError';
  }

  /** 只有 GET 會自動重試（D-40）。 */
  get retryable(): boolean {
    if (this.method !== 'GET') return false;
    return this.kind === 'network' || (this.status !== null && RETRYABLE_STATUS.has(this.status));
  }
}

/** 寫入 body（§7.5）。note：null＝保留原備註；''＝清空；其他字串＝改成該內容。 */
export interface RecordInput {
  proposed: boolean;
  executed: boolean;
  note: string | null;
}

export interface ApiClient {
  getSeasons(signal: AbortSignal): Promise<SeasonSummary[]>;
  getState(seasonId: string, signal: AbortSignal): Promise<SeasonState>;
}

export interface AdminApi {
  /** POST /api/auth/check：正確時 resolve，錯誤時丟出 ApiRequestError（401／429）。 */
  checkAuth(passphrase: string, signal: AbortSignal): Promise<void>;
  putRecord(
    seasonId: string,
    date: string,
    input: RecordInput,
    passphrase: string,
    signal: AbortSignal,
  ): Promise<RecordDto>;
  deleteRecord(
    seasonId: string,
    date: string,
    passphrase: string,
    signal: AbortSignal,
  ): Promise<void>;
  /** GET export：回傳資料檔內容（備份用，D-08）。 */
  exportSeason(seasonId: string, passphrase: string, signal: AbortSignal): Promise<Blob>;
}

function errorCodeOf(body: unknown): ApiErrorCode | null {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return API_ERROR_CODES.find((known) => known === code) ?? null;
}

export function createApiClient(
  baseUrl: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): ApiClient & AdminApi {
  const base = baseUrl.replace(/\/+$/, '');
  const seasonPath = (seasonId: string) => `/api/seasons/${encodeURIComponent(seasonId)}`;
  const recordPath = (seasonId: string, date: string) =>
    `${seasonPath(seasonId)}/records/${encodeURIComponent(date)}`;

  async function send(
    method: HttpMethod,
    path: string,
    signal: AbortSignal,
    options: { passphrase?: string; body?: unknown } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.passphrase !== undefined) headers.Authorization = `Bearer ${options.passphrase}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        signal,
        cache: 'no-store',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new ApiRequestError('network', null, null, method);
    }
    if (!response.ok) {
      let body: unknown = null;
      try {
        body = await response.json();
      } catch (error) {
        if (signal.aborted) throw error;
      }
      throw new ApiRequestError('http', response.status, errorCodeOf(body), method);
    }
    return response;
  }

  async function json(method: HttpMethod, response: Response, signal: AbortSignal) {
    try {
      return (await response.json()) as unknown;
    } catch (error) {
      if (signal.aborted) throw error;
      throw new ApiRequestError('invalid-response', response.status, null, method);
    }
  }

  return {
    async getSeasons(signal) {
      const response = await send('GET', '/api/seasons', signal);
      const seasons = parseSeasons(await json('GET', response, signal));
      if (!seasons) throw new ApiRequestError('invalid-response', 200);
      return seasons;
    },
    async getState(seasonId, signal) {
      const response = await send('GET', `${seasonPath(seasonId)}/state`, signal);
      const state = parseState(await json('GET', response, signal));
      if (!state || state.seasonId !== seasonId) throw new ApiRequestError('invalid-response', 200);
      return state;
    },
    async checkAuth(passphrase, signal) {
      await send('POST', '/api/auth/check', signal, { passphrase });
    },
    async putRecord(seasonId, date, input, passphrase, signal) {
      const response = await send('PUT', recordPath(seasonId, date), signal, {
        passphrase,
        body: input,
      });
      const record = await json('PUT', response, signal);
      if (!isRecordDto(record)) {
        throw new ApiRequestError('invalid-response', response.status, null, 'PUT');
      }
      return record;
    },
    async deleteRecord(seasonId, date, passphrase, signal) {
      await send('DELETE', recordPath(seasonId, date), signal, { passphrase });
    },
    async exportSeason(seasonId, passphrase, signal) {
      const response = await send('GET', `${seasonPath(seasonId)}/export`, signal, {
        passphrase,
      });
      return response.blob();
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
 * 不可重試的錯誤（例如 500 DATA_FILE_ERROR、任何寫入請求的錯誤）立即丟出。
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

/** 寫入與驗證用：只設逾時，不重試（D-40）。 */
export async function once<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  method: HttpMethod,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new ApiRequestError('timeout', null, null, method);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
