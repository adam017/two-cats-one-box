// Kitten, Looking Up — an entry for make.fun's cutest-picture-01.
//
// A flat, warm illustration: a cream kitten's face fills the frame against a soft
// mint wall, two huge glossy eyes with big catchlights, pink inner ears and nose,
// a blush on each cheek, whiskers. Clean shapes with analytic antialiasing, so it
// still reads when it is only a thumbnail.
//
// Node 22, standard library only. Deterministic: no clock, no randomness.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SIZE = 1024;

const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

type RGB = [number, number, number];
const cover = (f: number, w: number) => sstep(w, -w, f);
const over = (dst: RGB, src: RGB, a: number): RGB => [
  mix(dst[0], src[0], a),
  mix(dst[1], src[1], a),
  mix(dst[2], src[2], a),
];

// ------------------------------------------------------------------ palette
const WALL_TOP: RGB = [0.62, 0.84, 0.78];
const WALL_BOT: RGB = [0.80, 0.92, 0.84];
const GLOW: RGB = [1.0, 0.97, 0.88];
const FUR: RGB = [1.0, 0.975, 0.935];
const FUR_SH: RGB = [0.965, 0.895, 0.845];
const FUR_EDGE: RGB = [0.80, 0.68, 0.62];
const PINK: RGB = [0.99, 0.735, 0.745];
const PINK_D: RGB = [0.90, 0.545, 0.595];
const EYE: RGB = [0.185, 0.135, 0.165];
const EYE_RIM: RGB = [0.055, 0.045, 0.060];
const EYE_WARM: RGB = [0.50, 0.31, 0.22];
const WHITE: RGB = [1.0, 1.0, 1.0];
const INK: RGB = [0.30, 0.19, 0.20];

// ------------------------------------------------------------------ geometry
const CX = 0.0, CY = 0.155;         // the head's centre
const RX = 0.735, RY = 0.615;       // its radii
const EYE_DX = 0.315, EYE_DY = -0.055;
const EYE_RX = 0.183, EYE_RY = 0.212;
const EAR_DX = 0.390, EAR_DY = -0.560;

/** A kitten's ear: a tall triangle standing on the skull, its apex rounded. */
function earField(u: number, v: number, side: number, inner = false) {
  const eu = u - side * 0.395;               // across the ear
  const apex = inner ? -0.760 : -0.840;      // the tip
  const base = -0.300;                       // where it meets the skull
  const t = clamp((v - apex) / (base - apex));
  const halfW = (inner ? 0.150 : 0.250) * Math.pow(t, 0.78);
  const lean = side * 0.030 * (1 - t);       // the ear leans outward a little
  return Math.max(v - base, apex - v, Math.abs(eu - lean) - halfW);
}

/** The head: a wide superellipse, a little fuller at the cheeks. */
function headField(u: number, v: number) {
  const dx = (u - CX) / RX;
  const dy = (v - CY) / RY;
  const n = 2.75;
  const d = Math.pow(Math.pow(Math.abs(dx), n) + Math.pow(Math.abs(dy), n), 1 / n);
  const cheek = sstep(-0.30, 0.80, dy) * 0.075 * Math.exp(-Math.pow(dx / 0.85, 2));
  return d - 1 - cheek;
}

function shade(u: number, v: number): RGB {
  // ---- the wall: a mint gradient, warm light pooling behind the head
  let c: RGB = [
    mix(WALL_TOP[0], WALL_BOT[0], clamp((v + 1) / 2)),
    mix(WALL_TOP[1], WALL_BOT[1], clamp((v + 1) / 2)),
    mix(WALL_TOP[2], WALL_BOT[2], clamp((v + 1) / 2)),
  ];
  const gd = Math.hypot(u - 0.05, v + 0.35);
  c = over(c, GLOW, Math.exp(-Math.pow(gd / 0.62, 2.2)) * 0.40);

  // ---- the ears, behind the head
  for (const side of [-1, 1]) {
    const f = earField(u, v, side);
    const a = cover(f, 0.006);
    if (a <= 0) continue;
    let ec: RGB = FUR;
    // a soft edge along the outer slope
    const outer = sstep(0.02, 0.14, Math.abs(u - side * 0.400) * 2.4);
    ec = over(ec, FUR_EDGE, outer * 0.38);
    c = over(c, ec, a);
    // the inner ear: a smaller pink triangle, inset from the edge
    const fi = earField(u, v, side, true);
    const ia = cover(fi, 0.008) * a;
    if (ia > 0) {
      let ic: RGB = PINK;
      ic = over(ic, PINK_D, cover(fi + 0.070, 0.014) * 0.60);
      c = over(c, ic, ia);
    }
  }

  // ---- the head
  const hf = headField(u, v);
  const ha = cover(hf, 0.005);
  if (ha > 0) {
    let fc: RGB = FUR;
    // a soft shadow down the left cheek and under the chin
    const shadow = clamp(
      sstep(0.10, -0.60, (u - CX) / RX) * 0.60 + sstep(0.40, 1.05, (v - CY) / RY) * 0.50,
    );
    fc = over(fc, FUR_SH, shadow * 0.55);
    // a thin edge, so the face separates from the wall
    fc = over(fc, FUR_EDGE, cover(hf + 0.024, 0.010) * 0.26);
    c = over(c, fc, ha);
  }

  // ---- the eyes: tall ovals, dark and glossy
  for (const side of [-1, 1]) {
    const ex = CX + side * EYE_DX, ey = CY + EYE_DY;
    const dx = (u - ex) / EYE_RX, dy = (v - ey) / EYE_RY;
    const d = Math.hypot(dx, dy);
    const ea = cover(d - 1, 0.007);
    if (ea <= 0) continue;
    // the eyeball: near-black, a warm brown ring toward the edge
    let ec: RGB = EYE;
    ec = over(ec, EYE_WARM, sstep(0.38, 1.0, d) * 0.78);
    ec = over(ec, EYE_RIM, cover(d - 0.965, 0.022) * 0.70);
    c = over(c, ec, ea);
    // one big catchlight high on the inner side, one small one low and outer
    const s1 = Math.hypot((dx + side * 0.26) / 0.36, (dy + 0.36) / 0.33);
    c = over(c, WHITE, cover(s1 - 1, 0.012) * ea);
    const s2 = Math.hypot((dx - side * 0.33) / 0.155, (dy - 0.38) / 0.135);
    c = over(c, WHITE, cover(s2 - 1, 0.012) * ea * 0.80);
  }

  // ---- the nose: a small rounded triangle, pink
  {
    const nx = CX, ny = CY + 0.288;
    const w = 0.082, h = 0.060;
    const t = clamp((v - (ny - h)) / (2 * h));
    const halfW = w * (1 - Math.pow(t, 1.4) * 0.60);
    const f = Math.max(Math.abs(u - nx) - halfW, Math.abs(v - ny) - h);
    const na = cover(f, 0.006);
    if (na > 0) {
      let nc: RGB = PINK;
      nc = over(nc, PINK_D, sstep(ny + h, ny - h * 0.1, v) * 0.42);
      c = over(c, nc, na);
    }
  }

  // ---- the mouth: the little "w" under the nose
  {
    const my = CY + 0.362;
    for (const side of [-1, 1]) {
      const ccx = CX + side * 0.058, ccy = my - 0.012;
      const d = Math.hypot(u - ccx, v - ccy);
      const arc = cover(Math.abs(d - 0.058) - 0.0090, 0.004)
        * sstep(ccy + 0.006, ccy - 0.026, v) * sstep(ccy - 0.062, ccy - 0.040, v);
      c = over(c, INK, arc * 0.80);
    }
    const pa = cover(Math.abs(u - CX) - 0.0070, 0.004)
      * sstep(my + 0.016, my + 0.002, v) * sstep(my - 0.040, my - 0.018, v);
    c = over(c, INK, pa * 0.70);
  }

  // ---- blush: two soft warm ovals on the cheeks
  for (const side of [-1, 1]) {
    const bx = CX + side * 0.420, by = CY + 0.160;
    const d = Math.hypot((u - bx) / 0.175, (v - by) / 0.115);
    c = over(c, PINK, Math.exp(-Math.pow(d / 0.95, 2.4)) * 0.40);
  }

  // ---- whiskers: three a side, thin and dark, curving out of the muzzle
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const y0 = CY + 0.292 + k * 0.055;
      const t = (u - (CX + side * 0.125)) * side;
      if (t > 0 && t < 0.52) {
        const lift = 0.05 + k * 0.090;
        const want = y0 + t * lift - t * t * 0.95;
        const dd = Math.abs(v - want);
        const a = cover(dd - 0.0044, 0.0024) * sstep(0.52, 0.30, t) * sstep(0.0, 0.045, t) * 0.55;
        c = over(c, INK, a);
      }
    }
  }

  return c;
}

// ------------------------------------------------------- rasterise, then encode
const px = new Uint8Array(SIZE * SIZE * 3);
const tone = (x: number) => Math.round(255 * clamp(x));
for (let y = 0; y < SIZE; y++) {
  const v = ((y + 0.5) / SIZE) * 2 - 1;
  for (let x = 0; x < SIZE; x++) {
    const u = ((x + 0.5) / SIZE) * 2 - 1;
    const c = shade(u, v);
    const i = (y * SIZE + x) * 3;
    px[i] = tone(c[0]);
    px[i + 1] = tone(c[1]);
    px[i + 2] = tone(c[2]);
  }
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function encodePNG(width: number, height: number, rgb: Uint8Array) {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = width * 3 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * stride + 1);
  }
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { png.set(p, at); at += p.length; }
  return png;
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), encodePNG(SIZE, SIZE, px));
console.log(`wrote ${join(outDir, 'entry.png')} (${SIZE}x${SIZE})`);
