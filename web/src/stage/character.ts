/**
 * 主角的動作（FR-02、AC-12、AC-13）。純邏輯：以注入的時間推進，PixiJS 與 CSS 退路都用同一份規則。
 * - 左右來回等速移動：走完一趟（左緣到右緣）為 sprite 描述檔的 tripMs，與跑道寬度無關。
 * - 碰到邊界時轉向；facing 為 1 時面向右（圖檔本身朝右），-1 時左右翻轉。
 * - 位置以「跑道上的比例」保存，視窗縮放或字型載入後跑道改變，主角仍在範圍內。
 * - 減少動態效果時：停在標題文字正中央，只保留緩慢的透明度呼吸。
 */
import type { MovementStrategy } from './movement';
import type { ActionName, SpriteInfo } from './sprite-sheet';
import { centeredLeft, leftAt, type Span, type Track } from './track';

export interface BreathConfig {
  /** 透明度呼吸的週期 */
  periodMs: number;
  /** 最低透明度（最高為 1） */
  minAlpha: number;
}

export interface CharacterPose {
  /** 主角左緣（CSS 像素，整數） */
  left: number;
  /** 垂直位移（CSS 像素，整數；負值＝往上） */
  offsetY: number;
  /** 1＝面向右、-1＝面向左 */
  facing: 1 | -1;
  action: ActionName;
  /** 該動作的第幾格 */
  frame: number;
  alpha: number;
}

export class CharacterMotion {
  #progress: number;
  #direction: 1 | -1 = 1;
  #elapsed = 0;

  constructor(
    private readonly sprite: Pick<SpriteInfo, 'tripMs' | 'frameMs' | 'frames'>,
    private readonly movement: MovementStrategy,
    private readonly breath: BreathConfig,
    /** 起始位置（0＝最左、1＝最右） */
    startProgress = 0.5,
  ) {
    this.#progress = startProgress;
  }

  get direction(): 1 | -1 {
    return this.#direction;
  }

  get progress(): number {
    return this.#progress;
  }

  /** 推進 dtMs。減少動態效果時不移動。 */
  step(dtMs: number, reduced: boolean): void {
    const dt = Math.max(0, dtMs);
    this.#elapsed += dt;
    if (reduced) return;
    let p = this.#progress + (this.#direction * dt) / this.sprite.tripMs;
    // 碰到邊界就轉向（一次推進很多時，來回反射到正確位置）
    while (p > 1 || p < 0) {
      if (p > 1) {
        p = 2 - p;
        this.#direction = -1;
      } else {
        p = -p;
        this.#direction = 1;
      }
    }
    this.#progress = p;
  }

  /**
   * 目前的姿勢。spriteWidth 為放大後的寬度（CSS 像素）、scale 為放大倍率。
   */
  pose(
    track: Track,
    text: Span,
    spriteWidth: number,
    scale: number,
    reduced: boolean,
  ): CharacterPose {
    if (reduced) {
      const phase = (2 * Math.PI * this.#elapsed) / this.breath.periodMs;
      const alpha = this.breath.minAlpha + ((1 - this.breath.minAlpha) * (1 + Math.cos(phase))) / 2;
      return {
        left: centeredLeft(text, spriteWidth),
        offsetY: 0,
        facing: 1,
        action: 'idle',
        frame: 0,
        alpha,
      };
    }
    const frames = this.sprite.frames.move.length;
    return {
      left: leftAt(track, this.#progress),
      offsetY: Math.round(this.movement.offsetY(this.#elapsed) * scale),
      // 跑道不存在時（D-22-j）停在中央，保持面向右
      facing: track.kind === 'fixed' ? 1 : this.#direction,
      action: 'move',
      frame: Math.floor(this.#elapsed / this.sprite.frameMs.move) % frames,
      alpha: 1,
    };
  }
}
