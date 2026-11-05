/** API 回應的型別與檢查（SRS §7.2、§7.3）。格式不符時視為讀取失敗。 */

export interface RecordDto {
  date: string;
  proposed: boolean;
  executed: boolean;
  note: string;
  updatedAt: string;
}

export interface SeasonSummary {
  id: string;
  startDate: string;
  ended: boolean;
  endedDate: string | null;
}

export interface SeasonState {
  seasonId: string;
  serverNow: string;
  timezone: string;
  today: string;
  startDate: string;
  daysElapsed: number;
  ended: boolean;
  endedDate: string | null;
  todayRecord: RecordDto | null;
  records: RecordDto[];
  stats: { proposedCount: number; executedCount: number; successRate: number };
  lastUpdatedAt: string | null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isDate = (value: unknown): value is string =>
  typeof value === 'string' && DATE_PATTERN.test(value);
const isDateOrNull = (value: unknown): value is string | null => value === null || isDate(value);
const isTime = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

export function isRecordDto(value: unknown): value is RecordDto {
  return (
    isObject(value) &&
    isDate(value.date) &&
    typeof value.proposed === 'boolean' &&
    typeof value.executed === 'boolean' &&
    typeof value.note === 'string' &&
    isTime(value.updatedAt)
  );
}

export function isSeasonSummary(value: unknown): value is SeasonSummary {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    isDate(value.startDate) &&
    typeof value.ended === 'boolean' &&
    isDateOrNull(value.endedDate)
  );
}

export function parseSeasons(body: unknown): SeasonSummary[] | null {
  if (!isObject(body) || !Array.isArray(body.seasons)) return null;
  const seasons: unknown[] = body.seasons;
  return seasons.length > 0 && seasons.every(isSeasonSummary) ? seasons : null;
}

export function parseState(body: unknown): SeasonState | null {
  if (!isObject(body)) return null;
  const { stats, records, todayRecord } = body;
  const ok =
    typeof body.seasonId === 'string' &&
    isTime(body.serverNow) &&
    typeof body.timezone === 'string' &&
    isDate(body.today) &&
    isDate(body.startDate) &&
    isCount(body.daysElapsed) &&
    typeof body.ended === 'boolean' &&
    isDateOrNull(body.endedDate) &&
    (todayRecord === null || isRecordDto(todayRecord)) &&
    Array.isArray(records) &&
    records.every(isRecordDto) &&
    isObject(stats) &&
    isCount(stats.proposedCount) &&
    isCount(stats.executedCount) &&
    isCount(stats.successRate) &&
    (body.lastUpdatedAt === null || isTime(body.lastUpdatedAt));
  return ok ? (body as unknown as SeasonState) : null;
}
