/**
 * 季別解析（SRS §3.3 規則 3、D-22-k、D-22-l、D-32）。
 * 正常模式用 API 的季別清單，退路模式用建置時打包的清單（D-04），規則相同：
 * `?season=` 在清單中就用它；否則用清單最後一筆（最新一季），並移除無效的參數。
 */
export const SEASON_PARAM = 'season';

export interface SeasonChoice {
  seasonId: string;
  /** 網址帶了不在清單中的 `?season=`，需要移除（D-22-l） */
  dropParam: boolean;
}

export function requestedSeason(search: string): string | null {
  return new URLSearchParams(search).get(SEASON_PARAM);
}

export function chooseSeason(requested: string | null, available: readonly string[]): SeasonChoice {
  const latest = available.at(-1);
  if (latest === undefined) throw new Error('季別清單是空的');
  if (requested !== null && available.includes(requested)) {
    return { seasonId: requested, dropParam: false };
  }
  return { seasonId: latest, dropParam: requested !== null };
}

/** 移除網址中的 `?season=`，保留其他參數與 hash。 */
export function urlWithoutSeasonParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(SEASON_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
