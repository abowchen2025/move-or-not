/**
 * 主角相關的 Playwright 工具（PLAN §4.5）。
 * 主角畫在 canvas 上，DOM 讀不到位置，因此直接分析截圖的像素：
 * - 主角是純白（§9.2 #ffffff），眼睛 #202040；星星與粒子刻意不用白色。
 * - 在跑道範圍截圖，取「接近白色」的最大連通區塊當作主角，避免零星的星星干擾。
 * - 面向：眼睛畫在前進方向那一側，以眼睛的水平重心相對主角中心判斷。
 * 截圖前會關掉 CRT 掃描線（掃描線會讓顏色變暗）。
 */
import { expect, type Page } from '@playwright/test';

export interface GhostBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** 1＝面向右、-1＝面向左、0＝無法判斷（減少動態時眼睛置中） */
  facing: 1 | -1 | 0;
  /** 主角最亮像素的亮度（0～255），用來判斷透明度呼吸 */
  peak: number;
}

export interface TextSpan {
  left: number;
  right: number;
}

/** 標題文字的實際範圍（Range，不是 <h1> 區塊） */
export async function titleText(page: Page): Promise<TextSpan> {
  return page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('h1.title')!);
    const rect = range.getBoundingClientRect();
    return { left: rect.left, right: rect.right };
  });
}

export async function crtOff(page: Page): Promise<void> {
  const toggle = page.locator('[data-toggle="crt"]');
  if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-crt', 'off');
  // 點頁尾的開關會捲到下方；捲回頂端，讓跑道在畫面內
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** 等主角就緒（webgl 或 css） */
export async function stageReady(page: Page, kind: 'webgl' | 'css' = 'webgl'): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-stage', kind, { timeout: 15_000 });
}

/** 在跑道範圍內找主角；找不到時回傳 null */
export async function findGhost(page: Page): Promise<GhostBox | null> {
  const track = await page.locator('.ghost-track').boundingBox();
  const viewport = page.viewportSize()!;
  if (!track || track.height === 0) return null;
  if (track.y < 0 || track.y + track.height > viewport.height) {
    throw new Error('跑道不在畫面內，請先捲到頂端');
  }
  // 上方多留一些空間（完結演出會往上升）
  const clip = {
    x: 0,
    y: Math.max(0, Math.floor(track.y - 8)),
    width: viewport.width,
    height: Math.ceil(track.height + 16),
  };
  const png = await page.screenshot({ clip, animations: 'allow' });
  return page.evaluate(
    async ({ data, clip }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data: px, width, height } = ctx.getImageData(0, 0, img.width, img.height);
      const at = (x: number, y: number) => (y * width + x) * 4;
      // 接近白色（含半透明疊在深色背景上的情形）：R≈G、夠亮、藍色不明顯偏高
      const ghostLike = (i: number) => {
        const [r, g, b] = [px[i]!, px[i + 1]!, px[i + 2]!];
        return r > 100 && Math.abs(r - g) <= 10 && b - r <= 40 && b >= r - 10;
      };
      const seen = new Uint8Array(width * height);
      let best: number[] = [];
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const start = y * width + x;
          if (seen[start] || !ghostLike(start * 4)) continue;
          const component: number[] = [];
          const stack = [start];
          seen[start] = 1;
          while (stack.length) {
            const p = stack.pop()!;
            component.push(p);
            const px0 = p % width;
            const py0 = Math.floor(p / width);
            for (const [dx, dy] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ] as const) {
              const nx = px0 + dx;
              const ny = py0 + dy;
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
              const q = ny * width + nx;
              if (!seen[q] && ghostLike(q * 4)) {
                seen[q] = 1;
                stack.push(q);
              }
            }
          }
          if (component.length > best.length) best = component;
        }
      }
      // 太小的區塊不是主角（星星最大 6×6）
      if (best.length < 64) return null;
      let [left, right, top, bottom, peak] = [width, -1, height, -1, 0];
      for (const p of best) {
        const x = p % width;
        const y = Math.floor(p / width);
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        peak = Math.max(peak, px[p * 4]!);
      }
      // 眼睛：主角範圍內接近 #202040 的像素
      let sum = 0;
      let count = 0;
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const i = at(x, y);
          if (
            Math.abs(px[i]! - 0x20) <= 3 &&
            Math.abs(px[i + 1]! - 0x20) <= 3 &&
            Math.abs(px[i + 2]! - 0x40) <= 3
          ) {
            sum += x;
            count += 1;
          }
        }
      }
      const center = (left + right) / 2;
      const eyes = count ? sum / count : center;
      const facing = Math.abs(eyes - center) < 1 ? 0 : eyes > center ? 1 : -1;
      return {
        left: left + clip.x,
        right: right + 1 + clip.x,
        top: top + clip.y,
        bottom: bottom + 1 + clip.y,
        facing,
        peak,
      };
    },
    { data: png.toString('base64'), clip },
  );
}

/** 時鐘暫停後，每次推進 stepMs 取樣一次 */
export async function sampleGhost(page: Page, count: number, stepMs: number): Promise<GhostBox[]> {
  const samples: GhostBox[] = [];
  for (let i = 0; i < count; i += 1) {
    if (i > 0) await page.clock.runFor(stepMs);
    const ghost = await findGhost(page);
    expect(ghost, `第 ${i} 次取樣找不到主角`).not.toBeNull();
    samples.push(ghost!);
  }
  return samples;
}

/** 暫停時鐘（之後只隨 runFor 前進） */
export async function pauseClock(page: Page): Promise<void> {
  // 時鐘仍在走：目標時間取得稍晚一些；機器忙碌時若已經過了，再往後取
  for (let ahead = 500; ; ahead *= 2) {
    const now = await page.evaluate(() => Date.now());
    try {
      await page.clock.pauseAt(now + ahead);
      // 讓畫面依目前的捲動位置與尺寸至少更新一幀
      await page.clock.runFor(50);
      return;
    } catch (error) {
      if (ahead > 16_000) throw error;
    }
  }
}

/**
 * AC-12：每個取樣的左右緣都在標題文字範圍內；移動時面向前進方向；至少轉向一次並走到邊界附近。
 * margin：圖檔左右的透明邊（CSS 像素），走到邊界時可見部分與文字邊緣的最大距離。
 */
export function expectTrackRules(samples: GhostBox[], text: TextSpan, margin: number): void {
  for (const s of samples) {
    expect(s.left, '左緣不小於標題文字左緣').toBeGreaterThanOrEqual(Math.floor(text.left));
    expect(s.right, '右緣不大於標題文字右緣').toBeLessThanOrEqual(Math.ceil(text.right));
  }
  // 前後兩段位移同方向時（附近沒有轉向），該樣本必須面向那個方向
  const mid = (s: GhostBox) => s.left + s.right;
  const directions: number[] = [];
  for (let i = 1; i < samples.length - 1; i += 1) {
    const before = mid(samples[i]!) - mid(samples[i - 1]!);
    const after = mid(samples[i + 1]!) - mid(samples[i]!);
    if (Math.abs(before) < 2 || Math.abs(after) < 2 || Math.sign(before) !== Math.sign(after)) {
      continue;
    }
    const moving = before > 0 ? 1 : -1;
    expect(samples[i]!.facing, '面向前進方向').toBe(moving);
    directions.push(moving);
  }
  expect(new Set(directions).size, '碰到邊界會轉向').toBe(2);
  const reachedLeft = Math.min(...samples.map((s) => s.left)) <= text.left + margin;
  const reachedRight = Math.max(...samples.map((s) => s.right)) >= text.right - margin;
  expect(reachedLeft || reachedRight, '走到標題文字的邊緣附近').toBe(true);
}
