import type { SeasonStory } from './types';

/** 第一季劇本。文案依 SRS FR-01～FR-13、§9.3；D-05 的文案為 RD 提案。 */
export const season1 = {
  id: 'season-1',
  meta: {
    documentTitle: '今天搬家沒？！',
    ogTitle: '今天搬家沒？！',
    ogDescription: '一則還在連載的職場鬼故事。',
  },
  title: '今天搬家沒？！',
  loading: '讀取存檔中……（跟搬家進度一樣慢）',
  serverDown: '伺服器正在睡覺（讀取失敗）',
  disclaimer: '本故事純屬虛構，如有雷同，那應該就是真的。',
  sections: {
    status: '狀態',
    today: '今天提搬家沒？',
    records: '搬家記錄',
  },
  days: {
    before: '已經過了',
    after: '天',
    since: ({ startDate }) => `（自 ${startDate} 起算，台灣時間）`,
    endedBefore: '歷時',
    endedAfter: '天，終於搬了',
    dayPassed: '又過了一天。',
  },
  stats: {
    line: ({ proposedCount, executedCount, successRate }) =>
      `喊搬 ${proposedCount} 次｜實際搬 ${executedCount} 次｜達成率 ${successRate}%`,
    noSuccessQuip: '本季 KPI：搬家。進度：載入中。',
  },
  today: {
    none: '今天還沒人提',
    proposedNotExecuted: '今天提了，沒搬',
    executed: '今天提了，真的搬了！',
    endedEarlier: ({ date }) => `已於 ${date} 真的搬了，今天不用再問了。`,
  },
  actions: {
    propose: '提了',
    executed: '有搬',
    notExecuted: '沒搬',
  },
  menu: {
    title: '今天的狀況',
    backfillTitle: ({ date }) => `補記 ${date}`,
    backfillDone: ({ date }) => `已補記 ${date}`,
    recordSummary: ({ proposed, executed, note }) =>
      [proposed ? '提了' : '沒提', executed ? '有搬' : '沒搬', note ? `備註：${note}` : '']
        .filter(Boolean)
        .join('，'),
    overwriteConfirm: ({ date, previous, next }) =>
      `${date} 已經記過了（${previous}），要改成 ${next} 嗎？`,
    executedConfirm: ({ date }) => `確定 ${date} 真的搬了？這可是會讓天數停在那一天的。`,
  },
  recordTable: {
    date: '日期',
    proposed: '提出',
    executed: '執行',
    note: '備註',
  },
  ending: {
    theEnd: '— 全劇終 —',
    replayButton: '▶ 回放劇情',
  },
  replay: {
    recapButton: '▶ 劇情回顧',
    dialogLine: ({ date, proposed, executed, note }) =>
      `${date} 提出：${proposed ? '是' : '否'}\u3000執行：${executed ? '是' : '否'}` +
      (note ? `\n── ${note}` : ''),
    toBeContinued: '（未完待續）',
  },
  errors: {
    UNAUTHORIZED: '權限不足：你不是可以決定搬不搬的人。',
    TOO_MANY_ATTEMPTS: '你試太多次了，跟搬家一樣，等等再說。',
  },
  character: {
    spritesheet: 'sprites/ghost.json',
    movement: { type: 'float', amplitudePx: 2, periodMs: 1500 },
    ending: { type: 'purify', durationMs: 4000, shortDurationMs: 2000 },
  },
  audio: {
    button: { wave: 'square', frequencyHz: 880, durationMs: 60, gain: 0.08 },
    countUp: { wave: 'triangle', frequencyHz: 660, durationMs: 90, gain: 0.08 },
  },
} satisfies SeasonStory;
