/**
 * 寫入前的前端檢查，與 API 的規則一致（SRS §5.1、§7.5、FR-06、FR-08、AC-11、AC-21）。
 * 前端先擋下明顯錯誤，API 仍會再檢查一次。
 */
import type { ApiErrorCode } from '../api/error-codes';
import { dayNumber } from '../time/taipei';

export interface DateRange {
  /** 該季起始日 */
  min: string;
  /** 台灣今天 */
  max: string;
}

/** 可寫入的日期範圍：起始日～台灣今天；起始日在未來時為空（D-27）。 */
export function writableRange(startDate: string, today: string): DateRange | null {
  return dayNumber(startDate) <= dayNumber(today) ? { min: startDate, max: today } : null;
}

function isValidDate(value: string): boolean {
  try {
    dayNumber(value);
    return true;
  } catch {
    return false;
  }
}

/** 日期必須是合法的 YYYY-MM-DD，且在範圍內（AC-21）。 */
export function checkDate(value: string, range: DateRange | null): ApiErrorCode | null {
  if (!range || !isValidDate(value)) return 'INVALID_DATE';
  const day = dayNumber(value);
  return day < dayNumber(range.min) || day > dayNumber(range.max) ? 'INVALID_DATE' : null;
}

/** 執行＝是時，提出必須為是（AC-11）。 */
export function checkFlags(proposed: boolean, executed: boolean): ApiErrorCode | null {
  return executed && !proposed ? 'EXECUTED_REQUIRES_PROPOSED' : null;
}
