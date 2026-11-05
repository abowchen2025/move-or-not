/**
 * 主角 sprite 描述檔（SRS §3.3 規則 2、FR-02、D-22-i）。
 * 檔案是 PixiJS 原生 spritesheet JSON；本專案的自訂欄位放在 meta.character：
 *   { scale: { mobile, desktop }, tripMs, frameMs: { move, idle } }
 * 換一張尺寸不同的圖時，只改圖檔與這份描述檔（AC-31）；程式只從這裡取尺寸、倍率與速度。
 */

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 動作名稱：移動中與靜止（減少動態效果時） */
export type ActionName = 'move' | 'idle';

export interface SpriteInfo {
  /** spritesheet JSON 的網址（PixiJS 解析時需要原始資料） */
  url: string;
  /** 圖檔的網址（相對 JSON 解析） */
  imageUrl: string;
  /** 圖檔尺寸（CSS 退路用 background-size） */
  imageSize: { w: number; h: number };
  /** 單格尺寸（邏輯像素） */
  frameWidth: number;
  frameHeight: number;
  /** 預設放大倍率（整數） */
  scale: { mobile: number; desktop: number };
  /** 走完一趟（左緣到右緣）的時間 */
  tripMs: number;
  /** 各動作每一格的時間 */
  frameMs: Record<ActionName, number>;
  /** 各動作的影格（依順序） */
  frames: Record<ActionName, FrameRect[]>;
  /** 原始 JSON，交給 PixiJS 的 Spritesheet */
  data: SpritesheetJson;
}

export interface SpritesheetJson {
  frames: Record<string, { frame: FrameRect }>;
  animations: Record<string, string[]>;
  meta: {
    image: string;
    size: { w: number; h: number };
    character: {
      scale: { mobile: number; desktop: number };
      tripMs: number;
      frameMs: Record<ActionName, number>;
    };
  };
}

export class SpriteSheetError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function positiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new SpriteSheetError(`${field} 必須是正數`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  const n = positiveNumber(value, field);
  if (!Number.isInteger(n)) throw new SpriteSheetError(`${field} 必須是正整數`);
  return n;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new SpriteSheetError(`${field} 必須是 0 以上的整數`);
  }
  return value;
}

function rect(value: unknown, field: string): FrameRect {
  if (!isRecord(value)) throw new SpriteSheetError(`${field} 格式錯誤`);
  return {
    x: nonNegativeInteger(value.x, `${field}.x`),
    y: nonNegativeInteger(value.y, `${field}.y`),
    w: positiveInteger(value.w, `${field}.w`),
    h: positiveInteger(value.h, `${field}.h`),
  };
}

/** 驗證並整理描述檔。url 為 JSON 的網址，用來解析圖檔的相對路徑。 */
export function parseSpriteSheet(json: unknown, url: string): SpriteInfo {
  if (!isRecord(json) || !isRecord(json.frames) || !isRecord(json.animations)) {
    throw new SpriteSheetError('缺少 frames 或 animations');
  }
  const meta = json.meta;
  if (!isRecord(meta) || typeof meta.image !== 'string' || !isRecord(meta.size)) {
    throw new SpriteSheetError('缺少 meta.image 或 meta.size');
  }
  const character = meta.character;
  if (!isRecord(character) || !isRecord(character.scale) || !isRecord(character.frameMs)) {
    throw new SpriteSheetError('缺少 meta.character');
  }
  const frames = json.frames;
  const animations = json.animations;

  const framesOf = (action: ActionName): FrameRect[] => {
    const names = animations[action];
    if (!Array.isArray(names) || names.length === 0) {
      throw new SpriteSheetError(`缺少動作 ${action}`);
    }
    return names.map((name) => {
      const entry = typeof name === 'string' ? frames[name] : undefined;
      if (!isRecord(entry)) throw new SpriteSheetError(`找不到影格 ${String(name)}`);
      return rect(entry.frame, `frames.${name}.frame`);
    });
  };

  const all = { move: framesOf('move'), idle: framesOf('idle') };
  const [first] = all.move;
  for (const r of [...all.move, ...all.idle]) {
    if (r.w !== first!.w || r.h !== first!.h) {
      throw new SpriteSheetError('所有影格的尺寸必須相同（單格尺寸）');
    }
  }

  return {
    url,
    // 圖檔與 JSON 放在同一個目錄（PixiJS 的 meta.image 也是相對 JSON 解析）
    imageUrl: url.slice(0, url.lastIndexOf('/') + 1) + meta.image,
    imageSize: {
      w: positiveInteger(meta.size.w, 'meta.size.w'),
      h: positiveInteger(meta.size.h, 'meta.size.h'),
    },
    frameWidth: first!.w,
    frameHeight: first!.h,
    scale: {
      mobile: positiveInteger(character.scale.mobile, 'meta.character.scale.mobile'),
      desktop: positiveInteger(character.scale.desktop, 'meta.character.scale.desktop'),
    },
    tripMs: positiveNumber(character.tripMs, 'meta.character.tripMs'),
    frameMs: {
      move: positiveNumber(character.frameMs.move, 'meta.character.frameMs.move'),
      idle: positiveNumber(character.frameMs.idle, 'meta.character.frameMs.idle'),
    },
    frames: all,
    data: json as unknown as SpritesheetJson,
  };
}

/** 讀取描述檔（JSON 與圖檔的網址都相對網站根目錄，D-04 的 base） */
export async function loadSpriteSheet(url: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(url);
  if (!response.ok) throw new SpriteSheetError(`讀取 ${url} 失敗（${response.status}）`);
  return parseSpriteSheet(await response.json(), url);
}
