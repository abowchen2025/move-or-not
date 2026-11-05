/** style.css 的規則檢查：§8.4 對比、D-33 斷點、CLAUDE.md §4 字級。 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf-8');
const palette = Object.fromEntries(
  [...css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]),
) as Record<string, string>;

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

// [文字, 背景]：視窗漸層的兩端都要符合；頁面背景同理
const PAIRS: Array<[string, string]> = [
  ['text', 'window-top'],
  ['text', 'window-bottom'],
  ['accent', 'window-top'],
  ['accent', 'window-bottom'],
  ['text', 'bg-dark'],
  ['text', 'bg-light'],
  ['accent', 'bg-dark'],
  ['accent', 'bg-light'],
  ['chip-text', 'yes'],
  ['chip-text', 'no'],
];

describe('§8.4 色票對比', () => {
  it('計算方式正確（黑白為 21:1）', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it.each(PAIRS)('%s 在 %s 上 ≥ 4.5:1', (fg, bg) => {
    expect(palette[fg], fg).toBeDefined();
    expect(palette[bg], bg).toBeDefined();
    expect(contrast(palette[fg]!, palette[bg]!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('style.css', () => {
  it('D-33 CSS 不自己寫寬度斷點，只用 data-layout', () => {
    expect(css).not.toMatch(/@media[^{]*(min|max)-width/);
    expect(css).toContain(":root[data-layout='desktop']");
  });

  it('CLAUDE.md §4 字級一律為 12px 的整數倍', () => {
    const sizes = [...css.matchAll(/--fs-[\w-]+:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size % 12).toBe(0);
    // font-size 只能引用上面的變數（或 inherit）
    for (const [, value] of css.matchAll(/(?<!-)font-size:\s*([^;]+);/g)) {
      expect(value).toMatch(/^var\(--fs-[\w-]+\)$/);
    }
  });
});
