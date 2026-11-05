/**
 * 把畫面、同步、對話框與寫入流程接在一起（FR-05、FR-06、FR-08、FR-09、§8.4）。
 * - 「提了」選單與管理模式只在資料載入完成（ready）時可用。
 * - 管理模式的入口：頁尾 🔑，或網址 #admin（進站時與 hashchange 時）。
 * - 寫入成功後立即重新抓 state（FR-06）。
 */
import type { AdminApi } from './api/client';
import type { PassphraseStore } from './auth/session';
import type { AppConfig } from './config';
import { writableRange } from './records/validate';
import type { StoryConfig } from './stories/types';
import type { Snapshot, SyncController } from './sync/controller';
import type { ServerClock } from './time/server-clock';
import { taipeiDate } from './time/taipei';
import { openRecordForm } from './view/dialog/record-form';
import { domPrompts } from './view/dialog/prompts';
import { formatMonthDay } from './view/format';
import { openProposeMenu } from './view/menu/propose-menu';
import { buildViewModel, type UiState } from './view/model';
import type { View, ViewHandlers } from './view/render';
import {
  deleteRecord,
  downloadBackup,
  ensurePassphrase,
  saveAdminRecord,
  submitProposal,
  type WriteDeps,
  type WriteResult,
} from './write/flows';

export const ADMIN_HASH = '#admin';

export interface AppOptions {
  window: Window;
  api: AdminApi;
  store: PassphraseStore;
  clock: ServerClock;
  config: Pick<AppConfig, 'writeTimeoutMs' | 'noticeMs'>;
  storyFor: (seasonId: string) => StoryConfig;
}

export interface App {
  handlers: ViewHandlers;
  /** 同步狀態改變時呼叫 */
  update(snapshot: Snapshot): void;
  attach(view: View, controller: SyncController): void;
}

/** 對話框的結果 → 選單／表單需要的值：null＝成功、'cancelled'＝取消、其他＝錯誤訊息 */
function outcome(result: WriteResult): string | null | 'cancelled' {
  if (result.ok) return null;
  return 'cancelled' in result ? 'cancelled' : result.message;
}

export function createApp(options: AppOptions): App {
  const { window: win, api, store, clock, config } = options;
  const doc = win.document;
  let view: View | null = null;
  let controller: SyncController | null = null;
  let snapshot: Snapshot | null = null;
  const ui: UiState = { admin: false, notice: null, adminMessage: null };
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;

  const story = () => options.storyFor(snapshot?.seasonId ?? '');

  function render(): void {
    if (view && snapshot) view.render(buildViewModel(snapshot, story(), ui));
  }

  function setUi(patch: Partial<UiState>): void {
    Object.assign(ui, patch);
    render();
  }

  function showNotice(text: string): void {
    clearTimeout(noticeTimer);
    setUi({ notice: text });
    noticeTimer = setTimeout(() => setUi({ notice: null }), config.noticeMs);
  }

  function ready() {
    return snapshot?.kind === 'ready' ? snapshot : null;
  }

  function deps(): WriteDeps {
    const current = snapshot!;
    return {
      api,
      store,
      prompts: domPrompts(doc, story()),
      story: story(),
      seasonId: current.seasonId,
      timeoutMs: config.writeTimeoutMs,
    };
  }

  /** 校正後的台灣今天（§4.1-3）與可寫入的範圍 */
  function today() {
    const current = ready();
    if (!current) return null;
    const date = taipeiDate(clock.now());
    return { date, range: writableRange(current.state.startDate, date) };
  }

  const existing = (date: string) =>
    ready()?.state.records.find((record) => record.date === date) ?? null;

  /** 同一時間只開一個流程，避免重複點擊疊出多個對話框 */
  async function exclusive(task: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await task();
    } finally {
      busy = false;
    }
  }

  function clearAdminHash(): void {
    if (win.location.hash === ADMIN_HASH) {
      const url = new URL(win.location.href);
      url.hash = '';
      win.history.replaceState(win.history.state, '', url.toString());
    }
  }

  function enterAdmin(): Promise<void> {
    return exclusive(async () => {
      if (ui.admin || !snapshot) return;
      const passphrase = await ensurePassphrase(deps());
      if (passphrase === null) {
        clearAdminHash();
        return;
      }
      setUi({ admin: true, adminMessage: null });
      view?.focusTargets.records().focus();
    });
  }

  const handlers: ViewHandlers = {
    retry: () => void controller?.retry(),

    propose: () =>
      void exclusive(async () => {
        const now = today();
        if (!now?.range || !view) return;
        const { date: todayDate, range } = now;
        const s = story();
        const saved = await openProposeMenu(doc, {
          story: s,
          today: todayDate,
          range,
          submit: async (choice) =>
            outcome(await submitProposal(deps(), choice, range, existing(choice.date))),
          fallbackFocus: view.focusTargets.propose,
        });
        if (saved === null) return;
        // 補記時提示；今日狀態只反映今天的記錄（FR-06）
        if (saved !== todayDate) {
          showNotice(s.menu.backfillDone({ date: formatMonthDay(saved, s.common) }));
        }
        await controller?.refreshNow();
      }),

    adminEntry: () => void enterAdmin(),

    add: () =>
      void exclusive(async () => {
        const now = today();
        if (!now || !view) return;
        const saved = await openRecordForm(doc, {
          story: story(),
          mode: 'add',
          initial: { date: now.date, proposed: true, executed: false, note: '' },
          range: now.range,
          submit: async (input) =>
            outcome(await saveAdminRecord(deps(), 'add', input, now.range, existing(input.date))),
          fallbackFocus: view.focusTargets.records,
        });
        if (saved) await controller?.refreshNow();
      }),

    edit: (date) =>
      void exclusive(async () => {
        const now = today();
        const record = existing(date);
        if (!now || !record || !view) return;
        const targets = view.focusTargets;
        const saved = await openRecordForm(doc, {
          story: story(),
          mode: 'edit',
          initial: record,
          range: now.range,
          submit: async (input) =>
            outcome(await saveAdminRecord(deps(), 'edit', input, now.range, existing(date))),
          fallbackFocus: () => targets.row('edit', date) ?? targets.records(),
        });
        if (saved) await controller?.refreshNow();
      }),

    remove: (date, trigger) =>
      void exclusive(async () => {
        if (!ready() || !view) return;
        setUi({ adminMessage: null });
        const result = await deleteRecord(deps(), date);
        if (result.ok) {
          await controller?.refreshNow();
          // 該列已刪除：焦點移到記錄表標題（§8.4）
          view.focusTargets.records().focus();
        } else {
          if (!('cancelled' in result)) setUi({ adminMessage: result.message });
          (trigger.isConnected ? trigger : view.focusTargets.records()).focus();
        }
      }),

    backup: (trigger) =>
      void exclusive(async () => {
        if (!ready()) return;
        setUi({ adminMessage: null });
        const result = await downloadBackup(deps(), (blob, filename) => {
          const url = URL.createObjectURL(blob);
          const link = doc.createElement('a');
          link.href = url;
          link.download = filename;
          link.hidden = true;
          doc.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        });
        if (!result.ok && !('cancelled' in result)) setUi({ adminMessage: result.message });
        trigger.focus();
      }),

    logout: () => {
      store.clear();
      clearAdminHash();
      setUi({ admin: false, adminMessage: null });
      view?.focusTargets.adminEntry().focus();
    },
  };

  const onHash = () => {
    if (win.location.hash === ADMIN_HASH) void enterAdmin();
  };
  win.addEventListener('hashchange', onHash);

  return {
    handlers,
    attach(v, c) {
      view = v;
      controller = c;
    },
    update(next) {
      const first = snapshot === null;
      snapshot = next;
      render();
      // #admin：進站後立即要求密語（FR-08）
      if (first) onHash();
    },
  };
}
