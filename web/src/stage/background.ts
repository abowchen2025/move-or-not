/**
 * 背景（§9.1）：三層星空（閃爍、緩慢視差）與往上飄的粒子。
 * 這裡只算參數與位置（純函式）；PixiJS 依結果繪製。
 * - 數量依螢幕面積調整並設上限（§8.2）。
 * - 減少動態效果時「減弱」：速度、數量、閃爍幅度依倍率降低，不完全停止（D-11）。
 */
import { appConfig } from '../config';

export type StageConfig = (typeof appConfig)['stage'];

export interface BackgroundParams {
  stars: number;
  motes: number;
  /** 速度倍率（星空漂移、粒子上升、閃爍週期） */
  speed: number;
  /** 閃爍幅度（0～1：透明度變化量） */
  twinkle: number;
}

export function backgroundParams(
  viewport: { width: number; height: number },
  reduced: boolean,
  config: StageConfig = appConfig.stage,
): BackgroundParams {
  const area = Math.max(0, viewport.width) * Math.max(0, viewport.height);
  const count = reduced ? config.reduced.count : 1;
  return {
    stars: Math.round(Math.min(config.maxStars, (area / 100_000) * config.starsPer100k) * count),
    motes: Math.round(Math.min(config.maxMotes, (area / 100_000) * config.motesPer100k) * count),
    speed: reduced ? config.reduced.speed : 1,
    twinkle: reduced ? config.reduced.twinkle : 1,
  };
}

/** 把座標折回 [0, size) 內（星星漂出畫面後從另一側回來） */
export function wrap(value: number, size: number): number {
  if (size <= 0) return 0;
  return ((value % size) + size) % size;
}

/** 固定種子的亂數（同一個種子產生相同的星空） */
export function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** 星星的色票：刻意不用主角的純白（§9.2），避免與主角混淆 */
export const STAR_COLORS = [0x9ab0ff, 0xc8b8ff, 0xf8d850, 0xffb0d0] as const;
/** 粒子：淡青色 */
export const MOTE_COLOR = 0xa8f0ff;

/** 閃爍：階梯式（像素風）的透明度，phase 0～1 */
export function twinkleAlpha(phase: number, amount: number): number {
  const step = Math.floor(wrap(phase, 1) * 4);
  const levels = [1, 0.75, 0.45, 0.75];
  return 1 - (1 - levels[step]!) * amount;
}
