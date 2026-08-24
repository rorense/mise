/**
 * Regenerates the launcher icons from the master art in `assets/mise-app-icon.png`.
 *
 * The master art draws the logo as a small rounded tile floating on a cream field.
 * A launcher icon is already masked to a rounded shape by the OS, so shipping that
 * art as-is nests a tile inside a tile and wastes most of the grid slot. This script
 * throws away the cream field and the keyline, then redraws the mark full-bleed on
 * the tile's own orange:
 *
 *   assets/icon.png          1024x1024, the mark at the size it sits at in the master art
 *   assets/adaptive-icon.png 1024x1024, the same mark scaled to Android's 66.6% safe zone
 *
 * Both are written as opaque RGB — iOS rejects an app icon with an alpha channel.
 *
 * Run with `node scripts/gen-app-icons.mjs`. Uses only Node built-ins.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'assets');

const SIZE = 1024;
/** Android guarantees only the centre 72dp of the 108dp foreground survives masking. */
const ANDROID_SAFE_ZONE = 72 / 108;

// ---------------------------------------------------------------- PNG decode

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG: depth ${bitDepth}, colour type ${colorType}, interlace ${interlace}`);
  }
  const channels = colorType === 6 ? 4 : 3;

  const idat = [];
  for (let off = 8; off + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    if (type === 'IEND') break;
    off += len + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));

  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    line.copy(cur);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      if (filter === 1) cur[i] = (cur[i] + a) & 0xff;
      else if (filter === 2) cur[i] = (cur[i] + b) & 0xff;
      else if (filter === 3) cur[i] = (cur[i] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) cur[i] = (cur[i] + paeth(a, b, c)) & 0xff;
      else if (filter !== 0) throw new Error(`unknown row filter ${filter}`);
    }
    prev = cur;
  }
  return { width, height, channels, data: out };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// ---------------------------------------------------------------- PNG encode

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/** Encodes opaque 8-bit RGB, Paeth-filtered on every row. */
function encodePng(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const cur = rgb.subarray(y * stride, (y + 1) * stride);
    const dst = raw.subarray(y * (stride + 1), (y + 1) * (stride + 1));
    dst[0] = 4;
    for (let i = 0; i < stride; i++) {
      const a = i >= 3 ? cur[i - 3] : 0;
      const b = prev[i];
      const c = i >= 3 ? prev[i - 3] : 0;
      dst[i + 1] = (cur[i] - paeth(a, b, c)) & 0xff;
    }
    prev = cur;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- art layout

const src = decodePng(fs.readFileSync(path.join(assets, 'mise-app-icon.png')));
const pixel = (x, y) => {
  const i = (y * src.width + x) * src.channels;
  return [src.data[i], src.data[i + 1], src.data[i + 2]];
};
const luminance = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Bounding box of every pixel that differs from the cream field in the corner. */
function findTile() {
  const field = pixel(2, 2);
  let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const p = pixel(x, y);
      const diff = Math.abs(p[0] - field[0]) + Math.abs(p[1] - field[1]) + Math.abs(p[2] - field[2]);
      if (diff > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1 };
}

/**
 * Bounding box of the cream mark inside the tile. The search is inset far enough
 * to clear the tile's own cream keyline, which is otherwise just as light.
 */
function findMark(tile, inset) {
  const tw = tile.x1 - tile.x0 + 1;
  const th = tile.y1 - tile.y0 + 1;
  let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
  for (let y = tile.y0 + Math.round(inset * th); y <= tile.y1 - Math.round(inset * th); y++) {
    for (let x = tile.x0 + Math.round(inset * tw); x <= tile.x1 - Math.round(inset * tw); x++) {
      if (luminance(pixel(x, y)) > 175) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1 };
}

const tile = findTile();
const tileW = tile.x1 - tile.x0 + 1;
const tileH = tile.y1 - tile.y0 + 1;
const KEYLINE_INSET = 0.14;
const mark = findMark(tile, KEYLINE_INSET);

/** The tile's flat fill, taken as the median of probes clear of the mark and keyline. */
const fill = (() => {
  const probes = [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9], [0.5, 0.12], [0.12, 0.5], [0.88, 0.5], [0.5, 0.9]];
  const samples = probes.map(([fx, fy]) =>
    pixel(tile.x0 + Math.round(fx * tileW), tile.y0 + Math.round(fy * tileH))
  );
  return [0, 1, 2].map((c) => {
    const sorted = samples.map((s) => s[c]).sort((a, b) => a - b);
    return Math.round((sorted[3] + sorted[4]) / 2);
  });
})();

/**
 * Region of the tile we are willing to sample. Anything outside reads as the flat
 * fill, which keeps the keyline and the rounded corners out of the new icon while
 * leaving no seam — the pixels just inside that edge are that same flat fill.
 */
const interior = {
  x0: tile.x0 + Math.round(0.09 * tileW),
  y0: tile.y0 + Math.round(0.09 * tileH),
  x1: tile.x1 - Math.round(0.09 * tileW),
  y1: tile.y1 - Math.round(0.09 * tileH),
};

/**
 * Renders the mark centred on a solid `fill` canvas, scaled so it spans `markSpan`
 * pixels across. Resampling is a separable triangle filter whose radius widens when
 * downscaling, so the thin strokes do not alias.
 */
function render(size, markSpan) {
  const scale = markSpan / (mark.x1 - mark.x0 + 1);
  const markCx = (mark.x0 + mark.x1) / 2;
  const markCy = (mark.y0 + mark.y1) / 2;
  // Keep the master art's optical balance: the mark sits slightly below centre.
  const offsetY = (markCy - (tile.y0 + tile.y1) / 2) / tileH;
  const dstCx = size / 2;
  const dstCy = size / 2 + offsetY * size;

  const radius = Math.max(1, 1 / scale);
  const out = Buffer.alloc(size * size * 3);

  for (let y = 0; y < size; y++) {
    const sy = markCy + (y + 0.5 - dstCy) / scale;
    for (let x = 0; x < size; x++) {
      const sx = markCx + (x + 0.5 - dstCx) / scale;
      let r = 0, g = 0, b = 0, weight = 0;
      const xa = Math.floor(sx - radius), xb = Math.ceil(sx + radius);
      const ya = Math.floor(sy - radius), yb = Math.ceil(sy + radius);
      for (let py = ya; py <= yb; py++) {
        const wy = 1 - Math.abs(py + 0.5 - sy) / radius;
        if (wy <= 0) continue;
        for (let px = xa; px <= xb; px++) {
          const wx = 1 - Math.abs(px + 0.5 - sx) / radius;
          if (wx <= 0) continue;
          const w = wx * wy;
          const inside =
            px >= interior.x0 && px <= interior.x1 && py >= interior.y0 && py <= interior.y1;
          const p = inside ? pixel(px, py) : fill;
          r += p[0] * w;
          g += p[1] * w;
          b += p[2] * w;
          weight += w;
        }
      }
      const i = (y * size + x) * 3;
      out[i] = Math.round(r / weight);
      out[i + 1] = Math.round(g / weight);
      out[i + 2] = Math.round(b / weight);
    }
  }
  return out;
}

// The mark keeps the share of the frame the master art gives it. On Android that
// share is measured against the safe zone, since the rest may be masked away.
const markShare = (mark.x1 - mark.x0 + 1) / tileW;

const targets = [
  { file: 'icon.png', span: Math.round(markShare * SIZE) },
  { file: 'adaptive-icon.png', span: Math.round(markShare * SIZE * ANDROID_SAFE_ZONE) },
];

const hex = '#' + fill.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
console.log(`tile ${tileW}x${tileH} at ${tile.x0},${tile.y0}`);
console.log(`mark ${mark.x1 - mark.x0 + 1}x${mark.y1 - mark.y0 + 1} (${(markShare * 100).toFixed(1)}% of tile)`);
console.log(`fill ${hex} — keep app.json android.adaptiveIcon.backgroundColor in step with this`);

for (const { file, span } of targets) {
  fs.writeFileSync(path.join(assets, file), encodePng(SIZE, SIZE, render(SIZE, span)));
  console.log(`wrote ${file} — ${SIZE}x${SIZE}, mark ${span}px`);
}
