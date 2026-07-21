
import * as THREE from 'three';
import { state } from '../core/state.js';
import { EXAMPLE } from '../core/constants.js';
import { explainGLSLError } from '../shader/glsl-error-explain.js';
import { toast } from '../io/actions.js';
import { shaderNeedsRecompile, markCompiled } from '../render/shader-cache.js';
import { initGpuCache, isCached, recordSuccess, shaderCacheKey } from '../render/gpu-program-cache.js';
import { _makeFullScreenTriangle, _VERT_TRIANGLE, _applyResolution, getActiveResolutionPreset } from '../render/resolution.js';
import { startLoop } from '../render/raf-loop.js';
import { capturePrevFrameChannels } from '../channels/channels-prevframe.js';
import { fpsColorClass } from '../core/utils.js';

export const VERT = 'void main(){gl_Position=vec4(position,1.0);}';

const _domRefs = {
  cwrap: null,
  respill: null,
  fpspill: null,
  fps: null,
  gputpill: null,
  perfAlertBadge: null,
  tpill: null,
};

function _cacheDomRefs() {
  _domRefs.cwrap ??= document.getElementById('cwrap');
  _domRefs.respill ??= document.getElementById('respill');
  _domRefs.fpspill ??= document.getElementById('fpspill');
  _domRefs.fps ??= document.getElementById('fps');
  _domRefs.gputpill ??= document.getElementById('gputpill');
  _domRefs.perfAlertBadge ??= document.getElementById('perfAlertBadge');
  _domRefs.tpill ??= document.getElementById('tpill');
  return _domRefs;
}

// F-7.4 — blend mode GLSL constants (must match mpSetChannelBlend() indices)
const _BLEND_MODES = ['normal','add','multiply','screen','overlay','mask_alpha','difference'];

// F-7.4 — blend mode descriptions shown in the context menu.
// Fix 3.17 — Renamed from _BLEND_DESCS: underscore prefix signals private/internal,
// but this value is exported and consumed by multipass.js. Use BLEND_DESCS instead.
export const BLEND_DESCS = {
  normal:     'Pass-through — raw texture value',
  add:        '+ Exposure ×2 — additive brightness boost (src + src)',
  multiply:   '× Darken — gamma-style tone curve (src²)',
  screen:     '◌ Lighten — inverse gamma lift (1−(1−src)²)',
  overlay:    '◑ Contrast — S-curve (hard mix at 0.5)',
  mask_alpha: 'α Premult — RGB × alpha (straight→premultiplied)',
  difference: '∆ Invert — 1 − src (negative/complement)',
};

// F-7.4 — sampleChannel() GLSL helper injected into every wrapped shader.
// Each mode is a TONE TRANSFORM applied to the channel texture (self-blending):
//   normal      → identity
//   add (1)     → 2×brightness  (src + src)
//   multiply (2)→ gamma darken  (src²)
//   screen (3)  → gamma lift    (1−(1−src)²)
//   overlay (4) → S-curve contrast
//   mask_alpha (5) → premultiply RGB by alpha
//   difference (6) → invert     (1−src)
const _SAMPLE_CHANNEL_GLSL = `
uniform int iChannelMode[4];
vec4 sampleChannel(int ch, vec2 uv) {
  vec4 src = vec4(0.0);
  if (ch == 0) src = texture2D(iChannel0, uv);
  else if (ch == 1) src = texture2D(iChannel1, uv);
  else if (ch == 2) src = texture2D(iChannel2, uv);
  else              src = texture2D(iChannel3, uv);
  int mode = iChannelMode[ch];
  if (mode == 0) return src;                                            // normal
  if (mode == 1) return vec4(min(src.rgb * 2.0, 1.0), src.a);          // add: ×2 exposure
  if (mode == 2) return vec4(src.rgb * src.rgb, src.a);                 // multiply: src²
  if (mode == 3) return vec4(1.0-(1.0-src.rgb)*(1.0-src.rgb), src.a);  // screen: lift
  if (mode == 4) {                                                       // overlay: S-curve
    vec3 r = vec3(
      src.r < 0.5 ? 2.0*src.r*src.r : 1.0-2.0*(1.0-src.r)*(1.0-src.r),
      src.g < 0.5 ? 2.0*src.g*src.g : 1.0-2.0*(1.0-src.g)*(1.0-src.g),
      src.b < 0.5 ? 2.0*src.b*src.b : 1.0-2.0*(1.0-src.b)*(1.0-src.b)
    );
    return vec4(r, src.a);
  }
  if (mode == 5) return vec4(src.rgb * src.a, src.a);                   // mask_alpha: premult
  if (mode == 6) return vec4(1.0 - src.rgb, src.a);                     // difference: invert
  return src;
}`;

export function wrapFrag(userCode) {
  const hasMain = /void\s+mainImage\s*\(/.test(userCode);
  const channelDecls = [];
  for (let i = 0; i < 4; i++) {
    if (new RegExp('iChannel' + i).test(userCode)) {
      const ch = (typeof state !== 'undefined') ? state.channels?.[i] : null;
      const is3D = ch?.type === 'volume';
      channelDecls.push('uniform ' + (is3D ? 'sampler3D' : 'sampler2D') + ' iChannel' + i + ';');
    }
  }
  // F-7.4 — always inject sampleChannel() so shaders can opt-in to blend modes
  const needsChannel = /iChannel[0-3]/.test(userCode);
  const blendHelper = needsChannel ? _SAMPLE_CHANNEL_GLSL : '';
  let frag = `precision highp float;
uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform vec3 iAccel;
uniform vec3 iGyro;
uniform vec2 iGaze;
uniform float iHeart;
uniform float iGSR;
uniform float iPressure;
uniform vec2 iTilt;
${channelDecls.join('\n')}${blendHelper}
#line 1
${userCode}`;
  if (hasMain) frag += '\nvoid main(){vec4 o=vec4(0);mainImage(o,gl_FragCoord.xy);gl_FragColor=clamp(o,0.0,1.0);}';
  else if (!/void\s+main\s*\(/.test(userCode)) {
    frag += '\nvoid main(){gl_FragColor=vec4(0.5,0.2,0.8,1.0);}';
  }
  return frag;
}

export { _BLEND_MODES };

/**
 * Wrap a cube-pass fragment shader.
 * Declares uniform int iFace (0=+X,1=-X,2=+Y,3=-Y,4=+Z,5=-Z) plus
 * samplerCube iChannelN for cube-sourced channels, sampler2D otherwise.
 *
 * @param {string}      userCode    - raw GLSL user shader
 * @param {Set<number>} cubeChannels - channel indices that carry a cube texture
 */
export function wrapFragCube(userCode, cubeChannels = new Set()) {
  const hasMain = /void\s+mainImage\s*\(/.test(userCode);
  const channelDecls = [];
  for (let i = 0; i < 4; i++) {
    if (new RegExp('iChannel' + i).test(userCode)) {
      const ch = (typeof state !== 'undefined') ? state.channels?.[i] : null;
      const is3D = ch?.type === 'volume';
      const type = is3D ? 'sampler3D' : cubeChannels.has(i) ? 'samplerCube' : 'sampler2D';
      channelDecls.push('uniform ' + type + ' iChannel' + i + ';');
    }
  }
  let frag = `precision highp float;\nuniform vec3 iResolution;\nuniform float iTime;\nuniform float iTimeDelta;\nuniform int iFrame;\nuniform vec4 iMouse;\nuniform int iFace;\n${channelDecls.join('\n')}\n#line 1\n${userCode}`;
  if (hasMain) frag += '\nvoid main(){vec4 o=vec4(0);mainImage(o,gl_FragCoord.xy);gl_FragColor=clamp(o,0.0,1.0);}';
  else if (!/void\s+main\s*\(/.test(userCode)) {
    frag += '\nvoid main(){gl_FragColor=vec4(0.5,0.2,0.8,1.0);}';
  }
  return frag;
}

function makeDummyTexture() {
  const data = new Uint8Array([0, 0, 0, 255]);
  const tex  = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

export function buildUniforms(extra) {
  const base = {
    iResolution:        { value: new THREE.Vector3(800, 600, 1) },
    iTime:              { value: 0 },
    iTimeDelta:         { value: 0.016 },
    iFrame:             { value: 0 },
    iMouse:             { value: new THREE.Vector4(0, 0, 0, 0) },
    iJitter:            { value: new THREE.Vector2(0, 0) },
    iChannel0:          { value: makeDummyTexture() },
    iChannel1:          { value: makeDummyTexture() },
    iChannel2:          { value: makeDummyTexture() },
    iChannel3:          { value: makeDummyTexture() },
    iChannelResolution: { value: [
      new THREE.Vector3(1, 1, 1),
      new THREE.Vector3(1, 1, 1),
      new THREE.Vector3(1, 1, 1),
      new THREE.Vector3(1, 1, 1),
    ]},
    iChannelMode:       { value: [0, 0, 0, 0] },  // F-7.4: blend modes per channel
    // F-7.2 — G-Buffer textures (populated by gbuffer.js when a pass outputs MRT)
    iGBufColor:  { value: makeDummyTexture() },
    iGBufNormal: { value: makeDummyTexture() },
    iGBufDepth:  { value: makeDummyTexture() },
    // F-7.1 — Compute pass output textures
    iCompA: { value: makeDummyTexture() },
    iCompB: { value: makeDummyTexture() },
    iAccel:    { value: new THREE.Vector3(0, 0, 0) },
    iGyro:     { value: new THREE.Vector3(0, 0, 0) },
    iDepth:    { value: makeDummyTexture() },
    iGaze:     { value: new THREE.Vector2(0.5, 0.5) },
    iHeart:    { value: 0 },
    iGSR:      { value: 0 },
    iPressure: { value: 0 },
    iTilt:     { value: new THREE.Vector2(0, 0) },
  };
  return Object.assign(base, extra || {});
}

function _buildFragPrecheckSource(gl, fragSrc) {
  const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  if (!isWebGL2) return fragSrc;
  return `#version 300 es
#define varying in
out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
#define texture2D texture
#define textureCube texture
#define texture2DProj textureProj
#define texture2DLodEXT textureLod
#define texture2DProjLodEXT textureProjLod
#define textureCubeLodEXT textureLod
#line 1
${fragSrc}`;
}

export function checkFragCompile(fragSrc) {
  if (!state.renderer3) return null;
  const gl  = state.renderer3.getContext();
  const src = _buildFragPrecheckSource(gl, fragSrc);
  const sh  = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  const ok  = gl.getShaderParameter(sh, gl.COMPILE_STATUS);
  const log = gl.getShaderInfoLog(sh) || '';
  gl.deleteShader(sh);
  if (!ok) return log || 'Shader compilation failed';
  if (log.trim() && /error/i.test(log)) return log;
  return null;
}

const COMP_W = 800;
const COMP_H = 450;

export function initGL(canvas, width, height) {
  if (!canvas) {
    canvas = document.getElementById('glc');
    width  = COMP_W;
    height = COMP_H;
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 1);

  const scene    = new THREE.Scene();
  const camera   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  camera.position.z = 1;

  const geometry = _makeFullScreenTriangle();
  const material = new THREE.ShaderMaterial({
    vertexShader:   _VERT_TRIANGLE,
    fragmentShader: wrapFrag(EXAMPLE),
    uniforms:       buildUniforms(),
    depthTest:      false,
    depthWrite:     false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  state.renderer3 = renderer;
  state.scene3    = scene;
  state.cam3      = camera;
  state.mat3      = material;
  state.mesh3     = mesh;
  _cacheDomRefs();

  // Phase 22.2 — Initialiser le cache GPU persistant (IndexedDB) après avoir
  // le contexte WebGL disponible. On récupère les strings GPU via gl-caps.
  (async () => {
    try {
      const gl  = renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const gpuVendor   = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)   : 'unknown';
      const gpuRenderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
      await initGpuCache(gpuRenderer, gpuVendor);
    } catch (err) {
      console.warn('[initGL] gpu-program-cache init failed (non-blocking):', err.message);
    }
  })();

  state.mat3._ownedDummies = [0,1,2,3]
    .map(i => material.uniforms['iChannel' + i]?.value)
    .filter(Boolean);

  doResize();
  window.addEventListener('resize', doResize);

  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    if (state.mat3) {
      state.mat3.uniforms.iMouse.value.set(
        e.clientX - r.left,
        r.height - (e.clientY - r.top),
        e.buttons > 0 ? 1 : 0,
        0
      );
    }
  });

  if (state.callbacks.initPostProcess) state.callbacks.initPostProcess();

  loop();
  return { renderer, scene, camera, material };
}

export function doResize() {
  const { respill } = _cacheDomRefs();
  if (!state.renderer3) return;

  if (getActiveResolutionPreset() !== 'viewport') {
    _applyResolution();
    return;
  }

  const w = COMP_W;
  const h = COMP_H;
  state.renderer3.setPixelRatio(1);
  state.renderer3.setSize(w, h, false);
  if (state.mat3) state.mat3.uniforms.iResolution.value.set(w, h, 1);
  if (state.callbacks.resizePostRT) state.callbacks.resizePostRT(w, h);
  if (state.callbacks.mpResizeRTs)  state.callbacks.mpResizeRTs(w, h);
  if (respill) respill.textContent = `${w} \u00d7 ${h}`;
  const statusRes = document.getElementById('statusRes');
  if (statusRes) statusRes.textContent = `${w} \u00d7 ${h}`;
}

let _rafRunning = false;

export function loop() {
  if (_rafRunning) {
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      console.warn('[gl/renderer] loop() called twice — duplicate RAF start suppressed');
    }
    return;
  }
  _rafRunning = true;

  const canvas = state.renderer3?.domElement ?? document.getElementById('glc');
  startLoop(canvas);
}

function halton(index, base) {
  let result = 0.0;
  let f = 1.0;
  let i = index;
  while (i > 0) {
    f = f / base;
    result = result + f * (i % base);
    i = Math.floor(i / base);
  }
  return result;
}

function _tick() {
  requestAnimationFrame(_tick);
  const dom = _cacheDomRefs();
  const now = performance.now();

  if (state.perf.fpsCap > 0) {
    const interval = 1000 / state.perf.fpsCap;
    if (!state.perf._lastFrameMs) state.perf._lastFrameMs = now;
    const elapsed = now - state.perf._lastFrameMs;
    if (elapsed < interval) return;

    const steps = Math.max(1, Math.floor(elapsed / interval));
    state.perf._lastFrameMs += steps * interval;
  } else {
    state.perf._lastFrameMs = now;
  }

  const dt = Math.min((now - state.lastTs) / 1000, 0.1);
  state.lastTs = now;
  if (!state.paused) state.simTime += dt;
  if (state.mat3) {
    state.mat3.uniforms.iTime.value      = state.simTime;
    state.mat3.uniforms.iTimeDelta.value = dt;
    state.mat3.uniforms.iFrame.value     = state.fidx++;
    // per-frame sub-pixel jitter (Halton sequence)
    if (state.mat3.uniforms.iJitter) {
      const frameIndex = state.mat3.uniforms.iFrame.value || 0;
      const jx = halton(frameIndex + 1, 2) - 0.5;
      const jy = halton(frameIndex + 1, 3) - 0.5;
      state.mat3.uniforms.iJitter.value.set(jx, jy);
    }
  }

  if (
    state.callbacks.updateAudioTextures &&
    state.channels.some(ch => ch.analyser && ch.audioDataTex)
  ) {
    state.callbacks.updateAudioTextures();
  }

  const t0 = performance.now();

  if (state.callbacks.renderMultiPass) state.callbacks.renderMultiPass(dt);

  if (state.perf.postEnabled && state.perf.postRT) {
    state.renderer3.setRenderTarget(state.perf.postRT);
    state.renderer3.render(state.scene3, state.cam3);
    if (state.callbacks.renderTAA) state.callbacks.renderTAA();
    if (state.callbacks.syncPostUniforms) state.callbacks.syncPostUniforms();
    if (state.callbacks.renderColorBlindness) state.callbacks.renderColorBlindness();
    if (state.callbacks.renderPostIntegration) state.callbacks.renderPostIntegration();
    if (state.perf.fxaa && state.perf.fxaaRT) {
      state.renderer3.setRenderTarget(state.perf.fxaaRT);
      state.renderer3.render(state.perf.postScene, state.perf.postCam);
      if (state.callbacks.renderFXAA) state.callbacks.renderFXAA();
    } else {
      state.renderer3.setRenderTarget(null);
      state.renderer3.render(state.perf.postScene, state.perf.postCam);
    }
  } else {
    state.renderer3.render(state.scene3, state.cam3);
  }

  capturePrevFrameChannels();

  const frameMs = performance.now() - t0;
  state.perf.cpuMs = state.perf.cpuMs * 0.85 + frameMs * 0.15;

  if (state.callbacks.updateSparkline) state.callbacks.updateSparkline(frameMs);

  state.fcount++; state.ftimer += dt;
  if (state.ftimer >= 0.5) {
    const fps = Math.round(state.fcount / state.ftimer);
    if (dom.fpspill) {
      dom.fpspill.textContent = fps + ' FPS';
      dom.fpspill.classList.remove('fps-good', 'fps-warn', 'fps-bad');
      dom.fpspill.classList.add(fpsColorClass(fps));
    }
    if (dom.fps)     dom.fps.textContent     = fps + ' fps';
    state.fcount = 0; state.ftimer = 0;
  }

  const gpuEl = dom.gputpill;
  if (gpuEl && gpuEl.style.display !== 'none') {
    gpuEl.textContent = '~' + state.perf.cpuMs.toFixed(1) + ' ms';
  }

  if (state.perf.alertEnabled) {
    const badge = dom.perfAlertBadge;
    if (badge) badge.classList.toggle('visible', state.perf.cpuMs > 16);
  }

  if (dom.tpill) dom.tpill.textContent = 't = ' + state.simTime.toFixed(2);
}

export async function applyGLShader(code) {
  if (!state.mat3) return;
  const fragSrc = wrapFrag(code);

  // Phase 1.3 — In-memory cache (FNV-1a, session only)
  if (!shaderNeedsRecompile(fragSrc)) {
    return true;
  }

  // Phase 22.2 — Cache persistant IDB : si ce shader a déjà été compilé avec
  // succès sur ce GPU + cette version Z-GL, on saute checkFragCompile() (coûteux).
  const cacheKey = await shaderCacheKey(fragSrc);
  const gpuCached = await isCached(cacheKey);

  if (!gpuCached) {
    const errLog = checkFragCompile(fragSrc);
    if (errLog) { showErr(errLog); return false; }
  }

  if (Array.isArray(state.mat3._ownedDummies)) {
    state.mat3._ownedDummies.forEach(t => { try { t.dispose(); } catch(e){} });
  }

  const prev = state.mat3.uniforms;
  const chanUniforms = {};
  const newDummies = [];
  state.channels.forEach((ch, i) => {
    const tex = ch.texture;
    if (tex) {
      chanUniforms['iChannel' + i] = { value: tex };
    } else {
      const d = makeDummyTexture();
      newDummies.push(d);
      chanUniforms['iChannel' + i] = { value: d };
    }
  });

  state.mat3.uniforms = {
    iResolution: prev.iResolution,
    iTime:       prev.iTime,
    iTimeDelta:  prev.iTimeDelta,
    iFrame:      prev.iFrame,
    iMouse:      prev.iMouse,
    ...chanUniforms,
  };
  state.mat3._ownedDummies = newDummies;
  state.mat3.fragmentShader = fragSrc;
  state.mat3.needsUpdate    = true;
  try {
    state.renderer3.render(state.scene3, state.cam3);
    hideErr();
    markCompiled(fragSrc);
    // Phase 22.2 — Persister le succès dans IDB (non bloquant)
    recordSuccess(cacheKey, fragSrc).catch(() => {});
    return true;
  } catch (ex) {
    showErr(String(ex));
    return false;
  }
}

export function updateUniforms(time, frame, mouse) {
  const uniforms = state.mat3?.uniforms;
  if (!uniforms) return;
  uniforms.iTime.value  = time;
  uniforms.iFrame.value = frame;
  if (mouse) uniforms.iMouse.value.copy(mouse);
  const renderer = state.renderer3;
  if (renderer) {
    const w   = renderer.domElement.width;
    const h   = renderer.domElement.height;
    const dpr = window.devicePixelRatio || 1;
    uniforms.iResolution.value.set(w, h, dpr);
  }
}

export function setChannelTexture(index, texture) {
  if (!state.mat3?.uniforms) return;
  const key = 'iChannel' + index;
  if (state.mat3.uniforms[key]) {
    state.mat3.uniforms[key].value = texture || makeDummyTexture();
  }
}

export function renderFrame() {
  if (state.renderer3 && state.scene3 && state.cam3) {
    state.renderer3.render(state.scene3, state.cam3);
  }
}

let errorDecorationIds = [];

function parseGLSLErrors(log) {
  const errors = [];
  const seen   = new Set();

  for (const raw of log.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    let lineNo = null;
    let colNo  = null;
    let msg    = null;

    let m = line.match(/^ERROR:\s*\d+:(\d+)(?::(\d+))?:\s*(.*)/i);
    if (m) {
      lineNo = parseInt(m[1], 10);
      colNo  = m[2] ? parseInt(m[2], 10) : null;
      msg    = m[3].trim();
    }

    if (!msg) {
      m = line.match(/^(\d+)(?::(\d+))?:\s*(?:error|warning):\s*(.*)/i);
      if (m) {
        lineNo = parseInt(m[1], 10);
        colNo  = m[2] ? parseInt(m[2], 10) : null;
        msg    = m[3].trim();
      }
    }

    if (!msg) {
      m = line.match(/^ERROR:\s*(\d+)(?::(\d+))?:\s*(.*)/i);
      if (m) {
        lineNo = parseInt(m[1], 10);
        colNo  = m[2] ? parseInt(m[2], 10) : null;
        msg    = m[3].trim();
      }
    }

    if (!msg) {
      m = line.match(/^(\d+):\s+(.*)/);
      if (m) {
        lineNo = parseInt(m[1], 10);
        msg    = m[2].trim();
      }
    }

    if (!msg && /error/i.test(line)) {
      msg = line;
    }

    if (!msg) continue;

    const key = `${lineNo}|${colNo}|${msg.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    errors.push({ lineNo, colNo, msg, raw });
  }

  return errors;
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _wrapOffset() {
  return 0;
}

// §B.2 (UI v2) — chorégraphie de compilation : pulse de bordure sur l'éditeur.
let _hadCompileError = false;
function _pulseEditor(kind) {
  const ez = document.getElementById('editorZone');
  if (!ez) return;
  ez.classList.remove('compile-pulse-ok', 'compile-pulse-err');
  void ez.offsetWidth; // reflow → redémarre l'animation
  ez.classList.add(kind === 'err' ? 'compile-pulse-err' : 'compile-pulse-ok');
  setTimeout(() => ez.classList.remove('compile-pulse-ok', 'compile-pulse-err'), 700);
  // Phase W — flash FPS pill on successful compile
  if (kind !== 'err') {
    const pill = document.getElementById('fpspill');
    if (pill) { pill.classList.remove('compile-ok'); void pill.offsetWidth; pill.classList.add('compile-ok'); setTimeout(() => pill.classList.remove('compile-ok'), 400); }
  }
  // §I.4 — repère sonore subtil (opt-in via le toggle son ; no-op si coupé)
  import('../ui/sound.js').then(m => m.playSound(kind === 'err' ? 'error' : 'confirm')).catch(() => {});
}

export function showErr(log) {
  setStatus('err');
  _hadCompileError = true;
  _pulseEditor('err');
  const errors     = parseGLSLErrors(log);
  const userCode   = state.editor ? state.editor.getValue() : '';
  const wrapOffset = _wrapOffset();

  const body    = document.getElementById('cerrBody');
  const wrap    = document.getElementById('cerrWrap');
  const countEl = document.getElementById('cerrCount');
  if (!body || !wrap || !countEl) return;

  const realErrors = errors.filter(e => e.lineNo !== null);
  const errCount = realErrors.length || errors.length;
  countEl.textContent = `${errCount} error${errors.length !== 1 ? 's' : ''}`;

  // §1.4 — compteur d'erreurs persistant dans la barre de statut,
  // visible même quand le panneau d'erreurs est replié.
  const sbErr = document.getElementById('sbErrCount');
  if (sbErr) {
    sbErr.textContent = `${errCount} error${errCount !== 1 ? 's' : ''}`;
    sbErr.hidden = false;
    sbErr.classList.remove('has-errors');
    void sbErr.offsetWidth;
    sbErr.classList.add('has-errors');
  }
  // §6.2 — annonce assertive pour les lecteurs d'écran
  const a11y = document.getElementById('a11y-alert');
  if (a11y) a11y.textContent = `Shader compile failed — ${errCount} error${errCount !== 1 ? 's' : ''}`;

  let html = '';
  errors.forEach(err => {
    const userLine = err.lineNo ? err.lineNo - wrapOffset : null;
    const lineStr  = userLine && userLine > 0 ? `L${userLine}` : '?';
    const jumpAttr = userLine > 0
      ? `data-action="jumpTo" data-args="${userLine - 1}" title="Jump to line ${userLine}"`
      : '';
    html += `<div class="cerr-line" ${jumpAttr}>
      <span class="cerr-lineno">${lineStr}</span>
      <span class="cerr-msg">${_esc(err.msg)}</span>
    </div>`;
    // §G.2 — explication déterministe (basée sur des règles, sans IA)
    const explain = explainGLSLError(err.msg);
    if (explain) html += `<div class="cerr-explain">💡 ${_esc(explain)}</div>`;
  });
  if (!errors.length) html = `<div class="cerr-raw">${_esc(log.slice(0, 400))}</div>`;
  body.innerHTML = html;

  wrap.classList.add('visible');
  wrap.classList.remove('collapsed');
  const cerrToggle = document.getElementById('cerrToggle');
  if (cerrToggle) cerrToggle.textContent = '▲';

  if (state.editor && typeof monaco !== 'undefined') {
    const model = state.editor.getModel();

    function _resolveColumns(editorLine, colNo) {
      if (!model) return { startCol: 1, endCol: 1, wholeLine: true };
      const lineCount = model.getLineCount();
      if (editorLine < 1 || editorLine > lineCount) {
        return { startCol: 1, endCol: 1, wholeLine: true };
      }
      const lineText = model.getLineContent(editorLine);
      const maxCol   = model.getLineMaxColumn(editorLine);

      if (colNo !== null && colNo >= 1 && colNo < maxCol) {

        let end = colNo;
        const isIdent = ch => /[A-Za-z0-9_]/.test(ch);
        const ch0 = lineText[colNo - 1] ?? '';
        if (isIdent(ch0)) {

          while (end < maxCol - 1 && isIdent(lineText[end])) end++;
        } else if (ch0 !== ' ' && ch0 !== '	') {

          end = colNo + 1;
        } else {

          return { startCol: 1, endCol: maxCol, wholeLine: true };
        }
        return { startCol: colNo, endCol: end, wholeLine: false };
      }

      return { startCol: 1, endCol: maxCol, wholeLine: true };
    }

    const decors = realErrors
      .filter(err => (err.lineNo - wrapOffset) > 0)
      .map(err => {
        const l   = err.lineNo - wrapOffset;
        const loc = _resolveColumns(l, err.colNo);
        const colHint = err.colNo ? ` (col ${err.colNo})` : '';
        return {
          range: new monaco.Range(l, loc.startCol, l, loc.endCol),
          options: {
            isWholeLine: loc.wholeLine,
            className: 'errorLineHighlight',
            glyphMarginClassName: 'errorGlyph',
            glyphMarginHoverMessage: { value: `**GLSL Error**${colHint} — ${err.msg}` },
            hoverMessage:           { value: `⛔ **${err.msg}**${colHint}` },
            after: {
              content: '  ⛔ ' + err.msg,
              inlineClassName: 'errorInlineMsg',
            },
            overviewRuler: { color: '#ff5050', position: monaco.editor.OverviewRulerLane.Full },
            minimap:       { color: '#ff5050', position: monaco.editor.MinimapPosition.Inline },
          },
        };
      });
    errorDecorationIds = state.editor.deltaDecorations(errorDecorationIds, decors);

    if (model) {
      const markers = realErrors
        .filter(err => (err.lineNo - wrapOffset) > 0)
        .map(err => {
          const editorLine = err.lineNo - wrapOffset;
          const loc = _resolveColumns(editorLine, err.colNo);
          return {
            startLineNumber: editorLine,
            startColumn:     loc.startCol,
            endLineNumber:   editorLine,
            endColumn:       loc.endCol,
            message:         err.msg,
            severity:        monaco.MarkerSeverity.Error,
            source:          'GLSL',

            code: err.colNo
              ? `L${editorLine}:${err.colNo}`
              : `L${editorLine}`,
          };
        });
      monaco.editor.setModelMarkers(model, 'glsl-renderer', markers);
    }
  }

  toast('Compile error', 'err');
}

export function hideErr() {
  setStatus('live');
  // §B.2 — ne pulse en vert que si on sort effectivement d'une erreur
  if (_hadCompileError) { _pulseEditor('ok'); _hadCompileError = false; }
  document.getElementById('cerrWrap')?.classList.remove('visible');
  // §1.4 — masque le compteur d'erreurs de la barre de statut
  const sbErr = document.getElementById('sbErrCount');
  if (sbErr) { sbErr.hidden = true; sbErr.classList.remove('has-errors'); }
  // §6.2 — efface l'annonce d'erreur (succès de compilation)
  const a11y = document.getElementById('a11y-alert');
  if (a11y) a11y.textContent = '';
  if (state.editor && typeof monaco !== 'undefined') {
    errorDecorationIds = state.editor.deltaDecorations(errorDecorationIds, []);
    const model = state.editor.getModel();
    if (model) {
      monaco.editor.setModelMarkers(model, 'glsl-renderer', []);
    }
  }
}

let errPanelCollapsed = false;
export function toggleErrPanel() {
  errPanelCollapsed = !errPanelCollapsed;
  const wrap   = document.getElementById('cerrWrap');
  const toggle = document.getElementById('cerrToggle');
  wrap?.classList.toggle('collapsed', errPanelCollapsed);
  if (toggle) toggle.textContent = errPanelCollapsed ? '▼' : '▲';
}

function setStatus(s) {
  const badge = document.getElementById('statusBadge');
  const txt   = document.getElementById('stxt');
  if (badge) badge.className = 'status-badge ' + s;
  if (txt)   txt.textContent  = s.toUpperCase();
  // §1.3 — teinte la barre de statut en cas d'erreur de compilation
  const bar = document.getElementById('appStatusBar');
  if (bar) bar.classList.toggle('err', s === 'err');
}

export function disposeGL() {
  if (state.mat3)   { state.mat3.dispose();   state.mat3   = null; }
  if (state.scene3) {
    state.scene3.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    state.scene3 = null;
  }
  if (state.renderer3) { state.renderer3.dispose(); state.renderer3 = null; }
}
