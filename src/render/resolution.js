/**
 * src/render/resolution.js
 *
 * Phase 1.3 - Render Resolution Presets & Headless Render Mode
 *
 * Implements:
 *   1. Resolution presets - 720p / 1080p / 1440p / 2160p / custom - rendered at
 *      a fixed internal size regardless of the window/panel dimensions.
 *      The canvas is CSS-scaled to fill the viewport while the GL renders at
 *      the target resolution (pixel-perfect, no DPI compromise).
 *
 *   2. Headless render mode - creates an OffscreenCanvas (or a hidden regular
 *      canvas fallback) at arbitrary resolution, renders one frame, and returns
 *      a Blob. Used by the screenshot and video-export pipelines in export.js.
 *
 * Architecture: `render` layer - imports `core/`, `gl/`.
 */

import * as THREE from 'three';
import { state } from '../core/state.js';
import { VERT, wrapFrag, buildUniforms, checkFragCompile, doResize } from '../gl/renderer.js';
import { safeLocalGet, safeLocalSet } from '../core/utils.js';

// ─── Resolution presets ───────────────────────────────────────────────────────

const COMP_W = 800;
const COMP_H = 450;

export const RESOLUTION_PRESETS = {
  viewport: null,          // fixed composition canvas (800x450)
  '720p':   [1280,  720],
  '1080p':  [1920, 1080],
  '1440p':  [2560, 1440],
  '2160p':  [3840, 2160],
};

const PRESET_KEY = 'zgl_render_res_v1';

/** Currently selected preset key ('viewport' | '720p' | '1080p' | '1440p' | '2160p' | 'custom'). */
let _activePreset = safeLocalGet(PRESET_KEY, 'viewport');

/** Custom resolution [w, h] when preset === 'custom'. */
let _customRes = (() => {
  try { return JSON.parse(safeLocalGet('zgl_render_res_custom', '[1920,1080]')); } catch { return [1920, 1080]; }
})();

/**
 * Apply a render resolution preset.
 * @param {'viewport'|'720p'|'1080p'|'1440p'|'2160p'|'custom'} preset
 * @param {[number,number]} [customWH]  - required when preset === 'custom'
 */
export function setRenderResolution(preset, customWH) {
  _activePreset = preset;
  safeLocalSet(PRESET_KEY, preset);

  if (preset === 'custom' && customWH) {
    _customRes = customWH;
    safeLocalSet('zgl_render_res_custom', JSON.stringify(customWH));
  }

  _applyResolution();
  _syncUI();
}

/** Return the active preset key. */
export function getActiveResolutionPreset() { return _activePreset; }

/** Return the effective [width, height] for the current preset. */
export function getEffectiveResolution() {
  if (_activePreset === 'viewport') return _getViewportSize();
  if (_activePreset === 'custom')   return _customRes;
  return RESOLUTION_PRESETS[_activePreset] ?? _getViewportSize();
}

function _getViewportSize() {
  return [COMP_W, COMP_H];
}

/**
 * Apply the current resolution setting to the live renderer.
 * Called on preset change and on window resize when preset ≠ 'viewport'.
 */
export function _applyResolution() {
  if (!state.renderer3) return;

  if (_activePreset === 'viewport') {
    const canvas = state.renderer3.domElement;
    canvas.style.width  = '';
    canvas.style.height = '';
    doResize();
    return;
  }

  const [w, h] = getEffectiveResolution();
  const canvas = state.renderer3.domElement;

  // Render at the fixed target resolution
  state.renderer3.setPixelRatio(1);
  state.renderer3.setSize(w, h, false);

  // CSS-scale the canvas to fill its container without affecting GL viewport
  canvas.style.width  = '100%';
  canvas.style.height = '100%';
  canvas.style.imageRendering = 'auto';

  // Update iResolution uniform
  if (state.mat3?.uniforms?.iResolution) {
    state.mat3.uniforms.iResolution.value.set(w, h, 1);
  }
  if (state.callbacks?.mpResizeRTs)  state.callbacks.mpResizeRTs(w, h);

  // Update HUD
  const respill = document.getElementById('respill');
  if (respill) respill.textContent = `${w} × ${h}`;
  const statusRes = document.getElementById('statusRes');
  if (statusRes) statusRes.textContent = `${w} × ${h}`;
}

function _syncUI() {
  document.querySelectorAll('[data-res-preset]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.resPreset === _activePreset);
  });
  const customInput = document.getElementById('resCustomWH');
  if (customInput) customInput.style.display = _activePreset === 'custom' ? '' : 'none';
}

// ─── Headless render mode ─────────────────────────────────────────────────────
//
// Creates an off-screen rendering context at arbitrary resolution, renders
// exactly one frame using the current shader and uniforms, and returns a Blob.
//
// This does NOT touch the live canvas - it creates a completely separate
// WebGL context on an OffscreenCanvas (or hidden <canvas> fallback).

/**
 * Render one frame at the given resolution and return a PNG Blob.
 *
 * @param {object}   opts
 * @param {number}   [opts.width=1920]
 * @param {number}   [opts.height=1080]
 * @param {boolean}  [opts.alpha=false]   - transparent background
 * @param {string}   [opts.format='png']  - 'png' | 'jpeg' | 'webp'
 * @param {number}   [opts.quality=0.95]  - for jpeg/webp
 * @returns {Promise<Blob>}
 */
export async function renderHeadless({ width = 1920, height = 1080, alpha = false,
  format = 'png', quality = 0.95 } = {}) {

  const mimeType = format === 'jpeg' ? 'image/jpeg'
    : format === 'webp' ? 'image/webp'
    : 'image/png';

  // ── Create off-screen canvas ──────────────────────────────────────────────
  let offCanvas;
  const supportsOffscreen = typeof OffscreenCanvas !== 'undefined';

  if (supportsOffscreen) {
    offCanvas = new OffscreenCanvas(width, height);
  } else {
    offCanvas = document.createElement('canvas');
    offCanvas.width  = width;
    offCanvas.height = height;
    offCanvas.style.display = 'none';
    document.body.appendChild(offCanvas);
  }

  // ── Create isolated Three.js renderer ────────────────────────────────────
  const offRenderer = new THREE.WebGLRenderer({
    canvas:                offCanvas,
    antialias:             false,
    alpha,
    preserveDrawingBuffer: true,
    powerPreference:       'high-performance',
  });
  offRenderer.setPixelRatio(1);
  offRenderer.setSize(width, height, false);
  offRenderer.setClearColor(0x000000, alpha ? 0 : 1);

  try {
    // ── Clone current shader setup ────────────────────────────────────────
    const code = state.mat3?.fragmentShader || '';
    const uniforms = buildUniforms();

    // Copy current uniform values
    const live = state.mat3?.uniforms;
    if (live) {
      uniforms.iTime.value      = live.iTime.value;
      uniforms.iTimeDelta.value = live.iTimeDelta.value;
      uniforms.iFrame.value     = live.iFrame.value;
      uniforms.iMouse.value.copy(live.iMouse.value);
      uniforms.iResolution.value.set(width, height, 1);
      // Copy channel textures (shared references - same GPU textures)
      for (let i = 0; i < 4; i++) {
        const ch = live['iChannel' + i];
        if (ch?.value) uniforms['iChannel' + i] = { value: ch.value };
      }
    }

    const offScene  = new THREE.Scene();
    const offCam    = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    offCam.position.z = 1;

    // Use a full-screen triangle (Phase 1.3 geometry optimization)
    const tri = _makeFullScreenTriangle();
    const mat = new THREE.ShaderMaterial({
      vertexShader:   _VERT_TRIANGLE,
      fragmentShader: code,
      uniforms,
    });
    offScene.add(new THREE.Mesh(tri, mat));

    offRenderer.render(offScene, offCam);

    // ── Extract pixels ────────────────────────────────────────────────────
    let blob;
    if (supportsOffscreen) {
      blob = await (/** @type {any} */ (offCanvas)).convertToBlob({ type: mimeType, quality });
    } else {
      blob = await new Promise(res => offCanvas.toBlob(res, mimeType, quality));
    }

    // Cleanup
    tri.dispose();
    mat.dispose();

    return blob;
  } finally {
    offRenderer.dispose();
    if (!supportsOffscreen && offCanvas.parentNode) (/** @type {any} */ (offCanvas)).remove();
  }
}

// ─── Full-screen triangle geometry ────────────────────────────────────────────
//
// A single triangle covering [-1,-1] → [3,-1] → [-1,3] clips to [-1..1] on both
// axes, eliminating the diagonal seam and the index buffer of PlaneGeometry(2,2).
// One draw call, no index buffer, better GPU cache behaviour.

export const _VERT_TRIANGLE = `
uniform vec3 iResolution;
uniform vec2 iJitter;
void main() {
  // gl_VertexID 0,1,2 → UV (0,0),(2,0),(0,2) → NDC (-1,-1),(3,-1),(-1,3)
  vec2 uv = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vec2 pos = uv * 2.0 - 1.0;
  vec2 jitterNDC = (iJitter / iResolution.xy) * 2.0;
  gl_Position = vec4(pos + jitterNDC, 0.0, 1.0);
}`;

/**
 * Create a THREE.BufferGeometry representing one full-screen triangle.
 * No index buffer, 3 vertices only, no UV attribute needed (we derive it
 * from gl_VertexID in the vertex shader above).
 *
 * @returns {THREE.BufferGeometry}
 */
export function _makeFullScreenTriangle() {
  const geo = new THREE.BufferGeometry();
  // 3 vertices with position = [0,0,0] - actual positions computed in the VS from gl_VertexID
  const verts = new Float32Array(9);  // 3 × vec3
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setDrawRange(0, 3);
  return geo;
}
