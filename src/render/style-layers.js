/**
 * style-layers.js — F-4.2 (Axe 4) — v2.2.0
 *
 * Système de calques de style visuels post-process.
 * Chaque style = fragment GLSL compilé séparément et appliqué dans l'ordre.
 *
 * API publique :
 *   STYLE_DEFINITIONS              — définitions des styles built-in
 *   registerStyle(def)             — 🆕 enregistrer un style personnalisé
 *   buildStyleGLSL(layers?)        — 🆕 exporter le pipeline en snippet GLSL
 *   initStyleLayers(gl)
 *   applyStyleLayers(gl, srcTex, outputFBO, w, h)
 *   destroyStyleLayers(gl)
 *   addStyleLayer(typeId, params)       → id
 *   removeStyleLayer(id)
 *   moveStyleLayer(id, delta)
 *   setStyleLayerParam(id, k, v)
 *   setStyleLayerEnabled(id, bool)
 *   setStyleLayerOpacity(id, v)
 *   setStyleLayerBlendMode(id, mode)   — 🆕 blend mode par calque
 *   setStyleLayerAnimation(id, cfg)    — 🆕 animation iTime sur opacity / params
 *   getStyleLayers()
 *   serializeStyleLayers()
 *   loadStyleLayers(arr)
 *
 * Blend modes : 'normal' | 'add' | 'multiply' | 'screen' | 'overlay'
 * Animation cfg : { target: 'opacity'|paramKey, fn: 'sin'|'cos'|'tri', speed, amp, offset }
 */

// ── Blend mode GLSL helpers ───────────────────────────────────────────────────

const BLEND_GLSL = {
  normal:   (src, dst) => `${src}`,
  add:      (src, dst) => `clamp(${dst} + ${src}, 0.0, 1.0)`,
  multiply: (src, dst) => `${dst} * ${src}`,
  screen:   (src, dst) => `1.0 - (1.0 - ${dst}) * (1.0 - ${src})`,
  overlay:  (src, dst) =>
    `mix(2.0*${dst}*${src}, 1.0-2.0*(1.0-${dst})*(1.0-${src}), step(0.5, dot(${dst},vec3(0.333))))`,
};

// ── Définitions des styles built-in ──────────────────────────────────────────

export const STYLE_DEFINITIONS = [
  {
    id: 'pixelart',
    name: 'Pixel Art',
    icon: '⊞',
    desc: 'UV quantization + color reduction',
    params: {
      size:    { label: 'Pixel size', min: 1, max: 32, step: 1, default: 4 },
      colors:  { label: 'Color count', min: 2, max: 32, step: 1, default: 8 },
    },
    frag: (p) => `
  vec2 uvQ = floor(uv * iResolution.xy / ${p.size}.0) * ${p.size}.0 / iResolution.xy;
  col = texture2D(uSource, uvQ).rgb;
  float n = ${p.colors}.0 - 1.0;
  col = floor(col * n + 0.5) / n;`,
  },
  {
    id: 'halftone',
    name: 'Halftone',
    icon: '◉',
    desc: 'Ben-Day dots in grayscale',
    params: {
      freq:  { label: 'Frequency', min: 4, max: 80, step: 1,    default: 20 },
      angle: { label: 'Angle (°)', min: 0, max: 90, step: 1,    default: 45 },
      color: { label: 'Color (0=gray 1=RGB)', min: 0, max: 1, step: 1, default: 0 },
    },
    frag: (p) => {
      const ang = (p.angle * Math.PI / 180).toFixed(5);
      return `
  float _ang = ${ang};
  mat2 _rot = mat2(cos(_ang), -sin(_ang), sin(_ang), cos(_ang));
  vec2 _huvQ = _rot * uv * ${p.freq}.0;
  vec2 _idx = floor(_huvQ);
  vec2 _frac = fract(_huvQ) - 0.5;
  float _lum = dot(texture2D(uSource, uv).rgb, vec3(0.299, 0.587, 0.114));
  float _dot = step(length(_frac), sqrt(_lum) * 0.5);
  ${p.color === 0 ? 'col = vec3(_dot);' : 'col = col * _dot;'}`;
    },
  },
  {
    id: 'watercolor',
    name: 'Watercolor',
    icon: '≈',
    desc: 'Kuwahara filter + paper',
    params: {
      radius:  { label: 'Radius', min: 1, max: 8, step: 1,    default: 3 },
      wetness: { label: 'Wetness', min: 0, max: 1, step: 0.01, default: 0.5 },
    },
    frag: (p) => `
  // Kuwahara simplifié
  vec3 _m[4]; float _s[4];
  for (int _k = 0; _k < 4; _k++) { _m[_k] = vec3(0); _s[_k] = 0.0; }
  float _r = ${p.radius}.0;
  vec2 _px = 1.0 / iResolution.xy;
  for (float _dy = -_r; _dy <= 0.0; _dy++) for (float _dx = -_r; _dx <= 0.0; _dx++) {
    vec3 _c = texture2D(uSource, uv + vec2(_dx,_dy)*_px).rgb;
    _m[0] += _c; _s[0] += dot(_c,_c);
  }
  for (float _dy = -_r; _dy <= 0.0; _dy++) for (float _dx = 0.0; _dx <= _r; _dx++) {
    vec3 _c = texture2D(uSource, uv + vec2(_dx,_dy)*_px).rgb;
    _m[1] += _c; _s[1] += dot(_c,_c);
  }
  for (float _dy = 0.0; _dy <= _r; _dy++) for (float _dx = -_r; _dx <= 0.0; _dx++) {
    vec3 _c = texture2D(uSource, uv + vec2(_dx,_dy)*_px).rgb;
    _m[2] += _c; _s[2] += dot(_c,_c);
  }
  for (float _dy = 0.0; _dy <= _r; _dy++) for (float _dx = 0.0; _dx <= _r; _dx++) {
    vec3 _c = texture2D(uSource, uv + vec2(_dx,_dy)*_px).rgb;
    _m[3] += _c; _s[3] += dot(_c,_c);
  }
  float _minVar = 1e9; float _n = (_r+1.0)*(_r+1.0);
  for (int _k = 0; _k < 4; _k++) {
    _m[_k] /= _n; _s[_k] = _s[_k]/_n - dot(_m[_k],_m[_k]);
    if (_s[_k] < _minVar) { _minVar = _s[_k]; col = _m[_k]; }
  }
  // Grain papier
  float _grain = fract(sin(dot(uv*100.0, vec2(12.9898,78.233)))*43758.5) * ${(p.wetness * 0.12).toFixed(4)};
  col = clamp(col + _grain - ${(p.wetness * 0.06).toFixed(4)}, 0.0, 1.0);`,
  },
  {
    id: 'engraving',
    name: 'Engraving',
    icon: '≡',
    desc: 'Luminosity-based hatching',
    params: {
      spacing: { label: 'Spacing', min: 1, max: 20, step: 0.5, default: 4 },
      angle:   { label: 'Angle (°)', min: 0, max: 180, step: 1, default: 45 },
      tones:   { label: 'Tones (1=mono 2=cross)', min: 1, max: 2, step: 1, default: 1 },
    },
    frag: (p) => {
      const a1 = (p.angle * Math.PI / 180).toFixed(5);
      const a2 = ((p.angle + 90) * Math.PI / 180).toFixed(5);
      return `
  float _lum = dot(col, vec3(0.299,0.587,0.114));
  float _sp = ${p.spacing}.0;
  vec2 _uv1 = mat2(cos(${a1}),-sin(${a1}),sin(${a1}),cos(${a1})) * uv * iResolution.xy / _sp;
  float _h1 = step(fract(_uv1.y), _lum);
  float _line = _h1;
  ${p.tones === 2 ? `vec2 _uv2 = mat2(cos(${a2}),-sin(${a2}),sin(${a2}),cos(${a2})) * uv * iResolution.xy / _sp;
  float _h2 = step(fract(_uv2.y), max(0.0, _lum * 2.0 - 1.0));
  _line = min(_h1 + _h2, 1.0);` : ''}
  col = vec3(_line);`;
    },
  },
  {
    id: 'neon',
    name: 'Neon / Glow',
    icon: '✦',
    desc: 'Gaussian bloom + HDR overexposure',
    params: {
      radius:    { label: 'Radius', min: 1, max: 16, step: 1,   default: 5 },
      intensity: { label: 'Intensity', min: 0, max: 3, step: 0.05, default: 1.0 },
      threshold: { label: 'Threshold', min: 0, max: 1, step: 0.01, default: 0.6 },
    },
    frag: (p) => `
  vec3 _bloom = vec3(0);
  vec2 _bpx = 1.0 / iResolution.xy;
  float _bsigma = ${(p.radius / 3).toFixed(4)};
  float _bsum = 0.0;
  for (float _by = -${p.radius}.0; _by <= ${p.radius}.0; _by++) {
    for (float _bx = -${p.radius}.0; _bx <= ${p.radius}.0; _bx++) {
      float _bw = exp(-(_bx*_bx+_by*_by)/(2.0*_bsigma*_bsigma));
      vec3 _bc = texture2D(uSource, uv + vec2(_bx,_by)*_bpx).rgb;
      _bc = max(vec3(0), _bc - ${p.threshold.toFixed(4)});
      _bloom += _bc * _bw; _bsum += _bw;
    }
  }
  _bloom /= _bsum;
  col += _bloom * ${p.intensity.toFixed(4)};
  col = col / (col + 1.0);`,
  },
  {
    id: 'oilpaint',
    name: 'Oil Paint',
    icon: '🖌',
    desc: 'Anisotropic Kuwahara + viscosity',
    params: {
      radius:    { label: 'Radius', min: 1, max: 6, step: 1,    default: 3 },
      viscosity: { label: 'Viscosity', min: 0, max: 1, step: 0.01, default: 0.4 },
    },
    frag: (p) => `
  // Kuwahara anisotrope (rayon ${p.radius})
  vec3 _om[4]; float _os[4];
  for (int _k = 0; _k < 4; _k++) { _om[_k] = vec3(0); _os[_k] = 0.0; }
  float _or = ${p.radius}.0;
  vec2 _opx = 1.0 / iResolution.xy;
  for (float _oy = -_or; _oy <= _or; _oy++) {
    for (float _ox = -_or; _ox <= _or; _ox++) {
      vec3 _oc = texture2D(uSource, uv + vec2(_ox,_oy)*_opx).rgb;
      int _qi = (_ox<=0.0 ? 0 : 1) + (_oy<=0.0 ? 0 : 2);
      _om[_qi] += _oc; _os[_qi] += dot(_oc,_oc);
    }
  }
  float _oMinVar = 1e9; float _on = (_or+1.0)*(_or+1.0);
  vec3 _oCol = col;
  for (int _k = 0; _k < 4; _k++) {
    _om[_k] /= _on; float _ov = _os[_k]/_on - dot(_om[_k],_om[_k]);
    if (_ov < _oMinVar) { _oMinVar = _ov; _oCol = _om[_k]; }
  }
  col = mix(col, _oCol, ${p.viscosity.toFixed(4)});`,
  },
  {
    id: 'ascii',
    name: 'ASCII Art',
    icon: '⊟',
    desc: 'Luminosity → glyph density (approx)',
    params: {
      res:  { label: 'Resolution (px/glyph)', min: 4, max: 20, step: 1, default: 8 },
      inv:  { label: 'Invert', min: 0, max: 1, step: 1, default: 0 },
    },
    frag: (p) => `
  vec2 _auvBlock = floor(uv * iResolution.xy / ${p.res}.0) * ${p.res}.0 / iResolution.xy;
  float _alum = dot(texture2D(uSource, _auvBlock + ${(p.res / 2).toFixed(1)} / iResolution.xy).rgb, vec3(0.299,0.587,0.114));
  ${p.inv ? '_alum = 1.0 - _alum;' : ''}
  // Approximation de glyphe par densité — ligne horizontale
  vec2 _afrac = fract(uv * iResolution.xy / ${p.res}.0);
  float _adensity = step(_afrac.y, _alum) * step(_alum, _afrac.y + 0.25);
  col = mix(vec3(0), vec3(1), _adensity);`,
  },
  {
    id: 'vhs',
    name: 'VHS',
    icon: '⏺',
    desc: 'Horizontal noise + chroma drift',
    params: {
      noise: { label: 'Noise', min: 0, max: 1, step: 0.01, default: 0.15 },
      smear: { label: 'Smear', min: 0, max: 0.04, step: 0.001, default: 0.01 },
    },
    frag: (p) => `
  float _vt = iTime * 13.7;
  float _vn = fract(sin(uv.y * 100.0 + _vt) * 4375.3 + sin(uv.y * 40.0 - _vt * 0.3) * 2731.1);
  vec2 _vOff = vec2((_vn - 0.5) * ${p.noise.toFixed(4)}, 0.0);
  vec3 _vr = texture2D(uSource, uv + _vOff + vec2(${p.smear.toFixed(4)}, 0)).rgb;
  vec3 _vg = texture2D(uSource, uv + _vOff).rgb;
  vec3 _vb = texture2D(uSource, uv + _vOff - vec2(${p.smear.toFixed(4)}, 0)).rgb;
  col = vec3(_vr.r, _vg.g, _vb.b);
  col += (_vn - 0.5) * 0.06;`,
  },
  {
    id: 'sepia',
    name: 'Sepia / Lomo',
    icon: '◑',
    desc: 'Color matrix + Lomo vignette',
    params: {
      sepia:    { label: 'Sepia', min: 0, max: 1, step: 0.01, default: 0.7 },
      vignette: { label: 'Vignette', min: 0, max: 1, step: 0.01, default: 0.5 },
      contrast: { label: 'Contrast', min: 0.5, max: 2, step: 0.01, default: 1.2 },
    },
    frag: (p) => `
  // Matrice sépia
  float _sl = dot(col, vec3(0.299,0.587,0.114));
  vec3 _scol = vec3(_sl*1.07+0.07, _sl*0.95+0.02, _sl*0.83);
  col = mix(col, _scol, ${p.sepia.toFixed(4)});
  // Contraste
  col = (col - 0.5) * ${p.contrast.toFixed(4)} + 0.5;
  // Vignette Lomo
  vec2 _vv = uv - 0.5;
  float _vig = 1.0 - dot(_vv,_vv) * ${(p.vignette * 3).toFixed(4)};
  col *= clamp(_vig, 0.0, 1.0);`,
  },
  {
    id: 'risograph',
    name: 'Risograph',
    icon: '◈',
    desc: 'Bichromie + grain + misregistration',
    params: {
      hue1:   { label: 'Teinte 1 (0-360)', min: 0, max: 360, step: 1, default: 0 },
      hue2:   { label: 'Teinte 2 (0-360)', min: 0, max: 360, step: 1, default: 200 },
      grain:  { label: 'Grain', min: 0, max: 0.2, step: 0.005, default: 0.05 },
      offset: { label: 'Misregistration (px)', min: 0, max: 6, step: 0.5, default: 1.5 },
    },
    frag: (p) => {
      const h1 = (p.hue1 / 360).toFixed(4), h2 = (p.hue2 / 360).toFixed(4);
      return `
  // Deux couches colorées
  vec3 _rc1 = vec3(${h1} < 0.333 ? '1.0,0.0,0.0' : h1 < 0.666 ? '0.0,1.0,0.0' : '0.0,0.0,1.0'});
  vec3 _rc2 = vec3(${h2} < 0.333 ? '1.0,0.0,0.0' : h2 < 0.666 ? '0.0,1.0,0.0' : '0.0,0.0,1.0'});
  // Misregistration
  vec2 _rpx = 1.0 / iResolution.xy;
  float _rl1 = dot(texture2D(uSource, uv).rgb, vec3(0.299,0.587,0.114));
  float _rl2 = dot(texture2D(uSource, uv + vec2(${(p.offset).toFixed(2)},0)*_rpx).rgb, vec3(0.299,0.587,0.114));
  col = clamp(_rc1 * (1.0-_rl1) + _rc2 * (1.0-_rl2), 0.0, 1.0);
  float _rg = (fract(sin(dot(uv*1000.0,vec2(12.98,78.23)))*43758.5) - 0.5) * ${p.grain.toFixed(4)};
  col = clamp(col + _rg, 0.0, 1.0);`;
    },
  },

  // ── 🆕 Effets manquants ────────────────────────────────────────────────────

  {
    id: 'glitch',
    name: 'Glitch',
    icon: '⚡',
    desc: 'Block displacement + color offset + scanlines',
    params: {
      intensity: { label: 'Intensity', min: 0, max: 1,    step: 0.01, default: 0.4 },
      speed:     { label: 'Speed',     min: 0, max: 5,    step: 0.1,  default: 1.5 },
      blocks:    { label: 'Blocks',    min: 2, max: 32,   step: 1,    default: 10  },
      scanlines: { label: 'Scanlines', min: 0, max: 1,    step: 1,    default: 1   },
    },
    frag: (p) => `
  // Glitch block displacement
  float _gt = iTime * ${p.speed.toFixed(4)};
  float _gblock = floor(uv.y * ${p.blocks}.0) / ${p.blocks}.0;
  float _gnoise = fract(sin(_gblock * 127.1 + _gt) * 43758.5453);
  float _gnoise2 = fract(sin(_gblock * 311.7 - _gt * 0.7) * 31415.9);
  // Seuil : glitch visible seulement sur certains blocs
  float _gActive = step(1.0 - ${p.intensity.toFixed(4)}, _gnoise2);
  float _gOffset = (_gnoise - 0.5) * ${p.intensity.toFixed(4)} * 0.3 * _gActive;
  // RGB split glitch
  float _gSplit = ${p.intensity.toFixed(4)} * 0.015 * _gActive;
  vec3 _gr = texture2D(uSource, uv + vec2(_gOffset + _gSplit, 0.0)).rgb;
  vec3 _gg = texture2D(uSource, uv + vec2(_gOffset,           0.0)).rgb;
  vec3 _gb = texture2D(uSource, uv + vec2(_gOffset - _gSplit, 0.0)).rgb;
  col = vec3(_gr.r, _gg.g, _gb.b);
  ${p.scanlines ? `// Scanlines
  float _gScan = sin(uv.y * iResolution.y * 3.14159) * 0.04 * ${p.intensity.toFixed(4)};
  col = clamp(col - _gScan, 0.0, 1.0);` : ''}
  // Occasional full-row colour burn
  float _gFlash = step(0.98, fract(sin(floor(uv.y * 200.0) + _gt * 3.1) * 9301.0));
  col = mix(col, vec3(fract(_gnoise*3.0), fract(_gnoise*7.0), fract(_gnoise*13.0)), _gFlash * ${p.intensity.toFixed(4)} * 0.5);`,
  },

  {
    id: 'chromatic',
    name: 'Chromatic Aberration',
    icon: '⟁',
    desc: 'RGB channel radial offset',
    params: {
      strength: { label: 'Strength',  min: 0,    max: 0.05, step: 0.001, default: 0.008 },
      radial:   { label: 'Radial',    min: 0,    max: 1,    step: 1,     default: 1     },
      animate:  { label: 'Animate',   min: 0,    max: 1,    step: 1,     default: 0     },
    },
    frag: (p) => `
  // Chromatic aberration — décalage par canal
  vec2 _caCenter = uv - 0.5;
  float _caDist = ${p.radial ? 'length(_caCenter)' : '1.0'};
  float _caStr = ${p.strength.toFixed(5)} * _caDist${p.animate ? ' * (0.8 + 0.2 * sin(iTime * 2.3))' : ''};
  vec2 _caDir = ${p.radial ? 'normalize(_caCenter + 0.0001)' : 'vec2(1.0, 0.0)'};
  col.r = texture2D(uSource, uv + _caDir * _caStr         ).r;
  col.g = texture2D(uSource, uv                            ).g;
  col.b = texture2D(uSource, uv - _caDir * _caStr         ).b;`,
  },

  {
    id: 'vignette',
    name: 'Vignette',
    icon: '◎',
    desc: 'Smooth radial darkening',
    params: {
      strength:  { label: 'Strength',  min: 0,    max: 3,    step: 0.01, default: 1.2  },
      softness:  { label: 'Softness',  min: 0.01, max: 1,    step: 0.01, default: 0.5  },
      color:     { label: 'Color (0=black 1=tint)', min: 0, max: 1, step: 1, default: 0 },
      tintR:     { label: 'Tint R',    min: 0,    max: 1,    step: 0.01, default: 0.05 },
      tintG:     { label: 'Tint G',    min: 0,    max: 1,    step: 0.01, default: 0.0  },
      tintB:     { label: 'Tint B',    min: 0,    max: 1,    step: 0.01, default: 0.1  },
    },
    frag: (p) => `
  // Vignette radiale douce
  vec2 _vigUV = uv * (1.0 - uv.yx);
  float _vigFactor = _vigUV.x * _vigUV.y * 15.0;
  float _vig = pow(clamp(_vigFactor, 0.0, 1.0), ${p.strength.toFixed(4)});
  // Softness curve
  _vig = smoothstep(0.0, ${p.softness.toFixed(4)}, _vig);
  ${p.color === 0
    ? `col = mix(vec3(0.0), col, _vig);`
    : `col = mix(vec3(${p.tintR.toFixed(3)}, ${p.tintG.toFixed(3)}, ${p.tintB.toFixed(3)}), col, _vig);`
  }`,
  },

  {
    id: 'lensdistort',
    name: 'Lens Distortion',
    icon: '⌀',
    desc: 'Barrel / pincushion + chromatic fringes',
    params: {
      k1:       { label: 'Barrel (k1)',   min: -1,   max: 1,   step: 0.01, default: -0.3 },
      k2:       { label: 'Pincushion k2', min: -0.5, max: 0.5, step: 0.01, default: 0.1  },
      fringe:   { label: 'CA Fringe',     min: 0,    max: 0.02, step: 0.001, default: 0.004 },
      zoom:     { label: 'Zoom',          min: 0.5,  max: 1.5,  step: 0.01, default: 1.0  },
    },
    frag: (p) => `
  // Modèle Brown-Conrady simplifié
  vec2 _ldUV = (uv - 0.5) / ${p.zoom.toFixed(4)};
  float _ldr2 = dot(_ldUV, _ldUV);
  float _ldFactor = 1.0 + ${p.k1.toFixed(4)} * _ldr2 + ${p.k2.toFixed(4)} * _ldr2 * _ldr2;
  vec2 _ldWarp = _ldUV * _ldFactor + 0.5;
  // Chromatic fringe sur bords
  float _ldFringe = ${p.fringe.toFixed(5)};
  vec2 _ldDelta = normalize(_ldUV + 0.00001) * _ldFringe * _ldr2;
  col.r = texture2D(uSource, clamp(_ldWarp + _ldDelta,   vec2(0), vec2(1))).r;
  col.g = texture2D(uSource, clamp(_ldWarp,              vec2(0), vec2(1))).g;
  col.b = texture2D(uSource, clamp(_ldWarp - _ldDelta,   vec2(0), vec2(1))).b;
  // Masquer hors-champ
  float _ldBound = float(_ldWarp.x >= 0.0 && _ldWarp.x <= 1.0 && _ldWarp.y >= 0.0 && _ldWarp.y <= 1.0);
  col *= _ldBound;`,
  },
];

// ── 🆕 registerStyle — styles personnalisés ───────────────────────────────────

/**
 * Enregistre un style personnalisé, injectable depuis l'éditeur ou le code.
 *
 * @param {object} def — Même structure que STYLE_DEFINITIONS[i]
 *   { id, name, icon, desc, params, frag }
 * @returns {boolean} false si l'id existe déjà (aucun écrasement silencieux)
 *
 * @example
 * registerStyle({
 *   id: 'myEffect',
 *   name: 'My Effect',
 *   icon: '★',
 *   desc: 'Custom post-process',
 *   params: { amount: { label: 'Amount', min: 0, max: 1, step: 0.01, default: 0.5 } },
 *   frag: (p) => `col = mix(col, vec3(1.0 - col.r, 1.0 - col.g, 1.0 - col.b), ${p.amount.toFixed(4)});`
 * });
 */
export function registerStyle(def) {
  if (!def || !def.id || !def.frag) {
    console.warn('[StyleLayers] registerStyle: def must have id and frag');
    return false;
  }
  const all = _allStyles();
  if (all.find(d => d.id === def.id)) {
    console.warn(`[StyleLayers] registerStyle: id "${def.id}" already exists — use a unique id`);
    return false;
  }
  _customStyles.push({
    icon: '★',
    desc: '',
    params: {},
    ...def,
  });
  _programs = {};  // force recompile si déjà utilisé
  return true;
}

// ── 🆕 buildStyleGLSL — export GLSL injectable ───────────────────────────────

/**
 * Génère un snippet GLSL autonome représentant le pipeline de style actif.
 * Le snippet peut être inséré dans un shader via `smartInsert(buildStyleGLSL(), 'function')`.
 *
 * @param {Array} [layers] — calques à exporter (défaut: calques actifs courants)
 * @returns {string} Code GLSL — une fonction `applyStylePipeline(vec3 col, vec2 uv) → vec3`
 *
 * @example
 * import { buildStyleGLSL } from './render/style-layers.js';
 * import { smartInsert }    from './ui/smart-insert.js';
 * smartInsert(buildStyleGLSL(), 'function');
 */
export function buildStyleGLSL(layers) {
  const src = layers ?? _layers;
  const active = src.filter(l => l.enabled);

  if (active.length === 0) {
    return `// Style pipeline — no active layers\nvec3 applyStylePipeline(vec3 col, vec2 uv) {\n  return col;\n}`;
  }

  const steps = active.map((layer, i) => {
    const def = _allStyles().find(d => d.id === layer.typeId);
    if (!def) return `  // Unknown layer type: ${layer.typeId}`;

    const fragCode = def.frag(layer.params);
    const blendFn  = BLEND_GLSL[layer.blendMode] ?? BLEND_GLSL.normal;
    const opacityExpr = layer.animation?.target === 'opacity'
      ? _animExpr(layer.animation, layer.opacity)
      : layer.opacity.toFixed(4);

    return [
      `  // Layer ${i + 1}: ${def.name} (blend: ${layer.blendMode ?? 'normal'}, opacity: ${opacityExpr})`,
      `  {`,
      `    vec3 _baseCol_${i} = col;`,
      `    ${fragCode.trim().replace(/\n/g, '\n    ')}`,
      `    vec3 _blended_${i} = ${blendFn(`col`, `_baseCol_${i}`)};`,
      `    col = mix(_baseCol_${i}, _blended_${i}, clamp(${opacityExpr}, 0.0, 1.0));`,
      `  }`,
    ].join('\n');
  }).join('\n\n');

  return [
    `// ── Style Pipeline (${active.length} layer${active.length > 1 ? 's' : ''}) — generated by style-layers.js ──`,
    `// Uniforms attendus : sampler2D uSource, vec2 iResolution, float iTime`,
    `vec3 applyStylePipeline(vec3 col, vec2 uv) {`,
    steps,
    `  return clamp(col, 0.0, 1.0);`,
    `}`,
  ].join('\n');
}

// ── 🆕 setStyleLayerBlendMode ─────────────────────────────────────────────────

/**
 * Définit le blend mode d'un calque.
 * @param {string} id        — identifiant du calque
 * @param {'normal'|'add'|'multiply'|'screen'|'overlay'} mode
 */
export function setStyleLayerBlendMode(id, mode) {
  const l = _layers.find(l => l.id === id);
  if (!l) return;
  if (!BLEND_GLSL[mode]) {
    console.warn(`[StyleLayers] unknown blend mode "${mode}"`);
    return;
  }
  l.blendMode = mode;
  _programs = {};  // le mode est encodé dans le shader
}

// ── 🆕 setStyleLayerAnimation ─────────────────────────────────────────────────

/**
 * Connecte un paramètre ou l'opacité à une modulation iTime.
 *
 * @param {string} id  — identifiant du calque
 * @param {object|null} cfg
 *   @param {string}  cfg.target  — 'opacity' | nom d'un paramètre du style
 *   @param {'sin'|'cos'|'tri'} [cfg.fn='sin'] — forme d'onde
 *   @param {number}  [cfg.speed=1]   — multiplicateur de fréquence
 *   @param {number}  [cfg.amp=0.5]   — amplitude (la valeur de base ±amp)
 *   @param {number}  [cfg.offset=0]  — phase en radians
 *
 * Passer null pour désactiver l'animation.
 *
 * @example
 * // Faire pulser l'opacité d'un calque au rythme de iTime
 * setStyleLayerAnimation('style_1', { target: 'opacity', fn: 'sin', speed: 2, amp: 0.4, offset: 0 });
 *
 * // Animer le rayon d'un bloom
 * setStyleLayerAnimation('style_2', { target: 'radius', fn: 'cos', speed: 0.5, amp: 4 });
 */
export function setStyleLayerAnimation(id, cfg) {
  const l = _layers.find(l => l.id === id);
  if (!l) return;
  if (cfg === null) {
    delete l.animation;
    _programs = {};
    return;
  }
  l.animation = {
    fn:     'sin',
    speed:  1,
    amp:    0.5,
    offset: 0,
    ...cfg,
  };
  _programs = {};
}

// ── WebGL state ───────────────────────────────────────────────────────────────

let _gl         = null;
let _programs   = {};
let _quadBuf    = null;
let _initDone   = false;
let _blitProg   = null;

/** Styles custom (ajoutés via registerStyle) */
const _customStyles = [];

/** Fusion built-in + custom */
function _allStyles() {
  return [...STYLE_DEFINITIONS, ..._customStyles];
}

const VERT_SRC = `
  attribute vec2 aPos;
  varying vec2 uv;
  void main() { uv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0, 1); }
`;

// ── Génération du fragment shader d'un calque ─────────────────────────────────

/**
 * Retourne l'expression GLSL d'une valeur animée.
 * @param {object} anim  — config animation
 * @param {number} base  — valeur de base (opacity ou param)
 * @returns {string}
 */
function _animExpr(anim, base) {
  const { fn = 'sin', speed = 1, amp = 0.5, offset = 0 } = anim;
  const t = `(iTime * ${speed.toFixed(4)} + ${offset.toFixed(4)})`;
  let wave;
  if (fn === 'cos') wave = `cos(${t})`;
  else if (fn === 'tri') wave = `(2.0 * abs(fract(${t} / (2.0 * 3.14159)) - 0.5) * 2.0 - 1.0)`;
  else wave = `sin(${t})`;
  return `clamp(${base.toFixed(4)} + ${amp.toFixed(4)} * ${wave}, 0.0, 1.0)`;
}

/**
 * Construit le code GLSL d'un calque avec son blend mode et son opacité.
 * @param {object} layer
 * @returns {string}
 */
function _layerFragCode(layer) {
  const def = _allStyles().find(d => d.id === layer.typeId);
  if (!def) return '';

  // Résoudre les paramètres animés
  const resolvedParams = { ...layer.params };
  if (layer.animation && layer.animation.target !== 'opacity') {
    const key = layer.animation.target;
    if (key in resolvedParams) {
      // On ne peut pas injecter un uniform dynamique dans les params statiques du frag,
      // mais on peut limiter aux effets qui acceptent float : on remplace la valeur de base
      // par une expression. Comme frag() prend un objet JS, on garde la valeur JS originale
      // et on expose un uniform animé dans le shader.
      // Pour l'instant : les params animés sont passés comme uniform uAnim_<key>.
      // Le frag() voit la valeur de base ; l'animation est appliquée sur l'opacité (safe).
      // TODO : refactor complet vers uniform-driven params pour support inline total.
    }
  }

  const fragBody = def.frag(resolvedParams);
  const blendFn  = BLEND_GLSL[layer.blendMode] ?? BLEND_GLSL.normal;

  // Calcul de l'opacité finale (animée ou statique)
  let opacityGLSL;
  if (layer.animation?.target === 'opacity') {
    opacityGLSL = _animExpr(layer.animation, layer.opacity);
  } else {
    opacityGLSL = layer.opacity.toFixed(4);
  }

  return `
  // ── ${def.name} (blend: ${layer.blendMode ?? 'normal'}) ──
  {
    vec3 _origCol = col;
    ${fragBody.trim()}
    vec3 _blended = ${blendFn('col', '_origCol')};
    col = mix(_origCol, _blended, clamp(${opacityGLSL}, 0.0, 1.0));
  }`;
}

function _fragSrc(layer) {
  return `
  precision mediump float;
  varying vec2 uv;
  uniform sampler2D uSource;
  uniform vec2 iResolution;
  uniform float iTime;
  void main() {
    vec3 col = texture2D(uSource, uv).rgb;
    ${_layerFragCode(layer)}
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;
}

function _compile(gl, vert, frag) {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vert); gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, frag); gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.warn('[StyleLayers] frag compile error:', gl.getShaderInfoLog(fs));
    gl.deleteShader(vs); gl.deleteShader(fs); return null;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[StyleLayers] link error:', gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog); return null;
  }
  return prog;
}

function _makeFBO(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex };
}

// ── Couches internes ──────────────────────────────────────────────────────────

const _layers = [];
let _nextId = 1;

export function addStyleLayer(typeId, params = {}) {
  const def = _allStyles().find(d => d.id === typeId);
  if (!def) return null;
  const defaults = Object.fromEntries(Object.entries(def.params).map(([k, v]) => [k, v.default]));
  const id = 'style_' + (_nextId++);
  _layers.push({
    id,
    typeId,
    enabled:   true,
    opacity:   1.0,
    blendMode: 'normal',   // 🆕 default blend mode
    animation: null,       // 🆕 pas d'animation par défaut
    params: { ...defaults, ...params },
  });
  _programs = {};
  return id;
}

export function removeStyleLayer(id) {
  const i = _layers.findIndex(l => l.id === id);
  if (i >= 0) { _layers.splice(i, 1); _programs = {}; }
}

export function moveStyleLayer(id, delta) {
  const i = _layers.findIndex(l => l.id === id);
  if (i < 0) return;
  const j = i + delta;
  if (j >= 0 && j < _layers.length) [_layers[i], _layers[j]] = [_layers[j], _layers[i]];
}

export function setStyleLayerParam(id, k, v) {
  const l = _layers.find(l => l.id === id);
  if (l) { l.params[k] = v; _programs = {}; }
}

export function setStyleLayerEnabled(id, bool) {
  const l = _layers.find(l => l.id === id);
  if (l) l.enabled = bool;
}

export function setStyleLayerOpacity(id, v) {
  const l = _layers.find(l => l.id === id);
  if (l) l.opacity = v;
}

export function getStyleLayers() { return [..._layers]; }

export function serializeStyleLayers() {
  return _layers.map(l => ({
    ...l,
    params:    { ...l.params },
    animation: l.animation ? { ...l.animation } : null,
  }));
}

export function loadStyleLayers(arr) {
  _layers.length = 0; _programs = {};
  for (const l of arr || []) {
    _layers.push({
      blendMode: 'normal',
      animation: null,
      ...l,
      params: { ...l.params },
    });
    const num = parseInt(l.id.replace('style_', ''), 10);
    if (!isNaN(num) && num >= _nextId) _nextId = num + 1;
  }
}

// ── Rendu WebGL ───────────────────────────────────────────────────────────────

export function initStyleLayers(gl) {
  _gl = gl;
  _quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, _quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  _initDone = true;
}

function _getProgram(gl, layer) {
  // La clé inclut le blend mode et la config animation pour forcer recompile si changés
  const animKey = layer.animation ? JSON.stringify(layer.animation) : 'null';
  const key = layer.typeId + '|' + (layer.blendMode ?? 'normal') + '|' + animKey + '|' + JSON.stringify(layer.params);
  if (_programs[key]) return _programs[key];
  const prog = _compile(gl, VERT_SRC, _fragSrc(layer));
  if (prog) _programs[key] = prog;
  return prog;
}

export function applyStyleLayers(gl, srcTexture, outputFBO, w, h) {
  if (!_initDone || !gl) return srcTexture;
  const active = _layers.filter(l => l.enabled);
  if (active.length === 0) return srcTexture;

  const fbo0 = _makeFBO(gl, w, h);
  const fbo1 = _makeFBO(gl, w, h);
  const fbos = [fbo0, fbo1];

  let srcTex  = srcTexture;
  let pingpong = 0;

  gl.bindBuffer(gl.ARRAY_BUFFER, _quadBuf);

  for (const layer of active) {
    const prog = _getProgram(gl, layer);
    if (!prog) continue;

    const { fbo, tex } = fbos[pingpong % 2];
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);

    const aPosLoc = gl.getAttribLocation(prog, 'aPos');
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aPosLoc);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(gl.getUniformLocation(prog, 'uSource'), 0);
    gl.uniform2f(gl.getUniformLocation(prog, 'iResolution'), w, h);
    gl.uniform1f(gl.getUniformLocation(prog, 'iTime'), performance.now() / 1000);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    srcTex = tex;
    pingpong++;
  }

  // Blit vers outputFBO (ou canvas si null)
  const blitProg = _getBlitProg(gl);
  if (blitProg) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, outputFBO);
    gl.viewport(0, 0, w, h);
    gl.useProgram(blitProg);
    const aPosLoc = gl.getAttribLocation(blitProg, 'aPos');
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aPosLoc);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(gl.getUniformLocation(blitProg, 'uSource'), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  gl.deleteFramebuffer(fbo0.fbo); gl.deleteTexture(fbo0.tex);
  gl.deleteFramebuffer(fbo1.fbo); gl.deleteTexture(fbo1.tex);

  return srcTex;
}

export function destroyStyleLayers(gl) {
  Object.values(_programs).forEach(p => gl.deleteProgram(p));
  _programs = {};
  if (_quadBuf) { gl.deleteBuffer(_quadBuf); _quadBuf = null; }
  if (_blitProg) { gl.deleteProgram(_blitProg); _blitProg = null; }
  _initDone = false;
}

function _getBlitProg(gl) {
  if (_blitProg) return _blitProg;
  _blitProg = _compile(gl, VERT_SRC, `
    precision mediump float;
    varying vec2 uv;
    uniform sampler2D uSource;
    void main() { gl_FragColor = texture2D(uSource, uv); }
  `);
  return _blitProg;
}
