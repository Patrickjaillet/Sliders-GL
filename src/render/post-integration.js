/**
 * post-integration.js — Pont entre les backends F-2.2/F-4.2/F-4.3/F-4.4
 * et le pipeline Three.js existant (perf.js).
 *
 * Construit un ShaderMaterial combiné à partir des effets actifs :
 *   FX Stack (fx-stack.js)      — F-2.2
 *   Style Layers (style-layers.js) — F-4.2
 *   Shape Mask (shape-mask.js)  — F-4.4
 *   Color Remap (color-remap.js) — F-4.3
 *
 * Usage depuis renderer.js :
 *   state.callbacks.renderPostIntegration est enregistré ici.
 *   Renvoie la texture de sortie ou null si aucun effet actif.
 */

import * as THREE from 'three';
import { state } from '../core/state.js';
import { FX_DEFINITIONS, getFXState } from './fx-stack.js';
import { STYLE_DEFINITIONS, getStyleLayers } from './style-layers.js';
import { buildShapeGLSL, isShapeEnabled } from './shape-mask.js';
import { getRemapParams } from './color-remap.js';

const POST_VERT = `void main(){ gl_Position = vec4(position, 1.0); }`;

let _mat = null;
let _rt  = null;
let _rtW = 0, _rtH = 0;
let _lastFragKey = '';
let _lutTex = null;
let _lutParamsKey = '';
let _scene  = null;
let _cam    = null;
let _mesh   = null;

// ── GLSL generation ───────────────────────────────────────────────────────────

function _iqColor(a, b, c, d, t) {
  return [
    Math.max(0, Math.min(255, Math.round((a[0] + b[0] * Math.cos(2 * Math.PI * (c[0] * t + d[0]))) * 255))),
    Math.max(0, Math.min(255, Math.round((a[1] + b[1] * Math.cos(2 * Math.PI * (c[1] * t + d[1]))) * 255))),
    Math.max(0, Math.min(255, Math.round((a[2] + b[2] * Math.cos(2 * Math.PI * (c[2] * t + d[2]))) * 255))),
    255,
  ];
}

function _buildLUTDataTexture(params) {
  const size = 256;
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    const px = _iqColor(params.a, params.b, params.c, params.d, t);
    data[i * 4]     = px[0];
    data[i * 4 + 1] = px[1];
    data[i * 4 + 2] = px[2];
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function _buildCombinedFrag(activeFX, activeLayers, shapeGLSL, remap) {
  let uniforms = '';
  let functions = '';
  let calls = '';

  // ── FX Stack ──────────────────────────────────────────────────────────────
  const seenUniformNames = new Set(['tDiffuse', 'uResolution', 'uTime']);

  for (const fx of activeFX) {
    let frag = fx.frag;
    // Normalize texture uniform name
    frag = frag.replace(/\buFxTex\b/g, 'tDiffuse');
    // Normalize resolution
    frag = frag.replace(/\buResolution\b/g, 'uResolution');

    // Extract uniform declarations (skip tDiffuse since we declare it once)
    const uniformLines = frag.match(/uniform\s+\w+\s+\w+;/g) || [];
    for (const line of uniformLines) {
      const match = line.match(/uniform\s+\w+\s+(\w+)/);
      if (match && !seenUniformNames.has(match[1])) {
        seenUniformNames.add(match[1]);
        uniforms += line + '\n';
      }
    }
    // Remove uniform declarations from function body
    frag = frag.replace(/uniform\s+\w+\s+\w+;\s*/g, '');
    functions += frag.trim() + '\n\n';
    calls += `  col = fx_${fx.id}(col, uv);\n`;
  }

  // ── Style Layers ──────────────────────────────────────────────────────────
  for (const layer of activeLayers) {
    const def = STYLE_DEFINITIONS.find(d => d.id === layer.typeId);
    if (!def) continue;
    let snippet = def.frag(layer.params);
    // Normalize names
    snippet = snippet.replace(/\buSource\b/g, 'tDiffuse');
    snippet = snippet.replace(/iResolution\.xy/g, 'uResolution');
    calls += `  // style: ${def.name}\n  {\n${snippet}\n  }\n`;
  }

  // ── Shape Mask ────────────────────────────────────────────────────────────
  if (shapeGLSL) {
    calls += `  // shape mask\n  {\n    float _sdf = 0.0;\n    ${shapeGLSL}\n`;
    calls += `    float _alpha = 1.0 - smoothstep(-0.004, 0.0, _sdf);\n`;
    calls += `    col *= _alpha;\n  }\n`;
  }

  // ── Color Remap ───────────────────────────────────────────────────────────
  let remapUniforms = '';
  let remapFunctions = '';
  let remapCall = '';
  if (remap.enabled) {
    remapUniforms = `uniform sampler2D uColorRemap;\nuniform float uRemapStrength;\n`;
    remapFunctions = `vec3 applyColorRemap(vec3 col) {
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 remapped = texture2D(uColorRemap, vec2(clamp(luma, 0.001, 0.999), 0.5)).rgb;
  return mix(col, remapped, clamp(uRemapStrength, 0.0, 1.0));
}\n`;
    remapCall = `  col = applyColorRemap(col);\n`;
  }

  return `precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
${uniforms}${remapUniforms}
${functions}${remapFunctions}
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 col = texture2D(tDiffuse, uv).rgb;
${calls}${remapCall}
  gl_FragColor = vec4(col, 1.0);
}`;
}

function _buildUniformValues(activeFX, remap) {
  const uv = {};
  for (const fx of activeFX) {
    const st = getFXState()[fx.id];
    if (!st) continue;
    for (const [key, def] of Object.entries(fx.params || {})) {
      const uName = 'uFx' + key.charAt(0).toUpperCase() + key.slice(1);
      uv[uName] = { value: st.params[key] ?? def.default };
    }
  }
  if (remap.enabled) {
    uv.uColorRemap = { value: null };
    uv.uRemapStrength = { value: remap.strength };
  }
  return uv;
}

// ── Render pass ───────────────────────────────────────────────────────────────

function _ensureRT(w, h) {
  if (!_rt || _rtW !== w || _rtH !== h) {
    _rt?.dispose();
    _rt = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
    _rtW = w; _rtH = h;
  }
}

function _ensureScene() {
  if (_scene) return;
  _scene = new THREE.Scene();
  _cam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  _mesh  = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  _scene.add(_mesh);
}

export function renderPostIntegration() {
  const perf = state.perf;
  if (!perf?.postRT || !state.renderer3) return;

  const fxState     = getFXState();
  const activeFX    = FX_DEFINITIONS.filter(fx => fxState[fx.id]?.enabled);
  const activeLayers = getStyleLayers().filter(l => l.enabled);
  const shapeGLSL   = isShapeEnabled() ? buildShapeGLSL() : null;
  const remap       = getRemapParams();

  if (!activeFX.length && !activeLayers.length && !shapeGLSL && !remap.enabled) return;

  // Build / update fragment shader
  const fragKey = JSON.stringify({ fx: activeFX.map(f => f.id), layers: activeLayers.map(l => l.typeId + JSON.stringify(l.params)), shape: shapeGLSL, remap: remap.enabled });
  if (_lastFragKey !== fragKey) {
    _lastFragKey = fragKey;
    const frag = _buildCombinedFrag(activeFX, activeLayers, shapeGLSL, remap);
    const uvals = {
      tDiffuse:    { value: null },
      uResolution: { value: new THREE.Vector2() },
      uTime:       { value: 0 },
      ..._buildUniformValues(activeFX, remap),
    };
    _mat?.dispose();
    _mat = new THREE.ShaderMaterial({
      uniforms:         uvals,
      vertexShader:     POST_VERT,
      fragmentShader:   frag,
    });
  }

  const renderer = state.renderer3;
  const w = perf.postRT.width, h = perf.postRT.height;

  _ensureRT(w, h);
  _ensureScene();

  // Update per-frame uniforms
  _mat.uniforms.tDiffuse.value    = perf.postRT.texture;
  _mat.uniforms.uResolution.value.set(w, h);
  _mat.uniforms.uTime.value       = state.simTime ?? 0;

  // Update FX param uniforms
  for (const fx of activeFX) {
    const st = getFXState()[fx.id];
    if (!st) continue;
    for (const [key] of Object.entries(fx.params || {})) {
      const uName = 'uFx' + key.charAt(0).toUpperCase() + key.slice(1);
      if (_mat.uniforms[uName]) _mat.uniforms[uName].value = st.params[key];
    }
  }

  // Color remap LUT texture
  if (remap.enabled) {
    const lpKey = JSON.stringify(remap);
    if (_lutParamsKey !== lpKey) {
      _lutTex?.dispose();
      _lutTex = _buildLUTDataTexture(remap);
      _lutParamsKey = lpKey;
    }
    if (_mat.uniforms.uColorRemap) _mat.uniforms.uColorRemap.value = _lutTex;
    if (_mat.uniforms.uRemapStrength) _mat.uniforms.uRemapStrength.value = remap.strength;
  }

  // Apply combined pass to _rt
  _mesh.material = _mat;
  renderer.setRenderTarget(_rt);
  renderer.render(_scene, _cam);

  // Update postMat so the final screen render (and FXAA) reads our output
  if (perf.postMat?.uniforms?.tDiffuse) {
    perf.postMat.uniforms.tDiffuse.value = _rt.texture;
  }
}

export function resizePostIntegration(w, h) {
  if (_rt) { _rt.setSize(w, h); _rtW = w; _rtH = h; }
}

// ── Registration ──────────────────────────────────────────────────────────────

state.callbacks.renderPostIntegration = renderPostIntegration;
state.callbacks.resizePostIntegration = resizePostIntegration;
