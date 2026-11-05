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
    expect([...root.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
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
    expect(root.querySelectorAll('button')).toHaveLength(1);
    expect(visible('button')).toBe(false);
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
