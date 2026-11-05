import { describe, expect, it } from 'vitest';
import { getStory } from '../stories';
import { record } from '../testing/fixtures';
import { todayStatus } from './today-status';

// 文案一律從劇本取得，測試檔不寫死主題字詞（D-22-p、AC-30）
const text = getStory('season-1')!.today;
const TODAY = '2026-10-30';

function state(todayRecord: ReturnType<typeof record> | null, endedDate: string | null = null) {
  return { today: TODAY, ended: endedDate !== null, endedDate, todayRecord };
}

describe('FR-05 今日狀態', () => {
  it(`今天沒有記錄 → ${text.none}`, () => {
    expect(todayStatus(state(null))).toEqual({ kind: 'none' });
  });

  it(`proposed=true, executed=false → ${text.proposedNotExecuted}`, () => {
    expect(todayStatus(state(record(TODAY, true, false)))).toEqual({
      kind: 'proposedNotExecuted',
    });
  });

  it(`proposed=true, executed=true → ${text.executed}`, () => {
    expect(todayStatus(state(record(TODAY, true, true), TODAY))).toEqual({ kind: 'executed' });
  });

  it(`proposed=false → ${text.none}`, () => {
    expect(todayStatus(state(record(TODAY, false, false)))).toEqual({ kind: 'none' });
  });
});

describe('D-05、D-31 已完結後的今日狀態', () => {
  it('完結日是過去、今天沒有記錄 → 完結文案', () => {
    expect(todayStatus(state(null, '2026-10-28'))).toEqual({
      kind: 'endedEarlier',
      endedDate: '2026-10-28',
    });
  });

  it.each([
    ['proposed=true, executed=false', record(TODAY, true, false)],
    ['proposed=false, executed=false', record(TODAY, false, false)],
    ['proposed=true, executed=true', record(TODAY, true, true)],
  ])('完結日是過去、今天新增的記錄（%s）不影響顯示', (_label, todayRecord) => {
    expect(todayStatus(state(todayRecord, '2026-10-28'))).toEqual({
      kind: 'endedEarlier',
      endedDate: '2026-10-28',
    });
  });

  it(`今天就是完結日 → 照 FR-05 顯示「${text.executed}」`, () => {
    expect(todayStatus(state(record(TODAY, true, true), TODAY))).toEqual({ kind: 'executed' });
  });
});
