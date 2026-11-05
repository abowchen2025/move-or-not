/**
 * 由同步狀態與劇本算出畫面內容（FR-01、FR-03～FR-05、FR-07、FR-09、FR-11、§4.1-5、§4.4）。
 * 純函式：所有文字都來自劇本，不寫死在這裡（§3.3 規則 1）。
 */
import type { RecordDto } from '../api/types';
import type { StoryConfig } from '../stories/types';
import type { Snapshot } from '../sync/controller';
import { daysElapsed, taipeiDate } from '../time/taipei';
import { formatDateTime, formatFullDate, formatMonthDay } from './format';
import { todayStatus } from './today-status';

export interface YesNoCell {
  value: boolean;
  text: string;
}

export interface RecordRow {
  date: string;
  proposed: YesNoCell;
  executed: YesNoCell;
  /** 使用者輸入，只能以 textContent 輸出（NFR-S6） */
  note: string;
}

export interface ViewModel {
  documentTitle: string;
  title: string;
  /** 讀取中文案；不是讀取中時為 null */
  loading: string | null;
  /** 讀取失敗的訊息與重試按鈕（FR-11） */
  alert: { message: string; detail: string | null; retry: string } | null;
  status: {
    heading: string;
    days: { before: string; value: number; after: string; since: string };
    stats: { line: string; quip: string | null } | null;
  } | null;
  today: { heading: string; text: string } | null;
  records: {
    heading: string;
    columns: { date: string; proposed: string; executed: string; note: string };
    /** null＝暫時看不到記錄（退路模式） */
    rows: RecordRow[] | null;
    message: string | null;
  } | null;
  footer: {
    disclaimer: string;
    lastUpdated: string | null;
    clockNotice: string | null;
    syncWarning: string | null;
  };
}

function recordRows(records: readonly RecordDto[], story: StoryConfig): RecordRow[] {
  const { common } = story;
  const cell = (value: boolean): YesNoCell => ({ value, text: value ? common.yes : common.no });
  return [...records]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((record) => ({
      date: formatMonthDay(record.date, common),
      proposed: cell(record.proposed),
      executed: cell(record.executed),
      note: record.note,
    }));
}

function daysBlock(
  story: StoryConfig,
  startDate: string,
  value: number,
  ended: boolean,
): NonNullable<ViewModel['status']>['days'] {
  const { days, common } = story;
  return {
    before: ended ? days.endedBefore : days.before,
    value,
    after: ended ? days.endedAfter : days.after,
    since: days.since({ startDate: formatFullDate(startDate, common) }),
  };
}

export function buildViewModel(snapshot: Snapshot, story: StoryConfig): ViewModel {
  const { common } = story;
  const base: ViewModel = {
    documentTitle: story.meta.documentTitle,
    title: story.title,
    loading: null,
    alert: null,
    status: null,
    today: null,
    records: null,
    footer: {
      disclaimer: story.disclaimer,
      lastUpdated: null,
      clockNotice: null,
      syncWarning: null,
    },
  };
  const recordsBase = {
    heading: story.sections.records,
    columns: { ...story.recordTable },
  };

  switch (snapshot.kind) {
    case 'loading':
      return { ...base, loading: story.loading };

    case 'unavailable':
      return {
        ...base,
        alert: { message: story.errors.SEASON_NOT_FOUND, detail: null, retry: common.retry },
      };

    case 'fallback': {
      // 退路模式：訪客時鐘換算台灣日期；無法得知是否完結，天數不凍結（§4.1-5、D-04、D-27）
      const { season, localNow, errorCode } = snapshot;
      const value = daysElapsed(
        season.startDate,
        taipeiDate(localNow),
        season.countInclusive,
        null,
      );
      return {
        ...base,
        alert: {
          message: story.serverDown,
          detail: errorCode ? story.errors[errorCode] : null,
          retry: common.retry,
        },
        status: {
          heading: story.sections.status,
          days: daysBlock(story, season.startDate, value, false),
          stats: null,
        },
        records: { ...recordsBase, rows: null, message: common.recordsUnavailable },
        footer: { ...base.footer, clockNotice: common.fallbackClockNotice },
      };
    }

    case 'ready': {
      const { state, syncFailing } = snapshot;
      const status = todayStatus(state);
      const rows = recordRows(state.records, story);
      return {
        ...base,
        status: {
          heading: story.sections.status,
          days: daysBlock(story, state.startDate, state.daysElapsed, state.ended),
          stats: {
            line: story.stats.line(state.stats),
            quip: state.stats.executedCount === 0 ? story.stats.noSuccessQuip : null,
          },
        },
        today: {
          heading: story.sections.today,
          text:
            status.kind === 'endedEarlier'
              ? story.today.endedEarlier({ date: formatMonthDay(status.endedDate, common) })
              : story.today[status.kind],
        },
        records: {
          ...recordsBase,
          rows,
          message: rows.length === 0 ? common.noRecords : null,
        },
        footer: {
          ...base.footer,
          lastUpdated: state.lastUpdatedAt
            ? common.lastUpdated({ time: formatDateTime(state.lastUpdatedAt, common) })
            : null,
          syncWarning: syncFailing ? common.syncWarning : null,
        },
      };
    }
  }
}
