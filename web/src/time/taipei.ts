/**
 * 台灣日期與天數的純函式（SRS §4.1-1、§4.2、§4.4、D-27）。
 * 日期一律以 'YYYY-MM-DD' 字串表示，不使用訪客電腦的時區。
 */
export const TIME_ZONE = 'Asia/Taipei';

const MS_PER_DAY = 86_400_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface TaipeiParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

/** 某個瞬間在台灣的年月日時分（皆補零）。 */
export function taipeiParts(epochMs: number): TaipeiParts {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of partsFormatter.formatToParts(epochMs)) parts[part.type] = part.value;
  const { year, month, day, hour, minute } = parts;
  if (!year || !month || !day || !hour || !minute) throw new Error('無法換算台灣時間');
  return { year, month, day, hour, minute };
}

/** 某個瞬間的台灣日期。 */
export function taipeiDate(epochMs: number): string {
  const { year, month, day } = taipeiParts(epochMs);
  return `${year}-${month}-${day}`;
}

/** 'YYYY-MM-DD' 轉成日序（1970-01-01 為 0）。只看日曆日，與時分秒無關。 */
export function dayNumber(date: string): number {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new Error('日期格式必須是 YYYY-MM-DD');
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const utc = Date.UTC(y, m - 1, d);
  if (new Date(utc).toISOString().slice(0, 10) !== date) throw new Error('日期不存在');
  // UTC 午夜相減一定是 86400000 的整數倍，不會有夏令時間的邊界誤差
  return utc / MS_PER_DAY;
}

/** 星期幾（0＝週日）。 */
export function weekday(date: string): number {
  return new Date(dayNumber(date) * MS_PER_DAY).getUTCDay();
}

/**
 * 已經過的天數：today − startDate（日曆日相減）；有完結日時凍結在完結日（§4.4）。
 * 起始日在未來時最小為 0（D-27）。
 */
export function daysElapsed(
  startDate: string,
  today: string,
  countInclusive: boolean,
  endedDate: string | null,
): number {
  const until = dayNumber(endedDate ?? today);
  const start = dayNumber(startDate);
  if (until < start) return 0;
  return until - start + (countInclusive ? 1 : 0);
}
