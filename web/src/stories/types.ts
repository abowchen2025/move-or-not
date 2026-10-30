/**
 * 劇本設定檔的型別（SRS §3.3 規則 1、D-17）。
 * 畫面上的所有文字都從這裡定義的欄位讀取；少填欄位時編譯失敗。
 */
import type { ApiErrorCode } from '../api/error-codes';

/** 帶參數的文案。日期一律由程式先格式化成 MM/DD（週X）再傳入。 */
export type Template<P> = (params: P) => string;

export interface DateParam {
  date: string;
}

export interface RecordSummaryParam {
  proposed: boolean;
  executed: boolean;
  note: string;
}

/** 與季別無關的介面文字，放在 common.ts，各季可覆寫（D-17）。 */
export interface CommonText {
  /** 週日到週六，用於 MM/DD（週X） */
  weekdays: readonly [string, string, string, string, string, string, string];
  yes: string;
  no: string;
  retry: string;
  cancel: string;
  confirm: string;
  close: string;
  save: string;
  edit: string;
  delete: string;
  addRecord: string;
  logout: string;
  downloadBackup: string;
  /** 頁尾 🔑 的無障礙名稱 */
  adminEntryLabel: string;
  passphrasePrompt: string;
  dateLabel: string;
  noteLabel: string;
  notePlaceholder: string;
  deleteConfirm: Template<DateParam>;
  lastUpdated: Template<{ time: string }>;
  /** 退路模式的時間來源標示（§4.1-5） */
  fallbackClockNotice: string;
  /** 定期更新失敗、仍保留畫面時的小提示（D-06） */
  syncWarning: string;
  noRecords: string;
  recordsUnavailable: string;
  networkError: string;
  replayControls: {
    indicator: string;
    pause: string;
    resume: string;
    next: string;
    speedNormal: string;
    speedDouble: string;
    exit: string;
  };
  toggles: {
    crt: string;
    sound: string;
    on: string;
    off: string;
  };
  /** 依錯誤代碼顯示的文字；各季可在 SeasonStory.errors 覆寫（§7.8） */
  errors: Record<ApiErrorCode, string>;
}

export type MovementConfig =
  | { type: 'float'; amplitudePx: number; periodMs: number }
  | { type: 'walk'; bobPx: number; stepMs: number };

export type EndingConfig = { type: 'purify'; durationMs: number; shortDurationMs: number };

export interface ToneConfig {
  wave: 'square' | 'triangle' | 'sawtooth' | 'sine';
  frequencyHz: number;
  durationMs: number;
  gain: number;
}

/** 各季的劇本內容。 */
export interface SeasonStory {
  /** 必須與 api/seasons.config.json 的 id 相同 */
  id: string;
  meta: {
    documentTitle: string;
    ogTitle: string;
    ogDescription: string;
  };
  title: string;
  loading: string;
  serverDown: string;
  disclaimer: string;
  sections: {
    status: string;
    today: string;
    records: string;
  };
  days: {
    before: string;
    after: string;
    since: Template<{ startDate: string }>;
    endedBefore: string;
    endedAfter: string;
    dayPassed: string;
  };
  stats: {
    line: Template<{ proposedCount: number; executedCount: number; successRate: number }>;
    noSuccessQuip: string;
  };
  today: {
    none: string;
    proposedNotExecuted: string;
    executed: string;
    /** 已完結、但完結日不是今天（D-05） */
    endedEarlier: Template<DateParam>;
  };
  actions: {
    propose: string;
    executed: string;
    notExecuted: string;
  };
  menu: {
    title: string;
    backfillTitle: Template<DateParam>;
    backfillDone: Template<DateParam>;
    recordSummary: Template<RecordSummaryParam>;
    overwriteConfirm: Template<DateParam & { previous: string; next: string }>;
    executedConfirm: Template<DateParam>;
  };
  recordTable: {
    date: string;
    proposed: string;
    executed: string;
    note: string;
  };
  ending: {
    theEnd: string;
    replayButton: string;
  };
  replay: {
    recapButton: string;
    dialogLine: Template<DateParam & RecordSummaryParam>;
    toBeContinued: string;
  };
  /** 覆寫 CommonText.errors 的部分代碼 */
  errors: Partial<Record<ApiErrorCode, string>>;
  character: {
    /** 相對於網站根目錄的 spritesheet JSON 路徑（web/public/ 底下） */
    spritesheet: string;
    movement: MovementConfig;
    ending: EndingConfig;
  };
  audio: {
    button: ToneConfig;
    countUp: ToneConfig;
  };
  /** 覆寫共用介面文字（D-17） */
  common?: Partial<CommonText>;
}

/** 前端實際使用的完整劇本：季別內容＋已合併的共用文字。 */
export type StoryConfig = Omit<SeasonStory, 'common' | 'errors'> & {
  common: CommonText;
  errors: Record<ApiErrorCode, string>;
};

export function resolveStory(season: SeasonStory, common: CommonText): StoryConfig {
  const { common: overrides, errors, ...rest } = season;
  const mergedCommon: CommonText = { ...common, ...overrides };
  return {
    ...rest,
    common: mergedCommon,
    errors: { ...mergedCommon.errors, ...errors },
  };
}
