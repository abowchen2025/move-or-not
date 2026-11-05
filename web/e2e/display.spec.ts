/** 顯示相關：AC-10（備註只顯示為文字）、AC-33（季別）、D-22-k、D-22-l。 */
import { expect, test } from '@playwright/test';
import { record, taipei } from '../src/testing/fixtures';
import { MockApi, openPage, story } from './support';

const NOW = taipei('2026-10-30T10:00:00');

test('AC-10 備註含 HTML 或 script 時只顯示為文字，不會執行', async ({ page }) => {
  const notes = ['<script>alert(1)</script>', '<img src=x onerror="alert(2)">'];
  const api = new MockApi(NOW);
  api.records = notes.map((note, i) => record(`2026-10-2${i + 1}`, true, false, note));
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await openPage(page, api, { browserNow: NOW });

  const cells = page.locator('tbody .col-note');
  await expect(cells).toHaveText([notes[1]!, notes[0]!]);
  await expect(page.locator('tbody img, tbody script')).toHaveCount(0);
  await page.clock.runFor(2_000);
  expect(dialogs).toEqual([]);
});

test.describe('AC-33 季別（只有一季）', () => {
  const noSeasonPicker = async (page: import('@playwright/test').Page) => {
    await expect(page.locator('select, nav, [role="tablist"], [role="listbox"]')).toHaveCount(0);
    // 畫面上的按鈕只有「提了」、頁尾的 CRT／音效開關（階段 5）與管理入口（階段 4），
    // 沒有切換季別的按鈕
    const buttons = page.getByRole('button');
    await expect(buttons).toHaveCount(4);
    await expect(buttons.nth(0)).toHaveText(story.actions.propose);
    await expect(buttons.nth(1)).toHaveAccessibleName(story.common.toggles.crt);
    await expect(buttons.nth(2)).toHaveAccessibleName(story.common.toggles.sound);
    await expect(buttons.nth(3)).toHaveAccessibleName(story.common.adminEntryLabel);
  };

  test('未提供 ?season= → 最新一季', async ({ page }) => {
    const api = new MockApi(NOW);
    await openPage(page, api, { browserNow: NOW });
    expect(api.statePaths()).toEqual(['/api/seasons/season-1/state']);
    await expect(page.locator('h1')).toHaveText(story.title);
    await noSeasonPicker(page);
  });

  test('?season= 有效 → 用它，網址保留參數', async ({ page }) => {
    const api = new MockApi(NOW);
    await openPage(page, api, { browserNow: NOW, path: '?season=season-1' });
    expect(api.statePaths()).toEqual(['/api/seasons/season-1/state']);
    expect(new URL(page.url()).searchParams.get('season')).toBe('season-1');
    await noSeasonPicker(page);
  });

  test('?season= 無效 → 最新一季，並移除網址參數（D-22-l）', async ({ page }) => {
    const api = new MockApi(NOW);
    await openPage(page, api, { browserNow: NOW, path: '?season=nope&x=1#replay' });
    expect(api.statePaths()).toEqual(['/api/seasons/season-1/state']);
    const url = new URL(page.url());
    expect(url.searchParams.has('season')).toBe(false);
    expect(url.searchParams.get('x')).toBe('1');
    expect(url.hash).toBe('#replay');
    await noSeasonPicker(page);
  });
});

test.describe('季別清單有兩季時（D-22-k）', () => {
  test('?season= 指到有劇本的季別 → 取該季 state', async ({ page }) => {
    const api = new MockApi(NOW);
    api.seasons = ['season-1', 'season-test-2'];
    await openPage(page, api, { browserNow: NOW, path: '?season=season-1' });
    expect(api.statePaths()).toEqual(['/api/seasons/season-1/state']);
  });

  test('最新一季在前端沒有劇本 → 錯誤畫面與重試，不取 state', async ({ page }) => {
    const api = new MockApi(NOW);
    api.seasons = ['season-1', 'season-test-2'];
    await openPage(page, api, { browserNow: NOW, waitFor: 'none' });
    await expect(page.locator('.alert-message')).toHaveText(story.errors.SEASON_NOT_FOUND);
    await expect(page.getByRole('button', { name: story.common.retry })).toBeVisible();
    expect(api.statePaths()).toEqual([]);
  });
});
