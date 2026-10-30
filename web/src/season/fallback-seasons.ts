/**
 * 退路模式（API 連不上）使用的季別設定，建置時由 api/seasons.config.json 產生（D-04）。
 * 正常情況一律以 API 回傳值為準。
 */
import seasons from 'virtual:seasons-config';

export const fallbackSeasons = seasons;

export function latestFallbackSeasonId(): string {
  const latest = seasons.at(-1);
  if (!latest) throw new Error('seasons config is empty');
  return latest.id;
}
