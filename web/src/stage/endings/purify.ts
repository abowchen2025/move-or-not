/**
 * 完結演出 purify：主角被淨化成光點消失（SRS §4.4、Q-02）。
 * 這裡只定義「時間 → 畫面參數」的純函式；PixiJS 與 CSS 退路各自依參數繪製。
 * 完整版與短版（D-21）用同一條時間軸，只是總長不同（劇本的 durationMs、shortDurationMs）。
 */

export interface LightMote {
  /** 相對主角中心的起點（邏輯像素） */
  x: number;
  y: number;
  /** 往上飄的距離（邏輯像素） */
  rise: number;
  /** 往旁邊散開的距離（邏輯像素） */
  drift: number;
  /** 出現的時間點（0～1，相對整段演出） */
  delay: number;
  /** 色票索引 */
  color: number;
}

export interface PurifyFrame {
  /** 主角的透明度 */
  ghostAlpha: number;
  /** 主角往上升的距離（邏輯像素） */
  ghostLift: number;
  /** 光環：半徑（邏輯像素）與透明度 */
  aura: { radius: number; alpha: number };
  /** 每個光點的位置與透明度（邏輯像素，相對主角中心） */
  motes: { x: number; y: number; alpha: number; color: number }[];
}

/** 光點的色票：白、淡黃、強調色（§9.2） */
export const MOTE_COLORS = [0xffffff, 0xfff8c0, 0xf8d850] as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (v: number) => 1 - (1 - v) * (1 - v);

/** 以固定種子產生光點，每次演出相同（截圖與測試可重現） */
export function createMotes(width: number, height: number, count = 24): LightMote[] {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  return Array.from({ length: count }, () => ({
    x: Math.round((random() - 0.5) * width),
    y: Math.round((random() - 0.5) * height),
    rise: 8 + random() * 16,
    drift: (random() - 0.5) * 12,
    delay: 0.3 + random() * 0.25,
    color: Math.floor(random() * MOTE_COLORS.length),
  }));
}

/**
 * progress：0～1。
 * - 0～0.35：發光、微微上升，光環擴大。
 * - 0.3～0.7：主角淡出，光點從身上散出。
 * - 0.55～1：光點往上飄並消失。
 */
export function purifyFrame(progress: number, motes: readonly LightMote[]): PurifyFrame {
  const p = clamp01(progress);
  const glow = ease(clamp01(p / 0.35));
  const fade = clamp01((p - 0.3) / 0.4);
  return {
    ghostAlpha: 1 - fade,
    ghostLift: 4 * glow,
    aura: { radius: 4 + 12 * glow, alpha: 0.6 * glow * (1 - fade) },
    motes: motes.map((m) => {
      const t = clamp01((p - m.delay) / (1 - m.delay));
      const visible = p >= m.delay;
      return {
        x: m.x + m.drift * ease(t),
        y: m.y - m.rise * ease(t),
        alpha: visible ? 1 - t : 0,
        color: m.color,
      };
    }),
  };
}
