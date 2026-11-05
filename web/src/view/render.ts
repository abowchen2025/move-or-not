/**
 * 把 ViewModel 輸出成 DOM。所有文字（含使用者輸入的備註）一律用 textContent（NFR-S6）。
 * 結構只建立一次，之後只更新內容，讓 aria-live 區塊能正常朗讀（§8.4）；
 * 記錄表的內容沒有變時不重建，避免焦點所在的按鈕被換掉。
 * 天數改變時播放一次「跳數字」（FR-03）；減少動態效果時不播放。
 */
import type { RecordRow, ToggleModel, ViewModel } from './model';

/** 使用者操作；trigger 為觸發的元件，對話框關閉後焦點回到這裡（§8.4）。 */
export interface ViewHandlers {
  retry(): void;
  propose(trigger: HTMLElement): void;
  adminEntry(trigger: HTMLElement): void;
  add(trigger: HTMLElement): void;
  backup(trigger: HTMLElement): void;
  logout(): void;
  edit(date: string, trigger: HTMLElement): void;
  remove(date: string, trigger: HTMLElement): void;
  toggleCrt(): void;
  toggleSound(): void;
  /** 天數改變、播放跳數字時呼叫（音效） */
  daysJumped(): void;
}

export interface ViewOptions {
  /** 是否開啟減少動態效果（跳數字不播放） */
  reducedMotion?: () => boolean;
}

const noop = () => undefined;

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

function button(doc: Document, className: string, onClick: (b: HTMLButtonElement) => void) {
  const b = el(doc, 'button', className);
  b.type = 'button';
  b.addEventListener('click', () => onClick(b));
  return b;
}

function windowSection(doc: Document, id: string): { section: HTMLElement; heading: HTMLElement } {
  const section = el(doc, 'section', 'window');
  section.id = id;
  const heading = el(doc, 'h2', 'window-title');
  heading.id = `${id}-title`;
  // 對話框關閉時，原本的按鈕已不在畫面上的話，焦點改移到區塊標題（§8.4）
  heading.tabIndex = -1;
  section.setAttribute('aria-labelledby', heading.id);
  section.append(heading);
  return { section, heading };
}

export interface View {
  render(model: ViewModel): void;
  /** 對話框關閉後的焦點去處 */
  focusTargets: {
    propose: () => HTMLElement;
    records: () => HTMLElement;
    row: (action: 'edit' | 'remove', date: string) => HTMLElement | null;
    adminEntry: () => HTMLElement;
  };
  /** 主角跑道需要的元素（stage/） */
  stageElements: { title: HTMLElement; track: HTMLElement };
}

export function createView(
  root: HTMLElement,
  handlersOrRetry: Partial<ViewHandlers> | (() => void),
  options: ViewOptions = {},
): View {
  const handlers: ViewHandlers = {
    retry: noop,
    propose: noop,
    adminEntry: noop,
    add: noop,
    backup: noop,
    logout: noop,
    edit: noop,
    remove: noop,
    toggleCrt: noop,
    toggleSound: noop,
    daysJumped: noop,
    ...(typeof handlersOrRetry === 'function' ? { retry: handlersOrRetry } : handlersOrRetry),
  };
  const doc = root.ownerDocument;

  const title = el(doc, 'h1', 'title');
  title.tabIndex = -1;
  // 主角跑道（FR-02）：主角畫在 canvas 或 CSS 退路的元素上，這裡只保留位置
  const track = el(doc, 'div', 'ghost-track');
  track.setAttribute('aria-hidden', 'true');
  const theEnd = el(doc, 'p', 'the-end');
  theEnd.setAttribute('role', 'status');
  const loading = el(doc, 'p', 'loading');
  loading.setAttribute('role', 'status');

  const alert = el(doc, 'section', 'window alert');
  alert.setAttribute('role', 'alert');
  const alertMessage = el(doc, 'p', 'alert-message');
  const alertDetail = el(doc, 'p', 'alert-detail');
  const retry = button(doc, 'pixel-button', () => handlers.retry());
  alert.append(alertMessage, alertDetail, retry);

  const status = windowSection(doc, 'status');
  const days = el(doc, 'p', 'days');
  const daysBefore = el(doc, 'span', 'days-label');
  const daysValue = el(doc, 'strong', 'days-value');
  daysValue.addEventListener('animationend', () => daysValue.classList.remove('is-jumping'));
  const daysAfter = el(doc, 'span', 'days-label');
  days.append(daysBefore, daysValue, daysAfter);
  const since = el(doc, 'p', 'since');
  const stats = el(doc, 'p', 'stats');
  const quip = el(doc, 'p', 'quip');
  status.section.append(days, since, stats, quip);

  const today = windowSection(doc, 'today');
  const todayText = el(doc, 'p', 'today-status');
  todayText.setAttribute('aria-live', 'polite');
  const propose = button(doc, 'pixel-button propose-button', (b) => handlers.propose(b));
  const notice = el(doc, 'p', 'notice');
  notice.setAttribute('role', 'status');
  today.section.append(todayText, propose, notice);

  const records = windowSection(doc, 'records');
  const adminBar = el(doc, 'div', 'admin-bar');
  const adminLabel = el(doc, 'p', 'admin-label');
  const adminMessage = el(doc, 'p', 'admin-message');
  adminMessage.setAttribute('role', 'alert');
  const addButton = button(doc, 'pixel-button small', (b) => handlers.add(b));
  addButton.dataset.action = 'add';
  const backupButton = button(doc, 'pixel-button small', (b) => handlers.backup(b));
  backupButton.dataset.action = 'backup';
  const logoutButton = button(doc, 'pixel-button small', () => handlers.logout());
  logoutButton.dataset.action = 'logout';
  const adminButtons = el(doc, 'div', 'admin-buttons');
  adminButtons.append(addButton, backupButton, logoutButton);
  adminBar.append(adminLabel, adminButtons, adminMessage);

  const table = el(doc, 'table', 'records-table');
  table.setAttribute('aria-labelledby', records.heading.id);
  const headRow = el(doc, 'tr');
  const columns = (['date', 'proposed', 'executed', 'note'] as const).map((key) => {
    const th = el(doc, 'th', `col-${key}`);
    th.scope = 'col';
    headRow.append(th);
    return [key, th] as const;
  });
  const actionsHead = el(doc, 'th', 'col-actions');
  actionsHead.scope = 'col';
  headRow.append(actionsHead);
  const thead = el(doc, 'thead');
  thead.append(headRow);
  const tbody = el(doc, 'tbody');
  table.append(thead, tbody);
  const recordsMessage = el(doc, 'p', 'records-message');
  records.section.append(adminBar, table, recordsMessage);

  const footer = el(doc, 'footer', 'footer');
  const disclaimer = el(doc, 'p', 'disclaimer');
  const lastUpdated = el(doc, 'p', 'last-updated');
  const clockNotice = el(doc, 'p', 'clock-notice');
  const syncWarning = el(doc, 'p', 'sync-warning');
  const adminEntry = button(doc, 'admin-entry', (b) => handlers.adminEntry(b));
  const toggleButton = (name: string, onClick: () => void) => {
    const b = button(doc, 'toggle', onClick);
    b.dataset.toggle = name;
    const label = el(doc, 'span', 'toggle-label');
    const state = el(doc, 'span', 'toggle-state');
    b.append(label, state);
    return { button: b, label, state };
  };
  const crtToggle = toggleButton('crt', () => handlers.toggleCrt());
  const soundToggle = toggleButton('sound', () => handlers.toggleSound());
  const toggles = el(doc, 'p', 'toggles');
  toggles.append(crtToggle.button, soundToggle.button);
  footer.append(disclaimer, lastUpdated, clockNotice, syncWarning, toggles, adminEntry);

  // CRT 掃描線（§9.1）：蓋在畫面最上層，不攔截點擊
  const crt = el(doc, 'div', 'crt-overlay');
  crt.setAttribute('aria-hidden', 'true');

  function renderToggle(t: ReturnType<typeof toggleButton>, model: ToggleModel | null) {
    t.button.hidden = model === null;
    if (!model) return;
    t.label.textContent = model.label;
    t.state.textContent = model.state;
    // 名稱固定為開關名稱，狀態由 aria-pressed 表達
    t.button.setAttribute('aria-label', model.label);
    t.button.setAttribute('aria-pressed', String(model.pressed));
  }

  let shownDays: number | null = null;
  function renderDays(value: number | null): void {
    const changed = shownDays !== null && value !== null && value !== shownDays;
    shownDays = value;
    if (value === null) return;
    daysValue.textContent = String(value);
    if (changed && !(options.reducedMotion?.() ?? false)) {
      // 重新開始動畫：移除 class、強制重排、再加回
      daysValue.classList.remove('is-jumping');
      void daysValue.offsetWidth;
      daysValue.classList.add('is-jumping');
      handlers.daysJumped();
    }
  }

  const main = el(doc, 'main', 'content');
  main.append(loading, alert, status.section, today.section, records.section);
  const header = el(doc, 'header', 'header');
  header.append(title, track, theEnd);
  root.replaceChildren(header, main, footer, crt);

  function row(record: RecordRow, admin: NonNullable<ViewModel['records']>['admin']) {
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
    if (admin) {
      const actions = el(doc, 'td', 'col-actions');
      const edit = button(doc, 'pixel-button tiny', (b) => handlers.edit(record.key, b));
      edit.textContent = admin.edit;
      edit.dataset.action = 'edit';
      edit.dataset.date = record.key;
      edit.setAttribute('aria-label', `${admin.edit} ${record.date}`);
      const remove = button(doc, 'pixel-button tiny', (b) => handlers.remove(record.key, b));
      remove.textContent = admin.delete;
      remove.dataset.action = 'remove';
      remove.dataset.date = record.key;
      remove.setAttribute('aria-label', `${admin.delete} ${record.date}`);
      actions.append(edit, remove);
      tr.append(actions);
    }
    return tr;
  }

  let rowsKey = '';

  return {
    focusTargets: {
      propose: () => (propose.hidden ? today.heading : propose),
      records: () => (records.section.hidden ? title : records.heading),
      row: (action, date) =>
        tbody.querySelector<HTMLElement>(`[data-action="${action}"][data-date="${date}"]`),
      adminEntry: () => (adminEntry.hidden ? title : adminEntry),
    },
    stageElements: { title, track },
    render(model) {
      doc.title = model.documentTitle;
      title.textContent = model.title;
      setText(theEnd, model.theEnd);
      track.hidden = model.theEnd !== null;
      crt.hidden = !model.crt;
      doc.documentElement.dataset.crt = model.crt ? 'on' : 'off';
      setText(loading, model.loading);

      alert.hidden = model.alert === null;
      if (model.alert) {
        alertMessage.textContent = model.alert.message;
        setText(alertDetail, model.alert.detail);
        retry.textContent = model.alert.retry;
      }

      status.section.hidden = model.status === null;
      if (!model.status) renderDays(null);
      if (model.status) {
        status.heading.textContent = model.status.heading;
        daysBefore.textContent = model.status.days.before;
        renderDays(model.status.days.value);
        daysAfter.textContent = model.status.days.after;
        since.textContent = model.status.days.since;
        setText(stats, model.status.stats?.line ?? null);
        setText(quip, model.status.stats?.quip ?? null);
      }

      today.section.hidden = model.today === null;
      if (model.today) {
        today.heading.textContent = model.today.heading;
        if (todayText.textContent !== model.today.text) todayText.textContent = model.today.text;
        setText(propose, model.today.propose);
        setText(notice, model.today.notice);
      }

      records.section.hidden = model.records === null;
      if (model.records) {
        const { admin } = model.records;
        records.heading.textContent = model.records.heading;
        for (const [key, th] of columns) th.textContent = model.records.columns[key];
        adminBar.hidden = admin === null;
        actionsHead.hidden = admin === null;
        table.classList.toggle('is-admin', admin !== null);
        if (admin) {
          adminLabel.textContent = admin.label;
          addButton.textContent = admin.add;
          backupButton.textContent = admin.backup;
          logoutButton.textContent = admin.logout;
          actionsHead.textContent = admin.actionsColumn;
        }
        setText(adminMessage, admin?.message ?? null);
        const rows = model.records.rows ?? [];
        table.hidden = rows.length === 0;
        const key = JSON.stringify([rows, admin]);
        if (key !== rowsKey) {
          rowsKey = key;
          tbody.replaceChildren(...rows.map((r) => row(r, admin)));
        }
        setText(recordsMessage, model.records.message);
      }

      setText(disclaimer, model.footer.disclaimer);
      setText(lastUpdated, model.footer.lastUpdated);
      setText(clockNotice, model.footer.clockNotice);
      setText(syncWarning, model.footer.syncWarning);
      const entry = model.footer.adminEntry;
      setText(adminEntry, entry?.icon ?? null);
      if (entry) adminEntry.setAttribute('aria-label', entry.label);
      renderToggle(crtToggle, model.footer.toggles.crt);
      renderToggle(soundToggle, model.footer.toggles.sound);
    },
  };
}
