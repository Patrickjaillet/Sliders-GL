/**
 * fx-stack.js — F-2.2 (Axe 2)
 *
 * Stack de post-effets WebGL composables.
 * Chaque effet est une passe fragment shader sur le framebuffer courant.
 *
 * Effets disponibles :
 *   vignette, grain, chromatic, crt, dithering, pixelation,
 *   kuwahara, halftone, ascii, sobel
 *
 * API publique :
 *   initFXStack(gl)
 *   setFXEnabled(effectId, enabled)
 *   setFXParam(effectId, key, value)
 *   getFXState()
 *   getFXDefinitions()
 *   applyFXStack(gl, sourceTexture, outputFramebuffer) → void
 *   destroyFXStack(gl)
 */

// ── Définitions des effets ─────────────────────────────────────────────────────

export const FX_DEFINITIONS = [
  {
    id: 'vignette',
    name: 'Vignette',
    icon: '◯',
    desc: 'Assombrit les bords de l\'image',
    params: { strength: { label: 'Force', min: 0, max: 2, step: 0.05, default: 0.6 } },
    frag: /* glsl */`
      uniform float uFxStrength;
      vec3 fx_vignette(vec3 col, vec2 uv) {
          vec2 d = uv - 0.5;
          float vig = 1.0 - dot(d, d) * uFxStrength * 3.0;
          return col * clamp(vig, 0.0, 1.0);
      }
    `,
  },
  {
    id: 'grain',
    name: 'Grain',
    icon: '⠿',
    desc: 'Bruit pellicule cinématique',
    params: {
      strength: { label: 'Force', min: 0, max: 0.5, step: 0.01, default: 0.08 },
      size:     { label: 'Taille', min: 0.5, max: 3, step: 0.1, default: 1.0 },
    },
    frag: /* glsl */`
      uniform float uFxStrength;
      uniform float uFxSize;
      uniform float uTime;
      float _grainHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      vec3 fx_grain(vec3 col, vec2 uv) {
          vec2 g = uv * (1.0 / uFxSize) + uTime * 0.003;
          float n = _grainHash(floor(g * 512.0)) * 2.0 - 1.0;
          return col + n * uFxStrength;
      }
    `,
  },
  {
    id: 'chromatic',
    name: 'Aberration chromatique',
    icon: '⬡',
    desc: 'Décalage RGB radial',
    params: { strength: { label: 'Force', min: 0, max: 0.02, step: 0.001, default: 0.005 } },
    frag: /* glsl */`
      uniform sampler2D uFxTex;
      uniform float uFxStrength;
      vec3 fx_chromatic(vec3 col, vec2 uv) {
          vec2 d = (uv - 0.5) * uFxStrength;
          float r = texture2D(uFxTex, uv + d * 1.0).r;
          float g = texture2D(uFxTex, uv).g;
          float b = texture2D(uFxTex, uv - d * 1.0).b;
          return vec3(r, g, b);
      }
    `,
  },
  {
    id: 'crt',
    name: 'CRT / Scanlines',
    icon: '▬',
    desc: 'Scanlines et courbure tube cathodique',
    params: {
      scanlines: { label: 'Scanlines', min: 0, max: 1, step: 0.05, default: 0.3 },
      barrel:    { label: 'Barrel distortion', min: 0, max: 0.3, step: 0.01, default: 0.08 },
    },
    frag: /* glsl */`
      uniform float uFxScanlines;
      uniform float uFxBarrel;
      uniform sampler2D uFxTex;
      vec3 fx_crt(vec3 col, vec2 uv) {
          // Barrel distortion
          vec2 cc = uv - 0.5;
          float dist = dot(cc, cc) * uFxBarrel;
          uv = uv * (1.0 + dist * (1.0 + dist * 1.5)) - dist * 0.5 * (1.0 + dist);
          if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec3(0.0);
          col = texture2D(uFxTex, uv).rgb;
          // Scanlines
          float sl = sin(uv.y * 800.0) * 0.5 + 0.5;
          col *= 1.0 - uFxScanlines * (1.0 - sl);
          return col;
      }
    `,
  },
  {
    id: 'dithering',
    name: 'Dithering',
    icon: '▦',
    desc: 'Dithering Bayer 4×4',
    params: { levels: { label: 'Niveaux', min: 2, max: 32, step: 1, default: 8 } },
    frag: /* glsl */`
      uniform float uFxLevels;
      vec3 fx_dithering(vec3 col, vec2 uv) {
          mat4 bayer = mat4(
              0.0/16.0, 8.0/16.0, 2.0/16.0,10.0/16.0,
             12.0/16.0, 4.0/16.0,14.0/16.0, 6.0/16.0,
              3.0/16.0,11.0/16.0, 1.0/16.0, 9.0/16.0,
             15.0/16.0, 7.0/16.0,13.0/16.0, 5.0/16.0
          );
          ivec2 idx = ivec2(mod(gl_FragCoord.xy, 4.0));
          float threshold = bayer[idx.y][idx.x] - 0.5;
          float l = uFxLevels - 1.0;
          return floor(col * l + threshold + 0.5) / l;
      }
    `,
  },
  {
    id: 'pixelation',
    name: 'Pixelisation',
    icon: '▪',
    desc: 'Réduit la résolution effective',
    params: { size: { label: 'Taille px', min: 1, max: 32, step: 1, default: 4 } },
    frag: /* glsl */`
      uniform sampler2D uFxTex;
      uniform float uFxSize;
      uniform vec2 uResolution;
      vec3 fx_pixelation(vec3 col, vec2 uv) {
          vec2 px = uFxSize / uResolution;
          vec2 snapped = (floor(uv / px) + 0.5) * px;
          return texture2D(uFxTex, snapped).rgb;
      }
    `,
  },
  {
    id: 'kuwahara',
    name: 'Kuwahara',
    icon: '◈',
    desc: 'Filtre peinture à l\'huile (lissage préservant les bords)',
    params: { radius: { label: 'Rayon', min: 1, max: 6, step: 1, default: 3 } },
    frag: /* glsl */`
      uniform sampler2D uFxTex;
      uniform float uFxRadius;
      uniform vec2 uResolution;
      vec3 fx_kuwahara(vec3 col, vec2 uv) {
          vec2 d = 1.0 / uResolution;
          float r = floor(uFxRadius);
          vec3 meanBest = vec3(0); float varBest = 1e9;
          for (int qy = -1; qy <= 1; qy++) for (int qx = -1; qx <= 1; qx++) {
              vec3 m = vec3(0); vec3 m2 = vec3(0); float cnt = 0.0;
              for (float y = float(qy) * r; y <= float(qy) * r + r; y++)
                  for (float x = float(qx) * r; x <= float(qx) * r + r; x++) {
                      vec3 s = texture2D(uFxTex, uv + vec2(x, y) * d).rgb;
                      m += s; m2 += s * s; cnt += 1.0;
                  }
              m /= cnt; m2 /= cnt;
              float v = dot(m2 - m * m, vec3(1.0));
              if (v < varBest) { varBest = v; meanBest = m; }
          }
          return meanBest;
      }
    `,
  },
  {
    id: 'halftone',
    name: 'Halftone',
    icon: '●',
    desc: 'Points de trame façon impression offset',
    params: {
      size:  { label: 'Taille', min: 2, max: 20, step: 1, default: 6 },
      angle: { label: 'Angle °', min: 0, max: 90, step: 5, default: 45 },
    },
    frag: /* glsl */`
      uniform float uFxSize;
      uniform float uFxAngle;
      uniform vec2 uResolution;
      vec3 fx_halftone(vec3 col, vec2 uv) {
          float luma = dot(col, vec3(0.299, 0.587, 0.114));
          float a = uFxAngle * 3.14159 / 180.0;
          mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
          vec2 p = rot * (uv * uResolution / uFxSize);
          vec2 fp = fract(p) - 0.5;
          float r = (1.0 - luma) * 0.5;
          float dot_ = step(dot(fp, fp), r * r);
          return vec3(dot_);
      }
    `,
  },
  {
    id: 'ascii',
    name: 'ASCII Art',
    icon: 'A',
    desc: 'Rendu ASCII basé sur la luminance',
    params: {
      size:  { label: 'Taille', min: 4, max: 16, step: 2, default: 8 },
    },
    frag: /* glsl */`
      uniform sampler2D uFxTex;
      uniform float uFxSize;
      uniform vec2 uResolution;
      float _lumaS(vec2 uv) { return dot(texture2D(uFxTex, uv).rgb, vec3(0.299,0.587,0.114)); }
      vec3 fx_ascii(vec3 col, vec2 uv) {
          vec2 cellUV = floor(uv * uResolution / uFxSize) * uFxSize / uResolution;
          float brightness = _lumaS(cellUV + 0.5 * uFxSize / uResolution);
          // Map brightness to one of 8 "density" patterns using a 2x2 checker
          vec2 local = fract(uv * uResolution / uFxSize);
          int level = int(brightness * 7.999);
          float[8] thresholds; thresholds[0]=0.0; thresholds[1]=0.15; thresholds[2]=0.3;
          thresholds[3]=0.45; thresholds[4]=0.6; thresholds[5]=0.75;
          thresholds[6]=0.88; thresholds[7]=1.0;
          // Simple block char simulation
          float on = step(thresholds[level], 0.5);
          return vec3(on * brightness);
      }
    `,
  },
  {
    id: 'sobel',
    name: 'Sobel (contours)',
    icon: '⊡',
    desc: 'Détection de contours style Sobel',
    params: { strength: { label: 'Force', min: 0, max: 2, step: 0.1, default: 1.0 } },
    frag: /* glsl */`
      uniform sampler2D uFxTex;
      uniform float uFxStrength;
      uniform vec2 uResolution;
      float _lumaP(vec2 uv) { return dot(texture2D(uFxTex, uv).rgb, vec3(0.299,0.587,0.114)); }
      vec3 fx_sobel(vec3 col, vec2 uv) {
          vec2 d = 1.0 / uResolution;
          float tl=_lumaP(uv+vec2(-1,-1)*d), tc=_lumaP(uv+vec2(0,-1)*d), tr=_lumaP(uv+vec2(1,-1)*d);
          float ml=_lumaP(uv+vec2(-1, 0)*d),                              mr=_lumaP(uv+vec2(1, 0)*d);
          float bl=_lumaP(uv+vec2(-1, 1)*d), bc=_lumaP(uv+vec2(0, 1)*d), br=_lumaP(uv+vec2(1, 1)*d);
          float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
          float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;
          float edge = length(vec2(gx, gy)) * uFxStrength;
          return vec3(clamp(edge, 0.0, 1.0));
      }
    `,
  },
];

// ── État du stack ─────────────────────────────────────────────────────────────

const _fxState = {};

for (const fx of FX_DEFINITIONS) {
  const params = {};
  for (const [key, def] of Object.entries(fx.params || {})) {
    params[key] = def.default;
  }
  _fxState[fx.id] = { enabled: false, params };
}

export function getFXDefinitions() { return FX_DEFINITIONS; }

export function getFXState() {
  return Object.fromEntries(
    Object.entries(_fxState).map(([id, s]) => [id, { enabled: s.enabled, params: { ...s.params } }])
  );
}

export function setFXEnabled(id, enabled) {
  if (_fxState[id]) _fxState[id].enabled = !!enabled;
}

export function setFXParam(id, key, value) {
  if (_fxState[id]?.params) _fxState[id].params[key] = value;
}

// ── Runtime WebGL minimal ─────────────────────────────────────────────────────
// NOTE: L'intégration WebGL complète nécessite d'être raccordée au renderer
// principal (perf.js). Ces helpers fournissent la logique de compilation et
// d'application de chaque passe pour permettre à perf.js de les utiliser.

const _vert = /* glsl */`
attribute vec2 aPos;
varying vec2 vUV;
void main() { vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const _wrapFrag = (effectFrag, callExpr) => /* glsl */`
precision highp float;
varying vec2 vUV;
uniform sampler2D uFxTex;
uniform vec2 uResolution;
uniform float uTime;
${effectFrag}
void main() {
    vec3 col = texture2D(uFxTex, vUV).rgb;
    col = ${callExpr}(col, vUV);
    gl_FragColor = vec4(col, 1.0);
}
`;

let _quad = null;
const _programs = {};
const _fbos = [null, null];
const _textures = [null, null];

export function initFXStack(gl) {
  // Geometry quad
  if (!_quad) {
    _quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, _quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  }
  // Compile programs for enabled effects lazily
  for (const fx of FX_DEFINITIONS) {
    if (!_programs[fx.id]) {
      const callName = 'fx_' + fx.id;
      const prog = _compile(gl, _vert, _wrapFrag(fx.frag, callName));
      if (prog) _programs[fx.id] = prog;
    }
  }
}

export function destroyFXStack(gl) {
  for (const prog of Object.values(_programs)) gl.deleteProgram(prog);
  for (const fbo of _fbos) if (fbo) gl.deleteFramebuffer(fbo);
  for (const tex of _textures) if (tex) gl.deleteTexture(tex);
  if (_quad) { gl.deleteBuffer(_quad); _quad = null; }
}

/**
 * Applique toutes les passes actives.
 * @param {WebGLRenderingContext} gl
 * @param {WebGLTexture} sourceTexture — texture de la scène rendue
 * @param {WebGLFramebuffer|null} outputFBO — null = écriture à l'écran
 * @param {number} width
 * @param {number} height
 */
export function applyFXStack(gl, sourceTexture, outputFBO, width, height) {
  const active = FX_DEFINITIONS.filter(fx => _fxState[fx.id]?.enabled && _programs[fx.id]);
  if (!active.length) return;

  // Ensure ping-pong FBOs
  _ensureFBOs(gl, width, height);

  let readTex = sourceTexture;
  let writeIdx = 0;

  for (let i = 0; i < active.length; i++) {
    const fx = active[i];
    const isLast = i === active.length - 1;
    const writeFBO = isLast ? outputFBO : _fbos[writeIdx];

    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
    gl.viewport(0, 0, width, height);

    const prog = _programs[fx.id];
    gl.useProgram(prog);

    // Uniforms communs
    _setUniform(gl, prog, 'uFxTex', 0);
    _setUniform(gl, prog, 'uResolution', [width, height]);
    _setUniform(gl, prog, 'uTime', performance.now() / 1000);

    // Uniforms spécifiques de l'effet
    const state = _fxState[fx.id].params;
    for (const [key, val] of Object.entries(state)) {
      const uniformName = 'uFx' + key.charAt(0).toUpperCase() + key.slice(1);
      _setUniform(gl, prog, uniformName, val);
    }

    // Texture source
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTex);

    // Draw quad
    gl.bindBuffer(gl.ARRAY_BUFFER, _quad);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (!isLast) {
      readTex = _textures[writeIdx];
      writeIdx = 1 - writeIdx;
    }
  }
}

// ── Helpers GL ────────────────────────────────────────────────────────────────

function _compile(gl, vertSrc, fragSrc) {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vertSrc); gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fragSrc); gl.compileShader(fs);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[fx-stack] shader link error:', gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog); return null;
  }
  return prog;
}

function _setUniform(gl, prog, name, value) {
  const loc = gl.getUniformLocation(prog, name);
  if (!loc) return;
  if (Array.isArray(value)) {
    if (value.length === 2) gl.uniform2fv(loc, value);
    else if (value.length === 3) gl.uniform3fv(loc, value);
    else gl.uniform4fv(loc, value);
  } else if (typeof value === 'number') {
    gl.uniform1f(loc, value);
  } else if (typeof value === 'boolean') {
    gl.uniform1i(loc, value ? 1 : 0);
  }
}

let _fboSize = [0, 0];
function _ensureFBOs(gl, w, h) {
  if (_fboSize[0] === w && _fboSize[1] === h && _fbos[0]) return;
  for (let i = 0; i < 2; i++) {
    if (_textures[i]) gl.deleteTexture(_textures[i]);
    if (_fbos[i]) gl.deleteFramebuffer(_fbos[i]);
    _textures[i] = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, _textures[i]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    _fbos[i] = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, _fbos[i]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, _textures[i], 0);
  }
  _fboSize = [w, h];
}
