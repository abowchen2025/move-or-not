/**
 * 完結演出的 PixiJS 繪製。新增演出種類時：在 EndingConfig 加一種 type，
 * 在這裡與 css.ts 各登記一個實作（型別會要求兩邊都要有）。
 */
import { Container, Sprite, Texture } from 'pixi.js';
import type { EndingConfig } from '../../stories/types';
import { createMotes, MOTE_COLORS, purifyFrame } from './purify';

export interface PixiEndingContext {
  ghost: Sprite;
  /** 放大倍率 */
  scale: number;
  /** 主角中心（CSS 像素） */
  center: { x: number; y: number };
}

export interface PixiEndingPlayer {
  /** progress 0～1；回傳 true 表示演出已結束 */
  update(progress: number, context: PixiEndingContext): boolean;
  destroy(): void;
}

export type PixiEndingFactory = (options: {
  layer: Container;
  frameWidth: number;
  frameHeight: number;
}) => PixiEndingPlayer;

const AURA_POINTS = 12;

const createPurify: PixiEndingFactory = ({ layer, frameWidth, frameHeight }) => {
  const motes = createMotes(frameWidth, frameHeight);
  const container = new Container();
  layer.addChild(container);
  const square = (color: number) => {
    const s = new Sprite(Texture.WHITE);
    s.tint = color;
    s.anchor.set(0.5);
    container.addChild(s);
    return s;
  };
  const moteSprites = motes.map((m) => square(MOTE_COLORS[m.color]!));
  const aura = Array.from({ length: AURA_POINTS }, () => square(MOTE_COLORS[1]));

  return {
    update(progress, { ghost, scale, center }) {
      const frame = purifyFrame(progress, motes);
      ghost.alpha = frame.ghostAlpha;
      ghost.y -= Math.round(frame.ghostLift * scale);
      frame.motes.forEach((m, i) => {
        const s = moteSprites[i]!;
        s.width = scale;
        s.height = scale;
        s.position.set(Math.round(center.x + m.x * scale), Math.round(center.y + m.y * scale));
        s.alpha = m.alpha;
      });
      aura.forEach((s, i) => {
        const angle = (2 * Math.PI * i) / AURA_POINTS;
        const r = frame.aura.radius * scale;
        s.width = scale;
        s.height = scale;
        s.position.set(
          Math.round(center.x + r * Math.cos(angle)),
          Math.round(center.y + r * Math.sin(angle)),
        );
        s.alpha = frame.aura.alpha;
      });
      return progress >= 1;
    },
    destroy() {
      container.destroy({ children: true });
    },
  };
};

export const pixiEndings: Record<EndingConfig['type'], PixiEndingFactory> = {
  purify: createPurify,
};
