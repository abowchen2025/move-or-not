/**
 * 把 ViewModel 輸出成 DOM。所有文字（含使用者輸入的備註）一律用 textContent（NFR-S6）。
 * 結構只建立一次，之後只更新內容，讓 aria-live 區塊能正常朗讀（§8.4）。
 */
import type { RecordRow, ViewModel } from './model';

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (className) element.className = className;
  return element;
}

function setText(element: HTMLElement, text: string | null): void {
  element.textContent = text ?? '';
  element.hidden = text === null;
}

function windowSection(doc: Document, id: string): { section: HTMLElement; heading: HTMLElement } {
  const section = el(doc, 'section', 'window');
  section.id = id;
  const heading = el(doc, 'h2', 'window-title');
  heading.id = `${id}-title`;
  section.setAttribute('aria-labelledby', heading.id);
  section.append(heading);
  return { section, heading };
}

export interface View {
  render(model: ViewModel): void;
}

export function createView(root: HTMLElement, onRetry: () => void): View {
  const doc = root.ownerDocument;

  const title = el(doc, 'h1', 'title');
  const loading = el(doc, 'p', 'loading');
  loading.setAttribute('role', 'status');

  const alert = el(doc, 'section', 'window alert');
  alert.setAttribute('role', 'alert');
  const alertMessage = el(doc, 'p', 'alert-message');
  const alertDetail = el(doc, 'p', 'alert-detail');
  const retry = el(doc, 'button', 'pixel-button');
  retry.type = 'button';
  retry.addEventListener('click', onRetry);
  alert.append(alertMessage, alertDetail, retry);

  const status = windowSection(doc, 'status');
  const days = el(doc, 'p', 'days');
  const daysBefore = el(doc, 'span', 'days-label');
  const daysValue = el(doc, 'strong', 'days-value');
  const daysAfter = el(doc, 'span', 'days-label');
  days.append(daysBefore, daysValue, daysAfter);
  const since = el(doc, 'p', 'since');
  const stats = el(doc, 'p', 'stats');
  const quip = el(doc, 'p', 'quip');
  status.section.append(days, since, stats, quip);

  const today = windowSection(doc, 'today');
  const todayText = el(doc, 'p', 'today-status');
  todayText.setAttribute('aria-live', 'polite');
  today.section.append(todayText);

  const records = windowSection(doc, 'records');
  const table = el(doc, 'table', 'records-table');
  table.setAttribute('aria-labelledby', records.heading.id);
  const headRow = el(doc, 'tr');
  const columns = (['date', 'proposed', 'executed', 'note'] as const).map((key) => {
    const th = el(doc, 'th', `col-${key}`);
    th.scope = 'col';
    headRow.append(th);
    return [key, th] as const;
  });
  const thead = el(doc, 'thead');
  thead.append(headRow);
  const tbody = el(doc, 'tbody');
  table.append(thead, tbody);
  const recordsMessage = el(doc, 'p', 'records-message');
  records.section.append(table, recordsMessage);

  const footer = el(doc, 'footer', 'footer');
  const disclaimer = el(doc, 'p', 'disclaimer');
  const lastUpdated = el(doc, 'p', 'last-updated');
  const clockNotice = el(doc, 'p', 'clock-notice');
  const syncWarning = el(doc, 'p', 'sync-warning');
  footer.append(disclaimer, lastUpdated, clockNotice, syncWarning);

  const main = el(doc, 'main', 'content');
  main.append(loading, alert, status.section, today.section, records.section);
  const header = el(doc, 'header', 'header');
  header.append(title);
  root.replaceChildren(header, main, footer);

  function row(record: RecordRow): HTMLTableRowElement {
    const tr = el(doc, 'tr');
    const date = el(doc, 'td', 'col-date');
    date.textContent = record.date;
    const yesNo = (cell: RecordRow['proposed'], key: string) => {
      const td = el(doc, 'td', `col-${key}`);
      const mark = el(doc, 'span', `yes-no ${cell.value ? 'is-yes' : 'is-no'}`);
      mark.textContent = cell.text;
      td.append(mark);
      return td;
    };
    const note = el(doc, 'td', 'col-note');
    note.textContent = record.note;
    tr.append(date, yesNo(record.proposed, 'proposed'), yesNo(record.executed, 'executed'), note);
    return tr;
  }

  return {
    render(model) {
      doc.title = model.documentTitle;
      title.textContent = model.title;
      setText(loading, model.loading);

      alert.hidden = model.alert === null;
      if (model.alert) {
        alertMessage.textContent = model.alert.message;
        setText(alertDetail, model.alert.detail);
        retry.textContent = model.alert.retry;
      }

      status.section.hidden = model.status === null;
      if (model.status) {
        status.heading.textContent = model.status.heading;
        daysBefore.textContent = model.status.days.before;
        daysValue.textContent = String(model.status.days.value);
        daysAfter.textContent = model.status.days.after;
        since.textContent = model.status.days.since;
        setText(stats, model.status.stats?.line ?? null);
        setText(quip, model.status.stats?.quip ?? null);
      }

      today.section.hidden = model.today === null;
      if (model.today) {
        today.heading.textContent = model.today.heading;
        if (todayText.textContent !== model.today.text) todayText.textContent = model.today.text;
      }

      records.section.hidden = model.records === null;
      if (model.records) {
        records.heading.textContent = model.records.heading;
        for (const [key, th] of columns) th.textContent = model.records.columns[key];
        const rows = model.records.rows ?? [];
        table.hidden = rows.length === 0;
        tbody.replaceChildren(...rows.map(row));
        setText(recordsMessage, model.records.message);
      }

      setText(disclaimer, model.footer.disclaimer);
      setText(lastUpdated, model.footer.lastUpdated);
      setText(clockNotice, model.footer.clockNotice);
      setText(syncWarning, model.footer.syncWarning);
    },
  };
}
