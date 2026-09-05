#!/usr/bin/env node
/**
 * توليد أيقونات التطبيق (PWA + Electron) من غير أي اعتماديات خارجية.
 *
 * بيرسم أيقونة "طاقيّة تخرّج" على خلفية متدرّجة بلون البراند، بي-renderها
 * بـ supersampling عشان الحواف تطلع ناعمة، وبيشفّرها PNG/ICO/ICNS يدوياً.
 *
 * الاستخدام: node scripts/make-icons.mjs
 * المخرجات:
 *   public/icon-192.png · public/icon-512.png   (PWA manifest)
 *   build/icon.png (1024) · build/icon.ico · build/icon.icns  (Electron)
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- أدوات رسم ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixRgb(c1, c2, t) {
  return [Math.round(lerp(c1[0], c2[0], t)), Math.round(lerp(c1[1], c2[1], t)), Math.round(lerp(c1[2], c2[2], t))];
}

const BG_TOP = hexToRgb('#818cf8');
const BG_MID = hexToRgb('#6366f1');
const BG_BOT = hexToRgb('#4338ca');
const CAP_TOP = hexToRgb('#ffffff');
const CAP_BOT = hexToRgb('#e0e7ff');
const BOWL = hexToRgb('#c7d2fe');
const BUTTON = hexToRgb('#4338ca');
const TASSEL = hexToRgb('#fbbf24');
const TASSEL2 = hexToRgb('#f59e0b');

function bgGradient(x, y, S) {
  const t = clamp((x + y) / (2 * S), 0, 1);
  if (t < 0.55) return mixRgb(BG_TOP, BG_MID, t / 0.55);
  return mixRgb(BG_MID, BG_BOT, (t - 0.55) / 0.45);
}
function capGradient(y, S) {
  const t = clamp((y / S - 0.30) / 0.30, 0, 1);
  return mixRgb(CAP_TOP, CAP_BOT, t);
}

// أشكال هندسية (إحداثيات مطبّعة 0..1)
function inRoundedRect(x, y, S) {
  const r = 0.22 * S;
  const px = x, py = y;
  if (px < 0 || py < 0 || px > S || py > S) return false;
  const cx = clamp(px, r, S - r);
  const cy = clamp(py, r, S - r);
  const dx = px - cx, dy = py - cy;
  // خارج الرباعية الداخلة → قرّب من الركن
  if (px >= r && px <= S - r) return true;
  if (py >= r && py <= S - r) return true;
  return dx * dx + dy * dy <= r * r;
}

function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx, dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}
function inCircle(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * بيرجع لون العيّنة [r,g,b,a] عند نقطة (x,y) بمقاس S.
 * الترتيب: خلفية → وعاء القبّعة → المعيّ → الزرّ → الشرّابة.
 */
function samplePixel(x, y, S) {
  // الشرّابة (فوق الكل)
  const tx = 0.82 * S;
  if (distToSegment(x, y, tx, 0.47 * S, tx, 0.66 * S) <= 0.014 * S) return [...TASSEL, 255];
  if (inCircle(x, y, tx, 0.685 * S, 0.030 * S)) return [...TASSEL, 255];
  if (distToSegment(x, y, tx, 0.70 * S, tx, 0.755 * S) <= 0.012 * S) return [...TASSEL2, 255];

  if (!inRoundedRect(x, y, S)) return [0, 0, 0, 0];

  // الزرّ
  if (inCircle(x, y, 0.5 * S, 0.45 * S, 0.024 * S)) return [...BUTTON, 255];

  // المعيّ (لوحة القبّعة)
  const diamond = [
    [0.5 * S, 0.30 * S],
    [0.86 * S, 0.45 * S],
    [0.5 * S, 0.60 * S],
    [0.14 * S, 0.45 * S],
  ];
  if (inPolygon(x, y, diamond)) return [...capGradient(y, S), 255];

  // وعاء القبّعة (نصف بيضة تحت المعيّ)
  if (y >= 0.50 * S && inEllipse(x, y, 0.5 * S, 0.50 * S, 0.235 * S, 0.185 * S)) return [...BOWL, 255];

  // الخلفية
  return [...bgGradient(x, y, S), 255];
}

/** رسم RGBA بحجم S مع supersampling */
function renderRGBA(S, SS = 3) {
  const buf = Buffer.alloc(S * S * 4);
  const step = 1 / SS;
  const off = step / 2;
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [sr, sg, sb, sa] = samplePixel(px + off + sx * step, py + off + sy * step, S);
          r += sr; g += sg; b += sb; a += sa;
        }
      }
      const n = SS * SS;
      const i = (py * S + px) * 4;
      buf[i] = Math.round(r / n);
      buf[i + 1] = Math.round(g / n);
      buf[i + 2] = Math.round(b / n);
      buf[i + 3] = Math.round(a / n);
    }
  }
  return buf;
}

// ---------- ترميز PNG ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(S, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // scanlines مع filter byte 0
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0;
    rgba.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- ترميز ICO (بداخله PNG) ----------
function encodeICO(pngs) {
  // pngs: [{size, buf}]
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = [];
  const blobs = [];
  let offset = 6 + count * 16;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;   // 0 = 256
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4);           // planes
    e.writeUInt16LE(32, 6);          // bit count
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    blobs.push(buf);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...blobs]);
}

// ---------- ترميز ICNS (بداخله PNG) ----------
function encodeICNS(entries) {
  // entries: [{type:'ic07', buf}]
  const parts = [];
  let total = 8;
  for (const { type, buf } of entries) {
    const h = Buffer.alloc(8);
    h.write(type, 0, 'ascii');
    h.writeUInt32BE(buf.length + 8, 4);
    parts.push(h, buf);
    total += buf.length + 8;
  }
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(total, 4);
  return Buffer.concat([head, ...parts]);
}

// ---------- التوليد ----------
function pngAt(size) {
  return encodePNG(size, renderRGBA(size, size >= 512 ? 2 : 3));
}

mkdirSync(join(ROOT, 'public'), { recursive: true });
mkdirSync(join(ROOT, 'build'), { recursive: true });

const p192 = pngAt(192);
const p512 = pngAt(512);
const p1024 = pngAt(1024);

writeFileSync(join(ROOT, 'public/icon-192.png'), p192);
writeFileSync(join(ROOT, 'public/icon-512.png'), p512);
writeFileSync(join(ROOT, 'build/icon.png'), p1024);

// ICO: كل المقاسات الشائعة
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoPngs = icoSizes.map(s => ({ size: s, buf: pngAt(s) }));
writeFileSync(join(ROOT, 'build/icon.ico'), encodeICO(icoPngs));

// ICNS: أنواع PNG المدعومة
const icnsMap = [
  ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024],
  ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512],
];
const icnsEntries = icnsMap.map(([type, size]) => ({ type, buf: pngAt(size) }));
writeFileSync(join(ROOT, 'build/icon.icns'), encodeICNS(icnsEntries));

console.log('✓ icons generated:');
console.log('  public/icon-192.png', p192.length, 'bytes');
console.log('  public/icon-512.png', p512.length, 'bytes');
console.log('  build/icon.png     ', p1024.length, 'bytes');
console.log('  build/icon.ico     ', icoPngs.length, 'sizes');
console.log('  build/icon.icns    ', icnsEntries.length, 'entries');
