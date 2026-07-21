/**
 * uv-warp.js — F-4.1 (Axe 4)
 *
 * Génère et gère les transformations UV à injecter dans le shader courant.
 * 8 types de warps, empilables et ordonnables.
 *
 * API publique :
 *   UV_WARP_TYPES              — définitions des 8 types
 *   addWarp(type, params)      → id
 *   removeWarp(id)
 *   moveWarp(id, delta)        — déplacer dans la pile (+1 / -1)
 *   setWarpParam(id, key, val)
 *   setWarpEnabled(id, bool)
 *   getWarps()                 → [...warp objects]
 *   buildWarpGLSL()            → { funcBlock, callLine }
 *   serializeWarps()           → []
 *   loadWarps(arr)
 */

// ── Définitions des types ─────────────────────────────────────────────────────

export const UV_WARP_TYPES = [
  {
    id: 'symmetry',
    name: 'Symmetry',
    icon: '⇌',
    desc: 'Radial symmetry / kaleidoscope',
    params: {
      axis:   { label: 'Axis (0=X 1=Y 2=XY)', min: 0, max: 2, step: 1, default: 0 },
      folds:  { label: 'Symmetry count', min: 1, max: 16, step: 1, default: 2 },
    },
    glsl: ({ axis, folds }) => {
      const lines = [];
      if (axis === 0 || axis === 2) lines.push('uv.x = abs(uv.x);');
      if (axis === 1 || axis === 2) lines.push('uv.y = abs(uv.y);');
      if (folds > 1) lines.push(`{
    float _a = atan(uv.y, uv.x);
    float _r = length(uv);
    float _seg = ${(Math.PI * 2 / folds).toFixed(6)};
    _a = mod(_a, _seg);
    if (_a > _seg * 0.5) _a = _seg - _a;
    uv = _r * vec2(cos(_a), sin(_a));
  }`);
      return lines.join('\n  ');
    },
  },
  {
    id: 'polar',
    name: 'Polar',
    icon: '◎',
    desc: 'Polar coordinates → cartesian',
    params: {
      radius: { label: 'Rayon', min: 0.1, max: 4.0, step: 0.01, default: 1.0 },
    },
    glsl: ({ radius }) =>
      `uv = vec2(length(uv) / ${radius.toFixed(4)}, atan(uv.y, uv.x) / 6.28318);`,
  },
  {
    id: 'twist',
    name: 'Twist',
    icon: '⤢',
    desc: 'Rotation proportional to distance',
    params: {
      strength: { label: 'Strength', min: -8.0, max: 8.0, step: 0.01, default: 1.0 },
    },
    glsl: ({ strength }) =>
      `{ float _tw = length(uv) * ${strength.toFixed(4)}; float _c = cos(_tw), _s = sin(_tw); uv = mat2(_c,-_s,_s,_c) * uv; }`,
  },
  {
    id: 'fold',
    name: 'Fold',
    icon: '⤓',
    desc: 'Fold UVs on an axis',
    params: {
      axis:  { label: 'Axis (0=X 1=Y)', min: 0, max: 1, step: 1, default: 1 },
      pivot: { label: 'Pivot', min: 0.0, max: 1.0, step: 0.01, default: 0.5 },
    },
    glsl: ({ axis, pivot }) => axis === 0
      ? `uv.x = abs(uv.x - ${pivot.toFixed(4)}) + ${pivot.toFixed(4)};`
      : `uv.y = abs(uv.y - ${pivot.toFixed(4)}) + ${pivot.toFixed(4)};`,
  },
  {
    id: 'zoom',
    name: 'Zoom/Pan',
    icon: '⊞',
    desc: 'Centered zoom + offset',
    params: {
      scale:  { label: 'Scale', min: 0.1, max: 5.0, step: 0.01, default: 1.0 },
      cx:     { label: 'Centre X', min: -1.0, max: 1.0, step: 0.01, default: 0.0 },
      cy:     { label: 'Centre Y', min: -1.0, max: 1.0, step: 0.01, default: 0.0 },
    },
    glsl: ({ scale, cx, cy }) =>
      `uv = (uv - vec2(${cx.toFixed(4)}, ${cy.toFixed(4)})) * ${(1 / scale).toFixed(6)} + vec2(${cx.toFixed(4)}, ${cy.toFixed(4)});`,
  },
  {
    id: 'fisheye',
    name: 'Fisheye',
    icon: '◉',
    desc: 'Barrel or pincushion distortion',
    params: {
      k: { label: 'Strength (-=barrel +=pincushion)', min: -1.5, max: 1.5, step: 0.01, default: 0.3 },
    },
    glsl: ({ k }) =>
      `uv = uv * (1.0 + ${k.toFixed(4)} * dot(uv, uv));`,
  },
  {
    id: 'tile',
    name: 'Tile',
    icon: '⊞',
    desc: 'N×M grid repetition',
    params: {
      nx: { label: 'Columns', min: 1, max: 16, step: 1, default: 2 },
      ny: { label: 'Rows',    min: 1, max: 16, step: 1, default: 2 },
    },
    glsl: ({ nx, ny }) =>
      `uv = fract(uv * vec2(${nx.toFixed(1)}, ${ny.toFixed(1)}));`,
  },
  {
    id: 'domainwarp',
    name: 'Domain Warp',
    icon: '〜',
    desc: 'Double-pass FBM distortion',
    params: {
      amp:   { label: 'Amplitude', min: 0.0, max: 2.0, step: 0.01, default: 0.3 },
      freq:  { label: 'Frequency', min: 0.5, max: 8.0, step: 0.1,  default: 2.0 },
      oct:   { label: 'Octaves',   min: 1,   max: 6,   step: 1,    default: 3   },
    },
    glsl: ({ amp, freq, oct }) => `{
    vec2 _q = vec2(0.0);
    float _f = ${freq.toFixed(4)}, _a = ${amp.toFixed(4)}, _t = 0.0;
    for (int _i = 0; _i < ${oct}; _i++) {
      float _x = sin(uv.x * _f + uv.y * _f * 1.3 + iTime * 0.2);
      float _y = cos(uv.x * _f * 0.9 - uv.y * _f + iTime * 0.15);
      _q += vec2(_x, _y) * _a;
      _f *= 2.0; _a *= 0.5;
    }
    uv += _q;
  }`,
  },
  {
    id: 'cameraShake',
    name: 'Camera Shake',
    icon: '〰',
    desc: 'Décalage XY bruité synchronisé avec iTime',
    params: {
      amp:  { label: 'Amplitude',  min: 0.0, max: 0.05, step: 0.001, default: 0.008 },
      freq: { label: 'Fréquence',  min: 0.5, max: 30.0, step: 0.5,   default: 8.0  },
      seed: { label: 'Graine',     min: 0.0, max: 99.0, step: 1.0,   default: 0.0  },
    },
    glsl: ({ amp, freq, seed }) => `{
    float _nt = iTime * ${freq.toFixed(4)};
    float _sx = sin(_nt * 1.31 + ${seed.toFixed(1)}) * cos(_nt * 0.71 + ${(seed * 0.43 + 1.1).toFixed(2)});
    float _sy = cos(_nt * 1.73 + ${(seed * 0.17 + 2.3).toFixed(2)}) * sin(_nt * 0.93 + ${(seed * 0.63 + 0.7).toFixed(2)});
    uv += vec2(_sx, _sy) * ${amp.toFixed(5)};
  }`,
  },
  {
    id: 'dollyZoom',
    name: 'Dolly Zoom',
    icon: '⊙',
    desc: 'Zoom optique + recul simultané — effet Vertigo',
    params: {
      focal: { label: 'Focale (>1=zoom <1=wide)', min: 0.1, max: 3.0, step: 0.01, default: 0.7  },
      anim:  { label: 'Amplitude animée (0=fixe)',  min: 0.0, max: 0.5, step: 0.01, default: 0.0  },
      speed: { label: 'Vitesse animation',           min: 0.1, max: 4.0, step: 0.1,  default: 0.5  },
    },
    glsl: ({ focal, anim, speed }) => `{
    float _f = clamp(${focal.toFixed(4)} + sin(iTime * ${speed.toFixed(4)}) * ${anim.toFixed(4)}, 0.05, 10.0);
    uv = vec2(0.5) + (uv - vec2(0.5)) / _f;
  }`,
  },
];

// ── État interne ───────────────────────────────────────────────────────────────

const _warps = [];
let _nextId = 1;

function _typeById(typeId) {
  return UV_WARP_TYPES.find(t => t.id === typeId);
}

// ── API publique ───────────────────────────────────────────────────────────────

export function addWarp(typeId, params = {}) {
  const def = _typeById(typeId);
  if (!def) return null;
  const defaults = Object.fromEntries(Object.entries(def.params).map(([k, v]) => [k, v.default]));
  const id = 'warp_' + (_nextId++);
  _warps.push({ id, typeId, enabled: true, params: { ...defaults, ...params } });
  return id;
}

export function removeWarp(id) {
  const i = _warps.findIndex(w => w.id === id);
  if (i >= 0) _warps.splice(i, 1);
}

export function moveWarp(id, delta) {
  const i = _warps.findIndex(w => w.id === id);
  if (i < 0) return;
  const j = i + delta;
  if (j < 0 || j >= _warps.length) return;
  [_warps[i], _warps[j]] = [_warps[j], _warps[i]];
}

export function setWarpParam(id, key, val) {
  const w = _warps.find(w => w.id === id);
  if (w) w.params[key] = val;
}

export function setWarpEnabled(id, enabled) {
  const w = _warps.find(w => w.id === id);
  if (w) w.enabled = enabled;
}

export function getWarps() {
  return [..._warps];
}

/**
 * buildWarpGLSL()
 * Retourne { funcBlock, callLine } à injecter dans le shader.
 *
 * funcBlock : définition de la fonction `vec2 applyWarps(vec2 uv)`
 * callLine  : `uv = applyWarps(uv);`
 */
export function buildWarpGLSL() {
  const active = _warps.filter(w => w.enabled);
  if (active.length === 0) return null;

  const body = active.map(w => {
    const def = _typeById(w.typeId);
    if (!def) return '';
    const snippet = def.glsl(w.params);
    return `  // ${def.name}\n  ${snippet.replace(/\n/g, '\n  ')}`;
  }).join('\n');

  const funcBlock =
`vec2 applyWarps(vec2 uv) {
${body}
  return uv;
}`;

  const callLine = 'uv = applyWarps(uv);';
  return { funcBlock, callLine };
}

export function serializeWarps() {
  return _warps.map(w => ({ ...w, params: { ...w.params } }));
}

export function loadWarps(arr) {
  _warps.length = 0;
  for (const w of arr || []) {
    _warps.push({ ...w, params: { ...w.params } });
    const num = parseInt(w.id.replace('warp_', ''), 10);
    if (!isNaN(num) && num >= _nextId) _nextId = num + 1;
  }
}
