import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const expectedTimeZone = process.env.EXPECTED_TZ;

// 2026-10-30（洛杉磯仍為夏令時間）各時區的 getTimezoneOffset()
const OFFSETS: Record<string, number> = {
  'Asia/Taipei': -480,
  'America/Los_Angeles': 420,
  'Pacific/Kiritimati': -840,
};

describe('執行環境', () => {
  it.runIf(expectedTimeZone)('TZ 設定確實生效', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(expectedTimeZone);
    expect(new Date('2026-10-30T12:00:00Z').getTimezoneOffset()).toBe(
      OFFSETS[expectedTimeZone ?? ''],
    );
  });
});

interface DaysCase {
  name: string;
  nowUtc: string;
  taipeiToday: string;
  expectedDays: number;
}

describe('共用案例表 testdata/days-cases.json', () => {
  const cases = (
    JSON.parse(
      readFileSync(new URL('../../testdata/days-cases.json', import.meta.url), 'utf-8'),
    ) as { cases: DaysCase[] }
  ).cases;

  it('至少有一筆案例', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)('$name：nowUtc 換算台灣日期與 taipeiToday 一致', (c) => {
    const taipeiDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(c.nowUtc));
    expect(taipeiDate).toBe(c.taipeiToday);
  });
});
