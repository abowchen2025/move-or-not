/** 日期與時間的顯示格式。文字格式來自劇本（common.formats），這裡只負責拆出數字。 */
import { taipeiParts, weekday } from '../time/taipei';
import type { CommonText } from '../stories/types';

function split(date: string): { year: string; month: string; day: string } {
  const [year = '', month = '', day = ''] = date.split('-');
  return { year, month, day };
}

/** 'YYYY-MM-DD' → MM/DD（週X），例如 10/28（三）。 */
export function formatMonthDay(date: string, common: CommonText): string {
  const { month, day } = split(date);
  return common.formats.monthDay({ month, day, weekday: common.weekdays[weekday(date)] ?? '' });
}

/** 'YYYY-MM-DD' → 2026/10/13。 */
export function formatFullDate(date: string, common: CommonText): string {
  return common.formats.fullDate(split(date));
}

/** ISO 8601 時間 → 台灣時間的 10/30 10:00。 */
export function formatDateTime(iso: string, common: CommonText): string {
  const { month, day, hour, minute } = taipeiParts(Date.parse(iso));
  return common.formats.dateTime({ month, day, hour, minute });
}
