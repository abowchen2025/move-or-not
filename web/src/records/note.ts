/**
 * 備註的檢查與正規化，規則與後端 api/app/records.py 一致（SRS §5.1、D-09、D-28、D-34）。
 *
 * 1. 只要含換行或控制字元（Unicode Cc、Zl、Zp）就拒絕，不論位置（D-28）。
 * 2. 再去掉頭尾的一般空白字元（只有 Unicode Zs，含全形空白與 U+00A0）。
 *    不使用 String.prototype.trim()：trim() 也會去掉 U+FEFF 等字元，與後端不一致（D-34）。
 * 3. 字數以 Unicode code point 計算，上限 100（D-09）。
 */
export const NOTE_MAX_CODE_POINTS = 100;

const FORBIDDEN = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const LEADING_SPACE = /^\p{Zs}+/u;
const TRAILING_SPACE = /\p{Zs}+$/u;

export type NoteResult =
  { ok: true; value: string } | { ok: false; code: 'INVALID_REQUEST' | 'NOTE_TOO_LONG' };

export function normalizeNote(input: string): NoteResult {
  if (FORBIDDEN.test(input)) return { ok: false, code: 'INVALID_REQUEST' };
  const value = input.replace(LEADING_SPACE, '').replace(TRAILING_SPACE, '');
  if ([...value].length > NOTE_MAX_CODE_POINTS) return { ok: false, code: 'NOTE_TOO_LONG' };
  return { ok: true, value };
}

/**
 * 「提了」選單的備註（FR-06、D-34）：正規化後為空字串時視為留空，送出 null，保留原備註。
 */
export function menuNote(input: string): { ok: true; value: string | null } | NoteResult {
  const result = normalizeNote(input);
  if (!result.ok) return result;
  return { ok: true, value: result.value === '' ? null : result.value };
}
