/**
 * FR-02 主角（PixiJS）：AC-12 水平範圍與轉向、AC-13 減少動態效果、自適應（縮放、字型載入、旋轉）。
 * 主角的位置與面向由截圖像素判斷（e2e/stage-support.ts）。
 */
import { expect, test } from '@playwright/test';
import { taipei } from '../src/testing/fixtures';
import {
  crtOff,
  expectTrackRules,
  findGhost,
  pauseClock,
  sampleGhost,
  stageReady,
  titleText,
} from './stage-support';
import { MockApi, openPage } from './support';

const NOW = taipei('2026-10-30T10:00:00');
// 軟體 WebGL 加上逐張截圖分析，平行執行時較慢
test.describe.configure({ timeout: 120_000 });
/** 走完一趟約 5 秒：每 400ms 取樣一次、共 6.4 秒，至少碰到一次邊界 */
const SAMPLES = 17;
const STEP_MS = 400;
/**
 * 走到邊界時，可見部分與文字邊緣的最大距離：圖檔左右的透明邊（最多 1 個邏輯像素，桌機 ×3），
 * 加上取樣間隔內最多走的距離（轉向可能發生在兩次取樣之間）。
 */
function edgeMargin(text: { left: number; right: number }): number {
  return 4 + Math.ceil(((text.right - text.left) * STEP_MS) / 2 / 5_000);
}

async function open(page: import('@playwright/test').Page) {
  await openPage(page, new MockApi(NOW), { browserNow: NOW });
  await stageReady(page);
  await page.evaluate(() => document.fonts.ready);
  await crtOff(page);
  await pauseClock(page);
}

test.describe('AC-12 主角只在標題文字左右緣之間移動，碰到邊界轉向並面向前進方向', () => {
  for (const width of [360, 768, 1280]) {
    test(`寬度 ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page);
      const text = await titleText(page);
      const samples = await sampleGhost(page, SAMPLES, STEP_MS);
      expectTrackRules(samples, text, edgeMargin(text));
    });
  }
});

test('自適應：視窗縮放、旋轉手機後仍在範圍內', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  for (const size of [
    { width: 360, height: 740 },
    // 旋轉手機：寬高互換
    { width: 740, height: 360 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(size);
    await page.clock.runFor(100);
    const text = await titleText(page);
    const samples = await sampleGhost(page, SAMPLES, STEP_MS);
    expectTrackRules(samples, text, edgeMargin(text));
  }
});

test('自適應：字型載入完成後重新計算範圍', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  // 字型先不回應，主角以備用字型的標題寬度移動。
  // Playwright 截圖會等字型載入，因此字型回應前只量測標題寬度、推進時間，不截圖
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/fonts/Cubic_11.woff2', async (route) => {
    await held;
    await route.continue();
  });
  await openPage(page, new MockApi(NOW), { browserNow: NOW, waitUntil: 'domcontentloaded' });
  await stageReady(page);
  await crtOff(page);
  await pauseClock(page);
  const before = await titleText(page);
  await page.clock.runFor(1_700);

  release();
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(async () => await page.evaluate(() => document.fonts.check('12px "Cubic 11"')))
    .toBe(true);
  const after = await titleText(page);
  expect(after.right - after.left, '字型改變了標題寬度').not.toBe(before.right - before.left);
  expectTrackRules(await sampleGhost(page, SAMPLES, STEP_MS), after, edgeMargin(after));
});

test.describe('AC-13 減少動態效果', () => {
  test.use({ reducedMotion: 'reduce' });

  test('主角停在標題正中央，只有透明度呼吸；背景減弱（D-11）', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await open(page);
    const text = await titleText(page);
    const center = (text.left + text.right) / 2;
    const samples = await sampleGhost(page, 9, 500);
    for (const s of samples) {
      expect(Math.abs((s.left + s.right) / 2 - center), '在標題正中央').toBeLessThanOrEqual(2);
      expect(s.left).toBe(samples[0]!.left);
      expect(s.top).toBe(samples[0]!.top);
    }
    // 透明度呼吸：亮度有變化
    const peaks = samples.map((s) => s.peak);
    expect(Math.max(...peaks) - Math.min(...peaks)).toBeGreaterThan(40);

    const canvas = page.locator('canvas.stage-canvas');
    await expect(canvas).toHaveAttribute('data-motion', 'reduced');
    await expect(canvas).toHaveAttribute('data-speed', '0.25');
  });
});

test('D-11 背景減弱：同一個視窗大小，減少動態時粒子與星星較少、速度較慢', async ({ browser }) => {
  const counts: Record<string, { stars: number; motes: number; speed: string }> = {};
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    const context = await browser.newContext({
      reducedMotion,
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await openPage(page, new MockApi(NOW), { browserNow: NOW });
    await stageReady(page);
    const canvas = page.locator('canvas.stage-canvas');
    counts[reducedMotion] = {
      stars: Number(await canvas.getAttribute('data-stars')),
      motes: Number(await canvas.getAttribute('data-motes')),
      speed: (await canvas.getAttribute('data-speed'))!,
    };
    await context.close();
  }
  const full = counts['no-preference']!;
  const reduced = counts['reduce']!;
  expect(full.stars).toBeGreaterThan(0);
  expect(full.motes).toBeGreaterThan(0);
  // 減弱、不是停止（D-11）
  expect(reduced.stars).toBeGreaterThan(0);
  expect(reduced.motes).toBeGreaterThan(0);
  expect(reduced.stars).toBeLessThan(full.stars);
  expect(reduced.motes).toBeLessThan(full.motes);
  expect(full.speed).toBe('1');
  expect(reduced.speed).toBe('0.25');
});

test('canvas 不影響操作與無障礙：aria-hidden、不攔截點擊', async ({ page }) => {
  await openPage(page, new MockApi(NOW), { browserNow: NOW });
  await stageReady(page);
  const canvas = page.locator('canvas.stage-canvas');
  await expect(canvas).toHaveAttribute('aria-hidden', 'true');
  await expect(canvas).toHaveCSS('pointer-events', 'none');
  await page.locator('.propose-button').click();
  await expect(page.locator('.menu-dialog')).toBeVisible();
  expect(await findGhost(page)).not.toBeNull();
});
