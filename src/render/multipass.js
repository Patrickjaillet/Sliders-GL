

import * as THREE from 'three';
import { state } from '../core/state.js';
import { toast, applyAndParse } from '../io/actions.js';
import { wrapFrag, buildUniforms, VERT, applyGLShader, checkFragCompile, showErr, hideErr, wrapFragCube, _BLEND_MODES, BLEND_DESCS } from '../gl/renderer.js';
import { setTAAVelocityTex } from '../render/perf.js';
import { esc, escAttr } from '../core/utils.js';
import { soundEnable, soundDisable, soundRebuild, soundIsRunning } from './sound-pass.js';
import { adaptiveDebounce, cancelAdaptiveDebounce } from './adaptive-debounce.js';
import { passNeedsRecompile, markPassCompiled, invalidatePass, invalidateAll } from './hot-reload-diff.js';
import { timePass } from './pass-profiler.js';
import { initComputePass, setComputeShader, tickComputePass, getComputeTexture, disposeComputePass, MP_COMPUTE_TEMPLATE } from './compute-pass.js';
import { initGBuffer, resizeGBuffer, renderPassToGBuffer, wrapFragGBuffer, getGBufferTextures } from './gbuffer.js';

const MP_PASS_IDS         = ['bufA','bufB','bufC','bufD'];
const MP_CUBE_PASS_IDS    = ['cubeA','cubeB'];
const MP_COMPUTE_PASS_IDS = ['compA','compB'];
const MP_SOUND_PASS_ID    = 'sound';
const MP_ALL_BUF_IDS      = [...MP_PASS_IDS, ...MP_CUBE_PASS_IDS];
const MP_PASS_LABELS      = { bufA:'Buf A', bufB:'Buf B', bufC:'Buf C', bufD:'Buf D', cubeA:'Cube A', cubeB:'Cube B', sound:'Sound', image:'Image', compA:'Comp A', compB:'Comp B' };
const MP_BUF_COLORS       = { bufA:'#7b6fff', bufB:'#ff6b8a', bufC:'#5fffa0', bufD:'#ffa85c', cubeA:'#38d4f5', cubeB:'#f5c238', sound:'#ff9f43', compA:'#c084fc', compB:'#a78bfa' };

function mpGetRenderTargetType() {
  if (!state.renderer3) return THREE.UnsignedByteType;

  // Fix 1.4 — Previous code checked `capabilities.isWebGL2` twice, making the
  // HalfFloat branch unreachable on WebGL2. Corrected priority:
  //   WebGL2 → HalfFloat (guaranteed by spec, avoids precision issues on mobile GPUs)
  //   WebGL1 + OES_texture_float → FloatType (full 32-bit precision)
  //   WebGL1 + OES_texture_half_float → HalfFloat (16-bit, widely supported)
  //   Fallback → UnsignedByte (no HDR, but safe everywhere)
  const { capabilities, extensions } = state.renderer3;
  if (capabilities.isWebGL2) return THREE.HalfFloatType;
  if (extensions.get('OES_texture_float'))      return THREE.FloatType;
  if (extensions.get('OES_texture_half_float')) return THREE.HalfFloatType;
  return THREE.UnsignedByteType;
}

const MP_BUF_TEMPLATE = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    fragColor = vec4(uv, abs(sin(iTime)), 1.0);
}
`;

// Starter template for cube passes.
// iFace: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z
// faceDir() returns the direction vector for the current face at (u,v) ∈ [0,1]².
const MP_CUBE_TEMPLATE = `// Cube buffer pass — iFace: 0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z
// fragCoord covers one face; use faceDir() to get a 3-D direction vector.
vec3 faceDir(int face, vec2 uv) {
    vec2 st = uv * 2.0 - 1.0;
    if (face == 0) return vec3( 1.0,  st.y, -st.x);
    if (face == 1) return vec3(-1.0,  st.y,  st.x);
    if (face == 2) return vec3( st.x,  1.0, -st.y);
    if (face == 3) return vec3( st.x, -1.0,  st.y);
    if (face == 4) return vec3( st.x,  st.y,  1.0);
    return             vec3(-st.x,  st.y, -1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv  = fragCoord / iResolution.xy;
    vec3 dir = normalize(faceDir(iFace, uv));
    // Simple gradient per face as a starter:
    fragColor = vec4(dir * 0.5 + 0.5, 1.0);
}
`;

const MP_SOUND_TEMPLATE = `vec2 mainSound(float time) {
    float freq = 440.0;
    float wave = sin(2.0 * 3.14159 * freq * time);
    return vec2(wave * 0.3);
}
`;


function _cubeSize() {
  const glc = document.getElementById('glc');
  const sz = glc ? Math.min(glc.width, glc.height) : 512;
  return Math.max(1, Math.min(sz, 1024));
}

function _makeNullCubeTexture() {
  // Tiny 1×1 CubeTexture used as a placeholder uniform value.
  const data = new Uint8Array([0,0,0,255]);
  const faces = Array(6).fill(null).map(() => {
    const img = new ImageData(new Uint8ClampedArray([0,0,0,255]), 1, 1);
    return img;
  });
  const tex = new THREE.CubeTexture(faces);
  tex.needsUpdate = true;
  return tex;
}

function mpInitCubeRT(id) {
  const p = state.mp.passes[id];
  if (!state.renderer3) return;
  const sz = _cubeSize();
  if (p.rt) p.rt.dispose();
  p.rt = new THREE.WebGLCubeRenderTarget(sz, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: mpGetRenderTargetType(),
    generateMipmaps: false,
  });
  // rtBack not needed for cubes: we render all 6 faces fresh each frame.
}

function _mpRebuildCubeMat(id) {
  const p = state.mp.passes[id];
  const code = p.code || MP_CUBE_TEMPLATE;
  // Determine which channels come from other cube passes.
  const cubeChannels = new Set();
  for (let i = 0; i < 4; i++) {
    const src = p.ch[i];
    if (src && state.mp.passes[src]?.isCube) cubeChannels.add(i);
  }
  if (p.mat) p.mat.dispose();
  p.mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: wrapFragCube(code, cubeChannels),
    uniforms: {
      ...buildUniforms(),
      iFace: { value: 0 },
    },
  });
}

const _PASS_BADGE_LABELS = { image:'◈ Image', bufA:'Buf A', bufB:'Buf B', bufC:'Buf C', bufD:'Buf D', cubeA:'⬡ Cube A', cubeB:'⬡ Cube B', sound:'♪ Sound', compA:'⚙ Comp A', compB:'⚙ Comp B' };

function mpSyncTabs() {
  for (const id of [...MP_ALL_BUF_IDS, ...MP_COMPUTE_PASS_IDS, 'sound', 'image']) {
    const btn = document.getElementById('ptab-' + id);
    if (!btn) continue;
    const p = state.mp.passes[id];
    btn.classList.toggle('active', state.mp.active === id);
    btn.classList.toggle('enabled', !!p.enabled);
  }
  const sbPassBadge = document.getElementById('sbPassBadge');
  if (sbPassBadge) sbPassBadge.textContent = _PASS_BADGE_LABELS[state.mp.active] ?? state.mp.active;
  // Keep the TAA velocity selector in sync with available passes
  try { mpPopulateTAAVelSel(); } catch (e) { /* ignore if UI not ready */ }
  // §3.4 — notifie la barre de navigation des passes (pass-nav.js)
  try { window.dispatchEvent(new CustomEvent('zgl:passchange')); } catch (e) { /* SSR/no-DOM */ }
}

function _switchToGLSLEditor() {
  const soundPane = document.getElementById('soundPane');
  if (soundPane) soundPane.style.display = 'none';
  const ezSplit = document.getElementById('ezSplit');
  if (ezSplit) ezSplit.style.display = '';
}

function mpToggleOrSwitch(id) {
  const p = state.mp.passes[id];
  if (!p.enabled) {

    mpEnablePass(id);
  }
  mpSwitchPass(id);
}

function mpSwitchPass(id) {

  if (state.editor) {
    if (state.mp.active === 'sound') {
      const mc = document.getElementById('soundMc');
      const ed = mc?._monacoEditor;
      if (ed) state.mp.passes.sound.code = ed.getValue();
    } else {
      state.mp.passes[state.mp.active].code = state.editor.getValue();
    }
  }
  state.mp.active = id;

  if (id === 'sound') {
    _switchToSoundEditor();
    mpSyncTabs();
    return;
  }

  if (MP_COMPUTE_PASS_IDS.includes(id)) {
    _switchToComputeEditor(id);
    mpSyncTabs();
    return;
  }

  _switchToGLSLEditor();

  if (state.editor) {
    const p = state.mp.passes[id];
    const code = p.code || (id === 'image' ? '' : MP_BUF_TEMPLATE);
    if (!p.code) p.code = code;
    state.editor.setValue(code);
  }

  const lbl = document.querySelector('.el');
  if (lbl) lbl.textContent = id === 'image' ? 'fragment.glsl' : id + '.glsl';
  mpSyncTabs();
}

function mpEnablePass(id) {
  const p = state.mp.passes[id];
  if (p.enabled) return;
  p.enabled = true;
  if (p.isCompute) {
    if (!p.code) p.code = MP_COMPUTE_TEMPLATE;
    const c = state.renderer3?.domElement;
    const w = c ? Math.round(c.width / 2) : 256;
    const h = c ? Math.round(c.height / 2) : 256;
    initComputePass(id, w, h);
    if (p.code !== MP_COMPUTE_TEMPLATE) setComputeShader(id, p.code);
  } else if (p.isCube) {
    if (!p.code) p.code = MP_CUBE_TEMPLATE;
    mpInitCubeRT(id);
    _mpRebuildCubeMat(id);
  } else if (p.isSound) {
    if (!p.code) p.code = MP_SOUND_TEMPLATE;
    soundEnable(p.code);
  } else {
    if (!p.code) p.code = MP_BUF_TEMPLATE;
    mpInitRT(id);
    mpRebuildPassMat(id);
  }
  toast(`${MP_PASS_LABELS[id]} enabled`, 'ok');
  mpRenderWiring();
}

function mpDisablePass(id) {
  if (id === 'image') return;
  const p = state.mp.passes[id];
  p.enabled = false;
  if (p.isCompute) {
    disposeComputePass(id);
  } else if (p.isSound) {
    soundDisable();
  } else {
    if (p.rt) { p.rt.dispose(); p.rt = null; }
    if (p.rtBack) { p.rtBack.dispose(); p.rtBack = null; }
    if (p.mat) { p.mat.dispose(); p.mat = null; }
  }
  for (const pid of [...MP_ALL_BUF_IDS, 'image']) {
    const pp = state.mp.passes[pid];
    if (!pp.ch) continue;
    for (let i = 0; i < 4; i++) {
      if (pp.ch[i] === id) pp.ch[i] = null;
    }
  }
  if (state.mp.active === id) mpSwitchPass('image');
  mpSyncTabs();
  mpRenderWiring();
  toast(`${MP_PASS_LABELS[id]} removed`, 'warn');
}

function _makeRT(w, h) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: mpGetRenderTargetType(),
  });
}

function mpInitRT(id) {
  const p = state.mp.passes[id];
  if (p.isCube) { mpInitCubeRT(id); return; }
  if (!state.renderer3) return;
  const c = state.renderer3.domElement;
  const scale = p.resolutionScale ?? 1;
  const w = Math.max(1, Math.round(c.width  * scale));
  const h = Math.max(1, Math.round(c.height * scale));
  if (p.rt) p.rt.dispose();
  if (p.rtBack) p.rtBack.dispose();
  p.rt     = _makeRT(w, h);
  p.rtBack = _makeRT(w, h);
}

function mpResizeRTs(w, h) {
  for (const id of MP_PASS_IDS) {
    const p = state.mp.passes[id];
    if (!p.enabled || !p.rt) continue;
    const scale = p.resolutionScale ?? 1;
    const pw = Math.max(1, Math.round(w * scale));
    const ph = Math.max(1, Math.round(h * scale));
    p.rt.setSize(pw, ph);
    if (p.rtBack) p.rtBack.setSize(pw, ph);
  }
  // Cube RTs resize to the new min dimension (stay square).
  const sz = Math.max(1, Math.min(w, h, 1024));
  for (const id of MP_CUBE_PASS_IDS) {
    const p = state.mp.passes[id];
    if (!p.enabled || !p.rt) continue;
    if (p.rt.width !== sz) {
      p.rt.dispose();
      p.rt = new THREE.WebGLCubeRenderTarget(sz, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: mpGetRenderTargetType(),
        generateMipmaps: false,
      });
    }
  }

  if (state.callbacks.resizePostRT) state.callbacks.resizePostRT(w, h);
}

function mpRebuildPassMat(id) {
  const p = state.mp.passes[id];
  if (p.isCube) { _mpRebuildCubeMat(id); return; }
  const code = p.code || (id === 'image' ? '' : MP_BUF_TEMPLATE);
  if (id === 'image') {

    return;
  }
  if (p.mat) p.mat.dispose();
  p.mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: wrapFrag(code),
    uniforms: buildUniforms(),
  });
}

function mpApplyPassCode(id, code) {
  const p = state.mp.passes[id];
  p.code = code;

  // Phase 22.1 — Hot-reload différentiel : court-circuite si la passe n'a pas changé.
  if (!passNeedsRecompile(id, code)) return;

  if (id === 'image') {
    applyGLShader(code);
    markPassCompiled(id, code);
    return;
  }
  if (p.isSound) {
    if (soundIsRunning()) { soundRebuild(code); markPassCompiled(id, code); }
    return;
  }
  if (p.isCube) {
    _mpRebuildCubeMat(id);
    markPassCompiled(id, code);
    return;
  }
  const fragSrc = wrapFrag(code);
  const errLog  = checkFragCompile(fragSrc);
  if (errLog) {
    showErr(errLog);
    return;
  }
  if (!p.mat) { mpRebuildPassMat(id); }
  else {
    p.mat.fragmentShader = fragSrc;
    p.mat.needsUpdate = true;
    try {
      state.renderer3.render(state.scene3, state.cam3);
      hideErr();
    } catch(ex) {
      showErr(String(ex));
    }
  }
  markPassCompiled(id, code);
}

function mpSyncPassUniforms(id, dt) {
  const p = state.mp.passes[id];
  const uniforms = (id === 'image') ? (state.mat3 ? state.mat3.uniforms : null) : (p.mat ? p.mat.uniforms : null);
  if (!uniforms) return;
  uniforms.iTime.value      = state.simTime;
  uniforms.iTimeDelta.value = dt;
  uniforms.iFrame.value     = state.fidx;
  if (
    id !== 'image' &&
    uniforms.iResolution &&
    p.rt
  ) {
    uniforms.iResolution.value.set(p.rt.width, p.rt.height, 1);
  } else if (
    state.mat3 &&
    uniforms.iResolution &&
    state.mat3.uniforms.iResolution &&
    uniforms.iResolution.value !== state.mat3.uniforms.iResolution.value
  ) {
    uniforms.iResolution.value.copy(state.mat3.uniforms.iResolution.value);
  }

  for (let i = 0; i < 4; i++) {
    const src = p.ch[i];
    if (!src) continue;
    const srcPass = state.mp.passes[src];
    if (!srcPass) continue;
    if (srcPass.rt) {
      // Cube passes expose .texture as a CubeTexture; 2D passes expose .texture as Texture.
      uniforms['iChannel' + i].value = srcPass.rt.texture;
      if (uniforms.iChannelResolution) {
        const sz = srcPass.isCube ? srcPass.rt.width : srcPass.rt.width;
        uniforms.iChannelResolution.value[i].set(sz, sz, 1);
      }
    }
    // F-7.4 — sync blend mode for this channel
    if (uniforms.iChannelMode) {
      const mode = (p.chBlend ?? [])[i] ?? 'normal';
      uniforms.iChannelMode.value[i] = Math.max(0, _BLEND_MODES.indexOf(mode));
    }
  }

  if (id === 'image' && state.mat3) {
    state.channels.forEach(ch => {
      if (ch.texture) {
        state.mat3.uniforms['iChannel' + ch.i].value = ch.texture;
        if (state.mat3.uniforms.iChannelResolution) {
          const img = ch.texture.image;
          const w = img ? (img.videoWidth || img.width  || 1) : 1;
          const h = img ? (img.videoHeight || img.height || 1) : 1;
          state.mat3.uniforms.iChannelResolution.value[ch.i].set(w, h, 1);
        }
      }
    });
  }
}

/**
 * Set a multipass buffer as the TAA velocity source.
 * If `passId` is falsy or not found, clears the velocity texture.
 * The selected pass must be an enabled 2D buffer with a valid `.rt`.
 */
function mpSetTAAVelocity(passId) {
  if (!passId) {
    setTAAVelocityTex(null);
    if (state.perf) state.perf.taaVelocitySource = 'auto';
    const st = document.getElementById('taaVelStatus');
    if (st) {
      st.textContent = 'Auto (generated)';
      st.title = 'TAA velocity source: Auto (generated)';
    }
    const summaryBtn = document.getElementById('taaVelSummary');
    const summaryText = document.getElementById('taaVelSummaryText');
    if (summaryText) summaryText.textContent = 'TAA: Auto (generated)';
    if (summaryBtn) summaryBtn.title = 'TAA velocity source: Auto (generated)';
    return;
  }
  const p = state.mp.passes[passId];
  if (!p || !p.rt) {
    setTAAVelocityTex(null);
    toast('TAA velocity: pass not available', 'warn');
    return;
  }
  setTAAVelocityTex(p.rt.texture);
  if (state.perf) state.perf.taaVelocitySource = passId;
  const st2 = document.getElementById('taaVelStatus');
  if (st2) st2.textContent = (MP_PASS_LABELS[passId] || passId);
  if (st2) st2.title = `TAA velocity source: ${MP_PASS_LABELS[passId] || passId}`;
  const summaryBtn2 = document.getElementById('taaVelSummary');
  const summaryText2 = document.getElementById('taaVelSummaryText');
  if (summaryText2) summaryText2.textContent = `TAA: ${MP_PASS_LABELS[passId] || passId}`;
  if (summaryBtn2) summaryBtn2.title = `TAA velocity source: ${MP_PASS_LABELS[passId] || passId}`;
  toast(`TAA velocity source: ${MP_PASS_LABELS[passId] || passId}`, 'ok');
}

/**
 * Populate the TAA velocity source selector from available multipass passes.
 * Adds: auto, none, buffer passes (Buf A..D), cube passes and Image if present.
 */
function mpPopulateTAAVelSel() {
  const sel = document.getElementById('taaVelSelect');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '';
  const addOpt = (val, txt, disabled) => {
    const o = document.createElement('option');
    o.value = val;
    o.textContent = txt;
    if (disabled) o.disabled = true;
    sel.appendChild(o);
  };
  addOpt('auto', 'Auto (generated)');
  addOpt('none', 'None (jitter only)');
  for (const id of MP_PASS_IDS) {
    const p = state.mp.passes[id];
    const label = MP_PASS_LABELS[id] || id;
    const disabled = !(p && p.enabled && p.rt);
    addOpt(id, disabled ? `${label} (disabled)` : label, !!disabled);
  }
  for (const id of MP_CUBE_PASS_IDS) {
    const p = state.mp.passes[id];
    const label = MP_PASS_LABELS[id] || id;
    const disabled = !(p && p.enabled && p.rt);
    addOpt(id, disabled ? `${label} (disabled)` : label, !!disabled);
  }
  if (state.mp.passes['image']) {
    const p = state.mp.passes['image'];
    const label = MP_PASS_LABELS['image'] || 'Image';
    // Must match mpSetTAAVelocity's actual requirement (p.rt) — the Image
    // pass usually renders straight to the canvas with no offscreen target,
    // so selecting it here previously failed silently (toast only, no UI sync).
    const disabled = !(p && p.rt);
    addOpt('image', disabled ? `${label} (disabled)` : label, !!disabled);
  }
  const src = state.perf?.taaVelocitySource || 'auto';
  const found = Array.from(sel.options).find(o => o.value === src);
  if (found) sel.value = src; else sel.value = cur || 'auto';
  const status = document.getElementById('taaVelStatus');
  if (status) {
    let st = '';
    if (src === 'auto') st = 'Auto (generated)';
    else if (src === 'none') st = 'None (jitter only)';
    else st = MP_PASS_LABELS[src] || src || 'Auto';
    status.textContent = st;
    status.title = `TAA velocity source: ${st}`;
    const summaryBtn3 = document.getElementById('taaVelSummary');
    const summaryText3 = document.getElementById('taaVelSummaryText');
    if (summaryText3) summaryText3.textContent = `TAA: ${st}`;
    if (summaryBtn3) summaryBtn3.title = `TAA velocity source: ${st}`;
  }
}

let _mpDt = 0.016;
function renderMultiPass(dt) {
  _mpDt = dt;
  const enabledBufs    = MP_PASS_IDS.filter(id => state.mp.passes[id].enabled && state.mp.passes[id].mat && state.mp.passes[id].rt && state.mp.passes[id].rtBack);
  const enabledCubes   = MP_CUBE_PASS_IDS.filter(id => state.mp.passes[id].enabled && state.mp.passes[id].mat && state.mp.passes[id].rt);
  const enabledCompute = MP_COMPUTE_PASS_IDS.filter(id => state.mp.passes[id].enabled);
  if (enabledBufs.length === 0 && enabledCubes.length === 0 && enabledCompute.length === 0) return false;

  // F-7.1 — Tick GPGPU compute passes first (results available to buffer passes)
  for (const id of enabledCompute) {
    tickComputePass(id, dt);
    const tex = getComputeTexture(id);
    if (tex) {
      const key = id === 'compA' ? 'iCompA' : 'iCompB';
      // Push to all pass materials that declare the uniform
      for (const [, p] of Object.entries(state.mp.passes)) {
        if (p.mat?.uniforms?.[key]) p.mat.uniforms[key].value = tex;
      }
      if (state.mat3?.uniforms?.[key]) state.mat3.uniforms[key].value = tex;
    }
  }

  // F-7.2 — Buffer passes with outputGBuffer flag render to the G-Buffer MRT
  for (const id of enabledBufs) {
    const p = state.mp.passes[id];
    if (p.outputGBuffer) {
      mpSyncPassUniforms(id, dt);
      renderPassToGBuffer(id, dt);
    }
  }

  // Render 2D buffer passes (ping-pong).
  for (const id of enabledBufs) {
    const p = state.mp.passes[id];
    if (!p.feedbackDelay) {
      const tmp = p.rt;
      p.rt = p.rtBack;
      p.rtBack = tmp;
    }
    mpSyncPassUniforms(id, dt);
    state.mesh3.material = p.mat;
    state.renderer3.setRenderTarget(p.rtBack);
    timePass(id, () => state.renderer3.render(state.scene3, state.cam3)); // §7.1
    if (p.feedbackDelay) {
      const tmp = p.rt;
      p.rt = p.rtBack;
      p.rtBack = tmp;
    }
  }

  // Render cube passes — 6 faces per pass.
  for (const id of enabledCubes) {
    const p = state.mp.passes[id];
    mpSyncPassUniforms(id, dt);
    state.mesh3.material = p.mat;
    for (let face = 0; face < 6; face++) {
      p.mat.uniforms.iFace.value = face;
      p.mat.uniforms.iFace.needsUpdate = true;
      state.renderer3.setRenderTarget(p.rt, face);
      state.renderer3.render(state.scene3, state.cam3);
    }
  }

  state.renderer3.setRenderTarget(null);

  state.mesh3.material = state.mat3;

  mpSyncPassUniforms('image', dt);
  return true;
}

function applyAndParseActive() {
  if (!state.editor) {
    console.warn('applyAndParseActive called before editor is ready');
    return;
  }
  if (state.mp.active === 'sound') {
    const mc = document.getElementById('soundMc');
    const ed = mc?._monacoEditor;
    if (ed) {
      const code = ed.getValue();
      state.mp.passes.sound.code = code;
      mpApplyPassCode('sound', code);
      toast('Sound compiled', 'ok');
    }
    return;
  }
  if (MP_COMPUTE_PASS_IDS.includes(state.mp.active)) {
    _applyComputeShader(state.mp.active);
    return;
  }
  const code = state.editor.getValue();
  state.mp.passes[state.mp.active].code = code;
  if (state.mp.active === 'image') {
    applyAndParse();
  } else {
    mpApplyPassCode(state.mp.active, code);
    toast(`${MP_PASS_LABELS[state.mp.active]} compiled`, 'ok');
  }
  // P1.3 — clear dirty indicator after successful apply
  document.querySelector('.pass-tab.active')?.classList.remove('dirty');
}

function _switchToSoundEditor() {
  const editorZone = document.getElementById('editorZone');
  if (!editorZone) return;

  let soundPane = document.getElementById('soundPane');
  if (!soundPane) {
    soundPane = document.createElement('div');
    soundPane.id = 'soundPane';
    soundPane.className = 'compute-pane';
    soundPane.innerHTML = `
      <div class="compute-pane-head">
        <span class="compute-pane-label">sound.glsl</span>
        <div class="compute-pane-badges">
          <span class="compute-badge" id="soundBadge"></span>
        </div>
        <button class="ebn compute-dispatch-btn" id="soundToggleBtn" title="Start / stop audio" aria-label="Start or stop audio playback">▶ play</button>
      </div>
      <div id="soundMc" style="flex:1;min-height:0"></div>
      <div class="compute-output-bar">
        <span style="font-size:9px;color:var(--t3)">mainSound(float time) → vec2 stereo sample · rendered via AudioWorkletNode</span>
      </div>`;
    editorZone.appendChild(soundPane);

    _initSoundMonacoEditor();
    _bindSoundButtons();
  }

  const ezSplit = document.getElementById('ezSplit');
  if (ezSplit) ezSplit.style.display = 'none';
  soundPane.style.display = 'flex';

  const lbl = document.querySelector('.el');
  if (lbl) lbl.textContent = 'sound.glsl';
}

function _switchFromSoundEditor() {
  const soundPane = document.getElementById('soundPane');
  if (soundPane) soundPane.style.display = 'none';
  const ezSplit = document.getElementById('ezSplit');
  if (ezSplit) ezSplit.style.display = '';
}

// F-7.1 — Compute pass editor pane (similar to sound pane)
function _switchToComputeEditor(id) {
  const editorZone = document.getElementById('editorZone');
  if (!editorZone) return;

  // Hide other special panes
  const soundPane = document.getElementById('soundPane');
  if (soundPane) soundPane.style.display = 'none';
  // Hide other compute panes
  for (const cid of MP_COMPUTE_PASS_IDS) {
    if (cid !== id) {
      const pane = document.getElementById('computePane-' + cid);
      if (pane) pane.style.display = 'none';
    }
  }

  const paneId = 'computePane-' + id;
  let pane = document.getElementById(paneId);
  if (!pane) {
    pane = document.createElement('div');
    pane.id = paneId;
    pane.className = 'compute-pane';
    const label = MP_PASS_LABELS[id] || id;
    const color  = MP_BUF_COLORS[id] || '#c084fc';
    pane.innerHTML = `
      <div class="compute-pane-head" style="border-left:3px solid ${color}">
        <span class="compute-pane-label">${id}.glsl</span>
        <div class="compute-pane-badges">
          <span class="compute-badge compute-badge--running" id="${id}Badge" title="GPGPU compute pass — ${label}">⚙ compute</span>
        </div>
        <button class="ebn compute-dispatch-btn" id="${id}ApplyBtn" title="Compile and apply compute shader (Ctrl+Enter)">▶ apply</button>
        <button class="ebn compute-dispatch-btn" id="${id}ResetBtn" title="Reset particle state" style="margin-left:4px">↺ reset</button>
      </div>
      <div id="${id}Mc" style="flex:1;min-height:0"></div>
      <div class="compute-output-bar">
        <span style="font-size:9px;color:var(--t3)">GPGPU ping-pong · each texel = particle state (RGBA32F) · read as iChannel via <code>compA</code>/<code>compB</code></span>
      </div>`;
    editorZone.appendChild(pane);
    _initComputeMonacoEditor(id);
    _bindComputeButtons(id);
  }

  const ezSplit = document.getElementById('ezSplit');
  if (ezSplit) ezSplit.style.display = 'none';
  pane.style.display = 'flex';

  const lbl = document.querySelector('.el');
  if (lbl) lbl.textContent = id + '.glsl';
}

function _initComputeMonacoEditor(id) {
  if (typeof require === 'undefined') return;
  (/** @type {any} */ (require))(['vs/editor/editor.main'], () => {
    const mcEl = document.getElementById(id + 'Mc');
    if (!mcEl || mcEl._monacoEditor) return;
    const p = state.mp.passes[id];
    const code = p.code || MP_COMPUTE_TEMPLATE;
    if (!p.code) p.code = code;

    const editor = monaco.editor.create(mcEl, {
      value: code,
      language: 'glsl',
      theme: 'z-gl-light',
      fontSize: 12,
      fontFamily: "'JetBrains Mono', monospace",
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 6, bottom: 6 },
      tabSize: 2,
      automaticLayout: true,
      scrollbar: { verticalScrollbarSize: 3, horizontalScrollbarSize: 3 },
      folding: true,
    });
    mcEl._monacoEditor = editor;

    editor.onDidChangeModelContent(() => {
      const src = editor.getValue();
      adaptiveDebounce(id, src, () => {
        p.code = src;
        if (p.enabled) setComputeShader(id, src);
      });
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => _applyComputeShader(id));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,  () => _applyComputeShader(id));
  });
}

function _applyComputeShader(id) {
  const mcEl = document.getElementById(id + 'Mc');
  const editor = mcEl?._monacoEditor;
  const p = state.mp.passes[id];
  if (editor) p.code = editor.getValue();
  if (!p.enabled) {
    mpEnablePass(id);
    mpSwitchPass(id);
    return;
  }
  setComputeShader(id, p.code);
  const badge = document.getElementById(id + 'Badge');
  if (badge) { badge.textContent = '⚙ compiled'; setTimeout(() => { if (badge) badge.textContent = '⚙ compute'; }, 1500); }
  toast(`${MP_PASS_LABELS[id]} shader updated`, 'ok');
}

function _bindComputeButtons(id) {
  const applyBtn = document.getElementById(id + 'ApplyBtn');
  const resetBtn = document.getElementById(id + 'ResetBtn');
  if (applyBtn) applyBtn.addEventListener('click', () => _applyComputeShader(id));
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (state.mp.passes[id].enabled) {
        disposeComputePass(id);
        const p = state.mp.passes[id];
        const c = state.renderer3?.domElement;
        initComputePass(id, c ? Math.round(c.width / 2) : 256, c ? Math.round(c.height / 2) : 256);
        if (p.code) setComputeShader(id, p.code);
        toast(`${MP_PASS_LABELS[id]} state reset`, 'ok');
      }
    });
  }
}

function _initSoundMonacoEditor() {
  if (typeof require === 'undefined') return;
  (/** @type {any} */ (require))(['vs/editor/editor.main'], () => {
    if (document.getElementById('soundMcEditor')) return;
    const p = state.mp.passes.sound;
    const code = p.code || MP_SOUND_TEMPLATE;
    if (!p.code) p.code = code;

    const soundEditor = monaco.editor.create(document.getElementById('soundMc'), {
      value: code,
      language: 'glsl',
      theme: 'z-gl-light',
      fontSize: 12,
      fontFamily: "'JetBrains Mono', monospace",
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 6, bottom: 6 },
      tabSize: 2,
      automaticLayout: true,
      scrollbar: { verticalScrollbarSize: 3, horizontalScrollbarSize: 3 },
      folding: true,
    });

    document.getElementById('soundMc')._monacoEditor = soundEditor;

    soundEditor.onDidChangeModelContent(() => {
      // Phase 22.1 — Debounce adaptatif selon la complexité du shader sound
      const src = soundEditor.getValue();
      adaptiveDebounce('sound', src, () => {
        p.code = src;
        if (soundIsRunning()) soundRebuild(p.code);
      });
    });

    soundEditor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => _applySoundShader()
    );
    soundEditor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => _applySoundShader()
    );
  });
}

function _applySoundShader() {
  const mc = document.getElementById('soundMc');
  const editor = mc?._monacoEditor;
  const p = state.mp.passes.sound;
  if (editor) p.code = editor.getValue();
  if (!p.enabled) {
    mpEnablePass('sound');
    mpSwitchPass('sound');
    return;
  }
  if (soundIsRunning()) {
    soundRebuild(p.code);
  } else {
    soundEnable(p.code).then(ok => {
      _updateSoundBadge(ok);
    });
  }
}

function _updateSoundBadge(running) {
  const badge = document.getElementById('soundBadge');
  const btn   = document.getElementById('soundToggleBtn');
  if (badge) {
    badge.textContent = running ? 'playing ♪' : 'stopped';
    badge.style.color = running ? 'var(--ac3)' : 'var(--t3)';
  }
  if (btn) btn.textContent = running ? '■ stop' : '▶ play';
}

function _bindSoundButtons() {
  const toggleBtn = document.getElementById('soundToggleBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (soundIsRunning()) {
        soundDisable();
        _updateSoundBadge(false);
        mpSyncTabs();
      } else {
        const p = state.mp.passes.sound;
        soundEnable(p.code).then(ok => {
          _updateSoundBadge(ok);
          mpSyncTabs();
        });
      }
    });
  }
}

async function mpToggleSound() {
  const p = state.mp.passes.sound;
  if (p.enabled) {
    mpDisablePass('sound');
    toast('Sound pass disabled', 'warn');
    if (state.mp.active === 'sound') mpSwitchPass('image');
    mpSyncTabs();
  } else {
    if (state.mp.active !== 'sound') mpSwitchPass('sound');
    mpEnablePass('sound');
  }
}

function mpSwitchToSound() {
  mpSwitchPass('sound');
}

let _wireOpen = false;

const _NG_NODE_W  = 130;
const _NG_NODE_H  = 140;
const _NG_GAP_X   = 52;
const _NG_PAD     = 16;
const _NG_PORT_R  = 5;
const _NG_CH_H    = 22;
const _NG_TITLE_H = 30;
const _NG_FOOT_H  = 22;

let _ngDrag = null;

function mpToggleWiring() {
  _wireOpen = !_wireOpen;
  const panel = document.getElementById('wirePanel');
  const btn   = document.getElementById('wireBtn');
  if (panel) panel.classList.toggle('open', _wireOpen);
  if (btn)   btn.style.color = _wireOpen ? 'var(--ac)' : '';
  if (_wireOpen) mpRenderWiring();
}

function _ngNodePos(idx, total) {
  const x = _NG_PAD + idx * (_NG_NODE_W + _NG_GAP_X);
  const y = _NG_PAD;
  return { x, y };
}

function _ngOutputPortY() {
  return (_NG_NODE_H - _NG_FOOT_H) / 2;
}

function _ngInputPortY(chIdx) {
  return _NG_TITLE_H + chIdx * _NG_CH_H + _NG_CH_H / 2;
}

function _ngCable(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1) * 0.55 + 20;
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

function _ngPortColor(id) {
  return MP_BUF_COLORS[id] || 'rgba(var(--spark-go-rgb),1)';
}

function _ngCableColor(srcId) {
  return MP_BUF_COLORS[srcId] || 'rgba(92,242,255,0.9)';
}

function mpRenderWiring() {
  const panel = document.getElementById('wirePanel');
  if (!panel || !_wireOpen) return;

  const enabledIds = [...MP_PASS_IDS.filter(id => state.mp.passes[id].enabled), ...MP_CUBE_PASS_IDS.filter(id => state.mp.passes[id].enabled), 'image'];

  if (enabledIds.length <= 1) {
    panel.innerHTML = `<div class="wire-header">Connexions des passes</div><div class="wire-empty">Enable buffer passes to wire them.</div>`;
    return;
  }

  const total  = enabledIds.length;
  const panelW = _NG_PAD * 2 + total * _NG_NODE_W + (total - 1) * _NG_GAP_X;
  const panelH = _NG_NODE_H + _NG_PAD * 2;

  let nodesHtml = '';
  for (let idx = 0; idx < enabledIds.length; idx++) {
    const id    = enabledIds[idx];
    const p     = state.mp.passes[id];
    const col   = _ngPortColor(id);
    const isImg = id === 'image';
    const { x, y } = _ngNodePos(idx, total);

    let chHtml = '';
    for (let i = 0; i < 4; i++) {
      const srcId   = p.ch[i];
      const srcCol  = srcId ? _ngPortColor(srcId) : 'rgba(255,255,255,0.18)';
      const portY   = _ngInputPortY(i);
      chHtml += `
        <div class="ng-ch-row" data-pass="${escAttr(id)}" data-ch="${i}" style="top:${portY - _NG_CH_H/2}px">
          <div class="ng-port ng-port-in${srcId ? ' ng-port-connected' : ''}"
               data-port-in="${escAttr(id)}" data-ch="${i}"
               style="background:${srcCol};box-shadow:0 0 6px ${srcCol}"
               title="${srcId ? 'ch' + i + ' ← ' + MP_PASS_LABELS[srcId] + ' (right-click to disconnect)' : 'ch' + i + ' — drop a cable here'}"></div>
          <span class="ng-ch-lbl">ch${i}</span>
          ${srcId ? `<span class="ng-ch-src" style="color:${_ngPortColor(srcId)}">${esc(MP_PASS_LABELS[srcId])}</span>` : ''}
        </div>`;
    }

    const outPortY = _ngOutputPortY();
    const isBuf = MP_PASS_IDS.includes(id);
    const fdActive = isBuf && !!p.feedbackDelay;
    const resScaleOptions = isBuf
      ? ['0.25','0.5','0.75','1','1.5','2'].map(v =>
          '<option value="' + v + '"' + ((p.resolutionScale ?? 1) === Number(v) ? ' selected' : '') + '>' + v + '\xd7</option>'
        ).join('')
      : '';
    nodesHtml += `
      <div class="ng-node" id="ngn-${escAttr(id)}" style="left:${x}px;top:${y}px;width:${_NG_NODE_W}px;height:${_NG_NODE_H}px">
        <div class="ng-node-head" style="border-top:2px solid ${col}">
          <span class="ng-dot" style="background:${col}"></span>
          <span class="ng-label">${esc(MP_PASS_LABELS[id] || id)}</span>
          ${!isImg ? `<button class="ng-edit-btn" data-action="mpSwitchPass" data-args="${escAttr(id)}" title="Edit shader" aria-label="Edit ${esc(MP_PASS_LABELS[id] || id)} shader">✎</button>` : ''}
        </div>
        ${chHtml}
        ${isBuf ? `<div class="ng-node-foot">
          <button class="ng-fd-btn${fdActive ? ' ng-fd-active' : ''}" data-action="mpToggleFeedbackDelay" data-args="${escAttr(id)}" title="${fdActive ? '1-frame delay — reads frame N-1 (safe, ShaderToy-compatible). Click to switch to 0-frame.' : '0-frame delay — reads same frame (experimental, may glitch). Click to switch to 1-frame.'}" aria-label="${fdActive ? 'Switch to 0-frame delay' : 'Switch to 1-frame delay'} for ${esc(MP_PASS_LABELS[id] || id)}">
            <span class="ng-fd-icon">⧖</span> ${fdActive ? '1-frame delay' : '0-frame delay'}
          </button>
          <button class="ng-capture-btn" data-action="mpCapturePass" data-args="${escAttr(id)}" title="Capturer le contenu de ${esc(MP_PASS_LABELS[id] || id)} en PNG" aria-label="Capture ${esc(MP_PASS_LABELS[id] || id)} as PNG">📷</button>
          <select class="ng-res-select" data-change="mpSetPassResScale" data-args="${escAttr(id)}" title="Per-pass resolution multiplier" aria-label="Resolution multiplier for ${esc(MP_PASS_LABELS[id] || id)}">
            ${resScaleOptions}
          </select>
        </div>` : ''}
        ${!isImg ? `<div class="ng-port ng-port-out"
             data-port-out="${escAttr(id)}"
             style="top:${outPortY}px;background:${col};box-shadow:0 0 8px ${col}"
             title="Drag to wire ${esc(MP_PASS_LABELS[id])} output"></div>` : ''}
      </div>`;
  }

  panel.innerHTML = `
    <div class="wire-header">Connexions des passes</div>
    <div class="ng-canvas" id="ngCanvas" style="width:${panelW}px;height:${panelH}px">
      ${nodesHtml}
      <svg class="ng-svg" id="ngSVG" width="${panelW}" height="${panelH}" viewBox="0 0 ${panelW} ${panelH}" aria-hidden="true">
        <defs>
          <filter id="ngGlow">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <g id="ngCables"></g>
        <path id="ngLiveCable" fill="none" stroke-width="2" stroke-linecap="round" stroke-dasharray="5 6" opacity="0"/>
      </svg>
    </div>`;

  requestAnimationFrame(() => {
    _ngDrawCables(enabledIds);
    _ngBindDrag(panel, enabledIds);
  });
}

// F-7.4 — blend mode badge labels: cable midpoint + menu icon
const _BLEND_LABELS = { add: '+', multiply: '²', screen: '◌', overlay: '◑', mask_alpha: 'α', difference: '¬' };

function _ngDrawCables(enabledIds) {
  const svg    = document.getElementById('ngSVG');
  const cables = document.getElementById('ngCables');
  if (!cables) return;

  let paths = '';
  for (const id of enabledIds) {
    const p = state.mp.passes[id];
    const dstIdx = enabledIds.indexOf(id);
    const { x: dx, y: dy } = _ngNodePos(dstIdx, enabledIds.length);
    for (let i = 0; i < 4; i++) {
      const srcId = p.ch[i];
      if (!srcId) continue;
      const srcIdx = enabledIds.indexOf(srcId);
      if (srcIdx === -1) continue;
      const { x: sx, y: sy } = _ngNodePos(srcIdx, enabledIds.length);
      const x1 = sx + _NG_NODE_W;
      const y1 = sy + _ngOutputPortY();
      const x2 = dx;
      const y2 = dy + _ngInputPortY(i);
      const col = _ngCableColor(srcId);
      const blend = (p.chBlend ?? [])[i] ?? 'normal';
      // F-7.4 — non-normal cables shown thicker with a midpoint badge
      const sw = blend === 'normal' ? '1.8' : '2.4';
      const dsh = blend === 'normal' ? '5 6' : '8 4';
      paths += `<path class="ng-cable" data-dst="${escAttr(id)}" data-ch="${i}" data-blend="${escAttr(blend)}" d="${_ngCable(x1, y1, x2, y2)}" stroke="${col}" fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${dsh}" opacity="0.85" filter="url(#ngGlow)" style="cursor:pointer"><animate attributeName="stroke-dashoffset" from="0" to="-22" dur="1.6s" repeatCount="indefinite"/></path>`;
      if (blend !== 'normal') {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const badge = _BLEND_LABELS[blend] ?? blend;
        paths += `<circle cx="${mx}" cy="${my}" r="8" fill="${col}" opacity="0.9"/>`;
        paths += `<text x="${mx}" y="${my + 4}" text-anchor="middle" font-size="9" fill="#000" font-family="monospace" pointer-events="none">${badge}</text>`;
      }
    }
  }
  cables.innerHTML = paths;

  // F-7.4 — cable click → blend mode context menu
  cables.querySelectorAll('.ng-cable').forEach(path => {
    path.addEventListener('click', e => {
      e.stopPropagation();
      const dstId  = path.dataset.dst;
      const chIdx  = Number(path.dataset.ch);
      const cur    = path.dataset.blend ?? 'normal';
      _ngShowBlendMenu(e.clientX, e.clientY, dstId, chIdx, cur);
    });
  });
}

function _ngShowBlendMenu(cx, cy, passId, chIdx, currentMode) {
  document.getElementById('ng-blend-menu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'ng-blend-menu';
  menu.className = 'ng-blend-menu';

  // Clamp to viewport
  const vw = window.innerWidth, vh = window.innerHeight;
  const estimatedH = 40 + _BLEND_MODES.length * 40;
  const top  = Math.min(cy, vh - estimatedH - 8);
  const left = Math.min(cx, vw - 240 - 8);
  menu.style.cssText = `position:fixed;left:${left}px;top:${top}px;z-index:9999`;

  const header = document.createElement('div');
  header.className = 'ng-blend-menu-header';
  header.textContent = `ch${chIdx} — blend mode`;
  menu.appendChild(header);

  for (const mode of _BLEND_MODES) {
    const active = mode === currentMode;
    const badge  = _BLEND_LABELS[mode] ?? mode[0].toUpperCase();
    const desc   = BLEND_DESCS?.[mode] ?? mode;
    const item   = document.createElement('button');
    item.className = 'ng-blend-item' + (active ? ' ng-blend-item--active' : '');
    item.innerHTML = `<span class="ng-blend-badge">${badge}</span><span class="ng-blend-name">${mode}</span><span class="ng-blend-desc">${desc.split('—')[0].trim()}</span>`;
    item.title = desc;
    item.onclick = () => { mpSetChannelBlend(passId, chIdx, mode); menu.remove(); };
    menu.appendChild(item);
  }

  document.body.appendChild(menu);

  // Dismiss on outside click
  const close = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

function _ngBindDrag(panel, enabledIds) {
  const canvas   = document.getElementById('ngCanvas');
  const livePath = document.getElementById('ngLiveCable');
  if (!canvas || !livePath) return;

  canvas.addEventListener('mousedown', e => {
    const portEl = e.target.closest('[data-port-out]');
    if (!portEl) return;
    e.preventDefault();
    const srcId = portEl.dataset.portOut;
    const srcIdx = enabledIds.indexOf(srcId);
    const { x: sx, y: sy } = _ngNodePos(srcIdx, enabledIds.length);
    const x1 = sx + _NG_NODE_W;
    const y1 = sy + _ngOutputPortY();
    const col = _ngCableColor(srcId);

    _ngDrag = { srcId, x1, y1 };
    livePath.setAttribute('stroke', col);
    livePath.setAttribute('opacity', '0.7');
    portEl.classList.add('ng-port-dragging');

    document.getElementById('ngCanvas')?.querySelectorAll('.ng-port-in').forEach(p => {
      p.classList.add('ng-port-drop-target');
    });
  });

  document.addEventListener('mousemove', _ngOnMouseMove);
  document.addEventListener('mouseup', _ngOnMouseUp);

  canvas.addEventListener('contextmenu', e => {
    const portEl = e.target.closest('[data-port-in]');
    if (!portEl) return;
    e.preventDefault();
    const passId = portEl.dataset.portIn;
    const chIdx  = Number(portEl.dataset.ch);
    _ngDisconnect(passId, chIdx);
  });
}

function _ngOnMouseMove(e) {
  if (!_ngDrag) return;
  const canvas = document.getElementById('ngCanvas');
  const livePath = document.getElementById('ngLiveCable');
  if (!canvas || !livePath) return;
  const cr = canvas.getBoundingClientRect();
  const mx = e.clientX - cr.left;
  const my = e.clientY - cr.top;
  livePath.setAttribute('d', _ngCable(_ngDrag.x1, _ngDrag.y1, mx, my));
}

function _ngOnMouseUp(e) {
  if (!_ngDrag) return;
  const canvas   = document.getElementById('ngCanvas');
  const livePath = document.getElementById('ngLiveCable');
  if (livePath) livePath.setAttribute('opacity', '0');

  canvas?.querySelectorAll('.ng-port-dragging').forEach(p => p.classList.remove('ng-port-dragging'));
  canvas?.querySelectorAll('.ng-port-drop-target').forEach(p => p.classList.remove('ng-port-drop-target'));

  const target = e.target.closest('[data-port-in]');
  if (target) {
    const passId = target.dataset.portIn;
    const chIdx  = Number(target.dataset.ch);
    if (passId !== _ngDrag.srcId) {
      mpSetChannel(passId, chIdx, _ngDrag.srcId);
    }
  }

  _ngDrag = null;
  document.removeEventListener('mousemove', _ngOnMouseMove);
  document.removeEventListener('mouseup', _ngOnMouseUp);
}

function _ngDisconnect(passId, chIdx) {
  mpSetChannel(passId, chIdx, null);
}

function mpSetChannel(passId, chIdx, srcId) {
  const p = state.mp.passes[passId];
  p.ch[chIdx] = srcId || null;
  if (!p.chBlend) p.chBlend = ['normal','normal','normal','normal'];
  if (!srcId) p.chBlend[chIdx] = 'normal'; // reset blend when disconnecting
  mpRenderWiring();
  toast(`${MP_PASS_LABELS[passId]} ch${chIdx} → ${srcId ? MP_PASS_LABELS[srcId] : 'none'}`, 'ok');
}

// F-7.4 — set blend mode for a connected channel cable
function mpSetChannelBlend(passId, chIdx, mode) {
  const p = state.mp.passes[passId];
  if (!p || !p.ch[chIdx]) return;
  if (!p.chBlend) p.chBlend = ['normal','normal','normal','normal'];
  p.chBlend[chIdx] = _BLEND_MODES.includes(mode) ? mode : 'normal';
  mpRenderWiring();
  toast(`${MP_PASS_LABELS[passId]} ch${chIdx} blend: ${p.chBlend[chIdx]}`, 'ok');
}

function mpSetPassResScale(id, scale) {
  const p = state.mp.passes[id];
  if (!p || p.isCube || p.isSound || id === 'image') return;
  const parsed = Number(scale);
  const clamped = Math.min(2, Math.max(0.125, isNaN(parsed) ? 1 : parsed));
  p.resolutionScale = clamped;
  if (p.enabled && p.rt) {
    const c = state.renderer3?.domElement;
    if (c) {
      const w = Math.max(1, Math.round(c.width  * clamped));
      const h = Math.max(1, Math.round(c.height * clamped));
      p.rt.setSize(w, h);
      if (p.rtBack) p.rtBack.setSize(w, h);
    }
  }
  mpRenderWiring();
  toast(`${MP_PASS_LABELS[id]} resolution: ${clamped}×`, 'ok');
}


function mpToggleFeedbackDelay(id) {
  const p = state.mp.passes[id];
  if (!p || p.isCube || p.isSound || id === 'image') return;
  p.feedbackDelay = !p.feedbackDelay;
  mpRenderWiring();
  toast(`${MP_PASS_LABELS[id]} ${p.feedbackDelay ? '1-frame delay — reads frame N-1 (safe)' : '0-frame delay — reads same frame (experimental)'}`, p.feedbackDelay ? 'ok' : 'warn');
}

function mpCapturePass(id) {
  const p = state.mp.passes[id];
  const renderer = state.renderer3;
  if (!p || !renderer || !p.rt) {
    toast(`Capture ${id}: pas de render target disponible`, 'err');
    return;
  }
  const rt = p.rt;
  const w = rt.width, h = rt.height;
  const buf = new Uint8Array(w * h * 4);
  try {
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  } catch (e) {
    toast(`Capture ${id}: erreur lecture pixels — ${e.message}`, 'err');
    return;
  }
  // WebGL pixels are bottom-up; flip vertically for correct PNG
  const flipped = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const src = (h - 1 - row) * w * 4;
    flipped.set(buf.subarray(src, src + w * 4), row * w * 4);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').putImageData(new ImageData(flipped, w, h), 0, 0);
  const link = document.createElement('a');
  link.download = `${id}_capture.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  toast(`${MP_PASS_LABELS[id] || id} captured (${w}×${h})`, 'ok');
}

// F-7.2 — toggle G-Buffer output mode on a buffer pass
function mpToggleGBuffer(id) {
  const p = state.mp.passes[id];
  if (!p || p.isCompute || p.isSound || p.isCube) return;
  p.outputGBuffer = !p.outputGBuffer;
  if (p.outputGBuffer) {
    const c = state.renderer3?.domElement;
    const w = c ? c.width  : 800;
    const h = c ? c.height : 600;
    initGBuffer(w, h);
    toast(`${MP_PASS_LABELS[id]} → G-Buffer enabled`, 'ok');
  } else {
    toast(`${MP_PASS_LABELS[id]} → G-Buffer disabled`, 'warn');
  }
}

export { MP_PASS_IDS, MP_CUBE_PASS_IDS, MP_COMPUTE_PASS_IDS, MP_SOUND_PASS_ID, MP_ALL_BUF_IDS, MP_PASS_LABELS, MP_BUF_COLORS, MP_BUF_TEMPLATE, MP_CUBE_TEMPLATE, MP_SOUND_TEMPLATE, mpSyncTabs, mpToggleOrSwitch, mpSwitchPass, mpEnablePass, mpDisablePass, mpInitRT, mpInitCubeRT, mpResizeRTs, mpRebuildPassMat, mpApplyPassCode, mpSyncPassUniforms, _mpDt, renderMultiPass, applyAndParseActive, _wireOpen, mpToggleWiring, mpRenderWiring, mpSetChannel, mpSetChannelBlend, stImportMultipass, mpToggleSound, mpSwitchToSound, mpToggleFeedbackDelay, mpSetPassResScale, mpSetTAAVelocity, mpPopulateTAAVelSel, mpCapturePass, mpToggleGBuffer };

state.callbacks.mpResizeRTs = mpResizeRTs;
state.callbacks.renderMultiPass = renderMultiPass;

function stImportMultipass(descriptor) {
  // Phase 22.1 — Invalide le cache différentiel lors du chargement d'un nouveau projet
  invalidateAll();

  const { imagCode, imageChannelMap, buffers } = descriptor;

  for (const id of MP_PASS_IDS) {
    if (state.mp.passes[id].enabled) {
      mpDisablePass(id);
    }
  }

  for (const { appId, code, channelMap } of buffers) {
    mpEnablePass(appId);
    const p = state.mp.passes[appId];
    p.code = code;
    mpApplyPassCode(appId, code);

    for (let i = 0; i < 4; i++) {
      p.ch[i] = channelMap.get(i) || null;
    }
  }

  const imgPass = state.mp.passes['image'];
  for (let i = 0; i < 4; i++) {
    const srcId = imageChannelMap.get(i) || null;

    imgPass.ch[i] = (srcId && state.mp.passes[srcId]?.enabled) ? srcId : null;
  }

  if (state.editor) {

    state.mp.active = 'image';
    imgPass.code = imagCode;
    state.editor.setValue(imagCode);
    const lbl = document.querySelector('.el');
    if (lbl) lbl.textContent = 'fragment.glsl';
  }
  mpSyncTabs();
  mpRenderWiring();

  setTimeout(() => {
    applyAndParse();
  }, 80);

  const bufLabels = buffers.map(b => MP_PASS_LABELS[b.appId] || b.appId).join(', ');
  toast(`Multipass wired: ${bufLabels} → Image`, 'ok');
}

state.callbacks.stImportMultipass = stImportMultipass;
