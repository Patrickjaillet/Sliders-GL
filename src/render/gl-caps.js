/**
 * src/render/gl-caps.js
 *
 * Phase 1.3 — WebGL Extension Detection & Capability Reporting
 *
 * Queries the WebGL context for hardware capabilities and extension support.
 * Used by texture-compressor.js to pick the best native compressed format.
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

  return _caps;
}

/** Force a re-query (e.g. after context recreation). */
export function invalidateGLCaps() { _caps = null; }
