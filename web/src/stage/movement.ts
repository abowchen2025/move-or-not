/**
 * 移動方式策略（SRS §3.3 規則 2）。劇本指定 float 或 walk；
 * 策略只負責「垂直位移」，水平範圍、轉向、減少動態由 character.ts 統一處理，
 * 新增移動方式時不必改動那些邏輯。
 */
import type { MovementConfig } from '../stories/types';

export interface MovementStrategy {
  /** 經過 elapsedMs 時的垂直位移（邏輯像素；負值＝往上） */
  offsetY(elapsedMs: number): number;
  /** 可能的最大位移量（邏輯像素），用來預留跑道高度 */
  readonly extent: number;
  /** CSS 退路的近似動畫：在 from 與 to（邏輯像素）之間來回，來回一次 periodMs */
  readonly css: { from: number; to: number; periodMs: number };
}

type Factories = {
  [K in MovementConfig['type']]: (config: Extract<MovementConfig, { type: K }>) => MovementStrategy;
};

const factories: Factories = {
  // 飄浮：正弦上下浮動（FR-02：振幅 ±2 邏輯像素、週期約 1.5 秒，數值在劇本）
  float: ({ amplitudePx, periodMs }) => ({
    offsetY: (t) => -amplitudePx * Math.sin((2 * Math.PI * t) / periodMs),
    extent: amplitudePx,
    css: { from: -amplitudePx, to: amplitudePx, periodMs },
  }),
  // 走路：每一步輕微往上彈起
  walk: ({ bobPx, stepMs }) => ({
    offsetY: (t) => -bobPx * Math.abs(Math.sin((Math.PI * t) / stepMs)),
    extent: bobPx,
    css: { from: 0, to: -bobPx, periodMs: stepMs },
  }),
};

export function createMovement(config: MovementConfig): MovementStrategy {
  const factory = factories[config.type] as (c: MovementConfig) => MovementStrategy;
  return factory(config);
}
