/**
 * SRS §8.4：只用鍵盤完成一次新增與一次刪除；Esc 關閉；焦點回到觸發元件；焦點可見。
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { record, taipei } from '../src/testing/fixtures';
import { MockApi, openPage, presetSession, story } from './support';

const NOW = taipei('2026-10-30T10:00:00');

/** 一直按 Tab，直到焦點落在 target 上（最多 40 次）。 */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('按 Tab 找不到目標元素');
}

test('只用鍵盤：「提了 → 沒搬」並輸入密語，完成一次新增；焦點回到「提了」', async ({ page }) => {
  const api = new MockApi(NOW);
  await openPage(page, api, { browserNow: NOW });
  const propose = page.locator('.propose-button');
  await tabTo(page, propose);
  await page.keyboard.press('Enter');

  const menu = page.locator('.menu-dialog');
  await expect(menu.locator('[data-action="executed"]')).toBeFocused();
  // 焦點可見（§8.4）
  await expect(menu.locator('[data-action="executed"]')).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('ArrowDown');
  await expect(menu.locator('[data-action="not-executed"]')).toBeFocused();
  await page.keyboard.press('Enter');

  const passphrase = page.locator('.passphrase-dialog input');
  await expect(passphrase).toBeFocused();
  await page.keyboard.type(api.passphrase);
  await page.keyboard.press('Enter');

  await expect(menu).toHaveCount(0);
  await expect(propose).toBeFocused();
  expect(api.writes('PUT')).toHaveLength(1);
  await expect(page.locator('.today-status')).toHaveText(story.today.proposedNotExecuted);
});

test('只用鍵盤：🔑 進入管理模式並刪除一筆記錄', async ({ page }) => {
  const api = new MockApi(NOW);
  api.records = [record('2026-10-28', true, false, 'n1'), record('2026-10-23', true, false, 'n2')];
  await presetSession(page, api.passphrase);
  await openPage(page, api, { browserNow: NOW });

  await tabTo(page, page.locator('.admin-entry'));
  await page.keyboard.press('Enter');
  await expect(page.locator('.admin-bar')).toBeVisible();

  const remove = page.locator('[data-action="remove"][data-date="2026-10-23"]');
  await tabTo(page, remove);
  await page.keyboard.press('Enter');
  const confirm = page.locator('.confirm-dialog');
  // 預設游標在「取消」
  await expect(confirm.locator('[data-action="cancel"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(confirm.locator('[data-action="confirm"]')).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.locator('tbody tr')).toHaveCount(1);
  expect(api.writes('DELETE')).toHaveLength(1);
  // 該列已刪除：焦點移到記錄表標題
  await expect(page.locator('#records-title')).toBeFocused();
});

test('Esc：關閉最上層的對話框，焦點回到觸發元件', async ({ page }) => {
  const api = new MockApi(NOW);
  await presetSession(page, api.passphrase);
  await openPage(page, api, { browserNow: NOW });
  const propose = page.locator('.propose-button');
  await tabTo(page, propose);
  await page.keyboard.press('Enter');
  const menu = page.locator('.menu-dialog');
  await expect(menu).toBeVisible();

  // 「有搬」的確認框上按 Esc：只關閉確認框，選單還在，焦點回到「有搬」
  await page.keyboard.press('Enter');
  await expect(page.locator('.confirm-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.confirm-dialog')).toHaveCount(0);
  await expect(menu.locator('[data-action="executed"]')).toBeFocused();

  // 選單上按 Esc：關閉，焦點回到「提了」
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(propose).toBeFocused();
  expect(api.writes()).toHaveLength(0);
});

test('管理模式的表單：Esc 關閉，焦點回到「編輯」', async ({ page }) => {
  const api = new MockApi(NOW);
  api.records = [record('2026-10-28', true, false, 'n1')];
  await presetSession(page, api.passphrase);
  await openPage(page, api, { browserNow: NOW });
  await page.locator('.admin-entry').click();
  const edit = page.locator('[data-action="edit"][data-date="2026-10-28"]');
  await tabTo(page, edit);
  await page.keyboard.press('Enter');
  await expect(page.locator('.record-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.record-dialog')).toHaveCount(0);
  await expect(edit).toBeFocused();
});

test('對話框的 aria 屬性', async ({ page }) => {
  const api = new MockApi(NOW);
  await presetSession(page, api.passphrase);
  await openPage(page, api, { browserNow: NOW });
  await page.locator('.propose-button').click();
  const menu = page.locator('.menu-dialog');
  await expect(menu).toHaveAccessibleName(story.menu.title);
  await expect(menu.locator('input[type="date"]')).toHaveAccessibleName(story.common.dateLabel);
  await expect(menu.locator('input[name="note"]')).toHaveAccessibleName(story.common.noteLabel);
  await menu.locator('[data-action="executed"]').click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await expect(confirm).toHaveAccessibleName(/./);
  // 背景不可互動（showModal）
  expect(
    await page.evaluate(() => document.querySelector('dialog.menu-dialog')?.matches(':modal')),
  ).toBe(true);
});
