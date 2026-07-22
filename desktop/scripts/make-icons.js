'use strict';

/**
 * Generates the app and tray icons as PNGs so the repo carries no binary blobs.
 * Run with `node scripts/make-icons.js` after changing the palette below.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ACCENT = [99, 179, 237]; // clock face
const BG = [23, 27, 35]; // rounded square
const HAND = [255, 255, 255];

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

/** Anti-aliased clock glyph drawn by sampling distance fields. */
function drawIcon(size, { transparentBackground = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const radius = size * 0.38;
  const corner = size * 0.22;

  const put = (i, [r, g, b], a) => {
    const inv = 1 - a;
    px[i] = Math.round(px[i] * inv + r * a);
    px[i + 1] = Math.round(px[i + 1] * inv + g * a);
    px[i + 2] = Math.round(px[i + 2] * inv + b * a);
    px[i + 3] = Math.round(px[i + 3] * inv + 255 * a);
  };

  const coverage = (d) => Math.min(1, Math.max(0, 0.5 - d));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;

      if (!transparentBackground) {
        // Rounded square background.
        const qx = Math.abs(dx) - (size / 2 - corner);
        const qy = Math.abs(dy) - (size / 2 - corner);
        const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - corner;
        put(i, BG, coverage(outside));
      }

      const dist = Math.hypot(dx, dy);
      put(i, ACCENT, coverage(dist - radius));
      put(i, BG, coverage(dist - radius * 0.78));

      // Hands: 12 o'clock and 4 o'clock.
      const thickness = Math.max(1, size * 0.045);
      const hand = (angle, length) => {
        const ux = Math.sin(angle);
        const uy = -Math.cos(angle);
        const t = Math.min(Math.max(dx * ux + dy * uy, 0), radius * length);
        return Math.hypot(dx - ux * t, dy - uy * t) - thickness / 2;
      };
      put(i, HAND, coverage(hand(0, 0.62)));
      put(i, HAND, coverage(hand(Math.PI * 0.62, 0.5)));
    }
  }
  return px;
}

const outputs = [
  ['build/icon.png', 512, {}],
  ['electron/assets/tray.png', 32, { transparentBackground: true }],
  ['electron/assets/tray@2x.png', 64, { transparentBackground: true }],
];

for (const [rel, size, opts] of outputs) {
  const file = path.join(__dirname, '..', rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(size, size, drawIcon(size, opts)));
  console.log('wrote', rel, `${size}x${size}`);
}
