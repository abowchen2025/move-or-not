// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { appConfig } from '../config';
import { desktopQuery, watchLayout } from './layout';

/** 依指定寬度回答 (min-width: Npx) 的假 matchMedia。 */
function fakeWindow(width: number) {
  const listeners = new Set<() => void>();
  let current = width;
  const query = {
    get matches() {
      const min = Number(/min-width:\s*(\d+)px/.exec(desktopQuery())?.[1]);
      return current >= min;
    },
    addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
  };
  return {
    win: { matchMedia: () => query } as unknown as Window,
    resize(next: number) {
      current = next;
      for (const fn of listeners) fn();
    },
    listeners,
  };
}

describe('D-33 手機／桌機斷點', () => {
  it('斷點為 768px，集中在 config.ts', () => {
    expect(appConfig.desktopMinWidthPx).toBe(768);
    expect(desktopQuery()).toBe('(min-width: 768px)');
  });

  it.each([
    [360, 'mobile'],
    [767, 'mobile'],
    [768, 'desktop'],
    [1280, 'desktop'],
  ])('寬度 %ipx → %s', (width, layout) => {
    const root = document.createElement('html');
    watchLayout(fakeWindow(width).win, root);
    expect(root.dataset.layout).toBe(layout);
  });

  it('寬度跨過斷點時更新；取消後不再更新', () => {
    const root = document.createElement('html');
    const fake = fakeWindow(360);
    const stop = watchLayout(fake.win, root);
    fake.resize(1024);
    expect(root.dataset.layout).toBe('desktop');
    stop();
    fake.resize(360);
    expect(root.dataset.layout).toBe('desktop');
    expect(fake.listeners.size).toBe(0);
  });
});
