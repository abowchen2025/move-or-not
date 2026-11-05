/**
 * FR-08 管理模式的新增／編輯表單：日期、提出（是／否）、執行（是／否）、備註。
 * - 編輯時日期鎖定（D-07）；要改日期請先刪除再新增。
 * - 新增時日期範圍為起始日～台灣今天（AC-21）。
 * - 送出失敗時顯示錯誤，表單不關閉。
 */
import type { RecordDto } from '../../api/types';
import type { DateRange } from '../../records/validate';
import type { StoryConfig } from '../../stories/types';
import type { AdminRecordInput } from '../../write/flows';
import { formatMonthDay } from '../format';
import { commandButton, createCommandList } from '../menu/commands';
import { openModal } from './modal';

export interface RecordFormOptions {
  story: StoryConfig;
  mode: 'add' | 'edit';
  /** 新增時的預設日期（台灣今天）；編輯時為該筆記錄 */
  initial: Pick<RecordDto, 'date' | 'proposed' | 'executed' | 'note'>;
  range: DateRange | null;
  submit: (input: AdminRecordInput) => Promise<string | null | 'cancelled'>;
  fallbackFocus?: () => HTMLElement | null;
}

let sequence = 0;

function yesNoGroup(
  doc: Document,
  story: StoryConfig,
  legendText: string,
  name: string,
  value: boolean,
): { fieldset: HTMLFieldSetElement; read: () => boolean; inputs: HTMLInputElement[] } {
  const fieldset = doc.createElement('fieldset');
  fieldset.className = 'field yes-no-group';
  const legend = doc.createElement('legend');
  legend.textContent = legendText;
  fieldset.append(legend);
  const inputs = [true, false].map((option) => {
    const label = doc.createElement('label');
    label.className = 'radio';
    const input = doc.createElement('input');
    input.type = 'radio';
    input.name = `${name}-${sequence}`;
    input.value = String(option);
    input.checked = option === value;
    input.dataset.field = name;
    const text = doc.createElement('span');
    text.textContent = option ? story.common.yes : story.common.no;
    label.append(input, text);
    fieldset.append(label);
    return input;
  });
  return { fieldset, read: () => inputs[0]!.checked, inputs };
}

export function openRecordForm(doc: Document, options: RecordFormOptions): Promise<boolean> {
  const { story, mode, initial, range } = options;
  const { common } = story;
  sequence += 1;
  return new Promise((resolve) => {
    const title = doc.createElement('h2');
    title.textContent =
      mode === 'add' ? common.addRecord : `${common.edit} ${formatMonthDay(initial.date, common)}`;

    const form = doc.createElement('form');
    form.className = 'dialog-form record-form';
    form.noValidate = true;

    const dateField = doc.createElement('div');
    dateField.className = 'field';
    const dateLabel = doc.createElement('label');
    dateLabel.textContent = common.dateLabel;
    const date = doc.createElement('input');
    date.type = 'date';
    date.name = 'date';
    date.className = 'pixel-input';
    date.id = `record-date-${sequence}`;
    dateLabel.htmlFor = date.id;
    date.value = initial.date;
    if (mode === 'edit') {
      // 編輯時日期鎖定（D-07）
      date.readOnly = true;
      date.setAttribute('aria-readonly', 'true');
    } else if (range) {
      date.min = range.min;
      date.max = range.max;
    }
    const dateText = doc.createElement('span');
    dateText.className = 'date-text';
    dateText.setAttribute('aria-hidden', 'true');
    const syncDate = () => {
      dateText.textContent = /^\d{4}-\d{2}-\d{2}$/.test(date.value)
        ? formatMonthDay(date.value, common)
        : '';
    };
    date.addEventListener('input', syncDate);
    date.addEventListener('change', syncDate);
    syncDate();
    dateField.append(dateLabel, date, dateText);

    const proposed = yesNoGroup(
      doc,
      story,
      story.recordTable.proposed,
      'proposed',
      initial.proposed,
    );
    const executed = yesNoGroup(
      doc,
      story,
      story.recordTable.executed,
      'executed',
      initial.executed,
    );

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
    note.value = initial.note;
    note.id = `record-note-${sequence}`;
    noteLabel.htmlFor = note.id;
    noteField.append(noteLabel, note);

    const error = doc.createElement('p');
    error.className = 'dialog-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;

    const save = commandButton(doc, common.save, () => form.requestSubmit());
    save.dataset.action = 'save';
    const cancel = commandButton(doc, common.cancel, () => finish(false));
    cancel.dataset.action = 'cancel';
    const controls = [date, note, save, cancel, ...proposed.inputs, ...executed.inputs];

    form.append(
      dateField,
      proposed.fieldset,
      executed.fieldset,
      noteField,
      error,
      createCommandList(doc, [save, cancel]),
    );

    let busy = false;
    const finish = (saved: boolean) => {
      modal.close();
      resolve(saved);
    };
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      for (const control of controls) control.disabled = true;
      error.hidden = true;
      void options
        .submit({
          date: date.value,
          proposed: proposed.read(),
          executed: executed.read(),
          note: note.value,
        })
        .then((outcome) => {
          busy = false;
          for (const control of controls) control.disabled = false;
          if (outcome === null) {
            finish(true);
            return;
          }
          if (outcome !== 'cancelled') {
            error.textContent = outcome;
            error.hidden = false;
          }
          save.focus();
        });
    });

    const modal = openModal(doc, [form], {
      title,
      className: 'record-dialog',
      onCancel: () => {
        if (!busy) finish(false);
      },
      initialFocus: () => (mode === 'edit' ? proposed.inputs.find((i) => i.checked)! : date),
      fallbackFocus: options.fallbackFocus,
    });
  });
}
