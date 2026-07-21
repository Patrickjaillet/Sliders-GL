/**
 * src/render/gl-caps.js
 *
 * Phase 1.3 — WebGL Extension Detection & Capability Reporting
 *
 * Queries the WebGL context for hardware capabilities and extension support,
 * then populates the perf panel with the results.
 *
 * Detects:
 *   - Max texture size, max render buffer size
 *   - Float textures (OES_texture_float / EXT_color_buffer_float)
 *   - Half-float textures
 *   - MSAA sample count range
 *   - Anisotropic filtering max
 *   - Compressed texture formats (S3TC, ETC, ASTC)
 *   - Shader precision (highp float available?)
 *   - WebGL version (1 / 2)
 *   - GPU vendor/renderer string (WEBGL_debug_renderer_info)
 *   - Timestamp query (WebGPU only — reported separately)
 *
 * Architecture: `render` layer — imports `core/` only.
 */

import { state } from '../core/state.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} GLCaps
 * @property {number}   glVersion         — 1 or 2
 * @property {string}   vendor            — GPU vendor (or 'unknown')
 * @property {string}   renderer          — GPU renderer string (or 'unknown')
 * @property {number}   maxTextureSize
 * @property {number}   maxRenderBufSize
 * @property {number}   maxSamples        — MSAA (WebGL2 only)
 * @property {number}   maxAnisotropy     — 1 if extension absent
 * @property {boolean}  floatTextures
 * @property {boolean}  halfFloatTextures
 * @property {boolean}  floatRenderTarget
 * @property {boolean}  s3tc              — DXT / S3TC compression (BC1–BC5)
 * @property {boolean}  bc7               — BC7 / BPTC high-quality compression (Windows/Linux)
 * @property {boolean}  etc              — ETC1/ETC2 compression
 * @property {boolean}  astc              — ASTC compression (Apple Silicon / mobile)
 * @property {boolean}  highpFloat        — highp precision in fragment shader
 * @property {string[]} extensions        — all extension strings
 * @property {'bc7'|'astc'|'etc2'|'none'} bestCompressedFormat — best native GPU compressed format
 */

// ─── Main query ───────────────────────────────────────────────────────────────

/** Cached caps — populated once, re-used thereafter. */
let _caps = null;

/**
 * Query the WebGL context and return a GLCaps object.
 * Results are cached after the first call.
 *
 * @param {WebGLRenderingContext|WebGL2RenderingContext} [gl]
 *   Defaults to the context from `state.renderer3`.
 * @returns {GLCaps|null}  null if no GL context available
 */
export function detectGLCaps(gl) {
  if (_caps) return _caps;

  gl = gl ?? state.renderer3?.getContext();
  if (!gl) return null;

  const isWGL2   = typeof WebGL2RenderingContext !== 'undefined'
    && gl instanceof WebGL2RenderingContext;
  const glVersion = isWGL2 ? 2 : 1;

  // ── GPU strings ──────────────────────────────────────────────────────────
  let vendor   = 'unknown';
  let renderer = 'unknown';
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) {
    vendor   = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)   || 'unknown';
    renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || 'unknown';
  }

  // ── Limits ───────────────────────────────────────────────────────────────
  const maxTextureSize    = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const maxRenderBufSize  = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
  const maxSamples        = isWGL2 ? gl.getParameter(gl.MAX_SAMPLES) : 0;

  // ── Anisotropy ───────────────────────────────────────────────────────────
  const anisoExt    = gl.getExtension('EXT_texture_filter_anisotropic')
    || gl.getExtension('MOZ_EXT_texture_filter_anisotropic')
    || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
  const maxAnisotropy = anisoExt
    ? gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT)
    : 1;

  // ── Float textures ────────────────────────────────────────────────────────
  const floatTextures = isWGL2
    ? true  // always available in WebGL2
    : !!gl.getExtension('OES_texture_float');

  const halfFloatTextures = isWGL2
    ? true
    : !!(gl.getExtension('OES_texture_half_float') || gl.getExtension('EXT_color_buffer_half_float'));

  const floatRenderTarget = isWGL2
    ? !!gl.getExtension('EXT_color_buffer_float')
    : !!(gl.getExtension('WEBGL_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));

  // ── Compressed textures ───────────────────────────────────────────────────
  const s3tc = !!(
    gl.getExtension('WEBGL_compressed_texture_s3tc') ||
    gl.getExtension('MOZ_WEBGL_compressed_texture_s3tc') ||
    gl.getExtension('WEBKIT_WEBGL_compressed_texture_s3tc')
  );
  // BC7 / BPTC — high-quality compression, Windows/Linux desktop GPUs
  const bc7 = !!(
    gl.getExtension('EXT_texture_compression_bptc')
  );
  const etc = !!(
    gl.getExtension('WEBGL_compressed_texture_etc') ||
    gl.getExtension('WEBGL_compressed_texture_etc1')
  );
  const astc = !!gl.getExtension('WEBGL_compressed_texture_astc');

  // Best native GPU compressed format (priority: BC7 > ASTC > ETC2 > none)
  const bestCompressedFormat = /** @type {'none'|'bc7'|'astc'|'etc2'} */ (bc7 ? 'bc7' : astc ? 'astc' : etc ? 'etc2' : 'none');

  // ── Shader precision ──────────────────────────────────────────────────────
  let highpFloat = false;
  try {
    const prec = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    highpFloat  = prec && prec.precision > 0;
  } catch { /* some drivers throw on this query */ }

  // ── Extension list ────────────────────────────────────────────────────────
  let extensions = [];
  try {
    extensions = Array.from(gl.getSupportedExtensions() || []).sort();
  } catch {}

  _caps = {
    glVersion,
    vendor,
    renderer,
    maxTextureSize,
    maxRenderBufSize,
    maxSamples,
    maxAnisotropy,
    floatTextures,
    halfFloatTextures,
    floatRenderTarget,
    s3tc,
    bc7,
    etc,
    astc,
    bestCompressedFormat,
    highpFloat,
    extensions,
  };

  // Store on state for other modules to read
  state.perf.glCaps = _caps;
  return _caps;
}

/** Force a re-query (e.g. after context recreation). */
export function invalidateGLCaps() { _caps = null; }

// ─── Perf panel rendering ─────────────────────────────────────────────────────

/**
 * Populate the `#glCapsPanel` element in the perf panel with the detected caps.
 * Creates the element lazily if it doesn't exist yet.
 *
 * @param {GLCaps} caps — result of detectGLCaps()
 */
export function renderGLCapsPanel(caps) {
  let panel = document.getElementById('glCapsPanel');
  if (!panel) return;  // panel must be declared in ui.html

  const check = (v) => v
    ? '<span class="caps-yes">✓</span>'
    : '<span class="caps-no">✗</span>';
  const kb = (n) => n >= 1024 ? (n / 1024).toFixed(0) + ' K' : String(n);

  panel.innerHTML = `
    <div class="caps-row caps-header">
      <span>WebGL ${caps.glVersion}</span>
      <span class="caps-gpu-str" title="${_esc(caps.renderer)}">${_esc(_truncate(caps.renderer, 38))}</span>
    </div>
    <div class="caps-row">
      <span class="caps-label">Max texture</span>
      <span class="caps-val">${kb(caps.maxTextureSize)} px</span>
    </div>
    <div class="caps-row">
      <span class="caps-label">Max renderbuf</span>
      <span class="caps-val">${kb(caps.maxRenderBufSize)} px</span>
    </div>
    ${caps.maxSamples ? `<div class="caps-row">
      <span class="caps-label">MSAA max</span>
      <span class="caps-val">${caps.maxSamples}×</span>
    </div>` : ''}
    <div class="caps-row">
      <span class="caps-label">Anisotropy</span>
      <span class="caps-val">${caps.maxAnisotropy}×</span>
    </div>
    <div class="caps-row">
      <span class="caps-label">Float tex</span>
      <span class="caps-val">${check(caps.floatTextures)}</span>
    </div>
    <div class="caps-row">
      <span class="caps-label">Float RT</span>
      <span class="caps-val">${check(caps.floatRenderTarget)}</span>
    </div>
    <div class="caps-row">
      <span class="caps-label">highp float</span>
      <span class="caps-val">${check(caps.highpFloat)}</span>
    </div>
    <div class="caps-row">
      <span class="caps-label">S3TC / DXT</span>
      <span class="caps-val">${check(caps.s3tc)}</span>
    </div>
    <div class="caps-row">
      <span class="caps-label">BC7 / BPTC</span>
      <span class="caps-val">${check(caps.bc7)}</span>
    </div>
    <div class="caps-row">
      <span class="caps-label">ETC2</span>
      <span class="caps-val">${check(caps.etc)}</span>
    </div>
    <div class="caps-row">
      <span class="caps-label">ASTC</span>
      <span class="caps-val">${check(caps.astc)}</span>
    </div>
    <div class="caps-row">
      <span class="caps-label">Best format</span>
      <span class="caps-val" style="font-size:0.85em">${_esc(caps.bestCompressedFormat)}</span>
    </div>
    <div class="caps-row caps-ext-count">
      <span class="caps-label">Extensions</span>
      <span class="caps-val">${caps.extensions.length}</span>
    </div>
  `;
}

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _truncate(s, maxLen) {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}
