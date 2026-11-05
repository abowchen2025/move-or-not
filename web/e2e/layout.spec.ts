/** 版面：FR-07 記錄表在 360px 寬時沒有水平捲軸（CLAUDE.md §5 的手機寬度）。 */
import { expect, test, type Page } from '@playwright/test';
import { record, taipei } from '../src/testing/fixtures';
import { MockApi, openPage } from './support';

const NOW = taipei('2026-10-30T10:00:00');

test.use({ viewport: { width: 360, height: 740 } });

/** 備註上限 100 個 code point（D-09）；含一段沒有空白可斷行的長字串，最容易撐破版面 */
const LONG_NOTES = [
  'W'.repeat(100),
  'note '.repeat(20).trim(),
  `${'0123456789'.repeat(9)}<b>x</b>`,
];

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const size = await page.evaluate(() => ({
    viewport: window.innerWidth,
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(size.viewport).toBe(360);
  expect(size.scroll).toBeLessThanOrEqual(size.client);
  expect(size.body).toBeLessThanOrEqual(size.client);
}

test('FR-07 寬度 360px、記錄表有長備註時沒有水平捲軸', async ({ page }) => {
  const api = new MockApi(NOW);
  api.records = LONG_NOTES.map((note, i) => record(`2026-10-2${i + 1}`, true, i === 0, note));
  await openPage(page, api, { browserNow: NOW });
  await expect(page.locator('tbody tr')).toHaveCount(LONG_NOTES.length);
  await expect(page.locator('html')).not.toHaveAttribute('data-layout', 'desktop');
  await expectNoHorizontalScroll(page);
});

test('§4.1-5 寬度 360px 的退路模式畫面也沒有水平捲軸', async ({ page }) => {
  const api = new MockApi(NOW);
  api.down = true;
  await openPage(page, api, { browserNow: NOW, waitFor: 'none' });
  await page.clock.runFor(16_000);
  await expect(page.locator('.alert-message')).toBeVisible();
  await expectNoHorizontalScroll(page);
});
