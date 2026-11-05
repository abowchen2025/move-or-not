/** 讀取失敗：AC-18（API 連不上）、D-06（初次成功後，定期更新連續失敗）。 */
import { expect, test, type Page } from '@playwright/test';
import { record, taipei } from '../src/testing/fixtures';
import { MockApi, openPage, story } from './support';

const NOW = taipei('2026-10-30T10:00:00');

async function expectFallback(page: Page) {
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.alert-message')).toHaveText(story.serverDown);
  await expect(page.getByRole('button', { name: story.common.retry })).toBeVisible();
  await expect(page.locator('.clock-notice')).toHaveText(story.common.fallbackClockNotice);
  await expect(page.locator('.records-message')).toHaveText(story.common.recordsUnavailable);
  await expect(page.locator('#today')).toBeHidden();
}

test.describe('AC-18 API 連不上', () => {
  test('§4.1-5 讀取中最多等 15 秒，之後顯示錯誤、重試按鈕，天數改用本機時鐘並標示 ⚠', async ({
    page,
  }) => {
    const api = new MockApi(NOW);
    api.down = true;
    await openPage(page, api, { browserNow: NOW, waitFor: 'none' });

    await expect(page.locator('.loading')).toHaveText(story.loading);
    await page.clock.runFor(14_000);
    await expect(page.locator('.loading')).toBeVisible();
    await page.clock.runFor(2_000);

    await expectFallback(page);
    await expect(page.locator('.loading')).toBeHidden();
    // 本機時鐘換算台灣 10/30 → 17 天（D-04 打包的起始日）
    await expect(page.locator('.days-value')).toHaveText('17');
    await expect(page.locator('.since')).toHaveText(story.days.since({ startDate: '2026/10/13' }));
  });

  test('按「重試」且 API 恢復後回到正常畫面，⚠ 消失', async ({ page }) => {
    const api = new MockApi(NOW);
    api.down = true;
    await openPage(page, api, { browserNow: NOW, waitFor: 'none' });
    await page.clock.runFor(16_000);
    await expectFallback(page);

    api.down = false;
    api.records = [record('2026-10-28', true, false, 'a')];
    await page.getByRole('button', { name: story.common.retry }).click();
    await expect(page.locator('.today-status')).toHaveText(story.today.none);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('.clock-notice')).toBeHidden();
    await expect(page.getByRole('alert')).toBeHidden();
  });

  test('伺服器錯誤（不可重試）時不必等 15 秒', async ({ page }) => {
    const api = new MockApi(NOW);
    api.failStatus = 500;
    await openPage(page, api, { browserNow: NOW, waitFor: 'none' });
    await expectFallback(page);
    await expect(page.locator('.alert-detail')).toHaveText(story.errors.INTERNAL_ERROR);
  });
});

test('D-06 初次讀取成功後，定期更新連續失敗 3 次才切到錯誤畫面', async ({ page }) => {
  const api = new MockApi(NOW);
  api.records = [record('2026-10-28', true, false, 'a')];
  await openPage(page, api, { browserNow: NOW });
  await page.clock.pauseAt(NOW + 5_000);

  api.failStatus = 500;
  for (const attempt of [1, 2]) {
    await page.clock.runFor(60_000);
    await expect.poll(() => api.statePaths().length).toBe(1 + attempt);
    // 保留畫面資料，頁尾顯示小提示
    await expect(page.locator('.sync-warning')).toHaveText(story.common.syncWarning);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.getByRole('alert')).toBeHidden();
  }

  await page.clock.runFor(60_000);
  await expectFallback(page);

  // 恢復後，下一次定期更新自動回到正常畫面
  api.failStatus = null;
  await page.clock.runFor(60_000);
  await expect(page.locator('#today')).toBeVisible();
  await expect(page.locator('.sync-warning')).toBeHidden();
  await expect(page.locator('.clock-notice')).toBeHidden();
});
