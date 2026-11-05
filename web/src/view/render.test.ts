// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getStory } from '../stories';
import type { Snapshot } from '../sync/controller';
import { makeState, record, taipei } from '../testing/fixtures';
import { buildViewModel } from './model';
import { createView } from './render';

const story = getStory('season-1')!;
const NOW = taipei('2026-10-30T10:00:00');
const HOSTILE = ['<script>alert(1)</script>', '<img src=x onerror="alert(1)">', '"><b>x</b>&amp;'];

function ready(records = [record('2026-10-28', true, false, 'n')]): Snapshot {
  return {
    kind: 'ready',
    seasonId: 'season-1',
    state: makeState({ serverNow: NOW, records }),
    syncFailing: false,
  };
}

let root: HTMLElement;
let onRetry: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement('div');
  document.body.append(root);
  onRetry = vi.fn<() => void>();
});

function render(snapshot: Snapshot) {
  const view = createView(root, onRetry);
  view.render(buildViewModel(snapshot, story));
  return view;
}

const visible = (selector: string) => {
  const element = root.querySelector<HTMLElement>(selector);
  return element !== null && !element.closest('[hidden]');
};

describe('NFR-S6、AC-10 備註只以文字輸出', () => {
  it.each(HOSTILE)('%s', (note) => {
    render(ready([record('2026-10-28', true, false, note)]));
    const cell = root.querySelector('tbody .col-note');
    expect(cell?.textContent).toBe(note);
    expect(cell?.children).toHaveLength(0);
    expect(root.querySelector('tbody script, tbody img, tbody b')).toBeNull();
  });
});

describe('畫面結構', () => {
  it('FR-01 標題是 <h1>，文字來自劇本；document.title 也來自劇本', () => {
    render(ready());
    expect(root.querySelector('h1')?.textContent).toBe(story.title);
    expect(document.title).toBe(story.meta.documentTitle);
  });

  it('§8.4 今日狀態有 aria-live="polite"', () => {
    render(ready());
    const status = root.querySelector('.today-status');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.textContent).toBe(story.today.none);
  });

  it('FR-07 表頭、是／否附文字與顏色 class', () => {
    render(ready([record('2026-10-28', true, false, 'n')]));
    // 「操作」欄只在管理模式顯示
    expect(
      [...root.querySelectorAll('thead th:not([hidden])')].map((th) => th.textContent),
    ).toEqual([
      story.recordTable.date,
      story.recordTable.proposed,
      story.recordTable.executed,
      story.recordTable.note,
    ]);
    const marks = [...root.querySelectorAll('tbody .yes-no')];
    expect(marks.map((m) => [m.textContent, m.className])).toEqual([
      [story.common.yes, 'yes-no is-yes'],
      [story.common.no, 'yes-no is-no'],
    ]);
  });

  it('FR-07 沒有記錄時隱藏表格，顯示「尚無記錄」', () => {
    render(ready([]));
    expect(visible('table')).toBe(false);
    expect(root.querySelector('.records-message')?.textContent).toBe(story.common.noRecords);
  });

  it('更新時沿用同一個元素（aria-live 才會朗讀）', () => {
    const view = render(ready([]));
    const status = root.querySelector('.today-status');
    view.render(buildViewModel(ready([record('2026-10-30', true, false)]), story));
    expect(root.querySelector('.today-status')).toBe(status);
    expect(status?.textContent).toBe(story.today.proposedNotExecuted);
  });

  it('AC-33 只有一季時，畫面上沒有任何季別選擇 UI', () => {
    render(ready());
    expect(root.querySelector('select, nav, [role="tablist"], [role="listbox"]')).toBeNull();
    expect(root.querySelectorAll('a[href*="season"]')).toHaveLength(0);
    // 畫面上的按鈕只有「提了」與頁尾的管理入口，沒有切換季別的按鈕
    const shown = [...root.querySelectorAll<HTMLButtonElement>('button')].filter(
      (b) => !b.closest('[hidden]'),
    );
    expect(shown.map((b) => b.textContent)).toEqual([
      story.actions.propose,
      story.common.adminEntryIcon,
    ]);
  });
});

describe('FR-11 讀取中與錯誤', () => {
  it('讀取中：只顯示讀取文字', () => {
    render({ kind: 'loading', seasonId: 'season-1' });
    expect(root.querySelector('.loading')?.textContent).toBe(story.loading);
    expect(visible('.loading')).toBe(true);
    for (const id of ['#status', '#today', '#records', '.alert']) expect(visible(id)).toBe(false);
  });

  it('退路模式：錯誤、重試按鈕、⚠ 標示、暫時看不到記錄', () => {
    render({
      kind: 'fallback',
      seasonId: 'season-1',
      season: { id: 'season-1', startDate: '2026-10-13', countInclusive: false },
      localNow: NOW,
      errorCode: null,
    });
    expect(root.querySelector('.alert')?.getAttribute('role')).toBe('alert');
    expect(root.querySelector('.alert-message')?.textContent).toBe(story.serverDown);
    expect(visible('.alert-detail')).toBe(false);
    expect(root.querySelector('.days-value')?.textContent).toBe('17');
    expect(root.querySelector('.clock-notice')?.textContent).toBe(story.common.fallbackClockNotice);
    expect(visible('table')).toBe(false);
    expect(root.querySelector('.records-message')?.textContent).toBe(
      story.common.recordsUnavailable,
    );
    expect(visible('#today')).toBe(false);

    const retry = root.querySelector<HTMLButtonElement>('.alert button');
    expect(retry?.textContent).toBe(story.common.retry);
    retry?.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('FR-06、FR-08 操作按鈕', () => {
  function renderWith(
    handlers: Parameters<typeof createView>[1],
    ui = { admin: false, notice: null, adminMessage: null },
  ) {
    const view = createView(root, handlers);
    view.render(buildViewModel(ready([record('2026-10-28', true, false, 'n')]), story, ui));
    return view;
  }

  it('按「提了」時把按鈕本身傳給處理函式（關閉選單後焦點回到這裡）', () => {
    const propose = vi.fn();
    renderWith({ propose });
    const button = root.querySelector<HTMLButtonElement>('.propose-button')!;
    expect(button.textContent).toBe(story.actions.propose);
    button.click();
    expect(propose).toHaveBeenCalledWith(button);
  });

  it('🔑 有無障礙名稱', () => {
    renderWith({});
    const entry = root.querySelector<HTMLButtonElement>('.admin-entry')!;
    expect(entry.textContent).toBe(story.common.adminEntryIcon);
    expect(entry.getAttribute('aria-label')).toBe(story.common.adminEntryLabel);
  });

  it('管理模式：每列的編輯／刪除帶日期；資料沒變時不重建列（焦點不會被換掉）', () => {
    const edit = vi.fn();
    const remove = vi.fn();
    const ui = { admin: true, notice: null, adminMessage: null };
    const view = renderWith({ edit, remove }, ui);
    const editButton = root.querySelector<HTMLButtonElement>('[data-action="edit"]')!;
    expect(editButton.dataset.date).toBe('2026-10-28');
    editButton.click();
    expect(edit).toHaveBeenCalledWith('2026-10-28', editButton);
    root.querySelector<HTMLButtonElement>('[data-action="remove"]')!.click();
    expect(remove).toHaveBeenCalledWith('2026-10-28', expect.any(HTMLButtonElement));
    view.render(buildViewModel(ready([record('2026-10-28', true, false, 'n')]), story, ui));
    expect(root.querySelector('[data-action="edit"]')).toBe(editButton);
    expect(view.focusTargets.row('edit', '2026-10-28')).toBe(editButton);
  });

  it('備註在管理模式下同樣以文字輸出', () => {
    const view = createView(root, {});
    view.render(
      buildViewModel(ready([record('2026-10-28', true, false, HOSTILE[0]!)]), story, {
        admin: true,
        notice: null,
        adminMessage: null,
      }),
    );
    expect(root.querySelector('tbody .col-note')?.textContent).toBe(HOSTILE[0]);
    expect(root.querySelector('tbody script')).toBeNull();
  });
});
