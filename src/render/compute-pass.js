/**
 * F-7.1 — GPGPU Compute Passes (ping-pong float texture simulation)
 *
 * Each "compute pass" is a fragment-shader program that reads its own
 * previous output as `iState` and writes a new state every frame.
 * The data lives entirely on the GPU as a FloatType WebGLRenderTarget.
 *
 * Usage:
 *   initComputePass('compA', 512, 512);
 *   setComputeShader('compA', myGLSL);
 *   // in render loop:
 *   tickComputePass('compA', dt, renderer3);
 *   // read result in another pass as iChannel0 → getComputeTexture('compA')
 */

import * as THREE from 'three';
import { state } from '../core/state.js';

const _passes = new Map(); // id → { rt0, rt1, mat, w, h, readIdx }

export const MP_COMPUTE_TEMPLATE = `// Compute pass — each texel is a particle (posX, posY, velX, velY)
// iState   = previous frame's data
// iRes     = render-target resolution (vec2)
// iTime    = elapsed seconds
// iTimeDelta = frame dt

uniform sampler2D iState;
uniform vec2      iRes;
uniform float     iTime;
uniform float     iTimeDelta;

void main() {
  vec2 uv  = gl_FragCoord.xy / iRes;
  vec4 s   = texture2D(iState, uv);

  vec2 pos = s.xy;
  vec2 vel = s.zw;

  // Simple gravity + bounce
  vel.y -= 9.8 * iTimeDelta;
  pos   += vel * iTimeDelta;

  if (pos.y < -1.0) { pos.y = -1.0; vel.y = abs(vel.y) * 0.8; }
  if (pos.y >  1.0) { pos.y =  1.0; vel.y = -abs(vel.y) * 0.8; }
  if (pos.x < -1.0) { pos.x = -1.0; vel.x =  abs(vel.x); }
  if (pos.x >  1.0) { pos.x =  1.0; vel.x = -abs(vel.x); }

  gl_FragColor = vec4(pos, vel);
}`;

function _makeFloatRT(w, h) {
  const type = (() => {
    if (!state.renderer3) return THREE.HalfFloatType;
    const gl = state.renderer3.getContext();
    // Prefer full 32-bit float when available
    const ext = gl.getExtension('OES_texture_float') || gl instanceof WebGL2RenderingContext;
    return ext ? THREE.FloatType : THREE.HalfFloatType;
  })();
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

function _buildMat(fragSrc) {
  return new THREE.ShaderMaterial({
    vertexShader: `void main(){gl_Position=vec4(position,1.0);}`,
    fragmentShader: fragSrc,
    uniforms: {
      iState:     { value: null },
      iRes:       { value: new THREE.Vector2(512, 512) },
      iTime:      { value: 0 },
      iTimeDelta: { value: 0.016 },
    },
    depthTest: false,
    depthWrite: false,
  });
}

export function initComputePass(id, w = 512, h = 512) {
  const existing = _passes.get(id);
  if (existing) disposeComputePass(id);

  const rt0 = _makeFloatRT(w, h);
  const rt1 = _makeFloatRT(w, h);

  // Seed rt0 with random initial state
  if (state.renderer3) {
    const count = w * h * 4;
    const seed  = new Float32Array(count);
    for (let i = 0; i < count; i += 4) {
      seed[i]     = (Math.random() - 0.5) * 2; // posX
      seed[i + 1] = (Math.random() - 0.5) * 2; // posY
      seed[i + 2] = (Math.random() - 0.5);      // velX
      seed[i + 3] = Math.random() * 2 - 1;      // velY
    }
    const seedTex = new THREE.DataTexture(seed, w, h, THREE.RGBAFormat, THREE.FloatType);
    seedTex.needsUpdate = true;

    const seedMat = new THREE.MeshBasicMaterial({ map: seedTex });
    const mesh    = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), seedMat);
    const scene   = new THREE.Scene();
    const cam     = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(mesh);
    state.renderer3.setRenderTarget(rt0);
    state.renderer3.render(scene, cam);
    state.renderer3.setRenderTarget(null);
    seedMat.dispose();
    seedTex.dispose();
  }

  const mat = _buildMat(MP_COMPUTE_TEMPLATE);
  mat.uniforms.iRes.value.set(w, h);

  _passes.set(id, { rt0, rt1, mat, w, h, readIdx: 0 });

  // Register in state so channel selectors can find it
  if (state.mp?.passes) {
    if (!state.mp.passes[id]) {
      state.mp.passes[id] = { code: MP_COMPUTE_TEMPLATE, enabled: true, isCompute: true };
    }
  }
}

export function setComputeShader(id, fragSrc) {
  const cp = _passes.get(id);
  if (!cp) return;
  cp.mat.dispose();
  cp.mat = _buildMat(fragSrc);
  cp.mat.uniforms.iRes.value.set(cp.w, cp.h);
  if (state.mp?.passes[id]) state.mp.passes[id].code = fragSrc;
}

export function tickComputePass(id, dt) {
  const cp = _passes.get(id);
  if (!cp || !state.renderer3) return;

  const readRT  = cp.readIdx === 0 ? cp.rt0 : cp.rt1;
  const writeRT = cp.readIdx === 0 ? cp.rt1 : cp.rt0;

  cp.mat.uniforms.iState.value     = readRT.texture;
  cp.mat.uniforms.iTime.value      = state.simTime ?? 0;
  cp.mat.uniforms.iTimeDelta.value = dt;

  // Render pass: fullscreen quad → writeRT
  const mesh  = state.mesh3;
  const scene = state.scene3;
  const cam   = state.cam3;
  if (!mesh || !scene || !cam) return;

  const prevMat = mesh.material;
  mesh.material = cp.mat;
  state.renderer3.setRenderTarget(writeRT);
  state.renderer3.render(scene, cam);
  mesh.material = prevMat;

  // Swap
  cp.readIdx = 1 - cp.readIdx;
}

export function getComputeTexture(id) {
  const cp = _passes.get(id);
  if (!cp) return null;
  return (cp.readIdx === 0 ? cp.rt0 : cp.rt1).texture;
}

export function resizeComputePass(id, w, h) {
  const cp = _passes.get(id);
  if (!cp) return;
  cp.rt0.setSize(Math.max(1, w), Math.max(1, h));
  cp.rt1.setSize(Math.max(1, w), Math.max(1, h));
  cp.w = w;
  cp.h = h;
  cp.mat.uniforms.iRes.value.set(w, h);
}

export function disposeComputePass(id) {
  const cp = _passes.get(id);
  if (!cp) return;
  cp.rt0.dispose();
  cp.rt1.dispose();
  cp.mat.dispose();
  _passes.delete(id);
}

export function getComputePassIds() {
  return [..._passes.keys()];
}

export function isComputePassActive(id) {
  return _passes.has(id);
}
