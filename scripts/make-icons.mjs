// Generates the PNG app icons without extra dependencies: a plain accent square with a white dumbbell.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const ACCENT = [21, 99, 60];

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function isWhite(x, y, s) {
  // Coordinates relative to a 100-unit grid
  const u = (x / s) * 100;
  const v = (y / s) * 100;
  const bar = u >= 26 && u <= 74 && v >= 47 && v <= 53;
  const innerPlates = ((u >= 24 && u <= 32) || (u >= 68 && u <= 76)) && v >= 32 && v <= 68;
  const outerPlates = ((u >= 17 && u <= 23) || (u >= 77 && u <= 83)) && v >= 39 && v <= 61;
  return bar || innerPlates || outerPlates;
}

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const px = isWhite(x, y, size) ? [255, 255, 255] : ACCENT;
      raw.set(px, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/icon-192.png', png(192));
writeFileSync('public/icon-512.png', png(512));
// iOS picks the icon when the page is added to the home screen – offer every common size
writeFileSync('public/apple-touch-icon.png', png(180));
writeFileSync('public/apple-touch-icon-167.png', png(167));
writeFileSync('public/apple-touch-icon-152.png', png(152));
writeFileSync('public/apple-touch-icon-120.png', png(120));
console.log('Icons written to public/');
