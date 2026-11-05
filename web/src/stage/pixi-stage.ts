/**
 * PixiJS v8 繪製（FR-02、§9.1、§4.4）。只在 WebGL／WebGPU 可用時動態載入（stage.ts）。
 * - canvas 以 position: fixed 鋪滿視窗、放在 DOM 後面（SRS FR-02 建議），aria-hidden（§8.4）。
 * - 每一幀量測標題文字與跑道的位置，主角跟著標題走（捲動、縮放、字型載入、旋轉手機都適用）。
 * - 只 import 用到的模組：skipExtensionImports 關閉自動載入（無障礙、事件、濾鏡等都用不到），
 *   只載入 Application 的 ticker／resize 外掛（§8.2）。
 */
import 'pixi.js/app';
import { Application, Container, ImageSource, Sprite, Spritesheet, Texture } from 'pixi.js';
import type { SpritesheetData } from 'pixi.js';
import { appConfig } from '../config';
import type { StoryConfig } from '../stories/types';
import {
  backgroundParams,
  MOTE_COLOR,
  seededRandom,
  STAR_COLORS,
  twinkleAlpha,
  wrap,
  type BackgroundParams,
} from './background';
import { CharacterMotion } from './character';
import type { EndingMode } from './director';
import { pixiEndings, type PixiEndingPlayer } from './endings/pixi';
import type { MovementStrategy } from './movement';
import type { ActionName, SpriteInfo } from './sprite-sheet';
import type { StageElements, StageEnv, StageImpl } from './stage';
import { computeTrack, measureText } from './track';

interface Star {
  sprite: Sprite;
  x: number;
  y: number;
  layer: number;
  twinkleMs: number;
  phase: number;
}

interface Mote {
  sprite: Sprite;
  x: number;
  y: number;
  speed: number;
  phase: number;
}

async function loadTextures(sprite: SpriteInfo): Promise<Record<ActionName, Texture[]>> {
  const image = new Image();
  image.src = sprite.imageUrl;
  await image.decode();
  // 最近鄰取樣：像素圖放大後邊緣不可模糊（FR-02）
  const source = new ImageSource({ resource: image, scaleMode: 'nearest' });
  const sheet = new Spritesheet({
    texture: new Texture({ source }),
    data: sprite.data as unknown as SpritesheetData,
  });
  await sheet.parse();
  return {
    move: sheet.data.animations!.move!.map((name) => sheet.textures[name]!),
    idle: sheet.data.animations!.idle!.map((name) => sheet.textures[name]!),
  };
}

export async function createPixiStage(args: {
  elements: StageElements;
  story: StoryConfig;
  env: StageEnv;
  sprite: SpriteInfo;
  movement: MovementStrategy;
}): Promise<StageImpl> {
  const { elements, story, env, sprite, movement } = args;
  const win = env.window;
  const doc = win.document;
  const config = appConfig.stage;
  const textures = await loadTextures(sprite);

  const app = new Application();
  await app.init({
    resizeTo: win,
    backgroundAlpha: 0,
    antialias: false,
    roundPixels: true,
    resolution: win.devicePixelRatio || 1,
    autoDensity: true,
    // 只用 GPU 繪製；兩者都不可用時丟出例外，由 stage.ts 改用 CSS 退路
    preference: ['webgl', 'webgpu'],
    skipExtensionImports: true,
  });
  const canvas = app.canvas;
  canvas.className = 'stage-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  doc.body.prepend(canvas);

  // ---------------------------------------------------------------- 背景
  const starLayers = config.layerSpeeds.map(() => new Container());
  const moteLayer = new Container();
  const ghostLayer = new Container();
  const endingLayer = new Container();
  app.stage.addChild(...starLayers, moteLayer, ghostLayer, endingLayer);

  let stars: Star[] = [];
  let motes: Mote[] = [];
  let params: BackgroundParams = backgroundParams(app.screen, env.reducedMotion());
  const viewport = { width: 0, height: 0 };

  function square(color: number, size: number): Sprite {
    const s = new Sprite(Texture.WHITE);
    s.tint = color;
    s.width = size;
    s.height = size;
    return s;
  }

  function buildBackground(): void {
    for (const layer of starLayers) layer.removeChildren().forEach((c) => c.destroy());
    moteLayer.removeChildren().forEach((c) => c.destroy());
    const { width, height } = app.screen;
    viewport.width = width;
    viewport.height = height;
    params = backgroundParams({ width, height }, env.reducedMotion());
    const random = seededRandom(20261013);
    const unit = env.isDesktop() ? 3 : 2;
    stars = Array.from({ length: params.stars }, () => {
      const layer = Math.floor(random() * starLayers.length);
      const size = layer === starLayers.length - 1 && random() < 0.3 ? unit * 2 : unit;
      const star: Star = {
        sprite: square(STAR_COLORS[Math.floor(random() * STAR_COLORS.length)]!, size),
        x: random() * width,
        y: random() * height,
        layer,
        twinkleMs: config.twinkleMs[0] + random() * (config.twinkleMs[1] - config.twinkleMs[0]),
        phase: random(),
      };
      starLayers[layer]!.addChild(star.sprite);
      return star;
    });
    motes = Array.from({ length: params.motes }, () => {
      const mote: Mote = {
        sprite: square(MOTE_COLOR, unit),
        x: random() * width,
        y: random() * height,
        speed: config.moteSpeed[0] + random() * (config.moteSpeed[1] - config.moteSpeed[0]),
        phase: random() * Math.PI * 2,
      };
      moteLayer.addChild(mote.sprite);
      return mote;
    });
    canvas.dataset.motion = env.reducedMotion() ? 'reduced' : 'full';
    canvas.dataset.stars = String(params.stars);
    canvas.dataset.motes = String(params.motes);
    canvas.dataset.speed = String(params.speed);
  }

  function updateBackground(elapsed: number): void {
    const { width, height } = viewport;
    const scrollY = win.scrollY;
    for (const star of stars) {
      const dx = (config.layerSpeeds[star.layer]! * params.speed * elapsed) / 1000;
      star.sprite.x = Math.round(wrap(star.x - dx, width));
      star.sprite.y = Math.round(
        wrap(star.y - scrollY * config.layerParallax[star.layer]!, height),
      );
      const phase = star.phase + (elapsed * params.speed) / star.twinkleMs;
      star.sprite.alpha = twinkleAlpha(phase, params.twinkle);
    }
    for (const mote of motes) {
      const rise = (mote.speed * params.speed * elapsed) / 1000;
      const y = wrap(mote.y - rise, height);
      mote.sprite.y = Math.round(y);
      mote.sprite.x = Math.round(
        wrap(mote.x + 6 * Math.sin(mote.phase + (elapsed * params.speed) / 1500), width),
      );
      // 越往上越淡
      mote.sprite.alpha = 0.25 + 0.5 * (y / Math.max(1, height));
    }
  }

  // ---------------------------------------------------------------- 主角
  const ghost = new Sprite(textures.move[0]);
  ghost.anchor.set(0.5);
  ghostLayer.addChild(ghost);
  const motion = new CharacterMotion(sprite, movement, config.breath);
  const endingFactory = pixiEndings[story.character.ending.type];

  let ending: {
    player: PixiEndingPlayer;
    start: number;
    duration: number;
    resolve: () => void;
  } | null = null;
  /** 演出結束後主角消失，直到 restore */
  let gone = false;
  let elapsed = 0;

  function finishEnding(): void {
    if (!ending) return;
    const { player, resolve } = ending;
    ending = null;
    player.destroy();
    resolve();
  }

  function updateGhost(dt: number): void {
    const reduced = env.reducedMotion();
    motion.step(dt, reduced);
    const text = measureText(elements.title);
    const trackRect = elements.track.getBoundingClientRect();
    if (!text || trackRect.height === 0 || gone) {
      ghost.visible = false;
      return;
    }
    const scale = env.isDesktop() ? sprite.scale.desktop : sprite.scale.mobile;
    const width = sprite.frameWidth * scale;
    const track = computeTrack(text, width);
    const pose = motion.pose(track, text, width, scale, reduced);
    ghost.visible = true;
    ghost.texture = textures[pose.action][pose.frame]!;
    ghost.scale.set(pose.facing * scale, scale);
    const centerY = Math.round(trackRect.top + trackRect.height / 2);
    ghost.position.set(pose.left + width / 2, centerY + pose.offsetY);
    ghost.alpha = pose.alpha;

    if (ending) {
      const progress = (elapsed - ending.start) / ending.duration;
      const done = ending.player.update(Math.min(1, progress), {
        ghost,
        scale,
        center: { x: pose.left + width / 2, y: centerY },
      });
      if (progress >= 1 || done) {
        gone = true;
        ghost.visible = false;
        finishEnding();
      }
    }
  }

  buildBackground();
  // 視窗尺寸由 resize 外掛（resizeTo）處理；面積改變後依新的面積重建背景
  const rebuild = () => {
    if (app.screen.width !== viewport.width || app.screen.height !== viewport.height) {
      buildBackground();
    }
  };
  app.ticker.add(rebuild);
  const stopMotion = env.onReducedMotionChange(() => buildBackground());

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS;
    elapsed += dt;
    updateBackground(elapsed);
    updateGhost(dt);
  });

  return {
    kind: 'webgl',
    playEnding(mode: EndingMode) {
      finishEnding();
      if (mode === 'instant') {
        gone = true;
        ghost.visible = false;
        return Promise.resolve();
      }
      const { durationMs, shortDurationMs } = story.character.ending;
      return new Promise<void>((resolve) => {
        ending = {
          player: endingFactory({
            layer: endingLayer,
            frameWidth: sprite.frameWidth,
            frameHeight: sprite.frameHeight,
          }),
          start: elapsed,
          duration: mode === 'short' ? shortDurationMs : durationMs,
          resolve,
        };
      });
    },
    restore() {
      finishEnding();
      gone = false;
      ghost.alpha = 1;
    },
    destroy() {
      finishEnding();
      app.ticker.remove(rebuild);
      stopMotion();
      app.destroy({ removeView: true }, { children: true });
    },
  };
}
