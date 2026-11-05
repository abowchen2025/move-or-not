import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dayNumber, daysElapsed, taipeiDate, taipeiParts, weekday } from './taipei';

interface DaysCase {
  name: string;
  nowUtc: string;
  taipeiToday: string;
  startDate: string;
  countInclusive: boolean;
  endedDate: string | null;
  expectedDays: number;
}

const cases = (
  JSON.parse(
    readFileSync(new URL('../../../testdata/days-cases.json', import.meta.url), 'utf-8'),
  ) as { cases: DaysCase[] }
).cases;

describe('§4.2 天數公式（與後端共用 testdata/days-cases.json）', () => {
  it.each(cases)('$name', (c) => {
    const today = taipeiDate(Date.parse(c.nowUtc));
    expect(today).toBe(c.taipeiToday);
    expect(daysElapsed(c.startDate, today, c.countInclusive, c.endedDate)).toBe(c.expectedDays);
  });
});

describe('§4.1-1 台灣日期與訪客時區無關', () => {
  it('台灣 00:00 前後一秒是不同的日期（不論 TZ）', () => {
    expect(taipeiDate(Date.parse('2026-10-30T15:59:59Z'))).toBe('2026-10-30');
    expect(taipeiDate(Date.parse('2026-10-30T16:00:00Z'))).toBe('2026-10-31');
  });

  it('洛杉磯還是前一天時，台灣已經是隔天', () => {
    // 洛杉磯 2026-10-30 10:00（UTC−7）＝台灣 2026-10-31 01:00
    expect(taipeiDate(Date.parse('2026-10-30T17:00:00Z'))).toBe('2026-10-31');
  });

  it('時分以 24 小時制補零', () => {
    expect(taipeiParts(Date.parse('2026-10-30T16:05:00Z'))).toEqual({
      year: '2026',
      month: '10',
      day: '31',
      hour: '00',
      minute: '05',
    });
  });
});

describe('日曆日', () => {
  it('跨月、跨年只看日期', () => {
    expect(dayNumber('2026-11-01') - dayNumber('2026-10-31')).toBe(1);
    expect(dayNumber('2027-01-01') - dayNumber('2026-12-31')).toBe(1);
  });

  it('星期幾', () => {
    expect(weekday('2026-10-28')).toBe(3);
    expect(weekday('2026-10-13')).toBe(2);
    expect(weekday('2026-11-01')).toBe(0);
  });

  it.each(['2026-02-30', '2026/10/13', '2026-1-3', ''])('拒絕不合法的日期：%s', (value) => {
    expect(() => dayNumber(value)).toThrow();
  });

  it('D-27 起始日在未來時最小為 0', () => {
    expect(daysElapsed('2026-11-10', '2026-11-02', false, null)).toBe(0);
    expect(daysElapsed('2026-11-10', '2026-11-02', true, null)).toBe(0);
  });
});
