/**
 * 測試用的 API 回應。vitest 與 Playwright 共用；只用中性字串（D-22-p）。
 * 不會被正式程式 import，因此不會進入打包檔。
 */
import type { RecordDto, SeasonState, SeasonSummary } from '../api/types';
import { daysElapsed, taipeiDate } from '../time/taipei';

export const START_DATE = '2026-10-13';

export function record(
  date: string,
  proposed: boolean,
  executed: boolean,
  note = '',
  updatedAt = `${date}T18:00:00+08:00`,
): RecordDto {
  return { date, proposed, executed, note, updatedAt };
}

/** 與伺服器相同格式的台灣時間字串（+08:00，到秒）。 */
export function taipeiIso(epochMs: number): string {
  const shifted = new Date(epochMs + 8 * 3_600_000);
  return `${shifted.toISOString().slice(0, 19)}+08:00`;
}

/** 依伺服器的規則（§4.2、§4.4、§5.5、§7.3）組出 state。 */
export function makeState(options: {
  serverNow: number;
  records?: readonly RecordDto[];
  seasonId?: string;
  startDate?: string;
  countInclusive?: boolean;
}): SeasonState {
  const {
    serverNow,
    records = [],
    seasonId = 'season-1',
    startDate = START_DATE,
    countInclusive = false,
  } = options;
  const today = taipeiDate(serverNow);
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
  const executedDates = sorted.filter((r) => r.executed).map((r) => r.date);
  const endedDate = executedDates.length > 0 ? executedDates.sort()[0]! : null;
  const proposedCount = sorted.filter((r) => r.proposed).length;
  const executedCount = sorted.filter((r) => r.executed).length;
  const lastUpdatedAt =
    sorted.map((r) => r.updatedAt).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  return {
    seasonId,
    serverNow: taipeiIso(serverNow),
    timezone: 'Asia/Taipei',
    today,
    startDate,
    daysElapsed: daysElapsed(startDate, today, countInclusive, endedDate),
    ended: endedDate !== null,
    endedDate,
    todayRecord: sorted.find((r) => r.date === today) ?? null,
    records: sorted,
    stats: {
      proposedCount,
      executedCount,
      successRate:
        proposedCount === 0
          ? 0
          : Math.floor((200 * executedCount + proposedCount) / (2 * proposedCount)),
    },
    lastUpdatedAt,
  };
}

export function seasonsList(...ids: string[]): { seasons: SeasonSummary[] } {
  return {
    seasons: ids.map((id) => ({ id, startDate: START_DATE, ended: false, endedDate: null })),
  };
}

/** 台灣時間 → epoch 毫秒，例如 taipei('2026-10-30T23:59:50')。 */
export function taipei(local: string): number {
  return Date.parse(`${local}+08:00`);
}
