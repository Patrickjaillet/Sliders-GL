/**
 * color-remap.js — F-4.3 (Axe 4)
 *
 * LUT 1D appliquée sur la sortie du shader via la palette IQ :
 *   col = a + b*cos(2π*(c*t + d))
 *
 * Crée une texture 1D (256×1 RGBA) utilisée comme post-process de colorisation.
 * Intégration WebGL minimale — injecte le pass de remapping dans le pipeline.
 *
 * API publique :
 *   initColorRemap(gl)
 *   setRemapParams({ a, b, c, d, strength, enabled })
 *   getRemapParams()
 *   buildLUTTexture(gl, params)    — retourne WebGLTexture
 *   IQ_PALETTES                    — palettes prédéfinies
 */

import { state } from '../core/state.js';

export const IQ_PALETTES = [
  { name: 'Arcades',    a: [0.5,0.5,0.5], b: [0.5,0.5,0.5], c: [1.0,1.0,1.0], d: [0.00,0.33,0.67] },
  { name: 'Health',     a: [0.5,0.5,0.5], b: [0.5,0.5,0.5], c: [1.0,1.0,1.0], d: [0.00,0.10,0.20] },
  { name: 'Flame',      a: [0.5,0.5,0.5], b: [0.5,0.5,0.5], c: [1.0,0.7,0.4], d: [0.00,0.15,0.20] },
  { name: 'Ocean',      a: [0.5,0.5,0.5], b: [0.5,0.5,0.5], c: [1.0,1.0,0.5], d: [0.80,0.90,0.30] },
  { name: 'Sunset',     a: [0.8,0.5,0.4], b: [0.2,0.4,0.2], c: [2.0,1.0,1.0], d: [0.00,0.25,0.25] },
  { name: 'Neon',       a: [0.5,0.5,0.5], b: [0.5,0.5,0.5], c: [2.0,1.0,0.0], d: [0.50,0.20,0.25] },
  { name: 'Viridis',    a: [0.3,0.5,0.4], b: [0.3,0.5,0.4], c: [1.0,1.0,0.8], d: [0.00,0.10,0.20] },
  { name: 'Cold',       a: [0.2,0.3,0.5], b: [0.3,0.3,0.3], c: [1.0,0.5,1.0], d: [0.00,0.10,0.20] },
  { name: 'Synthwave',  a: [0.5,0.0,0.5], b: [0.5,0.5,0.5], c: [0.8,0.8,0.5], d: [0.00,0.00,0.50] },
  { name: 'Dawn',       a: [0.9,0.5,0.2], b: [0.3,0.3,0.3], c: [0.5,1.0,0.5], d: [0.80,0.20,0.10] },
];

// ── État module ───────────────────────────────────────────────────────────────

let _params = {
  enabled: false,
  strength: 1.0,
  a: [0.5, 0.5, 0.5],
  b: [0.5, 0.5, 0.5],
  c: [1.0, 1.0, 1.0],
  d: [0.0, 0.33, 0.67],
};

export function getRemapParams() { return { ..._params }; }

export function setRemapParams(p) {
  Object.assign(_params, p);
}

// ── Construction LUT texture 1D ───────────────────────────────────────────────

/**
 * Génère une texture 1D (256 pixels, RGBA) encodant la palette IQ.
 * @param {WebGLRenderingContext} gl
 * @param {object} [params]  — override local (sinon utilise _params)
 * @returns {WebGLTexture}
 */
export function buildLUTTexture(gl, params) {
  const p = params ?? _params;
  const size = 256;
  const data = new Uint8Array(size * 4);

  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    for (let ch = 0; ch < 3; ch++) {
      const v = p.a[ch] + p.b[ch] * Math.cos(2 * Math.PI * (p.c[ch] * t + p.d[ch]));
      data[i * 4 + ch] = Math.max(0, Math.min(255, Math.round(v * 255)));
    }
    data[i * 4 + 3] = 255;
  }

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// ── Fragment shader snippet pour l'application de la LUT ─────────────────────

/**
 * Retourne le code GLSL pour appliquer la LUT 1D dans un post-process.
 * Usage: mixer `texture2D(uColorRemap, vec2(luma, 0.5)).rgb` avec la couleur originale.
 */
export const COLOR_REMAP_FRAG_SNIPPET = /* glsl */`
uniform sampler2D uColorRemap;
uniform float uRemapStrength;

vec3 applyColorRemap(vec3 col) {
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    vec3 remapped = texture2D(uColorRemap, vec2(clamp(luma, 0.001, 0.999), 0.5)).rgb;
    return mix(col, remapped, clamp(uRemapStrength, 0.0, 1.0));
}
`;

// ── Helpers preview canvas ────────────────────────────────────────────────────

/**
 * Dessine un aperçu de la palette IQ dans un canvas 2D (gradient 256px).
 * @param {HTMLCanvasElement} canvas
 * @param {object} p  — { a, b, c, d }
 */
export function drawPalettePreview(canvas, p) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  for (let i = 0; i < w; i++) {
    const t = i / (w - 1);
    const r = p.a[0] + p.b[0] * Math.cos(2 * Math.PI * (p.c[0] * t + p.d[0]));
    const g = p.a[1] + p.b[1] * Math.cos(2 * Math.PI * (p.c[1] * t + p.d[1]));
    const b = p.a[2] + p.b[2] * Math.cos(2 * Math.PI * (p.c[2] * t + p.d[2]));
    ctx.fillStyle = `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;
    ctx.fillRect(i, 0, 1, h);
  }
}

// ── Accent depuis le rendu ────────────────────────────────────────────────────

/**
 * Échantillonne le canvas de rendu, calcule la couleur dominante et l'applique
 * comme propriété CSS `--accent` sur `document.documentElement`.
 *
 * Requiert `preserveDrawingBuffer: true` sur le renderer WebGL, sinon retourne null.
 * @returns {{ r, g, b, hex } | null}
 */
export function accentFromShader() {
  const canvas = state.gl?.renderer?.domElement
    || document.querySelector('canvas');
  if (!canvas) return null;

  try {
    const S = 64;
    const tmp = document.createElement('canvas');
    tmp.width = S; tmp.height = S;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(canvas, 0, 0, S, S);
    const pix = ctx.getImageData(0, 0, S, S).data;

    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < pix.length; i += 4) {
      if (pix[i] + pix[i + 1] + pix[i + 2] > 24) {
        r += pix[i]; g += pix[i + 1]; b += pix[i + 2]; n++;
      }
    }
    if (n === 0) return null;

    r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    document.documentElement.style.setProperty('--accent', hex);
    return { r, g, b, hex };
  } catch (e) {
    console.warn('[accentFromShader]', e);
    return null;
  }
}
