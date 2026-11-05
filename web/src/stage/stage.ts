/**
 * 主角與背景的進入點（FR-02、§9.1、§3.3 規則 2）。
 * - 先讀 sprite 描述檔；WebGL／WebGPU 可用時才動態載入 PixiJS（另一個 chunk，§8.2），
 *   不可用或初始化失敗時改用 CSS 退路（同一張 sprite sheet）。
 * - 結果寫在 <html data-stage="webgl|css|none">，CSS 與測試都看這個值。
 * - 主角、移動方式、完結演出的種類都來自劇本與 sprite 描述檔，這裡不寫死。
 */
import { appConfig } from '../config';
import type { StoryConfig } from '../stories/types';
import type { EndingMode } from './director';
import { createMovement } from './movement';
import { loadSpriteSheet, type SpriteInfo } from './sprite-sheet';

export interface StageElements {
  /** 標題 <h1>：量測文字的實際寬度 */
  title: HTMLElement;
  /** 標題下方的主角跑道 */
  track: HTMLElement;
}

export interface StageEnv {
  window: Window;
  isDesktop: () => boolean;
  reducedMotion: () => boolean;
  /** 減少動態效果的設定改變時呼叫 cb；回傳取消函式 */
  onReducedMotionChange: (cb: () => void) => () => void;
}

/** 已就緒的繪製實作（PixiJS 或 CSS） */
export interface StageImpl {
  readonly kind: 'webgl' | 'css';
  playEnding(mode: EndingMode): Promise<void>;
  restore(): void;
  destroy(): void;
}

export interface StageHandle {
  playEnding(mode: EndingMode): Promise<void>;
  restore(): void;
  /** 就緒（或確定無法顯示）時 resolve */
  readonly ready: Promise<StageImpl | null>;
}

export type StageKind = StageImpl['kind'] | 'none';

/** 瀏覽器是否可能支援 PixiJS 的 GPU 繪製（實際可否以 PixiJS 初始化結果為準） */
export function mayHaveGpu(win: Window): boolean {
  const canvas = win.document.createElement('canvas');
  try {
    if (canvas.getContext('webgl2') || canvas.getContext('webgl')) return true;
  } catch {
    // 有些環境在 getContext 時直接丟例外
  }
  return 'gpu' in win.navigator && Boolean((win.navigator as { gpu?: unknown }).gpu);
}

/** 依 sprite 描述檔設定跑道高度（CSS 變數，倍率依手機／桌機在 CSS 套用） */
export function applyTrackSize(
  track: HTMLElement,
  sprite: SpriteInfo,
  extent: number,
  padding: number,
) {
  track.style.setProperty('--sprite-scale-mobile', String(sprite.scale.mobile));
  track.style.setProperty('--sprite-scale-desktop', String(sprite.scale.desktop));
  track.style.setProperty('--track-units', String(sprite.frameHeight + 2 * (extent + padding)));
}

export function mountStage(options: {
  elements: StageElements;
  story: StoryConfig;
  env: StageEnv;
  /** 網站根目錄（Vite base） */
  baseUrl: string;
  /** 測試用：取代 PixiJS 的載入 */
  loadPixi?: () => Promise<typeof import('./pixi-stage')>;
}): StageHandle {
  const { elements, story, env, baseUrl } = options;
  const root = env.window.document.documentElement;
  const loadPixi = options.loadPixi ?? (() => import('./pixi-stage'));
  let impl: StageImpl | null = null;
  // restore 之後，還在等待就緒的 playEnding 不再播放
  let generation = 0;

  const ready = (async (): Promise<StageImpl | null> => {
    let sprite: SpriteInfo;
    try {
      sprite = await loadSpriteSheet(baseUrl + story.character.spritesheet);
    } catch {
      root.dataset.stage = 'none';
      return null;
    }
    const movement = createMovement(story.character.movement);
    applyTrackSize(elements.track, sprite, movement.extent, appConfig.stage.trackPadding);
    const args = { elements, story, env, sprite, movement };
    if (mayHaveGpu(env.window)) {
      try {
        const { createPixiStage } = await loadPixi();
        impl = await createPixiStage(args);
      } catch {
        impl = null;
      }
    }
    if (!impl) {
      const { createCssStage } = await import('./css-stage');
      impl = createCssStage(args);
    }
    root.dataset.stage = impl.kind;
    return impl;
  })();

  return {
    ready,
    async playEnding(mode) {
      const mine = ++generation;
      const current = await ready;
      if (current && mine === generation) await current.playEnding(mode);
    },
    restore() {
      generation += 1;
      impl?.restore();
    },
  };
}
