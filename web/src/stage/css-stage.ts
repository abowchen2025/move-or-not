/**
 * WebGL／WebGPU 不可用時的 CSS 退路（FR-02、§3.3 規則 2）：用同一張 sprite sheet 以 CSS 動畫顯示主角。
 * - 移動範圍與 PixiJS 版相同（track.ts），在縮放、字型載入、旋轉手機時重新計算。
 * - 來回移動、轉向、影格、上下飄動都是 CSS 動畫；減少動態效果時由 style.css 的
 *   media query 改成置中、只有透明度呼吸。
 * - 背景的星空與粒子只在 PixiJS 版顯示；退路模式保留 CSS 的夜空漸層。
 */
import type { StoryConfig } from '../stories/types';
import type { EndingMode } from './director';
import { cssEndings } from './endings/css';
import type { MovementStrategy } from './movement';
import type { FrameRect, SpriteInfo } from './sprite-sheet';
import type { StageElements, StageEnv, StageImpl } from './stage';
import { computeTrack, measureText } from './track';

let keyframeId = 0;

/** 依影格位置產生 background-position 的 keyframes（任何排列的 sprite sheet 都適用） */
function framesKeyframes(name: string, frames: readonly FrameRect[]): string {
  const at = (r: FrameRect) =>
    `background-position: calc(var(--sprite-scale) * ${-r.x}px) calc(var(--sprite-scale) * ${-r.y}px);`;
  const steps = frames.map((r, i) => `${((i / frames.length) * 100).toFixed(4)}% { ${at(r)} }`);
  return `@keyframes ${name} { ${steps.join(' ')} 100% { ${at(frames[0]!)} } }`;
}

export function createCssStage(args: {
  elements: StageElements;
  story: StoryConfig;
  env: StageEnv;
  sprite: SpriteInfo;
  movement: MovementStrategy;
}): StageImpl {
  const { elements, story, env, sprite, movement } = args;
  const win = env.window;
  const doc = win.document;
  const id = (keyframeId += 1);

  const style = doc.createElement('style');
  style.textContent = [
    framesKeyframes(`css-ghost-move-${id}`, sprite.frames.move),
    framesKeyframes(`css-ghost-idle-${id}`, sprite.frames.idle),
  ].join('\n');
  doc.head.append(style);

  const ghost = doc.createElement('div');
  ghost.className = 'css-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  const fx = doc.createElement('div');
  fx.className = 'css-ghost-fx';
  const float = doc.createElement('div');
  float.className = 'css-ghost-float';
  const body = doc.createElement('div');
  body.className = 'css-ghost-sprite';
  float.append(body);
  fx.append(float);
  ghost.append(fx);
  elements.track.append(ghost);

  const idle = sprite.frames.idle[0]!;
  const vars: Record<string, string> = {
    '--sprite-w': String(sprite.frameWidth),
    '--sprite-h': String(sprite.frameHeight),
    '--sheet-w': String(sprite.imageSize.w),
    '--sheet-h': String(sprite.imageSize.h),
    '--idle-x': String(-idle.x),
    '--idle-y': String(-idle.y),
    '--cycle-ms': `${2 * sprite.tripMs}ms`,
    // 從跑道中央、往右開始（與 PixiJS 版相同）
    '--cycle-delay': `${-sprite.tripMs / 2}ms`,
    '--frames-move': `css-ghost-move-${id}`,
    '--frames-move-ms': `${sprite.frames.move.length * sprite.frameMs.move}ms`,
    '--frames-idle': `css-ghost-idle-${id}`,
    '--float-from': String(movement.css.from),
    '--float-to': String(movement.css.to),
    '--float-ms': `${movement.css.periodMs / 2}ms`,
  };
  for (const [key, value] of Object.entries(vars)) ghost.style.setProperty(key, value);
  body.style.backgroundImage = `url("${sprite.imageUrl}")`;
  body.style.animationName = `css-ghost-face, ${vars['--frames-move']}`;

  /** 依標題文字的實際範圍，算出相對跑道左緣的移動範圍 */
  function layout(): void {
    const text = measureText(elements.title);
    const trackRect = elements.track.getBoundingClientRect();
    if (!text || trackRect.width === 0) return;
    const scale = env.isDesktop() ? sprite.scale.desktop : sprite.scale.mobile;
    const width = sprite.frameWidth * scale;
    const track = computeTrack(text, width);
    const offset = trackRect.left;
    const center = Math.round((text.left + text.right) / 2 - width / 2 - offset);
    const [min, max] =
      track.kind === 'range' ? [track.minLeft - offset, track.maxLeft - offset] : [center, center];
    ghost.style.setProperty('--ghost-min', `${Math.round(min)}px`);
    ghost.style.setProperty('--ghost-max', `${Math.round(max)}px`);
    ghost.style.setProperty('--ghost-center', `${center}px`);
    ghost.classList.toggle('is-fixed', track.kind === 'fixed');
  }

  layout();
  const observer = new ResizeObserver(() => layout());
  observer.observe(elements.title);
  observer.observe(elements.track);
  win.addEventListener('resize', layout);
  doc.fonts?.addEventListener?.('loadingdone', layout);
  void doc.fonts?.ready.then(layout);
  const stopMotion = env.onReducedMotionChange(layout);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: (() => void) | null = null;
  const endingClass = cssEndings[story.character.ending.type];

  function settle(): void {
    clearTimeout(timer);
    fx.classList.remove(endingClass);
    pending?.();
    pending = null;
  }

  return {
    kind: 'css',
    playEnding(mode: EndingMode) {
      settle();
      if (mode === 'instant') {
        ghost.classList.add('is-gone');
        return Promise.resolve();
      }
      const { durationMs, shortDurationMs } = story.character.ending;
      const duration = mode === 'short' ? shortDurationMs : durationMs;
      fx.style.setProperty('--ending-ms', `${duration}ms`);
      fx.classList.add(endingClass);
      return new Promise<void>((resolve) => {
        pending = resolve;
        timer = setTimeout(() => {
          ghost.classList.add('is-gone');
          settle();
        }, duration);
      });
    },
    restore() {
      settle();
      ghost.classList.remove('is-gone');
    },
    destroy() {
      settle();
      observer.disconnect();
      win.removeEventListener('resize', layout);
      doc.fonts?.removeEventListener?.('loadingdone', layout);
      stopMotion();
      ghost.remove();
      style.remove();
    },
  };
}
