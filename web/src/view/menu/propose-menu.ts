/**
 * FR-06「提了」選單（SNES 指令選單）：
 * - 日期：原生 <input type="date">，min／max 為起始日～台灣今天，預設台灣今天；旁邊顯示 MM/DD（週X）（D-03）。
 * - 選的日期不是今天時，標題改為「補記 MM/DD（週X）」。每次打開都重設為今天。
 * - 指令：executed（是）／not-executed（否）／取消，方向鍵移動、Enter 選擇、Esc 關閉；文字來自劇本 actions。
 * - 送出失敗時顯示錯誤訊息，選單不關閉，可以重試。
 */
import type { DateRange } from '../../records/validate';
import type { StoryConfig } from '../../stories/types';
import { openModal } from '../dialog/modal';
import { formatMonthDay } from '../format';
import { commandButton, createCommandList } from './commands';

export interface ProposeMenuOptions {
  story: StoryConfig;
  /** 台灣今天（校正後的時間） */
  today: string;
  range: DateRange;
  /** 送出；回傳 null＝成功並關閉，'cancelled'＝使用者在確認框取消（選單保持開啟），其他文字＝錯誤訊息 */
  submit: (choice: {
    date: string;
    executed: boolean;
    note: string;
  }) => Promise<string | null | 'cancelled'>;
  fallbackFocus?: () => HTMLElement | null;
}

/** 打開選單；送出成功時 resolve 選定的日期，取消時 resolve null。 */
export function openProposeMenu(
  doc: Document,
  options: ProposeMenuOptions,
): Promise<string | null> {
  const { story, today, range } = options;
  const { common } = story;
  return new Promise((resolve) => {
    const title = doc.createElement('h2');

    const dateField = doc.createElement('div');
    dateField.className = 'field';
    const dateLabel = doc.createElement('label');
    dateLabel.textContent = common.dateLabel;
    const date = doc.createElement('input');
    date.type = 'date';
    date.name = 'date';
    date.className = 'pixel-input';
    date.min = range.min;
    date.max = range.max;
    date.value = today;
    date.required = true;
    date.id = `menu-date-${Date.now()}`;
    dateLabel.htmlFor = date.id;
    const dateText = doc.createElement('span');
    dateText.className = 'date-text';
    dateText.setAttribute('aria-hidden', 'true');
    dateField.append(dateLabel, date, dateText);

    const noteField = doc.createElement('div');
    noteField.className = 'field';
    const noteLabel = doc.createElement('label');
    noteLabel.textContent = common.noteLabel;
    const note = doc.createElement('input');
    note.type = 'text';
    note.name = 'note';
    note.className = 'pixel-input';
    note.placeholder = common.notePlaceholder;
    note.autocomplete = 'off';
    note.id = `menu-note-${Date.now()}`;
    noteLabel.htmlFor = note.id;
    noteField.append(noteLabel, note);

    const error = doc.createElement('p');
    error.className = 'dialog-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;

    const executed = commandButton(doc, story.actions.executed, () => void choose(true));
    executed.dataset.action = 'executed';
    const notExecuted = commandButton(doc, story.actions.notExecuted, () => void choose(false));
    notExecuted.dataset.action = 'not-executed';
    const cancel = commandButton(doc, common.cancel, () => finish(null));
    cancel.dataset.action = 'cancel';
    const buttons = [executed, notExecuted, cancel];

    const sync = () => {
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(date.value);
      dateText.textContent = valid ? formatMonthDay(date.value, common) : '';
      title.textContent =
        valid && date.value !== today
          ? story.menu.backfillTitle({ date: formatMonthDay(date.value, common) })
          : story.menu.title;
    };
    date.addEventListener('input', sync);
    date.addEventListener('change', sync);
    sync();

    let busy = false;
    const setBusy = (value: boolean) => {
      busy = value;
      for (const element of [...buttons, date, note]) element.disabled = value;
    };
    const finish = (result: string | null) => {
      modal.close();
      resolve(result);
    };
    async function choose(isExecuted: boolean) {
      if (busy) return;
      const chosen = isExecuted ? executed : notExecuted;
      setBusy(true);
      error.hidden = true;
      const outcome = await options.submit({
        date: date.value,
        executed: isExecuted,
        note: note.value,
      });
      setBusy(false);
      if (outcome === null) {
        finish(date.value);
        return;
      }
      if (outcome !== 'cancelled') {
        error.textContent = outcome;
        error.hidden = false;
      }
      chosen.focus();
    }

    const modal = openModal(doc, [dateField, noteField, error, createCommandList(doc, buttons)], {
      title,
      className: 'menu-dialog',
      onCancel: () => {
        if (!busy) finish(null);
      },
      initialFocus: () => executed,
      fallbackFocus: options.fallbackFocus,
    });
  });
}
