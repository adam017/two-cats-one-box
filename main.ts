// Two Cats, One Box — an entry for make.fun's cutest-picture-01.
//
// One 1024x1024 image drawn from pure math, written as a PNG to /output/entry.png.
// The idea: a ginger cat asleep in a cardboard box with a smaller grey kitten curled up
// against it, both lit by one warm lamp. Everything is built from soft ellipses; the
// cuteness is in the proportions — big heads, tiny paws, closed happy eyes.
//
// Node 22, standard library only. Deterministic: no clock, one seeded PRNG.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

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

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A fur fibre field: two octaves of value noise, enough to break the flat fills without
// looking like static. Values in [-1,1].
const NOISE_N = 64;
const NOISE = (() => {
  const r = rng(4242);
  const a = new Float32Array(NOISE_N * NOISE_N);
  for (let i = 0; i < a.length; i++) a[i] = r() * 2 - 1;
  return a;
})();
function noise2(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const uu = xf * xf * (3 - 2 * xf);
  const vv = yf * yf * (3 - 2 * yf);
  const at = (i: number, j: number) => NOISE[(((j % NOISE_N) + NOISE_N) % NOISE_N) * NOISE_N + (((i % NOISE_N) + NOISE_N) % NOISE_N)];
  return mix(mix(at(xi, yi), at(xi + 1, yi), uu), mix(at(xi, yi + 1), at(xi + 1, yi + 1), uu), vv);
}
const fur = (u: number, v: number) => 0.6 * noise2(u * 40, v * 40) + 0.4 * noise2(u * 105 + 13, v * 105 + 7);

// ------------------------------------------------------------------- geometry
/** A soft ellipse: 1 inside, 0 outside, with a thin falloff in normalised units. */
function ell(u: number, v: number, cx: number, cy: number, rx: number, ry: number, soft = 0.004) {
  const dx = (u - cx) / rx;
  const dy = (v - cy) / ry;
  return sstep(1 + soft, 1 - soft, Math.sqrt(dx * dx + dy * dy));
}

/** The same, rotated about (cx,cy) by `deg`. */
function ellR(u: number, v: number, cx: number, cy: number, rx: number, ry: number, deg: number, soft = 0.004) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const dx = u - cx, dy = v - cy;
  const lx = (dx * c + dy * s) / rx;
  const ly = (-dx * s + dy * c) / ry;
  return sstep(1 + soft, 1 - soft, Math.sqrt(lx * lx + ly * ly));
}

/** A soft dot for highlights, noses and paw pads. */
const dot = (u: number, v: number, cx: number, cy: number, r: number, soft = 0.5) =>
  sstep(r, r * soft, Math.sqrt((u - cx) ** 2 + (v - cy) ** 2));

/** A rounded rectangle, for the box's faces. */
function rrect(u: number, v: number, x0: number, y0: number, x1: number, y1: number, r: number, soft = 0.003) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const hx = Math.abs(x1 - x0) / 2, hy = Math.abs(y1 - y0) / 2;
  const qx = Math.abs(u - cx) - (hx - r);
  const qy = Math.abs(v - cy) - (hy - r);
  const d = Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) + Math.min(Math.max(qx, qy), 0) - r;
  return sstep(soft, -soft, d);
}

// ------------------------------------------------------------------- palette
const CREAM: [number, number, number] = [1.00, 0.94, 0.83];
const GINGER: [number, number, number] = [0.95, 0.58, 0.29];
const GINGER_D: [number, number, number] = [0.72, 0.34, 0.13];
const GREY: [number, number, number] = [0.63, 0.64, 0.69];
const GREY_D: [number, number, number] = [0.38, 0.40, 0.46];
const PINK: [number, number, number] = [0.97, 0.63, 0.63];
const INK: [number, number, number] = [0.17, 0.11, 0.13];
const BOX: [number, number, number] = [0.76, 0.58, 0.38];
const BOX_D: [number, number, number] = [0.42, 0.30, 0.18];

// ------------------------------------------------------------- the composition
// All in screen coordinates, u,v in [-1,1]. The box's rim sits at RIM, so the front wall
// is the bottom quarter of the frame and the cats fill everything above it.
const BXL = -1.02, BXR = 1.02;  // the box, wider than the frame so its sides run off it
const MOUTH_T = 0.02;           // the top edge of the dark interior
const RIM = 0.46;               // the folded front lip

const G = { hx: -0.30, hy: -0.20, hrx: 0.265, hry: 0.235 };  // ginger head
const K = { hx: 0.37, hy: -0.09, hrx: 0.195, hry: 0.175 };   // kitten head

// ------------------------------------------------------------------- the scene
function shade(u: number, v: number): [number, number, number] {
  // 1. the room: warm dusk, one lamp off to the upper left
  const lampD = Math.sqrt((u + 0.78) ** 2 + (v + 0.80) ** 2);
  const lamp = Math.exp(-lampD * 1.30);
  let r = 0.16 + 0.42 * lamp;
  let g = 0.12 + 0.30 * lamp;
  let b = 0.14 + 0.19 * lamp;
  const vig = clamp(1 - 0.36 * (u * u + v * v));
  r *= vig; g *= vig; b *= vig;

  // 2. the box's dark interior, behind the cats
  const mouth = rrect(u, v, BXL + 0.03, MOUTH_T - 0.10, BXR - 0.03, RIM + 0.05, 0.02, 0.004);
  if (mouth > 0) {
    r = mix(r, 0.115, mouth); g = mix(g, 0.070, mouth); b = mix(b, 0.075, mouth);
  }

  // 3. the ginger cat
  // the body: a broad mass, mostly hidden by the front wall
  const gBody = ellR(u, v, G.hx, G.hy + 0.52, 0.44, 0.36, -4, 0.003);
  if (gBody > 0) {
    const f = fur(u, v);
    let cr = GINGER[0] + 0.05 * f, cg = GINGER[1] + 0.05 * f, cb = GINGER[2] + 0.04 * f;
    // tabby bands sweeping across the body
    const band = 0.5 + 0.5 * Math.sin((u * 7.0 + v * 3.6) * 2.5);
    const bm = sstep(0.60, 0.92, band) * 0.24;
    cr = mix(cr, GINGER_D[0], bm); cg = mix(cg, GINGER_D[1], bm); cb = mix(cb, GINGER_D[2], bm);
    // the lamp on its left shoulder
    const lit = 0.22 * clamp(1 - (u - G.hx + 0.36) * 1.1) + 0.10 * sstep(0.10, -0.10, v);
    cr = mix(cr, 1.0, lit); cg = mix(cg, 0.93, lit); cb = mix(cb, 0.82, lit);
    r = mix(r, cr, gBody); g = mix(g, cg, gBody); b = mix(b, cb, gBody);
  }
  // the head: big and round — the cuteness is in the proportion
  const gHead = ell(u, v, G.hx, G.hy, G.hrx, G.hry, 0.003);
  if (gHead > 0) {
    const f = fur(u, v);
    let cr = GINGER[0] + 0.04 * f, cg = GINGER[1] + 0.04 * f, cb = GINGER[2] + 0.04 * f;
    // a paler muzzle
    const muzzle = ell(u, v, G.hx, G.hy + 0.095, 0.140, 0.085, 0.03);
    cr = mix(cr, CREAM[0], muzzle * 0.72); cg = mix(cg, CREAM[1], muzzle * 0.72); cb = mix(cb, CREAM[2], muzzle * 0.72);
    // a cream blaze up the forehead
    const blaze = ell(u, v, G.hx, G.hy - 0.105, 0.050, 0.060, 0.05);
    cr = mix(cr, CREAM[0] * 0.99, blaze * 0.45); cg = mix(cg, CREAM[1] * 0.98, blaze * 0.45); cb = mix(cb, CREAM[2] * 0.96, blaze * 0.45);
    // the light from the upper left, wrapping the head
    const lit = 0.16 * clamp(1 - (u - G.hx + G.hrx) * 1.5) * clamp(1 - (v - G.hy + G.hry) * 1.4);
    cr = mix(cr, 1.0, lit); cg = mix(cg, 0.95, lit); cb = mix(cb, 0.86, lit);
    r = mix(r, cr, gHead); g = mix(g, cg, gHead); b = mix(b, cb, gHead);
  }
  // ears: rounded triangles with pink inners
  for (const s of [-1, 1]) {
    const ex = G.hx + s * 0.168;
    const ey = G.hy - 0.208;
    const earA = ellR(u, v, ex, ey, 0.088, 0.105, s * -20, 0.006);
    if (earA > 0) {
      r = mix(r, GINGER[0] * 0.92, earA); g = mix(g, GINGER[1] * 0.89, earA); b = mix(b, GINGER[2] * 0.89, earA);
      const inA = ellR(u, v, ex, ey + 0.018, 0.048, 0.058, s * -20, 0.03);
      r = mix(r, PINK[0], inA * earA); g = mix(g, PINK[1], inA * earA); b = mix(b, PINK[2], inA * earA);
    }
  }
  // the closed, happy eyes: two downward arcs
  for (const s of [-1, 1]) {
    const ex = G.hx + s * 0.100;
    const ey = G.hy - 0.030;
    const rr = 0.046;
    const d = Math.sqrt((u - ex) ** 2 + (v - (ey - 0.018)) ** 2);
    const arc = sstep(0.0100, 0.0034, Math.abs(d - rr)) * sstep(ey + 0.032, ey - 0.008, v);
    r = mix(r, INK[0], arc * 0.96); g = mix(g, INK[1], arc * 0.96); b = mix(b, INK[2], arc * 0.96);
  }
  // the nose
  const noseA = dot(u, v, G.hx, G.hy + 0.055, 0.019, 0.4);
  r = mix(r, PINK[0] * 0.93, noseA); g = mix(g, PINK[1] * 0.87, noseA); b = mix(b, PINK[2] * 0.87, noseA);
  // the mouth: a small "w" under the nose
  for (const s of [-1, 1]) {
    const d = Math.sqrt((u - (G.hx + s * 0.022)) ** 2 + (v - (G.hy + 0.110)) ** 2);
    const arc = sstep(0.0060, 0.0020, Math.abs(d - 0.027)) * sstep(G.hy + 0.118, G.hy + 0.090, v);
    r = mix(r, INK[0], arc * 0.55); g = mix(g, INK[1], arc * 0.55); b = mix(b, INK[2], arc * 0.55);
  }
  // whiskers: three a side, thin and bright
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const y0 = G.hy + 0.058 + k * 0.024;
      const t = (u - (G.hx + s * 0.080)) * s;
      if (t > 0 && t < 0.26) {
        const want = y0 - t * t * 1.3 + t * (0.11 + k * 0.07);
        const d = Math.abs(v - want);
        const a = sstep(0.0034, 0.0010, d) * sstep(0.26, 0.21, t) * sstep(0.0, 0.028, t);
        r = mix(r, 1.0, a * 0.52); g = mix(g, 0.98, a * 0.52); b = mix(b, 0.93, a * 0.52);
      }
    }
  }

  // 4. the grey kitten, curled against the ginger cat's right side
  const kBody = ellR(u, v, K.hx + 0.02, K.hy + 0.44, 0.30, 0.26, 12, 0.003);
  if (kBody > 0) {
    const f = fur(u, v);
    let cr = GREY[0] + 0.05 * f, cg = GREY[1] + 0.05 * f, cb = GREY[2] + 0.05 * f;
    const lit = 0.20 * sstep(K.hy + 0.70, K.hy + 0.10, v);
    cr = mix(cr, 1.0, lit); cg = mix(cg, 0.99, lit); cb = mix(cb, 0.97, lit);
    r = mix(r, cr, kBody); g = mix(g, cg, kBody); b = mix(b, cb, kBody);
  }
  const kHead = ell(u, v, K.hx, K.hy, K.hrx, K.hry, 0.003);
  if (kHead > 0) {
    const f = fur(u, v);
    let cr = GREY[0] + 0.04 * f, cg = GREY[1] + 0.04 * f, cb = GREY[2] + 0.04 * f;
    const muzzle = ell(u, v, K.hx, K.hy + 0.070, 0.102, 0.062, 0.03);
    cr = mix(cr, CREAM[0], muzzle * 0.66); cg = mix(cg, CREAM[1], muzzle * 0.66); cb = mix(cb, CREAM[2], muzzle * 0.66);
    const lit = 0.18 * clamp(1 - (u - K.hx + K.hrx) * 1.6);
    cr = mix(cr, 1.0, lit); cg = mix(cg, 0.99, lit); cb = mix(cb, 0.98, lit);
    r = mix(r, cr, kHead); g = mix(g, cg, kHead); b = mix(b, cb, kHead);
  }
  for (const s of [-1, 1]) {
    const ex = K.hx + s * 0.124;
    const ey = K.hy - 0.200;
    const earA = ellR(u, v, ex, ey, 0.066, 0.078, s * -22, 0.006);
    if (earA > 0) {
      r = mix(r, GREY[0] * 0.88, earA); g = mix(g, GREY[1] * 0.88, earA); b = mix(b, GREY[2] * 0.88, earA);
      const inA = ellR(u, v, ex, ey + 0.014, 0.036, 0.043, s * -22, 0.03);
      r = mix(r, PINK[0], inA * earA); g = mix(g, PINK[1], inA * earA); b = mix(b, PINK[2], inA * earA);
    }
  }
  for (const s of [-1, 1]) {
    const ex = K.hx + s * 0.073;
    const ey = K.hy - 0.020;
    const rr = 0.033;
    const d = Math.sqrt((u - ex) ** 2 + (v - (ey - 0.013)) ** 2);
    const arc = sstep(0.0078, 0.0026, Math.abs(d - rr)) * sstep(ey + 0.023, ey - 0.005, v);
    r = mix(r, INK[0], arc * 0.96); g = mix(g, INK[1], arc * 0.96); b = mix(b, INK[2], arc * 0.96);
  }
  const knose = dot(u, v, K.hx, K.hy + 0.042, 0.014, 0.4);
  r = mix(r, PINK[0] * 0.93, knose); g = mix(g, PINK[1] * 0.87, knose); b = mix(b, PINK[2] * 0.87, knose);
  // its little front paws, tucked up at the box's lip
  for (const [px0, py0, pr] of [[K.hx - 0.075, RIM - 0.055, 0.058], [K.hx + 0.055, RIM - 0.048, 0.054]]) {
    const pa = ell(u, v, px0, py0, pr, pr * 0.80, 0.006);
    if (pa > 0) {
      r = mix(r, CREAM[0] * 0.99, pa); g = mix(g, CREAM[1] * 0.98, pa); b = mix(b, CREAM[2] * 0.96, pa);
      for (let t = -1; t <= 1; t++) {
        const la = dot(u, v, px0 + t * pr * 0.40, py0 + pr * 0.28, pr * 0.14, 0.5) * pa;
        r = mix(r, GREY_D[0], la * 0.45); g = mix(g, GREY_D[1], la * 0.45); b = mix(b, GREY_D[2], la * 0.45);
      }
    }
  }

  // 5. the box's front wall, over the cats' bodies
  const front = rrect(u, v, BXL, RIM + 0.10, BXR, 2.2, 0.02, 0.003);
  if (front > 0) {
    const shadeV = 0.72 + 0.28 * sstep(RIM + 0.10, RIM + 0.50, v);
    let cr = BOX[0] * shadeV, cg = BOX[1] * shadeV, cb = BOX[2] * shadeV;
    const rib = 0.955 + 0.045 * Math.sin(u * 200);
    cr *= rib; cg *= rib; cb *= rib;
    // the lamp falls across its left end
    const lit = 0.24 * clamp(1 - (u - BXL) * 0.85);
    cr = mix(cr, 1.0, lit); cg = mix(cg, 0.92, lit); cb = mix(cb, 0.78, lit);
    r = mix(r, cr, front); g = mix(g, cg, front); b = mix(b, cb, front);
  }
  // the rim: a bright folded lip catching the lamp
  const rimA = rrect(u, v, BXL - 0.01, RIM, BXR + 0.01, RIM + 0.105, 0.03, 0.004);
  if (rimA > 0) {
    let cr = BOX[0] * 1.14, cg = BOX[1] * 1.14, cb = BOX[2] * 1.12;
    const lit = 0.22 * clamp(1 - (u - BXL) * 0.85);
    cr = mix(cr, 1.0, lit); cg = mix(cg, 0.94, lit); cb = mix(cb, 0.82, lit);
    r = mix(r, clamp(cr), rimA); g = mix(g, clamp(cg), rimA); b = mix(b, clamp(cb), rimA);
  }
  // the flaps: two panels standing up at the box's back corners
  for (const s of [-1, 1]) {
    const fx = s * 0.86;
    const flap = ellR(u, v, fx, MOUTH_T - 0.22, 0.115, 0.30, s * 16, 0.005);
    if (flap > 0) {
      const k = 0.88;
      r = mix(r, BOX[0] * k, flap); g = mix(g, BOX[1] * k, flap); b = mix(b, BOX[2] * k, flap);
    }
  }

  // 6. the ginger cat's paw, draped over the box's lip — the "aww" beat
  const pawA = ell(u, v, G.hx + 0.235, RIM - 0.020, 0.108, 0.080, 0.006);
  if (pawA > 0) {
    const f = fur(u, v);
    r = mix(r, CREAM[0] + 0.02 * f, pawA); g = mix(g, CREAM[1] * 0.99 + 0.02 * f, pawA); b = mix(b, CREAM[2] * 0.97, pawA);
    for (let t = -1; t <= 1; t++) {
      const la = dot(u, v, G.hx + 0.235 + t * 0.040, RIM + 0.032, 0.014, 0.5) * pawA;
      r = mix(r, GINGER_D[0], la * 0.38); g = mix(g, GINGER_D[1], la * 0.38); b = mix(b, GINGER_D[2], la * 0.38);
    }
  }

  // 7. the lamp's glow over everything, as a warm haze
  const haze = Math.exp(-lampD * 1.9) * 0.30;
  r = mix(r, 1.0, haze * 0.55); g = mix(g, 0.90, haze * 0.50); b = mix(b, 0.70, haze * 0.32);

  return [r, g, b];
}

// ------------------------------------------------------- rasterise, then encode
const px = new Uint8Array(SIZE * SIZE * 3);
const tone = (x: number) => Math.round(255 * Math.pow(clamp(x), 1 / 1.04));
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
