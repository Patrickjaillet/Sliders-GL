/**
 * F-7.2 — G-Buffer (MRT — Multiple Render Targets)
 *
 * Uses Three.js r162+ MRT API: new THREE.WebGLRenderTarget(w, h, { count: N })
 * Three color attachments:
 *   textures[0] — albedo / base color (RGBA8)
 *   textures[1] — world-space normal (RGB packed, A = roughness)
 *   textures[2] — depth + material ID (R = linear depth, G = material ID, BA = free)
 *
 * A buffer pass opts into G-Buffer output by setting pass.outputGBuffer = true.
 * The pass's GLSL must use gColor / gNormal / gDepth as outputs (injected via wrapFragGBuffer).
 * Downstream passes read iGBufColor, iGBufNormal, iGBufDepth uniforms.
 */

import * as THREE from 'three';
import { state } from '../core/state.js';

let _gbufRT   = null;
let _gbufW    = 0;
let _gbufH    = 0;

const GBUF_PREAMBLE_WEBGL2 = `
// G-Buffer MRT outputs (WebGL2)
layout(location = 0) out vec4 gColor;
layout(location = 1) out vec4 gNormal;
layout(location = 2) out vec4 gDepth;
`;

const GBUF_PREAMBLE_WEBGL1 = `
// G-Buffer MRT outputs (WebGL1 / WEBGL_draw_buffers)
#extension GL_EXT_draw_buffers : require
#define gColor  gl_FragData[0]
#define gNormal gl_FragData[1]
#define gDepth  gl_FragData[2]
`;

export function initGBuffer(w, h) {
  if (!state.renderer3) return;

  const gl = state.renderer3.getContext();
  const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;

  if (_gbufRT) _gbufRT.dispose();

  _gbufRT = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    count: 3,                      // Three.js r162+ MRT API
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.HalfFloatType,     // Half float for normals and depth
    depthBuffer: true,
    stencilBuffer: false,
  });

  // Individual texture settings per attachment
  _gbufRT.textures[0].name   = 'gColor';
  _gbufRT.textures[0].format = THREE.RGBAFormat;

  _gbufRT.textures[1].name   = 'gNormal';
  _gbufRT.textures[1].format = THREE.RGBAFormat;

  _gbufRT.textures[2].name   = 'gDepth';
  _gbufRT.textures[2].format = THREE.RGBAFormat;

  _gbufW = w;
  _gbufH = h;

  // Push textures as uniforms so any downstream pass can read them
  _syncGBufUniforms();
}

export function resizeGBuffer(w, h) {
  if (!_gbufRT) return;
  _gbufRT.setSize(Math.max(1, w), Math.max(1, h));
  _gbufW = w;
  _gbufH = h;
  _syncGBufUniforms();
}

export function disposeGBuffer() {
  if (_gbufRT) { _gbufRT.dispose(); _gbufRT = null; }
}

export function getGBufferRT() { return _gbufRT; }

export function getGBufferTextures() {
  if (!_gbufRT) return null;
  return {
    color:  _gbufRT.textures[0],
    normal: _gbufRT.textures[1],
    depth:  _gbufRT.textures[2],
  };
}

function _syncGBufUniforms() {
  if (!_gbufRT) return;
  // Push into image pass material and any enabled buffer pass material
  const passes = state.mp?.passes ?? {};
  for (const [, p] of Object.entries(passes)) {
    const mat = p.mat;
    if (!mat?.uniforms) continue;
    if (mat.uniforms.iGBufColor)  mat.uniforms.iGBufColor.value  = _gbufRT.textures[0];
    if (mat.uniforms.iGBufNormal) mat.uniforms.iGBufNormal.value = _gbufRT.textures[1];
    if (mat.uniforms.iGBufDepth)  mat.uniforms.iGBufDepth.value  = _gbufRT.textures[2];
  }
  const mat3 = state.mat3;
  if (mat3?.uniforms) {
    if (mat3.uniforms.iGBufColor)  mat3.uniforms.iGBufColor.value  = _gbufRT.textures[0];
    if (mat3.uniforms.iGBufNormal) mat3.uniforms.iGBufNormal.value = _gbufRT.textures[1];
    if (mat3.uniforms.iGBufDepth)  mat3.uniforms.iGBufDepth.value  = _gbufRT.textures[2];
  }
}

/**
 * Wrap a user's fragment shader for G-Buffer output.
 * Injects MRT output declarations and replaces gl_FragColor usage with gColor.
 */
export function wrapFragGBuffer(fragSrc) {
  if (!state.renderer3) return fragSrc;
  const gl       = state.renderer3.getContext();
  const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  const preamble = isWebGL2 ? GBUF_PREAMBLE_WEBGL2 : GBUF_PREAMBLE_WEBGL1;

  // If user writes mainImage(out vec4 fragColor, in vec2 fragCoord) style,
  // wrap it so gColor = fragColor, gNormal and gDepth get defaults.
  const hasMainImage = /void\s+mainImage\s*\(/.test(fragSrc);
  if (hasMainImage) {
    return `${preamble}
${fragSrc}

void main() {
  vec4 fragColor = vec4(0.0);
  mainImage(fragColor, gl_FragCoord.xy);
  gColor  = fragColor;
  gNormal = vec4(0.5, 0.5, 1.0, 1.0); // default normal (0,0,1) packed
  gDepth  = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0);
}`;
  }

  // Otherwise prepend preamble and replace gl_FragColor → gColor
  const patched = fragSrc.replace(/\bgl_FragColor\b/g, 'gColor');
  return `${preamble}\n${patched}`;
}

/**
 * Render a buffer pass into the G-Buffer RT instead of its own RT.
 * Called from multipass.js when pass.outputGBuffer is true.
 */
export function renderPassToGBuffer(passId, dt) {
  if (!_gbufRT || !state.renderer3) return false;
  const p = state.mp?.passes?.[passId];
  if (!p?.mat || !p.enabled) return false;

  const mesh  = state.mesh3;
  const scene = state.scene3;
  const cam   = state.cam3;
  if (!mesh || !scene || !cam) return false;

  const prevMat = mesh.material;
  mesh.material = p.mat;
  state.renderer3.setRenderTarget(_gbufRT);
  state.renderer3.render(scene, cam);
  mesh.material = prevMat;

  _syncGBufUniforms();
  return true;
}
