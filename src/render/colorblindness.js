/**
 * render/colorblindness.js — Phase 21.2
 *
 * Mode daltonisme : 3 modes de simulation (Protanopie, Deutéranopie, Tritanopie)
 * appliqués comme post-pass GLSL locale avec overlay indiquant la perception de chaque type.
 *
 * Usage :
 *   import { initColorBlindness, setColorBlindnessMode, getColorBlindnessMode,
 *            toggleColorBlindness, renderColorBlindnessPass, resizeColorBlindness } from './colorblindness.js';
 */

import * as THREE from 'three';
import { state } from '../core/state.js';
import { registerStyle } from './style-layers.js';

export const COLORBLINDNESS_MODES = {
  NONE: 'none',
  PROTANOPIA: 'protanopia',
  DEUTERANOPIA: 'deuteranopia',
  TRITANOPIA: 'tritanopia',
};

export const COLORBLINDNESS_DEFAULTS = {
  enabled: false,
  mode: COLORBLINDNESS_MODES.NONE,
  showOverlay: true,
};

let _pass = null;
let _overlayCanvas = null;
let _overlayCtx = null;

const POST_VERT = `void main(){ gl_Position = vec4(position, 1.0); }`;

const COLORBLINDNESS_FRAG = `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform int uMode;
uniform float uIntensity;

mat3 protanopiaMatrix = mat3(
  0.567, 0.433, 0.0,
  0.558, 0.442, 0.0,
  0.242, 0.758, 0.0
);

mat3 deuteranopiaMatrix = mat3(
  0.625, 0.375, 0.0,
  0.7, 0.3, 0.0,
  0.3, 0.7, 0.0
);

mat3 tritanopiaMatrix = mat3(
  0.95, 0.05, 0.0,
  0.0, 0.433, 0.567,
  0.0, 0.475, 0.525
);

vec3 applyColorBlindness(vec3 color, int mode) {
  if (mode == 1) {
    return color * protanopiaMatrix;
  } else if (mode == 2) {
    return color * deuteranopiaMatrix;
  } else if (mode == 3) {
    return color * tritanopiaMatrix;
  }
  return color;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 color = texture2D(tDiffuse, uv).rgb;
  vec3 cbColor = applyColorBlindness(color, uMode);
  vec3 finalColor = mix(color, cbColor, uIntensity);
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

function _makeRT(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });
}

function _makeMat(frag, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: frag,
    uniforms: uniforms,
  });
}

function _render(mat, input, rt) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.material.uniforms.tDiffuse.value = input;
  scene.add(quad);
  const renderer = state.gl.renderer;
  const oldRT = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(oldRT);
  return rt.texture;
}

export function initColorBlindness(rw, rh) {
  if (!state.perf.colorBlindness) {
    state.perf.colorBlindness = { ...COLORBLINDNESS_DEFAULTS };
  }

  if (_pass) return;

  _pass = {
    rt: _makeRT(rw, rh),
    mat: _makeMat(COLORBLINDNESS_FRAG, {
      tDiffuse: { value: null },
      uRes: { value: new THREE.Vector2(rw, rh) },
      uMode: { value: 0 },
      uIntensity: { value: 1.0 },
    }),
  };

  _createOverlay();
}

function _createOverlay() {
  _overlayCanvas = document.createElement('canvas');
  _overlayCanvas.id = 'colorblindness-overlay';
  _overlayCanvas.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    width: 200px;
    height: 120px;
    background: rgba(0, 0, 0, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    z-index: 1000;
    display: none;
    pointer-events: none;
  `;
  document.body.appendChild(_overlayCanvas);
  _overlayCtx = _overlayCanvas.getContext('2d');
  _overlayCanvas.width = 200;
  _overlayCanvas.height = 120;
}

function _updateOverlay() {
  if (!_overlayCtx || !state.perf.colorBlindness?.showOverlay) {
    if (_overlayCanvas) _overlayCanvas.style.display = 'none';
    return;
  }

  _overlayCanvas.style.display = 'block';
  const ctx = _overlayCtx;
  const w = _overlayCanvas.width;
  const h = _overlayCanvas.height;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.fillRect(0, 0, w, h);

  const mode = state.perf.colorBlindness.mode;
  const modeNames = {
    none: 'Normal',
    protanopia: 'Protanopie',
    deuteranopia: 'Deutéranopie',
    tritanopia: 'Tritanopie',
  };

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(`Mode: ${modeNames[mode] || 'Normal'}`, 10, 20);

  const testColors = [
    { name: 'Rouge', color: '#ff0000' },
    { name: 'Vert', color: '#00ff00' },
    { name: 'Bleu', color: '#0000ff' },
    { name: 'Jaune', color: '#ffff00' },
    { name: 'Cyan', color: '#00ffff' },
    { name: 'Magenta', color: '#ff00ff' },
  ];

  let y = 35;
  testColors.forEach((tc, i) => {
    ctx.fillStyle = tc.color;
    ctx.fillRect(10, y, 20, 15);
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px sans-serif';
    ctx.fillText(tc.name, 35, y + 11);
    y += 20;
  });

  ctx.fillStyle = '#888888';
  ctx.font = '9px sans-serif';
  ctx.fillText('Simulation daltonisme', 10, h - 5);
}

export function resizeColorBlindness(rw, rh) {
  if (_pass?.rt) _pass.rt.setSize(rw, rh);
  if (_pass?.mat?.uniforms?.uRes) _pass.mat.uniforms.uRes.value.set(rw, rh);
}

export function renderColorBlindnessPass(inputTexture) {
  if (!_pass || !state.perf.colorBlindness?.enabled) return inputTexture;

  const mode = state.perf.colorBlindness.mode;
  const modeMap = {
    none: 0,
    protanopia: 1,
    deuteranopia: 2,
    tritanopia: 3,
  };

  _pass.mat.uniforms.uMode.value = modeMap[mode] || 0;
  _pass.mat.uniforms.uIntensity.value = 1.0;

  _updateOverlay();

  return _render(_pass.mat, inputTexture, _pass.rt);
}

export function setColorBlindnessMode(mode) {
  if (!state.perf.colorBlindness) {
    state.perf.colorBlindness = { ...COLORBLINDNESS_DEFAULTS };
  }
  if (Object.values(COLORBLINDNESS_MODES).includes(mode)) {
    state.perf.colorBlindness.mode = mode;
    state.perf.colorBlindness.enabled = mode !== COLORBLINDNESS_MODES.NONE;
    _updateOverlay();
  }
}

export function getColorBlindnessMode() {
  return state.perf.colorBlindness?.mode ?? COLORBLINDNESS_MODES.NONE;
}

export function toggleColorBlindness() {
  if (!state.perf.colorBlindness) {
    state.perf.colorBlindness = { ...COLORBLINDNESS_DEFAULTS };
  }
  state.perf.colorBlindness.enabled = !state.perf.colorBlindness.enabled;
  if (!state.perf.colorBlindness.enabled) {
    state.perf.colorBlindness.mode = COLORBLINDNESS_MODES.NONE;
  } else if (state.perf.colorBlindness.mode === COLORBLINDNESS_MODES.NONE) {
    state.perf.colorBlindness.mode = COLORBLINDNESS_MODES.PROTANOPIA;
  }
  _updateOverlay();
}

export function setColorBlindnessOverlay(show) {
  if (!state.perf.colorBlindness) {
    state.perf.colorBlindness = { ...COLORBLINDNESS_DEFAULTS };
  }
  state.perf.colorBlindness.showOverlay = show;
  _updateOverlay();
}

export function isColorBlindnessEnabled() {
  return state.perf.colorBlindness?.enabled ?? false;
}

// ── Enregistrement comme calque de style ────────────────────────────────────

let _styleRegistered = false;

/**
 * Enregistre la simulation daltonisme comme calque activable dans le stack de style.
 * À appeler une fois après initColorBlindness().
 */
export function registerColorBlindnessAsStyleLayer() {
  if (_styleRegistered) return;
  _styleRegistered = true;

  registerStyle({
    id: 'colorblindness',
    name: 'Daltonisme Sim.',
    icon: '👁',
    desc: 'Simule protanopie, deutéranopie ou tritanopie',
    params: {
      mode: { label: 'Mode (0=normal 1=proto 2=deut 3=trit)', min: 0, max: 3, step: 1, default: 1 },
      intensity: { label: 'Intensité', min: 0, max: 1, step: 0.01, default: 1.0 },
    },
    frag: (p) => {
      const mode = Math.round(p.mode ?? 1);
      const intensity = (p.intensity ?? 1.0).toFixed(4);
      return `{
  mat3 _cbm;
  if (${mode} == 1) _cbm = mat3(0.567,0.433,0.0, 0.558,0.442,0.0, 0.242,0.758,0.0);
  else if (${mode} == 2) _cbm = mat3(0.625,0.375,0.0, 0.7,0.3,0.0, 0.3,0.7,0.0);
  else if (${mode} == 3) _cbm = mat3(0.95,0.05,0.0, 0.0,0.433,0.567, 0.0,0.475,0.525);
  else _cbm = mat3(1.0,0.0,0.0, 0.0,1.0,0.0, 0.0,0.0,1.0);
  col = mix(col, col * _cbm, ${intensity});
}`;
    },
  });
}
