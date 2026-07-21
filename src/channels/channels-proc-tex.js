// Procedural texture channel — Phase 19.1
// Generates Perlin, Simplex, Worley, Blue Noise, gradients, checkers, grids,
// Truchet tiles, Islamic / Penrose patterns directly as a THREE.DataTexture
// and assigns it to iChannelN without touching the disk.

import * as THREE from 'three';
import { state } from '../core/state.js';
import { chClear, updateChannelUniform, applyWrap } from './channels-core.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public catalogue  (used by UI)
// ─────────────────────────────────────────────────────────────────────────────

export const PROC_TEX_TYPES = [
  { id: 'perlin',    label: 'Perlin Noise' },
  { id: 'simplex',  label: 'Simplex Noise' },
  { id: 'worley',   label: 'Worley (Voronoi)' },
  { id: 'bluenoise',label: 'Blue Noise' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'checker',  label: 'Checkerboard' },
  { id: 'grid',     label: 'Grid' },
  { id: 'truchet',  label: 'Truchet Tiles' },
  { id: 'islamic',  label: 'Islamic / Star' },
  { id: 'penrose',  label: 'Penrose Tiling' },
  // F-9.1 — New types
  { id: 'fbm',       label: 'FBM Noise' },
  { id: 'curl',      label: 'Curl Noise' },
  { id: 'iq_palette',label: 'Palette IQ' },
  { id: 'cellular',  label: 'Cellular / Voronoi' },
  { id: 'dithered',  label: 'Bayer Dither' },
  { id: 'lut_1d',    label: 'LUT 1D Gradient' },
  { id: 'spiral',    label: 'Fermat Spiral' },
  { id: 'reaction',  label: 'Reaction-Diffusion' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Default parameters per type
// ─────────────────────────────────────────────────────────────────────────────

export function defaultProcTexParams(typeId) {
  const base = { size: 256, seed: 0 };
  switch (typeId) {
    case 'perlin':    return { ...base, octaves: 4, frequency: 4, persistence: 0.5, lacunarity: 2.0 };
    case 'simplex':   return { ...base, octaves: 4, frequency: 4, persistence: 0.5, lacunarity: 2.0 };
    case 'worley':    return { ...base, points: 16, mode: 'f1', jitter: 1.0 };
    case 'bluenoise': return { ...base };
    case 'gradient':  return { ...base, angle: 0, colorA: [0,0,0,255], colorB: [255,255,255,255] };
    case 'checker':   return { ...base, cells: 8, colorA: [0,0,0,255], colorB: [255,255,255,255] };
    case 'grid':      return { ...base, cells: 8, lineWidth: 1, colorBg: [0,0,0,255], colorLine: [255,255,255,255] };
    case 'truchet':   return { ...base, cells: 16, lineWidth: 2, colorBg: [20,20,20,255], colorLine: [220,220,220,255] };
    case 'islamic':   return { ...base, cells: 6, arms: 6, colorBg: [10,10,30,255], colorLine: [200,180,80,255] };
    case 'penrose':    return { ...base, iterations: 5, colorA: [240,220,80,255], colorB: [80,120,200,255] };
    // F-9.1
    case 'fbm':        return { ...base, octaves: 6, frequency: 3, lacunarity: 2.0, gain: 0.5 };
    case 'curl':       return { ...base, frequency: 3, octaves: 3 };
    case 'iq_palette': return { ...base, a: [0.5,0.5,0.5], b: [0.5,0.5,0.5], c: [1.0,1.0,1.0], d: [0.0,0.33,0.67] };
    case 'cellular':   return { ...base, points: 24, mode: 'f1' };
    case 'dithered':   return { ...base, threshold: 0.5, scale: 8 };
    case 'lut_1d':     return { ...base, stops: [[0,0,0,255],[255,255,255,255]] };
    case 'spiral':     return { ...base, density: 137.508, radius: 0.45, dotSize: 2 };
    case 'reaction':   return { ...base, feed: 0.055, kill: 0.062, steps: 60 };
    default:           return base;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// F-9.2 — Parameter metadata (key, label, min, max, step) for inline editor
// ─────────────────────────────────────────────────────────────────────────────

export function getProcTexParamMeta(typeId) {
  switch (typeId) {
    case 'perlin':
    case 'simplex':
    case 'fbm':
      return [
        { key: 'octaves',     label: 'Octaves',     min: 1, max: 10, step: 1,    def: 4 },
        { key: 'frequency',   label: 'Frequency',   min: 0.5, max: 16, step: 0.5, def: 4 },
        { key: 'persistence', label: 'Persistence', min: 0.1, max: 1, step: 0.05, def: 0.5 },
        { key: 'lacunarity',  label: 'Lacunarity',  min: 1, max: 4,  step: 0.1,  def: 2.0 },
        { key: 'seed',        label: 'Seed',        min: 0, max: 999, step: 1,   def: 0 },
        { key: 'size',        label: 'Resolution',  min: 64, max: 1024, step: 64, def: 256 },
      ];
    case 'worley':
    case 'cellular':
      return [
        { key: 'points',  label: 'Points',     min: 2, max: 64, step: 1,  def: 16 },
        { key: 'jitter',  label: 'Jitter',     min: 0, max: 2,  step: 0.05, def: 1.0 },
        { key: 'seed',    label: 'Seed',       min: 0, max: 999, step: 1, def: 0 },
        { key: 'size',    label: 'Resolution', min: 64, max: 1024, step: 64, def: 256 },
      ];
    case 'checker':
    case 'grid':
    case 'truchet':
    case 'islamic':
      return [
        { key: 'cells',    label: 'Cells',       min: 2, max: 32, step: 1, def: 8 },
        { key: 'seed',     label: 'Seed',        min: 0, max: 999, step: 1, def: 0 },
        { key: 'size',     label: 'Resolution',  min: 64, max: 1024, step: 64, def: 256 },
      ];
    case 'curl':
      return [
        { key: 'frequency', label: 'Frequency', min: 1, max: 8,  step: 0.5, def: 3 },
        { key: 'octaves',   label: 'Octaves',   min: 1, max: 6,  step: 1,   def: 3 },
        { key: 'seed',      label: 'Seed',      min: 0, max: 999, step: 1,  def: 0 },
        { key: 'size',      label: 'Resolution',min: 64, max: 512, step: 64, def: 256 },
      ];
    case 'dithered':
      return [
        { key: 'scale', label: 'Scale',      min: 1, max: 32, step: 1, def: 8 },
        { key: 'seed',  label: 'Seed',       min: 0, max: 999, step: 1, def: 0 },
        { key: 'size',  label: 'Resolution', min: 64, max: 512, step: 64, def: 256 },
      ];
    case 'spiral':
      return [
        { key: 'density',  label: 'Golden angle (°)', min: 100, max: 180, step: 0.001, def: 137.508 },
        { key: 'dotSize',  label: 'Dot size',         min: 1,   max: 6,   step: 1,     def: 2 },
        { key: 'size',     label: 'Resolution',       min: 64,  max: 1024, step: 64,   def: 256 },
      ];
    case 'reaction':
      return [
        { key: 'feed',  label: 'Feed',       min: 0.01, max: 0.1, step: 0.001, def: 0.055 },
        { key: 'kill',  label: 'Kill',       min: 0.04, max: 0.08, step: 0.001, def: 0.062 },
        { key: 'steps', label: 'Iterations', min: 10,  max: 200,  step: 10,    def: 60 },
        { key: 'size',  label: 'Resolution', min: 32,  max: 256,  step: 32,    def: 128 },
      ];
    case 'penrose':
      return [
        { key: 'iterations', label: 'Iterations', min: 1, max: 7, step: 1, def: 5 },
        { key: 'size',       label: 'Resolution', min: 64, max: 1024, step: 64, def: 256 },
      ];
    case 'gradient':
      return [
        { key: 'angle', label: 'Angle (°)',  min: 0, max: 360, step: 1, def: 0 },
        { key: 'size',  label: 'Resolution', min: 64, max: 512, step: 64, def: 256 },
      ];
    default:
      return [
        { key: 'size', label: 'Resolution', min: 64, max: 1024, step: 64, def: 256 },
        { key: 'seed', label: 'Seed',       min: 0, max: 999, step: 1, def: 0 },
      ];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate & assign to channel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a procedural texture and assign it as iChannelN.
 * @param {number} i        — channel index
 * @param {string} typeId   — PROC_TEX_TYPES id
 * @param {object} params   — generator params (merged with defaults)
 */
export function chGenProcTex(i, typeId, params = {}) {
  const p = { ...defaultProcTexParams(typeId), ...params };
  const size = Math.max(16, Math.min(1024, p.size || 256));

  const data = generateTexture(typeId, size, p);   // Uint8Array RGBA

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;

  const ch = state.channels[i];
  if (ch.texture) ch.texture.dispose();
  ch.texture        = tex;
  ch.type           = 'proc-tex';
  ch.procTexType    = typeId;
  ch.procTexParams  = { ...p };
  ch.status         = 'ok';
  ch.statusMsg      = `${size}×${size} ${typeId}`;
  applyWrap(ch);
  updateChannelUniform(i);
  state.callbacks.renderChannelUI?.(i);
}

// ─────────────────────────────────────────────────────────────────────────────
// Export current proc texture as PNG (triggers browser download)
// ─────────────────────────────────────────────────────────────────────────────

export function chExportProcTexPng(i) {
  const ch = state.channels[i];
  if (ch.type !== 'proc-tex' || !ch.procTexType) return;
  const p = ch.procTexParams || {};
  const size = p.size || 256;
  const data = generateTexture(ch.procTexType, size, p);

  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(size, size);
  imageData.data.set(data);
  ctx.putImageData(imageData, 0, 0);
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proc-tex-${ch.procTexType}-${size}.png`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Draw live preview into a <canvas> element (for the channel panel)
// ─────────────────────────────────────────────────────────────────────────────

export function drawProcTexPreview(canvasEl, typeId, params = {}) {
  if (!canvasEl) return;
  const W = canvasEl.width  || 72;
  const H = canvasEl.height || 48;
  const p = { ...defaultProcTexParams(typeId), ...params, size: Math.max(W, H) };
  const data = generateTexture(typeId, p.size, p);
  // scale-sample into the canvas dimensions
  const ctx = canvasEl.getContext('2d');
  const tmp = document.createElement('canvas');
  tmp.width = p.size; tmp.height = p.size;
  const tCtx = tmp.getContext('2d');
  const id = tCtx.createImageData(p.size, p.size);
  id.data.set(data);
  tCtx.putImageData(id, 0, 0);
  ctx.drawImage(tmp, 0, 0, W, H);
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── GENERATOR DISPATCH ──────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function generateTexture(typeId, size, p) {
  switch (typeId) {
    case 'perlin':    return genPerlin(size, p);
    case 'simplex':   return genSimplex(size, p);
    case 'worley':    return genWorley(size, p);
    case 'bluenoise': return genBlueNoise(size, p);
    case 'gradient':  return genGradient(size, p);
    case 'checker':   return genChecker(size, p);
    case 'grid':      return genGrid(size, p);
    case 'truchet':   return genTruchet(size, p);
    case 'islamic':   return genIslamic(size, p);
    case 'penrose':    return genPenrose(size, p);
    // F-9.1
    case 'fbm':        return genFBM(size, p);
    case 'curl':       return genCurl(size, p);
    case 'iq_palette': return genIQPalette(size, p);
    case 'cellular':   return genCellular(size, p);
    case 'dithered':   return genDithered(size, p);
    case 'lut_1d':     return genLUT1D(size, p);
    case 'spiral':     return genSpiral(size, p);
    case 'reaction':   return genReaction(size, p);
    default:           return new Uint8Array(size * size * 4);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── MATH HELPERS ────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function lcg(seed) {
  let s = seed | 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) | 0; return (s >>> 0) / 0xffffffff; };
}

function lerp(a, b, t) { return a + t * (b - a); }
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function fract(x) { return x - Math.floor(x); }

// Build permutation table from seed
function buildPerm(seed) {
  const rng = lcg(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
}

const GRAD3 = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
];
function dot2(g, x, y) { return g[0] * x + g[1] * y; }

// ─────────────────────────────────────────────────────────────────────────────
// ─── PERLIN NOISE ────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function perlinRaw(perm, x, y) {
  const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x), yf = y - Math.floor(y);
  const u = fade(xf), v = fade(yf);
  const aa = perm[perm[xi] + yi], ab = perm[perm[xi] + yi + 1];
  const ba = perm[perm[xi+1] + yi], bb = perm[perm[xi+1] + yi + 1];
  const g0 = GRAD3[aa % 12], g1 = GRAD3[ba % 12];
  const g2 = GRAD3[ab % 12], g3 = GRAD3[bb % 12];
  return lerp(
    lerp(dot2(g0, xf, yf), dot2(g1, xf - 1, yf), u),
    lerp(dot2(g2, xf, yf - 1), dot2(g3, xf - 1, yf - 1), u),
    v
  );
}

function fbm(perm, x, y, octaves, freq, persistence, lacunarity) {
  let val = 0, amp = 1, maxAmp = 0, f = freq;
  for (let o = 0; o < octaves; o++) {
    val += perlinRaw(perm, x * f, y * f) * amp;
    maxAmp += amp;
    amp *= persistence;
    f *= lacunarity;
  }
  return val / maxAmp;
}

function genPerlin(size, p) {
  const perm = buildPerm(p.seed);
  const buf = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = x / size, ny = y / size;
    const v = clamp((fbm(perm, nx, ny, p.octaves, p.frequency, p.persistence, p.lacunarity) + 1) / 2, 0, 1);
    const idx = (y * size + x) * 4;
    const c = (v * 255) | 0;
    buf[idx] = buf[idx+1] = buf[idx+2] = c; buf[idx+3] = 255;
  }
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── SIMPLEX NOISE ───────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function simplexRaw(perm, xin, yin) {
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s), j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const x0 = xin - (i - t), y0 = yin - (j - t);
  const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  const gi0 = perm[ii +     perm[jj]]     % 12;
  const gi1 = perm[ii + i1 + perm[jj+j1]] % 12;
  const gi2 = perm[ii + 1  + perm[jj+1]]  % 12;
  let n0 = 0, n1 = 0, n2 = 0;
  let t0 = 0.5 - x0*x0 - y0*y0; if (t0 >= 0) { t0 *= t0; n0 = t0*t0 * dot2(GRAD3[gi0], x0, y0); }
  let t1 = 0.5 - x1*x1 - y1*y1; if (t1 >= 0) { t1 *= t1; n1 = t1*t1 * dot2(GRAD3[gi1], x1, y1); }
  let t2 = 0.5 - x2*x2 - y2*y2; if (t2 >= 0) { t2 *= t2; n2 = t2*t2 * dot2(GRAD3[gi2], x2, y2); }
  return 70 * (n0 + n1 + n2);
}

function fbmSimplex(perm, x, y, octaves, freq, persistence, lacunarity) {
  let val = 0, amp = 1, maxAmp = 0, f = freq;
  for (let o = 0; o < octaves; o++) {
    val += simplexRaw(perm, x * f, y * f) * amp;
    maxAmp += amp;
    amp *= persistence;
    f *= lacunarity;
  }
  return val / maxAmp;
}

function genSimplex(size, p) {
  const perm = buildPerm(p.seed);
  const buf = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = x / size, ny = y / size;
    const v = clamp((fbmSimplex(perm, nx, ny, p.octaves, p.frequency, p.persistence, p.lacunarity) + 1) / 2, 0, 1);
    const idx = (y * size + x) * 4;
    const c = (v * 255) | 0;
    buf[idx] = buf[idx+1] = buf[idx+2] = c; buf[idx+3] = 255;
  }
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── WORLEY (CELLULAR / VORONOI) ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function genWorley(size, p) {
  const N = Math.max(2, Math.min(64, p.points || 16));
  const rng = lcg(p.seed);
  const pts = Array.from({ length: N }, () => [rng(), rng()]);
  const jitter = p.jitter ?? 1.0;
  const mode = p.mode || 'f1';         // f1 | f2 | f2-f1
  const buf = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = x / size, ny = y / size;
    let d1 = Infinity, d2 = Infinity;
    for (const [px, py] of pts) {
      const jx = px + (rng() - 0.5) * 0.05 * jitter;
      const jy = py + (rng() - 0.5) * 0.05 * jitter;
      // tiled distance
      const dx = Math.min(Math.abs(nx - jx), 1 - Math.abs(nx - jx));
      const dy = Math.min(Math.abs(ny - jy), 1 - Math.abs(ny - jy));
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    let v;
    if (mode === 'f2')       v = clamp(d2 * Math.SQRT2, 0, 1);
    else if (mode === 'f2-f1') v = clamp((d2 - d1) * 4, 0, 1);
    else                     v = clamp(d1 * Math.SQRT2, 0, 1);
    const idx = (y * size + x) * 4;
    const c = (v * 255) | 0;
    buf[idx] = buf[idx+1] = buf[idx+2] = c; buf[idx+3] = 255;
  }
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── BLUE NOISE (void-and-cluster approximation) ─────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function genBlueNoise(size, p) {
  // Fast approximation: generate white noise then apply high-pass filter via
  // repeated box-blur subtraction (Heitz & Nowrouzezahrai style, simplified).
  const rng = lcg(p.seed);
  const N = size * size;
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) raw[i] = rng();

  // Two-pass box blur radius = size/8 (approximates Gaussian)
  const blurred = boxBlur2D(raw, size, Math.max(2, (size / 8) | 0));
  let min = Infinity, max = -Infinity;
  const hp = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    hp[i] = raw[i] - blurred[i];
    if (hp[i] < min) min = hp[i];
    if (hp[i] > max) max = hp[i];
  }
  const buf = new Uint8Array(N * 4);
  const range = max - min || 1;
  for (let i = 0; i < N; i++) {
    const c = (((hp[i] - min) / range) * 255) | 0;
    buf[i*4] = buf[i*4+1] = buf[i*4+2] = c; buf[i*4+3] = 255;
  }
  return buf;
}

function boxBlur2D(src, size, radius) {
  const tmp = new Float32Array(size * size);
  // horizontal
  for (let y = 0; y < size; y++) {
    let sum = 0;
    const diam = radius * 2 + 1;
    for (let kx = -radius; kx <= radius; kx++) sum += src[y * size + ((kx + size) % size)];
    for (let x = 0; x < size; x++) {
      tmp[y * size + x] = sum / diam;
      sum -= src[y * size + ((x - radius + size) % size)];
      sum += src[y * size + ((x + radius + 1) % size)];
    }
  }
  const out = new Float32Array(size * size);
  for (let x = 0; x < size; x++) {
    let sum = 0;
    const diam = radius * 2 + 1;
    for (let ky = -radius; ky <= radius; ky++) sum += tmp[((ky + size) % size) * size + x];
    for (let y = 0; y < size; y++) {
      out[y * size + x] = sum / diam;
      sum -= tmp[((y - radius + size) % size) * size + x];
      sum += tmp[((y + radius + 1) % size) * size + x];
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── GRADIENT ────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function genGradient(size, p) {
  const angle = (p.angle || 0) * Math.PI / 180;
  const cA = p.colorA || [0,0,0,255];
  const cB = p.colorB || [255,255,255,255];
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const buf = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const t = clamp((x / size) * dx + (y / size) * dy, 0, 1);
    const idx = (y * size + x) * 4;
    buf[idx+0] = lerp(cA[0], cB[0], t) | 0;
    buf[idx+1] = lerp(cA[1], cB[1], t) | 0;
    buf[idx+2] = lerp(cA[2], cB[2], t) | 0;
    buf[idx+3] = lerp(cA[3], cB[3], t) | 0;
  }
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── CHECKERBOARD ────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function genChecker(size, p) {
  const cells = Math.max(1, p.cells || 8);
  const cA = p.colorA || [0,0,0,255];
  const cB = p.colorB || [255,255,255,255];
  const buf = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const cx = Math.floor(x / size * cells);
    const cy = Math.floor(y / size * cells);
    const c = (cx + cy) % 2 === 0 ? cA : cB;
    const idx = (y * size + x) * 4;
    buf[idx] = c[0]; buf[idx+1] = c[1]; buf[idx+2] = c[2]; buf[idx+3] = c[3] ?? 255;
  }
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── GRID ────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function genGrid(size, p) {
  const cells = Math.max(1, p.cells || 8);
  const lw = Math.max(1, p.lineWidth || 1);
  const cBg = p.colorBg || [0,0,0,255];
  const cLine = p.colorLine || [255,255,255,255];
  const cellPx = size / cells;
  const buf = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const rx = x % cellPx, ry = y % cellPx;
    const onLine = rx < lw || ry < lw;
    const c = onLine ? cLine : cBg;
    const idx = (y * size + x) * 4;
    buf[idx] = c[0]; buf[idx+1] = c[1]; buf[idx+2] = c[2]; buf[idx+3] = c[3] ?? 255;
  }
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── TRUCHET TILES ───────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function genTruchet(size, p) {
  const cells = Math.max(2, p.cells || 16);
  const lw = Math.max(1, p.lineWidth || 2);
  const cBg   = p.colorBg   || [20,20,20,255];
  const cLine = p.colorLine || [220,220,220,255];
  const rng = lcg(p.seed);
  const cellPx = size / cells;
  const half = cellPx / 2;
  // Pre-generate tile orientations
  const tiles = new Uint8Array(cells * cells);
  for (let i = 0; i < tiles.length; i++) tiles[i] = rng() > 0.5 ? 1 : 0;

  const buf = new Uint8Array(size * size * 4);
  // Fill background
  for (let i = 0; i < size * size; i++) {
    const idx = i * 4;
    buf[idx] = cBg[0]; buf[idx+1] = cBg[1]; buf[idx+2] = cBg[2]; buf[idx+3] = cBg[3] ?? 255;
  }
  // Draw arcs per tile
  for (let ty = 0; ty < cells; ty++) for (let tx = 0; tx < cells; tx++) {
    const flip = tiles[ty * cells + tx];
    const ox = tx * cellPx, oy = ty * cellPx;
    // Two quarter-circle arcs per tile
    const arcs = flip === 0
      ? [[ox,       oy,       0,        Math.PI / 2],
         [ox + cellPx, oy + cellPx, Math.PI, 3 * Math.PI / 2]]
      : [[ox + cellPx, oy,       Math.PI / 2, Math.PI],
         [ox,          oy + cellPx, 3 * Math.PI / 2, 2 * Math.PI]];

    for (const [ax, ay, a0, a1] of arcs) {
      // Rasterize arc by stepping angle
      const steps = Math.ceil(half * Math.PI * 2);
      for (let s = 0; s <= steps; s++) {
        const a = a0 + (a1 - a0) * s / steps;
        const cx0 = ax + Math.cos(a) * half;
        const cy0 = ay + Math.sin(a) * half;
        // thicken by lw
        for (let dy = -lw; dy <= lw; dy++) for (let dx = -lw; dx <= lw; dx++) {
          if (dx*dx + dy*dy > lw*lw) continue;
          const px = Math.round(cx0 + dx), py = Math.round(cy0 + dy);
          if (px < 0 || py < 0 || px >= size || py >= size) continue;
          const idx = (py * size + px) * 4;
          buf[idx] = cLine[0]; buf[idx+1] = cLine[1]; buf[idx+2] = cLine[2]; buf[idx+3] = cLine[3] ?? 255;
        }
      }
    }
  }
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── ISLAMIC / STAR PATTERN ──────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function genIslamic(size, p) {
  const cells = Math.max(2, p.cells || 6);
  const arms  = Math.max(4, Math.min(12, p.arms || 6));
  const cBg   = p.colorBg   || [10,10,30,255];
  const cLine = p.colorLine || [200,180,80,255];
  const cellPx = size / cells;
  const half = cellPx / 2;
  const r = half * 0.8;
  const lw = 1.5;

  const buf = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const idx = i * 4;
    buf[idx] = cBg[0]; buf[idx+1] = cBg[1]; buf[idx+2] = cBg[2]; buf[idx+3] = cBg[3] ?? 255;
  }

  // Draw star polygon in each tile
  for (let ty = 0; ty < cells; ty++) for (let tx = 0; tx < cells; tx++) {
    const cx = tx * cellPx + half, cy = ty * cellPx + half;
    const pts = [];
    const innerR = r * 0.4;
    for (let k = 0; k < arms * 2; k++) {
      const a = (k / (arms * 2)) * Math.PI * 2 - Math.PI / 2;
      const rr = k % 2 === 0 ? r : innerR;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    // Rasterize line segments
    for (let k = 0; k < pts.length; k++) {
      const [x1, y1] = pts[k];
      const [x2, y2] = pts[(k + 1) % pts.length];
      rasterLine(buf, size, x1, y1, x2, y2, lw, cLine);
    }
    // Connecting lines between adjacent stars (cell-edge midpoints to star points)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const ex = cx + Math.cos(a) * half * 0.95;
      const ey = cy + Math.sin(a) * half * 0.95;
      const idx = Math.round(((k / 4) * arms * 2 + arms / 2)) % (arms * 2);
      rasterLine(buf, size, pts[idx][0], pts[idx][1], ex, ey, lw, cLine);
    }
  }
  return buf;
}

function rasterLine(buf, size, x1, y1, x2, y2, lw, color) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.ceil(len * 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const px = x1 + dx * t, py = y1 + dy * t;
    const r = Math.ceil(lw);
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      if (ox*ox + oy*oy > lw*lw) continue;
      const ix = Math.round(px + ox), iy = Math.round(py + oy);
      if (ix < 0 || iy < 0 || ix >= size || iy >= size) continue;
      const idx = (iy * size + ix) * 4;
      buf[idx] = color[0]; buf[idx+1] = color[1]; buf[idx+2] = color[2]; buf[idx+3] = color[3] ?? 255;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── PENROSE TILING (P3 rhombus) ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const PHI = (1 + Math.sqrt(5)) / 2;

function genPenrose(size, p) {
  const iterations = Math.max(1, Math.min(7, p.iterations || 5));
  const cA = p.colorA || [240,220,80,255];
  const cB = p.colorB || [80,120,200,255];

  // Build initial 10-triangle wheel
  let triangles = [];
  for (let i = 0; i < 10; i++) {
    const a0 = (2 * i - 1) * Math.PI / 10;
    const a1 = (2 * i + 1) * Math.PI / 10;
    const type = i % 2 === 0 ? 0 : 1;
    triangles.push({
      type,
      A: [0, 0],
      B: [Math.cos(a0), Math.sin(a0)],
      C: [Math.cos(a1), Math.sin(a1)],
    });
  }

  // Subdivide
  for (let iter = 0; iter < iterations; iter++) {
    const next = [];
    for (const { type, A, B, C } of triangles) {
      if (type === 0) {
        // Thin triangle
        const P = lerpPt(A, B, 1 / PHI);
        next.push({ type: 0, A: C, B: P, C: B });
        next.push({ type: 1, A: P, B: C, C: A });
      } else {
        // Thick triangle
        const Q = lerpPt(B, A, 1 / PHI);
        const R = lerpPt(B, C, 1 / PHI);
        next.push({ type: 1, A: R, B: C, C: A });
        next.push({ type: 1, A: Q, B: R, C: B });
        next.push({ type: 0, A: R, B: Q, C: A });
      }
    }
    triangles = next;
  }

  // Rasterize
  const buf = new Uint8Array(size * size * 4);
  // Gray background
  buf.fill(30);
  for (let i = 3; i < buf.length; i += 4) buf[i] = 255;

  const margin = size * 0.05;
  const scale = (size - margin * 2) / 2;
  const offX = size / 2, offY = size / 2;

  const toScreen = (/** @type {number[]} */ [x, y]) => [x * scale + offX, y * scale + offY];

  for (const { type, A, B, C } of triangles) {
    const [ax, ay] = toScreen(A);
    const [bx, by] = toScreen(B);
    const [cx, cy] = toScreen(C);
    const color = type === 0 ? cA : cB;
    fillTriangle(buf, size, ax, ay, bx, by, cx, cy, color);
    // Thin edge lines
    rasterLine(buf, size, ax, ay, bx, by, 0.7, [0,0,0,255]);
    rasterLine(buf, size, bx, by, cx, cy, 0.7, [0,0,0,255]);
    rasterLine(buf, size, cx, cy, ax, ay, 0.7, [0,0,0,255]);
  }
  return buf;
}

/** @param {number[]} a @param {number[]} b @param {number} t */
function lerpPt([ax, ay], [bx, by], t) { return [ax + (bx - ax) * t, ay + (by - ay) * t]; }

function fillTriangle(buf, size, x1, y1, x2, y2, x3, y3, color) {
  const minX = Math.max(0, Math.floor(Math.min(x1, x2, x3)));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(x1, x2, x3)));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2, y3)));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(y1, y2, y3)));
  const denom = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
  if (Math.abs(denom) < 0.001) return;
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const w1 = ((y2 - y3) * (px - x3) + (x3 - x2) * (py - y3)) / denom;
      const w2 = ((y3 - y1) * (px - x3) + (x1 - x3) * (py - y3)) / denom;
      const w3 = 1 - w1 - w2;
      if (w1 >= 0 && w2 >= 0 && w3 >= 0) {
        const idx = (py * size + px) * 4;
        buf[idx] = color[0]; buf[idx+1] = color[1]; buf[idx+2] = color[2]; buf[idx+3] = color[3] ?? 255;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// F-9.1 — NEW GENERATOR TYPES
// ─────────────────────────────────────────────────────────────────────────────

// ── FBM Noise ─────────────────────────────────────────────────────────────────
function genFBM(size, p) {
  const perm = buildPerm(p.seed || 0);
  const buf = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = fbm(perm, x / size, y / size, p.octaves || 6, p.frequency || 3, p.gain ?? 0.5, p.lacunarity || 2.0);
    const c = clamp(Math.floor((v * 0.5 + 0.5) * 255), 0, 255);
    const i = (y * size + x) * 4;
    buf[i] = c; buf[i+1] = c; buf[i+2] = c; buf[i+3] = 255;
  }
  return buf;
}

// ── Curl Noise (curl of 2D perlin gradient) ───────────────────────────────────
function genCurl(size, p) {
  const perm = buildPerm(p.seed || 0);
  const freq = p.frequency || 3;
  const octs = p.octaves || 3;
  const buf = new Uint8Array(size * size * 4);
  const eps = 0.001;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = x / size, ny = y / size;
    const dpdy = (fbm(perm, nx, ny + eps, octs, freq, 0.5, 2.0) - fbm(perm, nx, ny - eps, octs, freq, 0.5, 2.0)) / (2 * eps);
    const dpdx = (fbm(perm, nx + eps, ny, octs, freq, 0.5, 2.0) - fbm(perm, nx - eps, ny, octs, freq, 0.5, 2.0)) / (2 * eps);
    const cx = clamp(Math.floor((dpdy * 0.5 + 0.5) * 255), 0, 255);
    const cy = clamp(Math.floor((-dpdx * 0.5 + 0.5) * 255), 0, 255);
    const i = (y * size + x) * 4;
    buf[i] = cx; buf[i+1] = cy; buf[i+2] = 128; buf[i+3] = 255;
  }
  return buf;
}

// ── IQ Palette ────────────────────────────────────────────────────────────────
function genIQPalette(size, p) {
  const a = p.a || [0.5, 0.5, 0.5];
  const b = p.b || [0.5, 0.5, 0.5];
  const c = p.c || [1.0, 1.0, 1.0];
  const d = p.d || [0.0, 0.33, 0.67];
  const buf = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const t = x / size;
    const r = a[0] + b[0] * Math.cos(2 * Math.PI * (c[0] * t + d[0]));
    const g = a[1] + b[1] * Math.cos(2 * Math.PI * (c[1] * t + d[1]));
    const bv = a[2] + b[2] * Math.cos(2 * Math.PI * (c[2] * t + d[2]));
    const i = (y * size + x) * 4;
    buf[i]   = clamp(Math.floor(r * 255), 0, 255);
    buf[i+1] = clamp(Math.floor(g * 255), 0, 255);
    buf[i+2] = clamp(Math.floor(bv * 255), 0, 255);
    buf[i+3] = 255;
  }
  return buf;
}

// ── Cellular / Voronoi ────────────────────────────────────────────────────────
function genCellular(size, p) {
  const rng = lcg(p.seed || 0);
  const n = Math.max(4, p.points || 24);
  const pts = Array.from({ length: n }, () => [rng() * size, rng() * size]);
  const mode = p.mode || 'f1'; // 'f1' | 'f2' | 'f2-f1'
  const buf = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dists = pts.map(([px, py]) => {
      const dx = Math.min(Math.abs(x - px), size - Math.abs(x - px));
      const dy = Math.min(Math.abs(y - py), size - Math.abs(y - py));
      return Math.sqrt(dx * dx + dy * dy);
    }).sort((a, b) => a - b);
    const f1 = dists[0], f2 = dists[1];
    const norm = (v) => clamp(Math.floor(v / (size * 0.5) * 255), 0, 255);
    const c = norm(mode === 'f2' ? f2 : mode === 'f2-f1' ? f2 - f1 : f1);
    const i = (y * size + x) * 4;
    buf[i] = c; buf[i+1] = c; buf[i+2] = c; buf[i+3] = 255;
  }
  return buf;
}

// ── Bayer Dither ──────────────────────────────────────────────────────────────
const BAYER8 = [
   0,32, 8,40, 2,34,10,42,
  48,16,56,24,50,18,58,26,
  12,44, 4,36,14,46, 6,38,
  60,28,52,20,62,30,54,22,
   3,35,11,43, 1,33, 9,41,
  51,19,59,27,49,17,57,25,
  15,47, 7,39,13,45, 5,37,
  63,31,55,23,61,29,53,21,
];
function genDithered(size, p) {
  const perm = buildPerm(p.seed || 0);
  const scale = Math.max(1, p.scale || 8);
  const buf = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = fbm(perm, x / size * 3, y / size * 3, 4, 3, 0.5, 2.0) * 0.5 + 0.5;
    const bx = Math.floor(x / scale) % 8;
    const by = Math.floor(y / scale) % 8;
    const threshold = BAYER8[by * 8 + bx] / 64;
    const c = v > threshold ? 255 : 0;
    const i = (y * size + x) * 4;
    buf[i] = c; buf[i+1] = c; buf[i+2] = c; buf[i+3] = 255;
  }
  return buf;
}

// ── LUT 1D Gradient ───────────────────────────────────────────────────────────
function genLUT1D(size, p) {
  const stops = p.stops || [[0,0,0,255],[255,255,255,255]];
  const buf = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const t = x / (size - 1);
    const si = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
    const f  = t * (stops.length - 1) - si;
    const s0 = stops[si], s1 = stops[si + 1] || s0;
    const ii = (y * size + x) * 4;
    buf[ii]   = Math.round(lerp(s0[0], s1[0], f));
    buf[ii+1] = Math.round(lerp(s0[1], s1[1], f));
    buf[ii+2] = Math.round(lerp(s0[2], s1[2], f));
    buf[ii+3] = 255;
  }
  return buf;
}

// ── Fermat Spiral (phyllotaxis) ───────────────────────────────────────────────
function genSpiral(size, p) {
  const goldenAngle = (p.density || 137.508) * Math.PI / 180;
  const radius      = Math.min(0.499, p.radius || 0.45);
  const dotSize     = Math.max(1, Math.round(p.dotSize || 2));
  const n           = Math.round(size * size * 0.3);
  const buf = new Uint8Array(size * size * 4);
  const cx = size / 2, cy = size / 2;
  for (let k = 0; k < n; k++) {
    const r  = Math.sqrt(k / n) * radius * size;
    const a  = k * goldenAngle;
    const px = Math.round(cx + Math.cos(a) * r);
    const py = Math.round(cy + Math.sin(a) * r);
    for (let dy = -dotSize; dy <= dotSize; dy++) for (let dx = -dotSize; dx <= dotSize; dx++) {
      if (dx*dx + dy*dy > dotSize*dotSize) continue;
      const ix = px + dx, iy = py + dy;
      if (ix < 0 || iy < 0 || ix >= size || iy >= size) continue;
      const hue = (k / n) * 6;
      const h6 = hue % 6, f = hue - Math.floor(hue);
      const rgb = [
        [1,f,0],[1-f,1,0],[0,1,f],[0,1-f,1],[f,0,1],[1,0,1-f]
      ][Math.floor(h6) % 6].map(v => Math.round(v * 220 + 35));
      const ii = (iy * size + ix) * 4;
      buf[ii] = rgb[0]; buf[ii+1] = rgb[1]; buf[ii+2] = rgb[2]; buf[ii+3] = 255;
    }
  }
  return buf;
}

// ── Gray-Scott Reaction-Diffusion ─────────────────────────────────────────────
function genReaction(size, p) {
  const feed  = p.feed  ?? 0.055;
  const kill  = p.kill  ?? 0.062;
  const steps = Math.max(1, Math.min(200, p.steps || 60));
  const Da = 1.0, Db = 0.5;
  const dt = 1.0;

  let A = new Float32Array(size * size).fill(1.0);
  let B = new Float32Array(size * size).fill(0.0);

  // Seed with a small square of B
  const mid = Math.floor(size / 2), r = Math.max(4, Math.floor(size / 16));
  for (let y = mid - r; y < mid + r; y++) for (let x = mid - r; x < mid + r; x++) {
    B[y * size + x] = 1.0;
  }

  const nA = new Float32Array(size * size);
  const nB = new Float32Array(size * size);

  for (let s = 0; s < steps; s++) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const xm = (x - 1 + size) % size, xp = (x + 1) % size;
      const ym = (y - 1 + size) % size, yp = (y + 1) % size;
      const lapA = A[ym*size+x] + A[yp*size+x] + A[y*size+xm] + A[y*size+xp] - 4*A[idx];
      const lapB = B[ym*size+x] + B[yp*size+x] + B[y*size+xm] + B[y*size+xp] - 4*B[idx];
      const a = A[idx], b = B[idx];
      const abb = a * b * b;
      nA[idx] = clamp(a + (Da * lapA - abb + feed * (1 - a)) * dt, 0, 1);
      nB[idx] = clamp(b + (Db * lapB + abb - (kill + feed) * b) * dt, 0, 1);
    }
    A.set(nA); B.set(nB);
  }

  const buf = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const c = clamp(Math.floor(B[i] * 255), 0, 255);
    buf[i*4]   = c;
    buf[i*4+1] = clamp(Math.floor((1 - A[i]) * 255), 0, 255);
    buf[i*4+2] = 128;
    buf[i*4+3] = 255;
  }
  return buf;
}
