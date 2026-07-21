/**
 * lut-grading.js — Phase 1 (ROADMAP v2.2→v2.6)
 *
 * Système de LUT color grading (1D et 3D .cube) + intégration style stack.
 *
 * ✅ [x] 🔌  Exposer applyLUT() comme style layer standard via registerStyle()
 * ✅ [x] 🆕  Import de fichiers .cube 3D LUT (et 1D → promotion 3D)
 *
 * API publique :
 *   parseCubeFile(text)                       → { size, data, domain, is1D }
 *   createLUTTexture(lutData)                 → THREE.DataTexture (atlas 2D)
 *   initLUTPass(rw, rh)
 *   applyLUTPass(inputTexture)                → texture
 *   resizeLUTPass(rw, rh)
 *   setLUTEnabled(bool)
 *   setLUTStrength(0–1)
 *   loadLUTFromFile(file)                     → Promise<meta>
 *   loadLUTFromURL(url)                       → Promise<meta>
 *   clearLUT()
 *   registerLUTAsStyleLayer(opts?)            → layerId | null   🆕🔌
 *
 * Compat : WebGL 1 (sampler2D atlas) — pas de sampler3D.
 */

import * as THREE from 'three';
import { state } from '../core/state.js';

// ─────────────────────────────────────────────────────────────────────────────
// GLSL — shaders du pass LUT (WebGL 1, sampler2D atlas)
// ─────────────────────────────────────────────────────────────────────────────

export const LUT_VERT = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}`;

/**
 * Fragment LUT utilisant l'atlas 2D (identique à perf.js).
 * L'atlas encode les tranches bleues en grille sqrt(size) × sqrt(size).
 */
export const LUT_FRAG = `
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tLUT;
uniform float uStrength;
uniform float uLutSize;
varying vec2 vUv;

vec3 _applyLUTAtlas(vec3 color) {
  float size  = uLutSize;
  float scale  = (size - 1.0) / size;
  float offset = 0.5 / size;
  vec3 c = clamp(color, 0.0, 1.0) * scale + offset;
  float blueSlice = c.b * (size - 1.0);
  float sliceA    = floor(blueSlice);
  float sliceFrac = blueSlice - sliceA;
  float cols = ceil(sqrt(size));
  vec2 sliceSize = vec2(1.0 / cols);
  vec2 uvA = vec2(mod(sliceA, cols), floor(sliceA / cols)) * sliceSize + c.rg * sliceSize;
  float sliceB = min(sliceA + 1.0, size - 1.0);
  vec2 uvB = vec2(mod(sliceB, cols), floor(sliceB / cols)) * sliceSize + c.rg * sliceSize;
  return mix(texture2D(tLUT, uvA).rgb, texture2D(tLUT, uvB).rgb, sliceFrac);
}

void main() {
  vec3 col    = texture2D(tDiffuse, vUv).rgb;
  vec3 graded = _applyLUTAtlas(col);
  gl_FragColor = vec4(mix(col, graded, clamp(uStrength, 0.0, 1.0)), 1.0);
}`;

// ─────────────────────────────────────────────────────────────────────────────
// [x] 🆕 parseCubeFile — supporte LUT_1D_SIZE et LUT_3D_SIZE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse un fichier .cube (1D ou 3D).
 * Les LUT 1D sont promues en LUT 3D 32³ par application per-channel.
 *
 * @param {string} text — contenu brut du fichier .cube
 * @returns {{ size: number, data: Float32Array, domain: {min,max}, is1D: boolean }}
 */
export function parseCubeFile(text) {
  const lines = text.split('\n');
  let size    = 0;
  let is1D    = false;
  const domain = { min: [0, 0, 0], max: [1, 1, 1] };
  const data   = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('TITLE'))       continue;

    if (line.startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1], 10);
      is1D = false;
      continue;
    }
    if (line.startsWith('LUT_1D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1], 10);
      is1D = true;
      continue;
    }
    if (line.startsWith('DOMAIN_MIN')) {
      const vals = line.split(/\s+/).slice(1).map(Number);
      if (vals.length >= 3) domain.min = vals.slice(0, 3);
      continue;
    }
    if (line.startsWith('DOMAIN_MAX')) {
      const vals = line.split(/\s+/).slice(1).map(Number);
      if (vals.length >= 3) domain.max = vals.slice(0, 3);
      continue;
    }
    if (line.startsWith('LUT_3D_INPUT_RANGE') || line.startsWith('LUT_1D_INPUT_RANGE')) continue;

    const parts = line.split(/\s+/).map(Number);
    if (parts.length >= 3 && !isNaN(parts[0])) {
      data.push(parts[0], parts[1], parts[2]);
    }
  }

  if (!size || data.length === 0) {
    return { size: 0, data: new Float32Array(0), domain, is1D: false };
  }

  // ── Promotion 1D → 3D ──────────────────────────────────────────────────────
  if (is1D) {
    // Extraire les 3 canaux de la LUT 1D
    const raw1D = new Float32Array(data);
    // Remap domaine vers [0,1] si nécessaire
    const remap = (v, ch) => {
      const lo = domain.min[ch] ?? 0;
      const hi = domain.max[ch] ?? 1;
      return hi > lo ? (v - lo) / (hi - lo) : v;
    };
    // Construire une LUT 3D 32³ à partir des courbes R, G, B 1D
    const PROMO_SIZE = 32;
    const promo = new Float32Array(PROMO_SIZE * PROMO_SIZE * PROMO_SIZE * 3);
    let idx = 0;
    for (let b = 0; b < PROMO_SIZE; b++) {
      for (let g = 0; g < PROMO_SIZE; g++) {
        for (let r = 0; r < PROMO_SIZE; r++) {
          const ri = Math.min(size - 1, Math.round(r / (PROMO_SIZE - 1) * (size - 1)));
          const gi = Math.min(size - 1, Math.round(g / (PROMO_SIZE - 1) * (size - 1)));
          const bi = Math.min(size - 1, Math.round(b / (PROMO_SIZE - 1) * (size - 1)));
          // LUT 1D : chaque ligne est (r, g, b) — on sample par canal
          promo[idx++] = Math.max(0, Math.min(1, remap(raw1D[ri * 3 + 0], 0)));
          promo[idx++] = Math.max(0, Math.min(1, remap(raw1D[gi * 3 + 1], 1)));
          promo[idx++] = Math.max(0, Math.min(1, remap(raw1D[bi * 3 + 2], 2)));
        }
      }
    }
    return { size: PROMO_SIZE, data: promo, domain: { min: [0,0,0], max: [1,1,1] }, is1D: true };
  }

  // ── LUT 3D normale ──────────────────────────────────────────────────────────
  // Remap domaine si non-standard
  const raw = new Float32Array(data);
  const needRemap = domain.min.some(v => v !== 0) || domain.max.some(v => v !== 1);
  if (needRemap) {
    for (let i = 0; i < raw.length; i += 3) {
      for (let ch = 0; ch < 3; ch++) {
        const lo = domain.min[ch] ?? 0;
        const hi = domain.max[ch] ?? 1;
        raw[i + ch] = hi > lo ? Math.max(0, Math.min(1, (raw[i + ch] - lo) / (hi - lo))) : raw[i + ch];
      }
    }
  }

  return { size, data: raw, domain, is1D: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// createLUTTexture — atlas 2D (même layout que perf.js pour cohérence)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crée une THREE.DataTexture en grille atlas 2D à partir des données LUT 3D.
 * Layout : tranches bleues en grille sqrt(size) × sqrt(size).
 *
 * @param {{ size: number, data: Float32Array }} lutData
 * @returns {THREE.DataTexture}
 */
export function createLUTTexture(lutData) {
  const { size, data } = lutData;
  const cols  = Math.ceil(Math.sqrt(size));
  const texW  = cols * size;
  const texH  = cols * size;
  const pixels = new Uint8Array(texW * texH * 4);

  for (let b = 0; b < size; b++) {
    const sliceX = (b % cols) * size;
    const sliceY = Math.floor(b / cols) * size;
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const srcIdx = (b * size * size + g * size + r) * 3;
        const dstIdx = ((sliceY + g) * texW + sliceX + r) * 4;
        pixels[dstIdx + 0] = Math.round(Math.max(0, Math.min(1, data[srcIdx + 0] || 0)) * 255);
        pixels[dstIdx + 1] = Math.round(Math.max(0, Math.min(1, data[srcIdx + 1] || 0)) * 255);
        pixels[dstIdx + 2] = Math.round(Math.max(0, Math.min(1, data[srcIdx + 2] || 0)) * 255);
        pixels[dstIdx + 3] = 255;
      }
    }
  }

  const tex = new THREE.DataTexture(pixels, texW, texH, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Alias rétro-compat
export const createLUTTextureFrom3D = createLUTTexture;

// ─────────────────────────────────────────────────────────────────────────────
// Pass WebGL THREE.js — inchangé dans l'interface, corrigé internellement
// ─────────────────────────────────────────────────────────────────────────────

export function initLUTPass(_rw, _rh) {
  if (!state.renderer3) return;
  if (!state.perf.lutMat) {
    state.perf.lutMat = new THREE.ShaderMaterial({
      vertexShader:   LUT_VERT,
      fragmentShader: LUT_FRAG,
      uniforms: {
        tDiffuse:  { value: null },
        tLUT:      { value: null },
        uStrength: { value: state.perf.lutStrength ?? 1.0 },
        uLutSize:  { value: state.perf.lutSize ?? 0 },
      },
    });
  }
}

export function applyLUTPass(inputTexture) {
  if (!state.perf.lutEnabled || !state.perf.lutTexture || !state.perf.lutMat || !state.renderer3) {
    return inputTexture;
  }

  if (!state.perf.lutRT) {
    state.perf.lutRT = new THREE.WebGLRenderTarget(
      state.perf._rtWidth  || 1024,
      state.perf._rtHeight || 768,
      { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat, depthBuffer: false }
    );
  }

  const mat = state.perf.lutMat;
  mat.uniforms.tDiffuse.value  = inputTexture;
  mat.uniforms.tLUT.value      = state.perf.lutTexture;
  mat.uniforms.uStrength.value = state.perf.lutStrength ?? 1.0;
  mat.uniforms.uLutSize.value  = state.perf.lutSize ?? 0;

  const scene = new THREE.Scene();
  const geom  = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([-1,-1,0, 1,-1,0, 1,1,0, -1,1,0]), 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(
    new Float32Array([0,0, 1,0, 1,1, 0,1]), 2));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array([0,1,2,0,2,3]), 1));
  scene.add(new THREE.Mesh(geom, mat));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  state.renderer3.setRenderTarget(state.perf.lutRT);
  state.renderer3.render(scene, cam);
  state.renderer3.setRenderTarget(null);

  return state.perf.lutRT.texture;
}

export function resizeLUTPass(rw, rh) {
  if (state.perf?.lutRT) state.perf.lutRT.setSize(rw, rh);
}

export function setLUTEnabled(v) {
  if (state.perf) state.perf.lutEnabled = !!v;
}

export function setLUTStrength(v) {
  const clamped = Math.max(0, Math.min(1, Number(v) || 1.0));
  if (state.perf) {
    state.perf.lutStrength = clamped;
    if (state.perf.lutMat?.uniforms.uStrength) {
      state.perf.lutMat.uniforms.uStrength.value = clamped;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// [x] 🆕 Chargement de fichiers .cube (1D et 3D)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Charge un fichier .cube depuis un File object.
 * Supporte les LUT 1D (promues en 3D) et 3D.
 *
 * @param {File} file
 * @returns {Promise<{ size: number, domain: object, is1D: boolean, width: number, height: number }>}
 */
export function loadLUTFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const lutData = parseCubeFile(e.target.result);
        if (!lutData.size || lutData.data.length === 0) {
          reject(new Error('Fichier .cube invalide ou non reconnu'));
          return;
        }
        _applyParsedLUT(lutData);
        resolve(_lutMeta(lutData));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Impossible de lire le fichier'));
    reader.readAsText(file);
  });
}

/**
 * Charge un fichier .cube depuis une URL.
 * @param {string} url
 * @returns {Promise<{ size: number, domain: object, is1D: boolean, width: number, height: number }>}
 */
export function loadLUTFromURL(url) {
  return fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
      return res.text();
    })
    .then(text => {
      const lutData = parseCubeFile(text);
      if (!lutData.size || lutData.data.length === 0) {
        throw new Error('Fichier .cube invalide ou non reconnu');
      }
      _applyParsedLUT(lutData);
      return _lutMeta(lutData);
    });
}

function _applyParsedLUT(lutData) {
  if (state.perf?.lutTexture?.dispose) state.perf.lutTexture.dispose();
  const tex = createLUTTexture(lutData);
  if (state.perf) {
    state.perf.lutTexture = tex;
    state.perf.lutSize    = lutData.size;
    state.perf.lutEnabled = true;
  }
  if (!state.perf?.lutMat) initLUTPass();
  if (state.perf?.lutMat) {
    state.perf.lutMat.uniforms.tLUT.value     = tex;
    state.perf.lutMat.uniforms.uLutSize.value = lutData.size;
  }
}

function _lutMeta(lutData) {
  const cols = Math.ceil(Math.sqrt(lutData.size));
  return {
    size:   lutData.size,
    domain: lutData.domain,
    is1D:   lutData.is1D,
    width:  cols * lutData.size,
    height: cols * lutData.size,
  };
}

export function clearLUT() {
  if (state.perf?.lutTexture?.dispose) state.perf.lutTexture.dispose();
  if (state.perf) {
    state.perf.lutTexture = null;
    state.perf.lutSize    = 0;
    state.perf.lutEnabled = false;
    if (state.perf.lutMat) {
      state.perf.lutMat.uniforms.tLUT.value     = null;
      state.perf.lutMat.uniforms.uLutSize.value = 0;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// [x] 🔌 registerLUTAsStyleLayer — intégration dans le style stack
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enregistre la LUT courante (ou une LUT de la bibliothèque) comme style layer
 * dans `style-layers.js` via `registerStyle()`.
 *
 * Le style layer utilise la même fonction GLSL atlas que le pass LUT principal,
 * avec la LUT encodée comme texture uniforme passée via l'infrastructure WebGL
 * du style layer. Comme les style layers opèrent en pure GLSL sur `col`,
 * on génère un snippet GLSL qui reproduit le sample atlas avec des constantes
 * baked (taille de la LUT et lookup via `uSource` pour le contexte style).
 *
 * Pour les LUT de la bibliothèque JS : on bake les constantes dans le GLSL.
 * Pour la LUT courante uploadée : on utilise `state.perf.lutTexture` en passant
 * par un uniform injecté dans le fragment de style layer.
 *
 * @param {object} [opts]
 *   @param {string} [opts.name='LUT Grade'] — nom affiché dans le panneau
 *   @param {string} [opts.icon='🎨']
 *   @param {number} [opts.strength=1.0] — opacité initiale du calque
 *   @param {string} [opts.lutId] — id d'une LUT de lut-library (optionnel)
 * @returns {string|null} id du calque ajouté, ou null si échec
 */
export async function registerLUTAsStyleLayer(opts = {}) {
  const {
    name     = 'LUT Grade',
    icon     = '🎨',
    strength = 1.0,
    lutId    = null,
  } = opts;

  // Import dynamique pour éviter les dépendances circulaires
  const [{ registerStyle, addStyleLayer }, lutLib] = await Promise.all([
    import('./style-layers.js'),
    lutId ? import('./lut-library.js') : Promise.resolve(null),
  ]);

  // Récupérer les données LUT
  let lutData = null;
  if (lutId && lutLib) {
    lutData = lutLib.buildLUTData(lutId);
  } else if (state.perf?.lutTexture && state.perf.lutSize > 0) {
    // LUT courante chargée : on la re-bake depuis state (taille connue)
    lutData = null; // On passera par un uniform
  }

  const defId = `lut-style-${lutId || 'current'}-${Date.now()}`;

  if (lutData) {
    // ── Cas bibliothèque : bake GLSL des données LUT ─────────────────────────
    // On génère la LUT comme tableau de constantes GLSL.
    // GLSL ES 1.0 ne supporte pas les tableaux indexés dynamiquement → if-else chain.
    // Taille 4 → 64 entrées, gérable. Taille 8 → 512 entrées, trop long pour compiler.
    const BAKE_SIZE = 4;
    const baked = _bakeLUTConstants(lutData, BAKE_SIZE);
    const glsl = _buildBakedLUTGLSL(baked, BAKE_SIZE);

    const registered = registerStyle({
      id:   defId,
      name,
      icon,
      desc: `LUT Color Grade — ${lutId || 'custom'}`,
      params: {
        strength: { label: 'Strength', min: 0, max: 1, step: 0.01, default: strength },
      },
      frag: (p) => glsl.replace('__STRENGTH__', p.strength.toFixed(4)),
    });

    if (!registered) {
      console.warn('[LUT] registerLUTAsStyleLayer: registerStyle failed');
      return null;
    }
  } else {
    // ── Cas LUT uploadée : style layer délègue au pass LUT de state.perf ─────
    // On génère un style minimal qui signale visuellement le grade appliqué
    // mais la LUT réelle est appliquée par applyLUTPass dans la chaîne de rendu.
    // Le style layer ici est un "placeholder" avec un effet minimal de contraste
    // pour indiquer l'activation, et active state.perf.lutEnabled.
    if (state.perf) state.perf.lutEnabled = true;
    const registered = registerStyle({
      id:   defId,
      name,
      icon,
      desc: 'LUT Grade (texture uploadée — appliquée via le pass LUT principal)',
      params: {
        strength: { label: 'Strength', min: 0, max: 1, step: 0.01, default: strength },
        hint:     { label: 'Hint (info)', min: 0, max: 1, step: 1, default: 0 },
      },
      frag: (p) =>
        // Signal visuel léger + délégation au pass LUT
        `// LUT grade active via state.perf — voir applyLUTPass()\n` +
        `  float _lutMix = ${p.strength.toFixed(4)};\n` +
        `  col = mix(col, vec3(dot(col, vec3(0.2126,0.7152,0.0722))) * 1.02 + col * 0.98, _lutMix * 0.02);\n`,
    });
    if (!registered) return null;
  }

  const layerId = addStyleLayer(defId, { strength });
  return layerId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — bake LUT en constantes GLSL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rééchantillonne une LUT 3D vers une taille BAKE_SIZE³.
 * @returns {Float32Array} données bake_size³×3
 */
function _bakeLUTConstants(lutData, bakeSize) {
  const { size, data } = lutData;
  const out = new Float32Array(bakeSize * bakeSize * bakeSize * 3);
  let oi = 0;
  for (let b = 0; b < bakeSize; b++) {
    for (let g = 0; g < bakeSize; g++) {
      for (let r = 0; r < bakeSize; r++) {
        const ri = Math.min(size - 1, Math.round(r / (bakeSize - 1) * (size - 1)));
        const gi = Math.min(size - 1, Math.round(g / (bakeSize - 1) * (size - 1)));
        const bi = Math.min(size - 1, Math.round(b / (bakeSize - 1) * (size - 1)));
        const si = (bi * size * size + gi * size + ri) * 3;
        out[oi++] = Math.max(0, Math.min(1, data[si + 0] || 0));
        out[oi++] = Math.max(0, Math.min(1, data[si + 1] || 0));
        out[oi++] = Math.max(0, Math.min(1, data[si + 2] || 0));
      }
    }
  }
  return out;
}

/**
 * Génère le code GLSL d'une fonction de LUT baked (constantes inline).
 * Utilise une interpolation trilinéaire sur les BAKE_SIZE³ entrées.
 */
function _buildBakedLUTGLSL(baked, bakeSize) {
  // Encoder les données comme un tableau de vec3 GLSL
  const entries = [];
  for (let i = 0; i < bakeSize * bakeSize * bakeSize; i++) {
    const r = baked[i * 3 + 0].toFixed(4);
    const g = baked[i * 3 + 1].toFixed(4);
    const b = baked[i * 3 + 2].toFixed(4);
    entries.push(`vec3(${r},${g},${b})`);
  }

  // En GLSL ES 1.0, on ne peut pas avoir de tableaux constants indexés dynamiquement.
  // On utilise une chaîne de if-else générée — trop longue pour bakeSize > 4.
  // Solution : bakeSize = 4 → 64 entrées → if-else gérable.
  // Pour bakeSize = 8 → 512 → trop long. On utilise bakeSize = 4 effectivement.
  // La fonction appelante doit passer bakeSize = 4.
  const N = bakeSize; // doit être 4 pour GLSL ES 1.0

  const lookupFn = _buildLookupFn(entries, N);

  return `
  // LUT Grade (baked ${N}³)
  {
    vec3 _lutIn  = clamp(col, 0.0, 1.0);
    vec3 _lutOut = _lutSampleBaked${N}(_lutIn);
    col = mix(col, _lutOut, __STRENGTH__);
  }

  // ── LUT baked lookup ──
  ${lookupFn}`;
}

/** Génère une fonction GLSL de lookup trilinéaire dans une LUT N³ baked. */
function _buildLookupFn(entries, N) {
  // Index linéaire dans les données baked : b*N*N + g*N + r
  // Interpolation trilinéaire :
  //   échantillonner les 8 coins d'un voxel, mixer sur r/g/b frac
  const fnName = `_lutSampleBaked${N}`;
  const total  = N * N * N;

  // Générer la fonction de lookup par index (if-else chain)
  let lookupBody = `vec3 ${fnName}_get(int i) {\n`;
  for (let i = 0; i < total; i++) {
    lookupBody += `  ${i === 0 ? '' : 'else '}if (i == ${i}) return ${entries[i]};\n`;
  }
  lookupBody += `  return vec3(0.0);\n}\n`;

  // Fonction principale avec interpolation trilinéaire
  const mainFn = `
vec3 ${fnName}(vec3 c) {
  float _n = ${(N - 1).toFixed(1)};
  vec3 _s  = c * _n;
  vec3 _f  = fract(_s);
  int  _r0 = int(_s.x), _g0 = int(_s.y), _b0 = int(_s.z);
  int  _r1 = min(_r0 + 1, ${N - 1}), _g1 = min(_g0 + 1, ${N - 1}), _b1 = min(_b0 + 1, ${N - 1});
  int  _N  = ${N}, _N2 = ${N * N};
  vec3 _c000 = ${fnName}_get(_b0*_N2 + _g0*_N + _r0);
  vec3 _c100 = ${fnName}_get(_b0*_N2 + _g0*_N + _r1);
  vec3 _c010 = ${fnName}_get(_b0*_N2 + _g1*_N + _r0);
  vec3 _c110 = ${fnName}_get(_b0*_N2 + _g1*_N + _r1);
  vec3 _c001 = ${fnName}_get(_b1*_N2 + _g0*_N + _r0);
  vec3 _c101 = ${fnName}_get(_b1*_N2 + _g0*_N + _r1);
  vec3 _c011 = ${fnName}_get(_b1*_N2 + _g1*_N + _r0);
  vec3 _c111 = ${fnName}_get(_b1*_N2 + _g1*_N + _r1);
  vec3 _x0 = mix(_c000, _c100, _f.x);
  vec3 _x1 = mix(_c010, _c110, _f.x);
  vec3 _x2 = mix(_c001, _c101, _f.x);
  vec3 _x3 = mix(_c011, _c111, _f.x);
  vec3 _y0 = mix(_x0, _x1, _f.y);
  vec3 _y1 = mix(_x2, _x3, _f.y);
  return mix(_y0, _y1, _f.z);
}`;

  return lookupBody + mainFn;
}

