import { describe, expect, it } from 'vitest';
import { checkDate, checkFlags, writableRange } from './validate';

describe('AC-21 可寫入的日期範圍', () => {
  const range = writableRange('2026-10-13', '2026-10-30');

  it('起始日～台灣今天', () => {
    expect(range).toEqual({ min: '2026-10-13', max: '2026-10-30' });
  });

  it.each(['2026-10-13', '2026-10-29', '2026-10-30'])('範圍內：%s', (date) => {
    expect(checkDate(date, range)).toBeNull();
  });

  it.each(['2026-10-12', '2026-10-31', '2027-01-01'])('範圍外：%s → INVALID_DATE', (date) => {
    expect(checkDate(date, range)).toBe('INVALID_DATE');
  });

  it.each(['', '2026-02-30', '2026/10/20', 'x'])('格式不合法：%j → INVALID_DATE', (date) => {
    expect(checkDate(date, range)).toBe('INVALID_DATE');
  });

  it('D-27 起始日在未來時範圍為空，任何日期都不能寫', () => {
    const empty = writableRange('2026-12-01', '2026-10-30');
    expect(empty).toBeNull();
    expect(checkDate('2026-10-30', empty)).toBe('INVALID_DATE');
  });
});

describe('AC-11 執行＝是時，提出必須為是', () => {
  it.each([
    [true, true, null],
    [true, false, null],
    [false, false, null],
    [false, true, 'EXECUTED_REQUIRES_PROPOSED'],
  ] as const)('proposed=%s, executed=%s → %s', (proposed, executed, expected) => {
    expect(checkFlags(proposed, executed)).toBe(expected);
  });
});
