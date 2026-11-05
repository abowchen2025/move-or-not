/**
 * 一次性產圖腳本（D-16）：產出主角 sprite sheet、og:image、favicon，以及 AC-31 測試用的另一組 sprite。
 *
 * - 主角是「點陣資料 → PNG」：每一格以字元陣列描述，由本腳本編碼成 PNG；執行期只讀取產出的圖檔，
 *   不用程式碼繪製角色（SRS §3.3 規則 2）。
 * - og:image 需要標題文字（俐方體 11 號），用 Playwright 的 Chromium 排版後截圖。標題取自劇本設定檔，
 *   本腳本不寫死任何文案。
 * - 前端不得引用本目錄（ESLint no-restricted-imports）。
 *
 * 用法（repo 根目錄，需先在 web/ 執行 npm install 與 npx playwright install chromium）：
 *   node tools/gen-images.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { season1 } from '../web/src/stories/season-1.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'web');
const require = createRequire(join(WEB, 'package.json'));

// ---------------------------------------------------------------- PNG 編碼（RGBA、無交錯）

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** pixels：長度 width*height*4 的 RGBA */
function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- 點陣資料

/** SRS §9.2：主角 #ffffff，眼睛 #202040 */
const PALETTE = {
  '.': [0, 0, 0, 0],
  W: [0xff, 0xff, 0xff, 0xff],
  E: [0x20, 0x20, 0x40, 0xff],
};

/**
 * 主角：16×16 的原創「尾巴型幽靈」（圓頭、短手、身體往後收成一條尾巴）。
 * move 朝右（眼睛與嘴巴偏右、尾巴甩向後方），兩格交替擺動尾巴與手；idle 面向正面。
 */
const HEAD = (eyes) => [
  '................',
  '......WWWW......',
  '....WWWWWWWW....',
  '...WWWWWWWWWW...',
  '..WWWWWWWWWWWW..',
  eyes,
  eyes,
];
const GHOST_FRAMES = {
  'move-0': [
    ...HEAD('..WWWWWWWEWWEW..'),
    '.WWWWWWWWWWWWWW.',
    '..WWWWWWWWEEWW..',
    '..WWWWWWWWWWWW..',
    '..WWWWWWWWWWWW..',
    '...WWWWWWWWWW...',
    '...WWWWWWWWW....',
    '..WWWWWWWW......',
    '.WWWWWW.........',
    'WWW.............',
  ],
  'move-1': [
    ...HEAD('..WWWWWWWEWWEW..'),
    '..WWWWWWWWWWWW..',
    '.WWWWWWWWWEEWWW.',
    '..WWWWWWWWWWWW..',
    '..WWWWWWWWWWWW..',
    '...WWWWWWWWWW...',
    '...WWWWWWWWW....',
    '...WWWWWWW......',
    '..WWWWWW........',
    '.WWW............',
  ],
  'idle-0': [
    ...HEAD('..WWWWEWWEWWWW..'),
    '.WWWWWWWWWWWWWW.',
    '..WWWWWEEWWWWW..',
    '..WWWWWWWWWWWW..',
    '..WWWWWWWWWWWW..',
    '...WWWWWWWWWW...',
    '...WWWWWWWWWW...',
    '....WWWWWWWW....',
    '.....WWWWWW.....',
    '.....WW.........',
  ],
  'idle-1': [
    ...HEAD('..WWWWEWWEWWWW..'),
    '..WWWWWWWWWWWW..',
    '.WWWWWWEEWWWWWW.',
    '..WWWWWWWWWWWW..',
    '..WWWWWWWWWWWW..',
    '...WWWWWWWWWW...',
    '...WWWWWWWWWW...',
    '....WWWWWWWW....',
    '.....WWWWWW.....',
    '........WW......',
  ],
};

/**
 * AC-31 測試用的另一組 sprite：24×20、move 3 格，形狀與倍率都不同（只供 Playwright 替換用）。
 * 以橢圓產生輪廓，眼睛同樣偏右。
 */
function altFrame(phase, eyesForward) {
  const w = 24;
  const h = 20;
  const rows = [];
  for (let y = 0; y < h; y += 1) {
    let row = '';
    for (let x = 0; x < w; x += 1) {
      const squash = 1 + 0.08 * Math.sin((phase * 2 * Math.PI) / 3);
      const dx = (x + 0.5 - w / 2) / (11 * squash);
      const dy = (y + 0.5 - 12) / (8 / squash);
      const inside = dx * dx + dy * dy <= 1 && y >= 3;
      const eyeX = eyesForward ? [14, 15, 19, 20] : [8, 9, 14, 15];
      const eye = y >= 9 && y <= 11 && eyeX.includes(x);
      row += inside ? (eye ? 'E' : 'W') : '.';
    }
    rows.push(row);
  }
  return rows;
}

const ALT_FRAMES = {
  'move-0': altFrame(0, true),
  'move-1': altFrame(1, true),
  'move-2': altFrame(2, true),
  'idle-0': altFrame(0, false),
  'idle-1': altFrame(1, false),
};

function rasterize(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const pixels = Buffer.alloc(width * height * 4);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`第 ${y} 列寬度不符`);
    [...row].forEach((ch, x) => {
      const color = PALETTE[ch];
      if (!color) throw new Error(`未知的色票字元 ${ch}`);
      pixels.set(color, (y * width + x) * 4);
    });
  });
  return { width, height, pixels };
}

/** 把所有影格排成一列，輸出 PNG 與 PixiJS spritesheet JSON（自訂欄位放 meta，D-22-i） */
function buildSheet(frames, imageName, character) {
  const names = Object.keys(frames);
  const cells = names.map((name) => rasterize(frames[name]));
  const { width: cw, height: ch } = cells[0];
  const sheetW = cw * cells.length;
  const pixels = Buffer.alloc(sheetW * ch * 4);
  cells.forEach((cell, i) => {
    for (let y = 0; y < ch; y += 1) {
      cell.pixels.copy(pixels, (y * sheetW + i * cw) * 4, y * cw * 4, (y + 1) * cw * 4);
    }
  });
  const json = {
    frames: Object.fromEntries(
      names.map((name, i) => [
        name,
        {
          frame: { x: i * cw, y: 0, w: cw, h: ch },
          sourceSize: { w: cw, h: ch },
          spriteSourceSize: { x: 0, y: 0, w: cw, h: ch },
        },
      ]),
    ),
    animations: {
      move: names.filter((n) => n.startsWith('move-')),
      idle: names.filter((n) => n.startsWith('idle-')),
    },
    meta: {
      image: imageName,
      format: 'RGBA8888',
      size: { w: sheetW, h: ch },
      scale: '1',
      character,
    },
  };
  return { png: encodePng(sheetW, ch, pixels), json, cell: { cw, ch }, cells };
}

/** 整數倍放大（最近鄰） */
function upscale({ width, height, pixels }, factor, canvasSize = null) {
  const outW = canvasSize ?? width * factor;
  const outH = canvasSize ?? height * factor;
  const offX = Math.floor((outW - width * factor) / 2);
  const offY = Math.floor((outH - height * factor) / 2);
  const out = Buffer.alloc(outW * outH * 4);
  for (let y = 0; y < height * factor; y += 1) {
    for (let x = 0; x < width * factor; x += 1) {
      const src = (Math.floor(y / factor) * width + Math.floor(x / factor)) * 4;
      pixels.copy(out, ((y + offY) * outW + x + offX) * 4, src, src + 4);
    }
  }
  return { width: outW, height: outH, pixels: out };
}

function write(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log('寫入', path.slice(ROOT.length + 1).replaceAll('\\', '/'));
}

function writeJson(path, value) {
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

// ---------------------------------------------------------------- 產出

// 主角：16×16，手機 ×2、桌機 ×3（FR-02）；走完一趟約 5 秒；每格約 250ms
const ghost = buildSheet(GHOST_FRAMES, 'ghost.png', {
  scale: { mobile: 2, desktop: 3 },
  tripMs: 5000,
  frameMs: { move: 250, idle: 250 },
});
write(join(WEB, 'public/sprites/ghost.png'), ghost.png);
writeJson(join(WEB, 'public/sprites/ghost.json'), ghost.json);

// AC-31 測試用：放在 e2e/fixtures，不會進入正式網站
const alt = buildSheet(ALT_FRAMES, 'ghost.png', {
  scale: { mobile: 1, desktop: 2 },
  tripMs: 3000,
  frameMs: { move: 200, idle: 400 },
});
write(join(WEB, 'e2e/fixtures/sprite-alt/ghost.png'), alt.png);
writeJson(join(WEB, 'e2e/fixtures/sprite-alt/ghost.json'), alt.json);

// favicon：idle 第一格 ×2，32×32
const idle = ghost.cells[Object.keys(GHOST_FRAMES).indexOf('idle-0')];
const icon = upscale(idle, 2, 32);
write(join(WEB, 'public/favicon.png'), encodePng(icon.width, icon.height, icon.pixels));

// og:image：1200×630，標題（劇本）＋主角
await renderOgImage(join(WEB, 'public/og-image.png'), ghost.cells[0]);

async function renderOgImage(path, cell) {
  const { chromium } = require('@playwright/test');
  const big = upscale(cell, 10);
  const ghostUrl = `data:image/png;base64,${encodePng(big.width, big.height, big.pixels).toString('base64')}`;
  const font = readFileSync(join(WEB, 'public/fonts/Cubic_11.woff2')).toString('base64');

  // 星星位置用固定種子的亂數，重跑結果相同
  let seed = 20261013;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const starColors = ['#9ab0ff', '#f8d850', '#ffb0d0'];
  const stars = Array.from({ length: 90 }, () => ({
    x: Math.floor(random() * 300) * 4,
    y: Math.floor(random() * 157) * 4,
    size: random() < 0.2 ? 8 : 4,
    color: starColors[Math.floor(random() * starColors.length)],
  }));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>`,
    );
    await page.evaluate(
      ({ title, font, ghostUrl, stars }) => {
        const style = document.createElement('style');
        style.textContent = `
          @font-face { font-family: 'Cubic 11'; src: url(data:font/woff2;base64,${font}) format('woff2'); }
          html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
          body { background: linear-gradient(180deg, #0b0f2a, #2a1f5c); position: relative;
                 font-family: 'Cubic 11'; color: #f8f8f8; }
          .star { position: absolute; }
          .window { position: absolute; left: 96px; right: 96px; top: 96px; bottom: 96px;
                    background: linear-gradient(180deg, #3048b8, #101c68);
                    border: 12px solid #f8f8f8; border-radius: 24px;
                    box-shadow: 0 0 0 4px #000, inset 0 0 0 4px #000;
                    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 36px; }
          h1 { margin: 0; font-size: 96px; font-weight: normal; line-height: 1; }
          img { width: 160px; height: 160px; image-rendering: pixelated; }`;
        document.head.append(style);
        for (const s of stars) {
          const star = document.createElement('div');
          star.className = 'star';
          Object.assign(star.style, {
            left: `${s.x}px`,
            top: `${s.y}px`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            background: s.color,
          });
          document.body.append(star);
        }
        const box = document.createElement('div');
        box.className = 'window';
        const h1 = document.createElement('h1');
        h1.textContent = title;
        const img = document.createElement('img');
        img.src = ghostUrl;
        img.alt = '';
        box.append(h1, img);
        document.body.append(box);
      },
      { title: season1.title, font, ghostUrl, stars },
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => img.decode()));
    });
    mkdirSync(dirname(path), { recursive: true });
    await page.screenshot({ path, type: 'png' });
    console.log('寫入', path.slice(ROOT.length + 1).replaceAll('\\', '/'));
  } finally {
    await browser.close();
  }
}
