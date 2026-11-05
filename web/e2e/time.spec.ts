/**
 * SRS §4 的瀏覽器測試：AC-02（訪客時區）、AC-03（訪客時鐘錯誤）、AC-04（跨過台灣午夜）。
 * 伺服器時間由 MockApi 控制，瀏覽器時間由 page.clock 控制，兩者刻意分開。
 */
import { expect, test } from '@playwright/test';
import { record, taipei } from '../src/testing/fixtures';
import { MockApi, openPage, story } from './support';

const DAY = 86_400_000;

test.describe('AC-02 訪客時區設為 America/Los_Angeles', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  // 台灣 10/31 01:00 ＝ 洛杉磯 10/30 10:00
  const NOW = taipei('2026-10-31T01:00:00');

  test('§4.1-1 天數與今日狀態和台灣一致', async ({ page }) => {
    const api = new MockApi(NOW);
    api.records = [record('2026-10-30', true, false, 'a'), record('2026-10-31', true, false, 'b')];
    await openPage(page, api, { browserNow: NOW });

    // 確認瀏覽器真的在洛杉磯時區，而且當地日期還是 10/30
    expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(
      'America/Los_Angeles',
    );
    expect(await page.evaluate(() => new Date().getDate())).toBe(30);

    await expect(page.locator('.days-value')).toHaveText('18');
    // 今天（台灣 10/31）有記錄 → 今天提了，沒搬；不是洛杉磯的 10/30
    await expect(page.locator('.today-status')).toHaveText(story.today.proposedNotExecuted);
  });

  test('§4.1-5 退路模式也用台灣日期計算天數', async ({ page }) => {
    const api = new MockApi(NOW);
    api.down = true;
    await openPage(page, api, { browserNow: NOW, waitFor: 'none' });
    await page.clock.runFor(16_000);
    await expect(page.locator('.clock-notice')).toHaveText(story.common.fallbackClockNotice);
    await expect(page.locator('.days-value')).toHaveText('18');
  });
});

test.describe('AC-03 訪客時鐘與伺服器時間不同', () => {
  const SERVER_NOW = taipei('2026-10-30T10:00:00');

  for (const [label, skew] of [
    ['快一天', DAY],
    ['慢一天', -DAY],
  ] as const) {
    test(`§4.1-3 訪客時鐘${label}，天數仍以伺服器為準`, async ({ page }) => {
      const api = new MockApi(SERVER_NOW);
      api.records = [record('2026-10-30', true, false, 'a')];
      await openPage(page, api, { browserNow: SERVER_NOW + skew });

      await expect(page.locator('.days-value')).toHaveText('17');
      await expect(page.locator('.today-status')).toHaveText(story.today.proposedNotExecuted);

      // 每秒的跨日檢查用校正後的時間：不會因為訪客時鐘的日期不同而重抓
      await page.clock.runFor(5_000);
      expect(api.statePaths()).toHaveLength(1);
      await expect(page.locator('.days-value')).toHaveText('17');
    });
  }
});

test.describe('AC-04 頁面開著跨過台灣 00:00', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('§4.3 不重新整理，天數自動 +1、今日狀態重置', async ({ page }) => {
    const start = taipei('2026-10-30T23:59:40');
    const api = new MockApi(start);
    api.records = [record('2026-10-30', true, false, 'a')];
    await openPage(page, api, { browserNow: start });
    await page.clock.pauseAt(start + 5_000);

    await expect(page.locator('.days-value')).toHaveText('17');
    await expect(page.locator('.today-status')).toHaveText(story.today.proposedNotExecuted);
    await page.evaluate(() => {
      (window as unknown as { noReload: boolean }).noReload = true;
    });

    // 伺服器那邊也過了午夜
    api.serverNow = taipei('2026-10-31T00:00:00');
    await page.clock.runFor(16_000);

    await expect(page.locator('.days-value')).toHaveText('18');
    await expect(page.locator('.today-status')).toHaveText(story.today.none);
    // 跨日是由每秒檢查觸發，不是 60 秒輪詢
    expect(api.statePaths()).toHaveLength(2);
    expect(await page.evaluate(() => (window as unknown as { noReload?: boolean }).noReload)).toBe(
      true,
    );
  });
});

test('§4.1-4、FR-10 每 60 秒與回到前景時重新抓取', async ({ page }) => {
  const now = taipei('2026-10-30T10:00:00');
  const api = new MockApi(now);
  await openPage(page, api, { browserNow: now });
  await page.clock.pauseAt(now + 5_000);
  expect(api.statePaths()).toHaveLength(1);

  // 管理者在別處新增了一筆記錄
  api.records = [record('2026-10-30', true, false, 'a')];
  api.serverNow = now + 65_000;
  await page.clock.runFor(60_000);
  await expect(page.locator('.today-status')).toHaveText(story.today.proposedNotExecuted);
  expect(api.statePaths()).toHaveLength(2);

  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => api.statePaths().length).toBe(3);
});
