import { describe, expect, it } from 'vitest';
import { getStory } from '../stories';
import { makeState, record, taipei } from '../testing/fixtures';
import type { Snapshot } from '../sync/controller';
import { buildViewModel } from './model';

const story = getStory('season-1')!;
const { common } = story;
const NOW = taipei('2026-10-30T10:00:00');
const season = { id: 'season-1', startDate: '2026-10-13', countInclusive: false };

function ready(records = [record('2026-10-13', true, false, 'a')], syncFailing = false): Snapshot {
  return {
    kind: 'ready',
    seasonId: 'season-1',
    state: makeState({ serverNow: NOW, records }),
    syncFailing,
  };
}

describe('FR-01、FR-03、FR-04 標題、天數、統計', () => {
  it('文字都來自劇本', () => {
    const model = buildViewModel(ready(), story);
    expect(model.title).toBe(story.title);
    expect(model.documentTitle).toBe(story.meta.documentTitle);
    expect(model.status?.heading).toBe(story.sections.status);
    expect(model.status?.days).toEqual({
      before: story.days.before,
      value: 17,
      after: story.days.after,
      since: story.days.since({ startDate: '2026/10/13' }),
    });
    expect(model.status?.stats).toEqual({
      line: story.stats.line({ proposedCount: 1, executedCount: 0, successRate: 0 }),
      quip: story.stats.noSuccessQuip,
    });
  });

  it('有成功執行時不顯示 0 次的小字', () => {
    const model = buildViewModel(ready([record('2026-10-28', true, true)]), story);
    expect(model.status?.stats?.quip).toBeNull();
  });

  it('§4.4、AC-23 已完結：天數用伺服器凍結的值，改用完結的文字', () => {
    const model = buildViewModel(
      ready([record('2026-10-23', true, true), record('2026-10-28', true, false)]),
      story,
    );
    expect(model.status?.days).toMatchObject({
      before: story.days.endedBefore,
      value: 10,
      after: story.days.endedAfter,
    });
  });
});

describe('FR-05 今日狀態的文字', () => {
  it('完結日是過去時，顯示 D-05 文案與 MM/DD（週X）', () => {
    const model = buildViewModel(ready([record('2026-10-28', true, true)]), story);
    expect(model.today).toEqual({
      heading: story.sections.today,
      text: story.today.endedEarlier({ date: '10/28（三）' }),
    });
  });

  it('今天提了沒提', () => {
    const model = buildViewModel(ready([record('2026-10-30', true, false)]), story);
    expect(model.today?.text).toBe(story.today.proposedNotExecuted);
  });
});

describe('FR-07 記錄表', () => {
  it('新到舊排序、日期為 MM/DD（週X）、是否附文字', () => {
    const snapshot = ready([
      record('2026-10-13', true, false, 'a'),
      record('2026-10-28', true, false, 'c'),
      record('2026-10-23', false, false, 'b'),
    ]);
    const model = buildViewModel(snapshot, story);
    expect(model.records?.columns).toEqual(story.recordTable);
    expect(model.records?.rows).toEqual([
      {
        date: '10/28（三）',
        proposed: { value: true, text: common.yes },
        executed: { value: false, text: common.no },
        note: 'c',
      },
      {
        date: '10/23（五）',
        proposed: { value: false, text: common.no },
        executed: { value: false, text: common.no },
        note: 'b',
      },
      {
        date: '10/13（二）',
        proposed: { value: true, text: common.yes },
        executed: { value: false, text: common.no },
        note: 'a',
      },
    ]);
    expect(model.records?.message).toBeNull();
  });

  it('沒有記錄時顯示「尚無記錄」', () => {
    const model = buildViewModel(ready([]), story);
    expect(model.records?.rows).toEqual([]);
    expect(model.records?.message).toBe(common.noRecords);
  });

  it('備註原樣保留（由畫面以 textContent 輸出）', () => {
    const note = '<script>alert(1)</script>';
    const model = buildViewModel(ready([record('2026-10-28', true, false, note)]), story);
    expect(model.records?.rows?.[0]?.note).toBe(note);
  });
});

describe('FR-09 頁尾', () => {
  it('最後更新取最新的 updatedAt，以台灣時間顯示（不論 TZ）', () => {
    const model = buildViewModel(
      ready([
        record('2026-10-28', true, false, '', '2026-10-28T18:00:00+08:00'),
        record('2026-10-29', true, false, '', '2026-10-29T16:30:00Z'),
      ]),
      story,
    );
    expect(model.footer.lastUpdated).toBe(common.lastUpdated({ time: '10/30 00:30' }));
    expect(model.footer.disclaimer).toBe(story.disclaimer);
    expect(model.footer.clockNotice).toBeNull();
    expect(model.footer.syncWarning).toBeNull();
  });

  it('沒有記錄時不顯示最後更新', () => {
    expect(buildViewModel(ready([]), story).footer.lastUpdated).toBeNull();
  });

  it('D-06 定期更新失敗時保留畫面並顯示小提示', () => {
    const model = buildViewModel(ready(undefined, true), story);
    expect(model.footer.syncWarning).toBe(common.syncWarning);
    expect(model.status?.days.value).toBe(17);
  });
});

describe('FR-11 讀取中與錯誤', () => {
  it('讀取中只顯示標題、讀取文字與頁尾', () => {
    const model = buildViewModel({ kind: 'loading', seasonId: 'season-1' }, story);
    expect(model.loading).toBe(story.loading);
    expect(model.alert).toBeNull();
    expect(model.status).toBeNull();
    expect(model.today).toBeNull();
    expect(model.records).toBeNull();
    expect(model.footer.disclaimer).toBe(story.disclaimer);
  });

  it('§4.1-5 退路模式：錯誤訊息、重試、訪客時鐘換算台灣日期、⚠ 標示、暫時看不到記錄', () => {
    const model = buildViewModel(
      {
        kind: 'fallback',
        seasonId: 'season-1',
        season,
        // 洛杉磯 10/30 10:00 ＝ 台灣 10/31 01:00 → 18 天
        localNow: Date.parse('2026-10-30T17:00:00Z'),
        errorCode: null,
      },
      story,
    );
    expect(model.alert).toEqual({ message: story.serverDown, detail: null, retry: common.retry });
    expect(model.status?.days.value).toBe(18);
    expect(model.status?.stats).toBeNull();
    expect(model.today).toBeNull();
    expect(model.records).toMatchObject({ rows: null, message: common.recordsUnavailable });
    expect(model.footer.clockNotice).toBe(common.fallbackClockNotice);
    expect(model.footer.lastUpdated).toBeNull();
  });

  it('退路模式有錯誤代碼時，加上劇本中的錯誤文字', () => {
    const model = buildViewModel(
      {
        kind: 'fallback',
        seasonId: 'season-1',
        season,
        localNow: NOW,
        errorCode: 'DATA_FILE_ERROR',
      },
      story,
    );
    expect(model.alert?.detail).toBe(story.errors.DATA_FILE_ERROR);
  });

  it('D-27 退路模式的起始日在未來時天數為 0', () => {
    const model = buildViewModel(
      {
        kind: 'fallback',
        seasonId: 'season-1',
        season: { ...season, startDate: '2026-12-01' },
        localNow: NOW,
        errorCode: null,
      },
      story,
    );
    expect(model.status?.days.value).toBe(0);
  });

  it('D-22-k 缺少劇本：顯示錯誤與重試', () => {
    const model = buildViewModel({ kind: 'unavailable', seasonId: 'season-9' }, story);
    expect(model.alert).toEqual({
      message: story.errors.SEASON_NOT_FOUND,
      detail: null,
      retry: common.retry,
    });
    expect(model.status).toBeNull();
  });
});
