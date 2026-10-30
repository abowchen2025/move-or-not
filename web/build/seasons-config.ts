/**
 * D-04：建置與 dev server 時，從 repo 內的 api/seasons.config.json 讀出各季的
 * startDate、countInclusive，以虛擬模組提供給前端，只供退路模式使用。
 * 在 Node 端讀檔，瀏覽器不會直接存取 web/ 以外的檔案。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

export const VIRTUAL_MODULE_ID = 'virtual:seasons-config';
const RESOLVED_ID = `\0${VIRTUAL_MODULE_ID}`;

export const SEASONS_CONFIG_PATH = fileURLToPath(
  new URL('../../api/seasons.config.json', import.meta.url),
);

export interface FallbackSeason {
  id: string;
  startDate: string;
  countInclusive: boolean;
}

const SEASON_ID_PATTERN = /^[a-z0-9-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** 解析並驗證設定內容，只回傳退路模式需要的欄位。 */
export function parseFallbackSeasons(
  text: string,
  source = 'seasons.config.json',
): FallbackSeason[] {
  const fail = (reason: string): never => {
    throw new Error(`${source}：${reason}`);
  };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail('不是合法的 JSON');
  }
  const seasons = (data as { seasons?: unknown } | null)?.seasons;
  if (!Array.isArray(seasons) || seasons.length === 0) return fail('seasons 必須是非空陣列');

  const result = seasons.map((entry: unknown, index): FallbackSeason => {
    const { id, startDate, countInclusive } = (entry ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || !SEASON_ID_PATTERN.test(id))
      fail(`第 ${index + 1} 季的 id 格式錯誤`);
    if (typeof startDate !== 'string' || !isCalendarDate(startDate))
      fail(`第 ${index + 1} 季的 startDate 格式錯誤`);
    if (typeof countInclusive !== 'boolean')
      fail(`第 ${index + 1} 季的 countInclusive 必須是布林值`);
    return {
      id: id as string,
      startDate: startDate as string,
      countInclusive: countInclusive as boolean,
    };
  });
  if (new Set(result.map((s) => s.id)).size !== result.length) fail('季別 id 不可重複');
  return result;
}

export function readFallbackSeasons(path = SEASONS_CONFIG_PATH): FallbackSeason[] {
  return parseFallbackSeasons(readFileSync(path, 'utf-8'), path);
}

export function seasonsConfigPlugin(path = SEASONS_CONFIG_PATH): Plugin {
  return {
    name: 'seasons-config',
    resolveId(id) {
      return id === VIRTUAL_MODULE_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      // dev 時設定檔變更會讓這個模組重新載入
      this.addWatchFile(path);
      return `export default ${JSON.stringify(readFallbackSeasons(path))};`;
    },
  };
}
