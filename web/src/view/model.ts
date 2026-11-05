/**
 * 由同步狀態與劇本算出畫面內容（FR-01、FR-03～FR-05、FR-07、FR-09、FR-11、§4.1-5、§4.4）。
 * 純函式：所有文字都來自劇本，不寫死在這裡（§3.3 規則 1）。
 */
import type { RecordDto } from '../api/types';
import type { StoryConfig } from '../stories/types';
import type { Snapshot } from '../sync/controller';
import { writableRange } from '../records/validate';
import { daysElapsed, taipeiDate } from '../time/taipei';
import { formatDateTime, formatFullDate, formatMonthDay } from './format';
import { todayStatus } from './today-status';

export interface YesNoCell {
  value: boolean;
  text: string;
}

export interface RecordRow {
  /** 原始日期 YYYY-MM-DD（管理模式的編輯／刪除用） */
  key: string;
  date: string;
  proposed: YesNoCell;
  executed: YesNoCell;
  /** 使用者輸入，只能以 textContent 輸出（NFR-S6） */
  note: string;
}

export interface ToggleModel {
  label: string;
  /** 目前狀態的文字（開／關） */
  state: string;
  pressed: boolean;
}

export interface ViewModel {
  documentTitle: string;
  title: string;
  /** 完結畫面的「— 全劇終 —」（§4.4、D-21）；完結演出結束前為 null */
  theEnd: string | null;
  /** CRT 掃描線是否開啟（§9.1、D-12） */
  crt: boolean;
  /** 讀取中文案；不是讀取中時為 null */
  loading: string | null;
  /** 讀取失敗的訊息與重試按鈕（FR-11） */
  alert: { message: string; detail: string | null; retry: string } | null;
  status: {
    heading: string;
    days: { before: string; value: number; after: string; since: string };
    stats: { line: string; quip: string | null } | null;
  } | null;
  today: {
    heading: string;
    text: string;
    /** 「提了」按鈕的文字；不顯示時為 null（FR-05、D-31） */
    propose: string | null;
    /** 補記成功等提示（FR-06）；沒有時為 null */
    notice: string | null;
  } | null;
  records: {
    heading: string;
    columns: { date: string; proposed: string; executed: string; note: string };
    /** null＝暫時看不到記錄（退路模式） */
    rows: RecordRow[] | null;
    message: string | null;
    /** 管理模式的按鈕文字（FR-08）；不在管理模式時為 null */
    admin: {
      label: string;
      add: string;
      backup: string;
      logout: string;
      actionsColumn: string;
      edit: string;
      delete: string;
      /** 刪除、下載備份失敗時的訊息 */
      message: string | null;
    } | null;
  } | null;
  footer: {
    disclaimer: string;
    lastUpdated: string | null;
    clockNotice: string | null;
    syncWarning: string | null;
    /** 頁尾的 🔑 管理入口（FR-09）；管理模式中或資料未載入時不顯示 */
    adminEntry: { icon: string; label: string } | null;
    /** CRT 與音效開關（§9.1、D-12）；音效在瀏覽器不支援時為 null */
    toggles: { crt: ToggleModel; sound: ToggleModel | null };
  };
}

/** 不屬於同步資料的畫面狀態 */
export interface UiState {
  admin: boolean;
  notice: string | null;
  adminMessage: string | null;
  /** 完結演出已結束、顯示完結畫面（D-21） */
  endingShown: boolean;
  /** CRT 預設開（§9.1）；音效預設關（D-12）；都不保存 */
  crt: boolean;
  sound: boolean;
  /** 瀏覽器是否支援 Web Audio */
  soundSupported: boolean;
}

export const DEFAULT_UI: UiState = {
  admin: false,
  notice: null,
  adminMessage: null,
  endingShown: false,
  crt: true,
  sound: false,
  soundSupported: true,
};

function toggle(label: string, on: boolean, story: StoryConfig): ToggleModel {
  const { toggles } = story.common;
  return { label, state: on ? toggles.on : toggles.off, pressed: on };
}

function recordRows(records: readonly RecordDto[], story: StoryConfig): RecordRow[] {
  const { common } = story;
  const cell = (value: boolean): YesNoCell => ({ value, text: value ? common.yes : common.no });
  return [...records]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((record) => ({
      key: record.date,
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

export function buildViewModel(
  snapshot: Snapshot,
  story: StoryConfig,
  ui: UiState = DEFAULT_UI,
): ViewModel {
  const { common } = story;
  const base: ViewModel = {
    documentTitle: story.meta.documentTitle,
    title: story.title,
    theEnd: ui.endingShown ? story.ending.theEnd : null,
    crt: ui.crt,
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
      adminEntry: null,
      toggles: {
        crt: toggle(common.toggles.crt, ui.crt, story),
        sound: ui.soundSupported ? toggle(common.toggles.sound, ui.sound, story) : null,
      },
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
        records: { ...recordsBase, rows: null, message: common.recordsUnavailable, admin: null },
        footer: { ...base.footer, clockNotice: common.fallbackClockNotice },
      };
    }

    case 'ready': {
      const { state, syncFailing } = snapshot;
      const status = todayStatus(state);
      const rows = recordRows(state.records, story);
      // 「提了」：已完結後隱藏，修正只能透過管理模式（FR-05、D-31）；起始日在未來時沒有可寫的日期（D-27）
      const canPropose = !state.ended && writableRange(state.startDate, state.today) !== null;
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
          propose: canPropose ? story.actions.propose : null,
          notice: ui.notice,
        },
        records: {
          ...recordsBase,
          rows,
          message: rows.length === 0 ? common.noRecords : null,
          admin: ui.admin
            ? {
                label: common.adminMode,
                add: common.addRecord,
                backup: common.downloadBackup,
                logout: common.logout,
                actionsColumn: common.actionsColumn,
                edit: common.edit,
                delete: common.delete,
                message: ui.adminMessage,
              }
            : null,
        },
        footer: {
          ...base.footer,
          lastUpdated: state.lastUpdatedAt
            ? common.lastUpdated({ time: formatDateTime(state.lastUpdatedAt, common) })
            : null,
          syncWarning: syncFailing ? common.syncWarning : null,
          adminEntry: ui.admin
            ? null
            : { icon: common.adminEntryIcon, label: common.adminEntryLabel },
        },
      };
    }
  }
}
