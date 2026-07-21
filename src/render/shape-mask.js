/**
 * shape-mask.js — Phase 2 (ROADMAP v2.2→v2.6)
 *
 * ✅ [x] 🆕 Forme "custom Bézier" (4 pts de contrôle, polygone samplé en GLSL)
 * ✅ [x] 🆕 Import SVG path → extraction des points de contrôle cubique
 * ✅ [x] 🖼 buildShapeGLSL() — insérable dans le shader via bouton "→ Shader"
 * ✅ [x] 🆕 Animation iTime : rotation, scale pulsante, morph vers cercle
 * ✅ [x] 🔌 feather, invert, extrude 2.5D sur tous les types
 *
 * API publique :
 *   SHAPE_TYPES
 *   setShape(type, params)
 *   getShape() → { type, params }
 *   setShapeEnabled(bool)
 *   isShapeEnabled() → bool
 *   buildShapeGLSL() → string | null
 *   applyShapeMask(gl, srcTex, outFBO, w, h)
 *   initShapeMask(gl)
 *   destroyShapeMask(gl)
 *   serializeShape() / loadShape(data)
 *   — 🆕 —
 *   setBezierPoints(pts)   pts = [{x,y},{x,y},{x,y},{x,y}] in UV [0,1]
 *   getBezierPoints() → pts
 *   setGlobalParams(obj)   { feather, invert, extrude }
 *   getGlobalParams() → obj
 *   setAnimation(cfg)      { enabled, target, fn, speed, amp, offset }
 *   getAnimation() → cfg
 *   importSVGPath(svgStr)  → bool (true if at least one bezier extracted)
 */

// ── Types de forme ────────────────────────────────────────────────────────────

export const SHAPE_TYPES = [
  { id: 'none',         name: 'Aucun',              icon: '□', params: {} },
  {
    id: 'circle', name: 'Cercle', icon: '○',
    params: {
      radius: { label: 'Rayon',    min: 0.01, max: 1.0,  step: 0.01,  default: 0.48 },
      smooth: { label: 'Douceur',  min: 0,    max: 0.05, step: 0.001, default: 0.004 },
    },
    sdf: (p) => `float _sdf = length(uv2 - 0.5) - ${p.radius.toFixed(4)};`,
  },
  {
    id: 'ellipse', name: 'Ellipse', icon: '◯',
    params: {
      rx:     { label: 'Rayon X',  min: 0.01, max: 1.0,  step: 0.01,  default: 0.48 },
      ry:     { label: 'Rayon Y',  min: 0.01, max: 1.0,  step: 0.01,  default: 0.3  },
      smooth: { label: 'Douceur',  min: 0,    max: 0.05, step: 0.001, default: 0.004 },
    },
    sdf: (p) => `{
      vec2 _ec = uv2 - 0.5;
      vec2 _eab = vec2(${p.rx.toFixed(4)}, ${p.ry.toFixed(4)});
      float _ek0 = length(_ec / _eab);
      float _ek1 = length(_ec / (_eab * _eab));
      float _sdf = (_ek1 < 0.0001) ? -min(_eab.x,_eab.y) : _ek0*(_ek0-1.)/_ek1;
    }`,
  },
  {
    id: 'polygon', name: 'Polygon', icon: '⬡',
    params: {
      sides:  { label: 'Côtés',    min: 3,    max: 12,   step: 1,     default: 6   },
      radius: { label: 'Rayon',    min: 0.01, max: 0.6,  step: 0.01,  default: 0.45 },
      smooth: { label: 'Douceur',  min: 0,    max: 0.05, step: 0.001, default: 0.004 },
    },
    sdf: (p) => `{
      vec2 _pc = uv2 - 0.5;
      float _pn = ${p.sides.toFixed(1)};
      float _pan = 6.28318 / _pn;
      float _pa = atan(_pc.y, _pc.x) + 3.14159;
      float _pr = length(_pc);
      _pa = mod(_pa, _pan) - _pan * 0.5;
      float _sdf = _pr * cos(_pa) - ${p.radius.toFixed(4)};
    }`,
  },
  {
    id: 'star', name: 'Étoile', icon: '★',
    params: {
      branches: { label: 'Branches', min: 3,    max: 12,   step: 1,     default: 5   },
      outer:    { label: 'Rayon ext',min: 0.01, max: 0.6,  step: 0.01,  default: 0.45 },
      inner:    { label: 'Rayon int',min: 0.01, max: 0.5,  step: 0.01,  default: 0.2  },
      smooth:   { label: 'Douceur',  min: 0,    max: 0.05, step: 0.001, default: 0.004 },
    },
    sdf: (p) => {
      const n = p.branches;
      const an = (Math.PI / n).toFixed(6);
      return `{
        vec2 _sc = uv2 - 0.5;
        float _sa = atan(_sc.y, _sc.x) - ${(Math.PI / 2).toFixed(6)};
        float _san2 = ${(2 * Math.PI / n).toFixed(6)};
        _sa = mod(_sa, _san2) - _san2 * 0.5;
        _sc = length(_sc) * vec2(cos(_sa), abs(sin(_sa)));
        vec2 _sba = ${p.outer.toFixed(4)} * normalize(vec2(cos(${an}), sin(${an})));
        float _sh = clamp(dot(_sc, _sba) / dot(_sba, _sba), 0.0, 1.0);
        float _sdf = length(_sc - _sba * _sh) * sign(_sc.y * _sba.x - _sc.x * _sba.y);
      }`;
    },
  },
  {
    id: 'rounded_rect', name: 'Rectangle', icon: '▭',
    params: {
      w:      { label: 'Largeur',  min: 0.01, max: 1.0,  step: 0.01,  default: 0.7  },
      h:      { label: 'Hauteur',  min: 0.01, max: 1.0,  step: 0.01,  default: 0.5  },
      r:      { label: 'Arrondi',  min: 0,    max: 0.3,  step: 0.005, default: 0.05 },
      smooth: { label: 'Douceur',  min: 0,    max: 0.02, step: 0.001, default: 0.003 },
    },
    sdf: (p) => `{
      vec2 _rc = abs(uv2 - 0.5) - vec2(${(p.w/2).toFixed(4)}, ${(p.h/2).toFixed(4)}) + vec2(${p.r.toFixed(4)});
      float _sdf = length(max(_rc, 0.0)) + min(max(_rc.x, _rc.y), 0.0) - ${p.r.toFixed(4)};
    }`,
  },
  {
    id: 'bezier', name: 'Bézier', icon: '⌒',
    params: {
      smooth: { label: 'Douceur', min: 0, max: 0.05, step: 0.001, default: 0.006 },
    },
    // sdf generated dynamically in buildShapeGLSL via _bezierPolygonGLSL()
    sdf: null,
  },
];

// ── État interne ──────────────────────────────────────────────────────────────

let _type    = 'none';
let _params  = {};
let _enabled = false;

// 🆕 Bézier control points (UV [0,1] space)
let _bezierPoints = [
  { x: 0.5,  y: 0.15 },
  { x: 0.85, y: 0.5  },
  { x: 0.5,  y: 0.85 },
  { x: 0.15, y: 0.5  },
];

// 🆕 Paramètres globaux (s'appliquent à tous les types)
let _globalParams = { feather: 0, invert: false, extrude: 0 };

// 🆕 Animation
let _animation = {
  enabled: false,
  target:  'rotation',   // 'rotation' | 'scale' | 'morph'
  fn:      'sin',        // 'sin' | 'cos' | 'tri'
  speed:   1.0,
  amp:     0.3,
  offset:  0.0,
};

// WebGL
let _gl      = null;
let _prog    = null;
let _quadBuf = null;

// ── API publique ───────────────────────────────────────────────────────────────

export function setShape(type, params = {}) {
  const def = SHAPE_TYPES.find(t => t.id === type);
  if (!def) return;
  _type = type;
  const defaults = Object.fromEntries(Object.entries(def.params).map(([k, v]) => [k, v.default]));
  _params = { ...defaults, ...params };
  _prog = null;
}

export function getShape()          { return { type: _type, params: { ..._params } }; }
export function setShapeEnabled(b)  { _enabled = b; }
export function isShapeEnabled()    { return _enabled; }

export function setBezierPoints(pts) {
  if (Array.isArray(pts) && pts.length === 4) {
    _bezierPoints = pts.map(p => ({ x: Number(p.x), y: Number(p.y) }));
    _prog = null;
  }
}
export function getBezierPoints()   { return _bezierPoints.map(p => ({ ...p })); }

export function setGlobalParams(obj) {
  _globalParams = { ..._globalParams, ...obj };
  _prog = null;
}
export function getGlobalParams()   { return { ..._globalParams }; }

export function setAnimation(cfg) {
  _animation = { ..._animation, ...cfg };
  _prog = null;
}
export function getAnimation()      { return { ..._animation }; }

// ── 🆕 SVG path import ────────────────────────────────────────────────────────

/**
 * Extrait les premiers points de contrôle cubiques d'un SVG (path d=…).
 * Supporte M, L, C, Z. Retourne true si au moins un arc cubique est trouvé.
 */
export function importSVGPath(svgStr) {
  // Chercher le premier attribut d="…"
  const mD = svgStr.match(/\bd\s*=\s*["']([^"']+)["']/i);
  const pathD = mD ? mD[1] : svgStr; // accepte aussi le chemin brut

  const tokens = pathD.replace(/([MmCcLlZz])/g, ' $1 ').trim().split(/[\s,]+/).filter(Boolean);
  let i = 0;
  let cx = 0, cy = 0;
  let startX = 0, startY = 0;
  const cubics = []; // { p0, p1, p2, p3 } en coordonnées SVG brutes

  while (i < tokens.length) {
    const cmd = tokens[i++];
    switch (cmd) {
      case 'M': case 'm': {
        const rx = parseFloat(tokens[i++]), ry = parseFloat(tokens[i++]);
        cx = cmd === 'M' ? rx : cx + rx;
        cy = cmd === 'M' ? ry : cy + ry;
        startX = cx; startY = cy;
        break;
      }
      case 'C': case 'c': {
        while (i + 5 < tokens.length && isNaN(tokens[i]) === false) {
          const vals = [];
          for (let j = 0; j < 6; j++) vals.push(parseFloat(tokens[i++]));
          const rel = cmd === 'c';
          cubics.push({
            p0: { x: cx, y: cy },
            p1: { x: rel ? cx+vals[0] : vals[0], y: rel ? cy+vals[1] : vals[1] },
            p2: { x: rel ? cx+vals[2] : vals[2], y: rel ? cy+vals[3] : vals[3] },
            p3: { x: rel ? cx+vals[4] : vals[4], y: rel ? cy+vals[5] : vals[5] },
          });
          cx = cubics[cubics.length-1].p3.x;
          cy = cubics[cubics.length-1].p3.y;
        }
        break;
      }
      case 'L': case 'l': {
        while (i + 1 < tokens.length && !isNaN(tokens[i])) {
          const rx = parseFloat(tokens[i++]), ry = parseFloat(tokens[i++]);
          cx = cmd === 'L' ? rx : cx + rx;
          cy = cmd === 'L' ? ry : cy + ry;
        }
        break;
      }
      case 'Z': case 'z': cx = startX; cy = startY; break;
      default: break;
    }
  }

  if (cubics.length === 0) return false;

  // Normaliser vers [0,1]: trouver bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of cubics) {
    for (const pt of [c.p0, c.p1, c.p2, c.p3]) {
      minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
    }
  }
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const norm = pt => ({
    x: (pt.x - minX) / rangeX * 0.8 + 0.1,
    y: (pt.y - minY) / rangeY * 0.8 + 0.1,
  });

  // Utiliser le premier arc cubique → 4 points de contrôle
  const c = cubics[0];
  _bezierPoints = [norm(c.p0), norm(c.p1), norm(c.p2), norm(c.p3)];
  _type = 'bezier';
  const def = SHAPE_TYPES.find(t => t.id === 'bezier');
  const defaults = Object.fromEntries(Object.entries(def.params).map(([k, v]) => [k, v.default]));
  _params = defaults;
  _prog = null;
  return true;
}

// ── 🆕 Bézier polygon SDF (GLSL inline, N=12 points samplés) ─────────────────

function _cubicPt(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x,
    y: mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y,
  };
}

function _bezierPolygonGLSL(N = 12) {
  const pts = [];
  for (let i = 0; i < N; i++) {
    pts.push(_cubicPt(_bezierPoints[0], _bezierPoints[1], _bezierPoints[2], _bezierPoints[3], i / N));
  }

  // IQ polygon SDF — unrolled pour N points (GLSL ES 1.0 compatible)
  const lines = [`  {`, `    vec2 _bzp = uv2 - 0.5;`];
  pts.forEach((p, i) => {
    const cx = (p.x - 0.5).toFixed(5), cy = (p.y - 0.5).toFixed(5);
    lines.push(`    vec2 _bzv${i} = vec2(${cx}, ${cy});`);
  });
  lines.push(`    float _bzd = dot(_bzp-_bzv0, _bzp-_bzv0);`);
  lines.push(`    float _bzs = 1.0;`);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    lines.push(
      `    { vec2 _bze=_bzv${j}-_bzv${i},_bzw=_bzp-_bzv${i};`,
      `      vec2 _bzb=_bzw-_bze*clamp(dot(_bzw,_bze)/dot(_bze,_bze),0.,1.);`,
      `      _bzd=min(_bzd,dot(_bzb,_bzb));`,
      `      bvec3 _bzc=bvec3(_bzp.y>=_bzv${i}.y,_bzp.y<_bzv${j}.y,_bze.x*_bzw.y>_bze.y*_bzw.x);`,
      `      if(all(_bzc)||all(not(_bzc)))_bzs=-_bzs; }`,
    );
  }
  lines.push(`    float _sdf = _bzs * sqrt(_bzd);`);
  lines.push(`  }`);
  return lines.join('\n');
}

// ── 🆕 buildShapeGLSL ────────────────────────────────────────────────────────

/**
 * Génère le snippet GLSL du masque de forme courant.
 * Inclut : animation UV, SDF de forme, feather, invert, extrude.
 * Le snippet utilise : vec2 uv (in), vec3 col (inout), uniform float iTime.
 *
 * @returns {string|null}
 */
export function buildShapeGLSL() {
  if (_type === 'none') return null;
  const def = SHAPE_TYPES.find(t => t.id === _type);
  if (!def) return null;

  const smooth = (_params.smooth ?? 0.004) + (_globalParams.feather ?? 0);
  const invert = _globalParams.invert ?? false;
  const extrude = _globalParams.extrude ?? 0;

  // ── Animation UV ──────────────────────────────────────────────────────────
  let animCode = `  vec2 uv2 = uv;`;
  if (_animation.enabled) {
    const { target, fn, speed, amp, offset } = _animation;
    const t = `(iTime * ${speed.toFixed(4)} + ${offset.toFixed(4)})`;
    let wave;
    if (fn === 'cos')     wave = `cos(${t})`;
    else if (fn === 'tri') wave = `(2.0*abs(fract(${t}/6.28318)-0.5)*2.0-1.0)`;
    else                   wave = `sin(${t})`;

    if (target === 'rotation') {
      const rotAng = `(${wave} * ${amp.toFixed(4)})`;
      animCode = `
  float _rotA = ${rotAng};
  float _rotC = cos(_rotA), _rotS = sin(_rotA);
  mat2 _rotM = mat2(_rotC, -_rotS, _rotS, _rotC);
  vec2 uv2 = _rotM * (uv - 0.5) + 0.5;`;
    } else if (target === 'scale') {
      animCode = `
  float _scaleF = 1.0 + ${wave} * ${amp.toFixed(4)};
  vec2 uv2 = (uv - 0.5) / _scaleF + 0.5;`;
    } else if (target === 'morph') {
      // morph vers cercle (r=0.45)
      animCode = `  vec2 uv2 = uv;`;
    }
  }

  // ── SDF du type ───────────────────────────────────────────────────────────
  let sdfCode;
  if (_type === 'bezier') {
    sdfCode = _bezierPolygonGLSL(12);
  } else {
    sdfCode = def.sdf(_params);
    // s'assure que la variable s'appelle _sdf
    if (!sdfCode.includes('_sdf')) {
      sdfCode = `float _sdf = 0.0;\n  ${sdfCode}`;
    }
  }

  // ── Morph vers cercle ────────────────────────────────────────────────────
  let morphCode = '';
  if (_animation.enabled && _animation.target === 'morph') {
    const { fn, speed, amp, offset } = _animation;
    const t = `(iTime * ${speed.toFixed(4)} + ${offset.toFixed(4)})`;
    const wave = fn === 'cos' ? `cos(${t})` : `sin(${t})`;
    morphCode = `
  float _morphT = ${wave} * ${amp.toFixed(4)} * 0.5 + 0.5;
  float _circleSdf = length(uv2 - 0.5) - 0.45;
  _sdf = mix(_sdf, _circleSdf, clamp(_morphT, 0.0, 1.0));`;
  }

  // ── Invert ────────────────────────────────────────────────────────────────
  const invertCode = invert ? `  _sdf = -_sdf;` : '';

  // ── Mask final ────────────────────────────────────────────────────────────
  const smoothExpr = smooth.toFixed(5);
  let maskCode = `  float _mask = 1.0 - smoothstep(-${smoothExpr}, ${smoothExpr}, _sdf);`;

  // ── Extrude 2.5D ─────────────────────────────────────────────────────────
  let extrudeCode = '';
  if (extrude > 0) {
    extrudeCode = `
  // Extrude 2.5D — depth tinting sur les bords
  float _extDepth = clamp(-_sdf / ${extrude.toFixed(4)}, 0.0, 1.0);
  col = mix(col * 0.4, col, _extDepth) * _mask;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), _mask);`;
  } else {
    extrudeCode = `
  col *= _mask;
  gl_FragColor = vec4(col, _mask);`;
  }

  return [
    animCode,
    sdfCode,
    morphCode,
    invertCode,
    maskCode,
    extrudeCode,
  ].join('\n');
}

// ── Sérialisation ─────────────────────────────────────────────────────────────

export function serializeShape() {
  return {
    type: _type, params: { ..._params }, enabled: _enabled,
    bezierPoints: _bezierPoints.map(p => ({ ...p })),
    globalParams: { ..._globalParams },
    animation:    { ..._animation },
  };
}

export function loadShape(data) {
  if (!data) return;
  setShape(data.type || 'none', data.params || {});
  _enabled = data.enabled ?? false;
  if (data.bezierPoints) setBezierPoints(data.bezierPoints);
  if (data.globalParams) setGlobalParams(data.globalParams);
  if (data.animation)    setAnimation(data.animation);
}

// ── WebGL ─────────────────────────────────────────────────────────────────────

const VERT = `attribute vec2 aPos; varying vec2 uv; void main(){uv=aPos*.5+.5;gl_Position=vec4(aPos,0,1);}`;

function _fragSrc(snippet) {
  return `
  precision mediump float;
  varying vec2 uv;
  uniform sampler2D uSource;
  uniform vec2 iResolution;
  uniform float iTime;
  void main() {
    vec3 col = texture2D(uSource, uv).rgb;
    ${snippet}
  }`;
}

function _compile(gl, frag) {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, VERT); gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, frag); gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.warn('[ShapeMask] frag error:', gl.getShaderInfoLog(fs));
    gl.deleteShader(vs); gl.deleteShader(fs); return null;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[ShapeMask] link error:', gl.getProgramInfoLog(prog)); return null;
  }
  return prog;
}

export function initShapeMask(gl) {
  _gl = gl;
  _quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, _quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
}

export function applyShapeMask(gl, srcTexture, outputFBO, w, h) {
  if (!_enabled || _type === 'none') return srcTexture;
  const snippet = buildShapeGLSL();
  if (!snippet) return srcTexture;

  if (!_prog) _prog = _compile(gl, _fragSrc(snippet));
  if (!_prog) return srcTexture;

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

  gl.viewport(0, 0, w, h);
  gl.useProgram(_prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, _quadBuf);
  const aPos = gl.getAttribLocation(_prog, 'aPos');
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(aPos);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, srcTexture);
  gl.uniform1i(gl.getUniformLocation(_prog, 'uSource'), 0);
  gl.uniform2f(gl.getUniformLocation(_prog, 'iResolution'), w, h);
  gl.uniform1f(gl.getUniformLocation(_prog, 'iTime'), performance.now() / 1000);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.bindFramebuffer(gl.FRAMEBUFFER, outputFBO ?? null);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(tex);
  return tex;
}

export function destroyShapeMask(gl) {
  if (_prog)    { gl.deleteProgram(_prog); _prog = null; }
  if (_quadBuf) { gl.deleteBuffer(_quadBuf); _quadBuf = null; }
}
