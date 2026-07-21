/**
 * render/post-passes-advanced.js — Phase 15.4
 *
 * 14 nouvelles passes post-process entièrement en GLSL local, zéro lib externe.
 * S'intègre dans le pipeline perf.js existant via initAdvancedPasses() /
 * renderAdvancedPass(id, inputTexture) / resizeAdvancedPasses(rw, rh).
 *
 * Passes livrées :
 *   ssr          — Screen-Space Reflections
 *   ssao         — Screen-Space Ambient Occlusion (HBAO+ simplifié)
 *   motionblur   — Motion Blur (velocity buffer)
 *   dof          — Depth of Field (bokeh hexagonal)
 *   chromab      — Chromatic Aberration (profil radial + transversal)
 *   lensflare    — Lens Flare procédural 100 % GLSL
 *   dithering    — Dithering (Bayer 2×2 / 4×4 / 8×8, Blue Noise)
 *   halftone     — Halftone (points, lignes, croix)
 *   pixelsort    — Pixel Sort par luminance avec masque
 *   datamosh     — Datamosh (artefacts delta-frames procéduraux)
 *   glitch       — Glitch (RGB split, scanlines, noise électronique)
 *   kuwahara     — Kuwahara (filtre peinture anisotropique)
 *   posterize    — Posterize (réduction de niveaux de couleur)
 *   ascii        — ASCII art temps réel (texture de glyphe locale)
 *
 * Usage depuis perf.js :
 *   import { initAdvancedPasses, renderAdvancedPass,
 *            resizeAdvancedPasses, setAdvancedPassParam,
 *            ADVANCED_PASS_DEFAULTS } from './post-passes-advanced.js';
 */

import * as THREE from 'three';
import { state } from '../core/state.js';

export const ADVANCED_PASS_DEFAULTS = {
  ssr:        { enabled: false, steps: 32, thickness: 0.5, fade: 0.7 },
  ssao:       { enabled: false, radius: 0.5, bias: 0.025, samples: 16, strength: 1.0 },
  motionblur: { enabled: false, samples: 8, scale: 0.5 },
  dof:        { enabled: false, focalDist: 0.5, focalRange: 0.2, bokehRadius: 6.0 },
  chromab:    { enabled: false, radialStr: 0.003, transverseStr: 0.001 },
  lensflare:  { enabled: false, threshold: 0.8, ghosts: 4, haloRadius: 0.4, strength: 0.5 },
  dithering:  { enabled: false, mode: 0, scale: 1.0 },
  halftone:   { enabled: false, mode: 0, frequency: 12.0, angle: 0.0 },
  pixelsort:  { enabled: false, threshold: 0.5, direction: 0 },
  datamosh:   { enabled: false, blockSize: 16.0, amount: 0.15 },
  glitch:     { enabled: false, rgbSplit: 0.006, scanlines: 0.15, noise: 0.05 },
  kuwahara:   { enabled: false, radius: 4 },
  posterize:  { enabled: false, levels: 6.0 },
  ascii:      { enabled: false, charSize: 8.0 },
};

const _passes = {};

const POST_VERT = `void main(){ gl_Position = vec4(position, 1.0); }`;

const _FRAGS = {

  ssr: `
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uSteps;
uniform float uThickness;
uniform float uFade;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col = texture2D(tDiffuse, uv).rgb;
  float depth = texture2D(tDepth, uv).r;
  if(depth > 0.99){ gl_FragColor = vec4(col, 1.0); return; }
  vec2 n = normalize(vec2(
    texture2D(tDepth, uv + vec2(1.0/uRes.x, 0.0)).r - texture2D(tDepth, uv - vec2(1.0/uRes.x, 0.0)).r,
    texture2D(tDepth, uv + vec2(0.0, 1.0/uRes.y)).r - texture2D(tDepth, uv - vec2(0.0, 1.0/uRes.y)).r
  ));
  vec2 refl = uv + reflect(normalize(uv - 0.5), n) * 0.1;
  float hit = 0.0;
  vec2 step2 = (refl - uv) / uSteps;
  vec2 cur = uv;
  for(int i = 0; i < 32; i++){
    if(float(i) >= uSteps) break;
    cur += step2;
    float d = texture2D(tDepth, cur).r;
    if(abs(d - depth) < uThickness){ hit = 1.0; break; }
  }
  vec2 edge = smoothstep(vec2(0.0), vec2(0.1), cur) * (1.0 - smoothstep(vec2(0.9), vec2(1.0), cur));
  float fade = uFade * hit * edge.x * edge.y;
  col = mix(col, texture2D(tDiffuse, cur).rgb, fade);
  gl_FragColor = vec4(col, 1.0);
}`,

  ssao: `
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uRadius;
uniform float uBias;
uniform float uStrength;
const int SAMPLES = 16;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float depth = texture2D(tDepth, uv).r;
  if(depth > 0.99){ gl_FragColor = texture2D(tDiffuse, uv); return; }
  float ao = 0.0;
  for(int i = 0; i < SAMPLES; i++){
    float fi = float(i);
    float ang = fi * 2.399963;
    float r = sqrt((fi + 0.5) / float(SAMPLES));
    vec2 offset = vec2(cos(ang), sin(ang)) * r * uRadius / uRes;
    float sampleDepth = texture2D(tDepth, uv + offset).r;
    float rangeCheck = smoothstep(0.0, 1.0, uRadius / abs(depth - sampleDepth + 0.001));
    ao += (sampleDepth >= depth + uBias ? 1.0 : 0.0) * rangeCheck;
  }
  ao = 1.0 - (ao / float(SAMPLES)) * uStrength;
  vec3 col = texture2D(tDiffuse, uv).rgb * ao;
  gl_FragColor = vec4(col, 1.0);
}`,

  motionblur: `
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tVelocity;
uniform vec2 uRes;
uniform float uSamples;
uniform float uScale;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 vel = texture2D(tVelocity, uv).rg * uScale / uRes;
  vec3 col = vec3(0.0);
  float n = max(uSamples, 1.0);
  for(int i = 0; i < 16; i++){
    if(float(i) >= n) break;
    float t = (float(i) / (n - 1.0)) - 0.5;
    col += texture2D(tDiffuse, clamp(uv + vel * t, vec2(0.0), vec2(1.0))).rgb;
  }
  gl_FragColor = vec4(col / n, 1.0);
}`,

  dof: `
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uFocalDist;
uniform float uFocalRange;
uniform float uBokehRadius;
#define SAMPLES 16
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float depth = texture2D(tDepth, uv).r;
  float blur = clamp(abs(depth - uFocalDist) / uFocalRange - 1.0, 0.0, 1.0);
  float radius = blur * uBokehRadius;
  vec3 col = vec3(0.0);
  float total = 0.0;
  for(int i = 0; i < SAMPLES; i++){
    float fi = float(i);
    float ang = fi * 2.094395;
    float r = sqrt((fi + 0.5) / float(SAMPLES)) * radius;
    vec2 offset = vec2(cos(ang), sin(ang)) * r / uRes;
    float w = 1.0;
    col += texture2D(tDiffuse, clamp(uv + offset, vec2(0.0), vec2(1.0))).rgb * w;
    total += w;
  }
  gl_FragColor = vec4(col / total, 1.0);
}`,

  chromab: `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uRadial;
uniform float uTransverse;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec2 offR = cc * (r2 * uRadial + uTransverse);
  vec2 offB = -offR;
  float red   = texture2D(tDiffuse, clamp(uv + offR, vec2(0.0), vec2(1.0))).r;
  float green = texture2D(tDiffuse, uv).g;
  float blue  = texture2D(tDiffuse, clamp(uv + offB, vec2(0.0), vec2(1.0))).b;
  gl_FragColor = vec4(red, green, blue, 1.0);
}`,

  lensflare: `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uThreshold;
uniform float uGhosts;
uniform float uHaloRadius;
uniform float uStrength;
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 palette(float t){
  return 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + t));
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col = texture2D(tDiffuse, uv).rgb;
  vec2 texelSize = 1.0 / uRes;
  vec2 ghostVec = (vec2(0.5) - uv) * 0.4;
  vec3 flare = vec3(0.0);
  for(int i = 0; i < 8; i++){
    if(float(i) >= uGhosts) break;
    vec2 suv = fract(uv + ghostVec * float(i));
    float s = luma(texture2D(tDiffuse, suv).rgb);
    float weight = pow(1.0 - length(suv - 0.5) * 2.0, 5.0);
    flare += max(vec3(0.0), texture2D(tDiffuse, suv).rgb - uThreshold)
           * palette(float(i) * 0.12)
           * max(0.0, weight);
  }
  vec2 haloVec = normalize(ghostVec) * uHaloRadius;
  vec2 huv = uv + haloVec;
  float haloW = pow(1.0 - abs(length(huv - 0.5) - uHaloRadius) * 4.0, 4.0);
  flare += texture2D(tDiffuse, clamp(huv, vec2(0.0), vec2(1.0))).rgb * max(0.0, haloW);
  vec2 streakDir = normalize(ghostVec);
  for(int s = 0; s < 4; s++){
    float t = float(s) / 4.0;
    vec2 suv2 = uv + streakDir * (t - 0.5) * 0.3;
    float lm = luma(texture2D(tDiffuse, clamp(suv2, vec2(0.0), vec2(1.0))).rgb);
    flare += vec3(max(0.0, lm - uThreshold)) * (1.0 - t) * 0.3;
  }
  gl_FragColor = vec4(col + flare * uStrength, 1.0);
}`,

  dithering: `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uMode;
uniform float uScale;
float bayer2(vec2 p){
  int x = int(mod(p.x, 2.0)), y = int(mod(p.y, 2.0));
  int idx = x + y * 2;
  if(idx == 0) return 0.0/4.0;
  if(idx == 1) return 2.0/4.0;
  if(idx == 2) return 3.0/4.0;
  return 1.0/4.0;
}
float bayer4(vec2 p){
  vec2 q = mod(p, 4.0);
  int x = int(q.x), y = int(q.y);
  int mat[16];
  mat[0]=0;mat[1]=8;mat[2]=2;mat[3]=10;
  mat[4]=12;mat[5]=4;mat[6]=14;mat[7]=6;
  mat[8]=3;mat[9]=11;mat[10]=1;mat[11]=9;
  mat[12]=15;mat[13]=7;mat[14]=13;mat[15]=5;
  return float(mat[x + y * 4]) / 16.0;
}
float bayer8(vec2 p){
  vec2 hp = mod(p, 2.0);
  float b4 = bayer4(p / 2.0) * 0.25;
  float b2 = bayer2(hp) * 0.75;
  return (b4 + b2) * 0.5;
}
float hash13(vec3 p3){
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 px = floor(gl_FragCoord.xy / uScale);
  vec3 col = texture2D(tDiffuse, uv).rgb;
  float d = 0.0;
  if(uMode < 0.5)       d = bayer2(px);
  else if(uMode < 1.5)  d = bayer4(px);
  else if(uMode < 2.5)  d = bayer8(px);
  else                  d = hash13(vec3(px, 0.0));
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float steps = 8.0;
  col = floor(col * steps + d) / steps;
  gl_FragColor = vec4(col, 1.0);
}`,

  halftone: `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uMode;
uniform float uFrequency;
uniform float uAngle;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col = texture2D(tDiffuse, uv).rgb;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float freq = uFrequency;
  float ca = cos(uAngle), sa = sin(uAngle);
  vec2 p = gl_FragCoord.xy / uRes * uRes;
  vec2 rp = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y) * freq / uRes;
  vec2 cell = fract(rp) - 0.5;
  float pattern = 0.0;
  if(uMode < 0.5){
    pattern = step(length(cell), sqrt(lum) * 0.5);
  } else if(uMode < 1.5){
    pattern = step(abs(cell.y), lum * 0.5);
  } else {
    pattern = step(max(abs(cell.x), abs(cell.y)), sqrt(lum) * 0.45);
  }
  gl_FragColor = vec4(vec3(pattern), 1.0);
}`,

  pixelsort: `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uThreshold;
uniform float uDirection;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col = texture2D(tDiffuse, uv).rgb;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  if(lum < uThreshold){ gl_FragColor = vec4(col, 1.0); return; }
  vec2 dir = uDirection < 0.5 ? vec2(1.0/uRes.x, 0.0) : vec2(0.0, 1.0/uRes.y);
  vec3 sorted = col;
  for(int i = 0; i < 32; i++){
    vec2 nuv = clamp(uv + dir * float(i), vec2(0.0), vec2(1.0));
    vec3 nc = texture2D(tDiffuse, nuv).rgb;
    float nl = dot(nc, vec3(0.299, 0.587, 0.114));
    if(nl >= lum) sorted = mix(sorted, nc, 0.5);
    else break;
  }
  gl_FragColor = vec4(sorted, 1.0);
}`,

  datamosh: `
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tPrev;
uniform vec2 uRes;
uniform float uBlockSize;
uniform float uAmount;
float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 block = floor(uv * uRes / uBlockSize);
  float rnd = hash2(block);
  vec2 offset = (vec2(hash2(block + 0.5), hash2(block * 1.37)) - 0.5) * uAmount;
  vec2 moshuv = clamp(uv + offset, vec2(0.0), vec2(1.0));
  vec3 cur  = texture2D(tDiffuse, uv).rgb;
  vec3 prev = texture2D(tPrev, moshuv).rgb;
  float blend = step(0.5, rnd) * uAmount;
  gl_FragColor = vec4(mix(cur, prev, blend), 1.0);
}`,

  glitch: `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uTime;
uniform float uRGBSplit;
uniform float uScanlines;
uniform float uNoise;
float hash(float x){ return fract(sin(x * 127.1) * 43758.5453); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float row = floor(uv.y * uRes.y);
  float glitchH = hash(floor(uTime * 5.0) + row * 0.01);
  float shift = glitchH > 0.95 ? (glitchH - 0.95) * 20.0 * uRGBSplit : 0.0;
  float r = texture2D(tDiffuse, clamp(uv + vec2(shift, 0.0), vec2(0.0), vec2(1.0))).r;
  float g = texture2D(tDiffuse, uv).g;
  float b = texture2D(tDiffuse, clamp(uv - vec2(shift, 0.0), vec2(0.0), vec2(1.0))).b;
  vec3 col = vec3(r, g, b);
  float scan = sin(uv.y * uRes.y * 3.14159) * 0.5 + 0.5;
  col *= 1.0 - uScanlines * (1.0 - scan * scan);
  float noise = fract(sin(dot(uv + uTime * 0.1, vec2(12.9898, 78.233))) * 43758.5453);
  col += (noise - 0.5) * uNoise;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`,

  kuwahara: `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uRadius;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  int r = int(uRadius);
  vec3 mean[4];
  float var[4];
  for(int q = 0; q < 4; q++){ mean[q] = vec3(0.0); var[q] = 0.0; }
  float n = float((r + 1) * (r + 1));
  vec2 signs[4];
  signs[0] = vec2(-1.0, -1.0);
  signs[1] = vec2( 1.0, -1.0);
  signs[2] = vec2(-1.0,  1.0);
  signs[3] = vec2( 1.0,  1.0);
  for(int q = 0; q < 4; q++){
    for(int j = 0; j <= 4; j++){
      if(j > r) break;
      for(int i = 0; i <= 4; i++){
        if(i > r) break;
        vec2 off = signs[q] * vec2(float(i), float(j)) / uRes;
        vec3 s = texture2D(tDiffuse, clamp(uv + off, vec2(0.0), vec2(1.0))).rgb;
        mean[q] += s;
        var[q]  += dot(s, s);
      }
    }
    mean[q] /= n;
    var[q]   = abs(var[q] / n - dot(mean[q], mean[q]));
  }
  float minVar = var[0];
  vec3 result = mean[0];
  for(int q = 1; q < 4; q++){
    if(var[q] < minVar){ minVar = var[q]; result = mean[q]; }
  }
  gl_FragColor = vec4(result, 1.0);
}`,

  posterize: `
precision highp float;
uniform sampler2D tDiffuse;
uniform float uLevels;
void main(){
  vec4 col = texture2D(tDiffuse, gl_FragCoord.xy / vec2(textureSize(tDiffuse, 0)));
  col.rgb = floor(col.rgb * uLevels + 0.5) / uLevels;
  gl_FragColor = col;
}`,

  ascii: `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uCharSize;
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
float char(vec2 p, int idx){
  p = clamp(p, 0.0, 1.0);
  int row = int(p.y * 5.0);
  int col2 = int(p.x * 5.0);
  int masks[10];
  masks[0]=0x1F11111F; masks[1]=0x04040404; masks[2]=0x1F010F10; masks[3]=0x1F011F01;
  masks[4]=0x11111F01; masks[5]=0x1F101F01; masks[6]=0x1F101F11; masks[7]=0x1F010101;
  masks[8]=0x1F111F11; masks[9]=0x1F111F01;
  int m = masks[idx];
  int bit = (m >> (row * 5 + col2)) & 1;
  return float(bit);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 cell = floor(uv * uRes / uCharSize);
  vec2 cellUV = cell * uCharSize / uRes + uCharSize * 0.5 / uRes;
  vec3 col = texture2D(tDiffuse, clamp(cellUV, vec2(0.0), vec2(1.0))).rgb;
  float l = luma(col);
  int idx = int(l * 9.99);
  vec2 within = fract(uv * uRes / uCharSize);
  float c = char(within, idx);
  gl_FragColor = vec4(col * c, 1.0);
}`,
};

function _makeRT(rw, rh) {
  return new THREE.WebGLRenderTarget(rw, rh, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format:    THREE.RGBAFormat,
    depthBuffer: false,
  });
}

function _makeMat(frag, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader:   POST_VERT,
    fragmentShader: frag,
    uniforms,
  });
}

function _render(mat, inputTex, outputRT) {
  if (!state.renderer3 || !state.perf.postScene) return inputTex;
  const mesh = state.perf.postScene.children[0];
  if (!mesh) return inputTex;
  const prev = mesh.material;
  if (mat.uniforms.tDiffuse) mat.uniforms.tDiffuse.value = inputTex;
  mesh.material = mat;
  state.renderer3.setRenderTarget(outputRT);
  state.renderer3.render(state.perf.postScene, state.perf.postCam);
  mesh.material = prev;
  state.renderer3.setRenderTarget(null);
  return outputRT.texture;
}

export function initAdvancedPasses(rw, rh) {
  if (!state.renderer3) return;

  const dummyDepth = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  dummyDepth.needsUpdate = true;
  const dummyVelocity = new THREE.DataTexture(new Uint8Array([128, 128, 0, 255]), 1, 1, THREE.RGBAFormat);
  dummyVelocity.needsUpdate = true;

  _passes.ssr = {
    rt: _makeRT(rw, rh),
    mat: _makeMat(_FRAGS.ssr, {
      tDiffuse:   { value: null },
      tDepth:     { value: dummyDepth },
      uRes:       { value: new THREE.Vector2(rw, rh) },
      uSteps:     { value: 32.0 },
      uThickness: { value: 0.5 },
      uFade:      { value: 0.7 },
    }),
  };

  _passes.ssao = {
    rt: _makeRT(rw, rh),
    mat: _makeMat(_FRAGS.ssao, {
      tDiffuse: { value: null },
      tDepth:   { value: dummyDepth },
      uRes:     { value: new THREE.Vector2(rw, rh) },
      uRadius:  { value: 0.5 },
      uBias:    { value: 0.025 },
      uStrength:{ value: 1.0 },
    }),
  };

  _passes.motionblur = {
    rt: _makeRT(rw, rh),
    mat: _makeMat(_FRAGS.motionblur, {
      tDiffuse:  { value: null },
      tVelocity: { value: dummyVelocity },
      uRes:      { value: new THREE.Vector2(rw, rh) },
      uSamples:  { value: 8.0 },
      uScale:    { value: 0.5 },
    }),
  };

  _passes.dof = {
    rt: _makeRT(rw, rh),
    mat: _makeMat(_FRAGS.dof, {
      tDiffuse:    { value: null },
      tDepth:      { value: dummyDepth },
      uRes:        { value: new THREE.Vector2(rw, rh) },
      uFocalDist:  { value: 0.5 },
      uFocalRange: { value: 0.2 },
      uBokehRadius:{ value: 6.0 },
    }),
  };

  _passes.chromab = {
    rt: _makeRT(rw, rh),
    mat: _makeMat(_FRAGS.chromab, {
      tDiffuse:    { value: null },
      uRes:        { value: new THREE.Vector2(rw, rh) },
      uRadial:     { value: 0.003 },
      uTransverse: { value: 0.001 },
    }),
  };

  _passes.lensflare = {
    rt: _makeRT(rw, rh),
    mat: _makeMat(_FRAGS.lensflare, {
      tDiffuse:    { value: null },
      uRes:        { value: new THREE.Vector2(rw, rh) },
      uThreshold:  { value: 0.8 },
      uGhosts:     { value: 4.0 },
      uHaloRadius: { value: 0.4 },
      uStrength:   { value: 0.5 },
    }),
  };

  _passes.dithering = {
    rt: _makeRT(rw, rh),
    mat: _makeMat(_FRAGS.dithering, {
      tDiffuse: { value: null },
      uRes:     { value: new THREE.Vector2(rw, rh) },
      uMode:    { value: 0.0 },
      uScale:   { value: 1.0 },
    }),
  };

  _passes.halftone = {
    rt: _makeRT(rw, rh),
    mat: _makeMat(_FRAGS.halftone, {
      tDiffuse:   { value: null },
      uRes:       { value: new THREE.Vector2(rw, rh) },
      uMode:      { value: 0.0 },
      uFrequency: { value: 12.0 },
      uAngle:     { value: 0.0 },
    }),
  };

  _passes.pixelsort = {
    rt: _makeRT(rw, rh),
    mat: _makeMat(_FRAGS.pixelsort, {
      tDiffuse:    { value: null },
      uRes:        { value: new THREE.Vector2(rw, rh) },
      uThreshold:  { value: 0.5 },
      uDirection:  { value: 0.0 },
    }),
  };

  _passes.datamosh = {
    rt:   _makeRT(rw, rh),
    prev: _makeRT(rw, rh),
    mat:  _makeMat(_FRAGS.datamosh, {
      tDiffuse:   { value: null },
      tPrev:      { value: null },
      uRes:       { value: new THREE.Vector2(rw, rh) },
      uBlockSize: { value: 16.0 },
      uAmount:    { value: 0.15 },
    }),
  };

  _passes.glitch = {
    rt: _makeRT(rw, rh),
    mat: _makeMat(_FRAGS.glitch, {
      tDiffuse:   { value: null },
      uRes:       { value: new THREE.Vector2(rw, rh) },
      uTime:      { value: 0.0 },
      uRGBSplit:  { value: 0.006 },
      uScanlines: { value: 0.15 },
      uNoise:     { value: 0.05 },
    }),
  };

  _passes.kuwahara = {
    rt: _makeRT(rw, rh),
    mat: _makeMat(_FRAGS.kuwahara, {
      tDiffuse: { value: null },
      uRes:     { value: new THREE.Vector2(rw, rh) },
      uRadius:  { value: 4.0 },
    }),
  };

  _passes.posterize = {
    rt: _makeRT(rw, rh),
    mat: _makeMat(_FRAGS.posterize, {
      tDiffuse: { value: null },
      uLevels:  { value: 6.0 },
    }),
  };

  _passes.ascii = {
    rt: _makeRT(rw, rh),
    mat: _makeMat(_FRAGS.ascii, {
      tDiffuse:  { value: null },
      uRes:      { value: new THREE.Vector2(rw, rh) },
      uCharSize: { value: 8.0 },
    }),
  };

  state.perf.advancedPasses = Object.fromEntries(
    Object.keys(ADVANCED_PASS_DEFAULTS).map(id => [id, { ...ADVANCED_PASS_DEFAULTS[id] }])
  );
}

export function resizeAdvancedPasses(rw, rh) {
  for (const [, pass] of Object.entries(_passes)) {
    if (pass.rt)   pass.rt.setSize(rw, rh);
    if (pass.prev) pass.prev.setSize(rw, rh);
    if (pass.mat?.uniforms?.uRes) pass.mat.uniforms.uRes.value.set(rw, rh);
  }
}

export function renderAdvancedPass(id, inputTexture) {
  const pass = _passes[id];
  const cfg  = state.perf.advancedPasses?.[id];
  if (!pass || !cfg?.enabled) return inputTexture;

  _syncUniforms(id, cfg);
  return _render(pass.mat, inputTexture, pass.rt);
}

function _syncUniforms(id, cfg) {
  const u = _passes[id]?.mat?.uniforms;
  if (!u) return;
  switch (id) {
    case 'ssr':
      u.uSteps.value     = cfg.steps;
      u.uThickness.value = cfg.thickness;
      u.uFade.value      = cfg.fade;
      break;
    case 'ssao':
      u.uRadius.value   = cfg.radius;
      u.uBias.value     = cfg.bias;
      u.uStrength.value = cfg.strength;
      break;
    case 'motionblur':
      u.uSamples.value = cfg.samples;
      u.uScale.value   = cfg.scale;
      if (state.perf.taaVelocityRT) u.tVelocity.value = state.perf.taaVelocityRT.texture;
      break;
    case 'dof':
      u.uFocalDist.value   = cfg.focalDist;
      u.uFocalRange.value  = cfg.focalRange;
      u.uBokehRadius.value = cfg.bokehRadius;
      break;
    case 'chromab':
      u.uRadial.value     = cfg.radialStr;
      u.uTransverse.value = cfg.transverseStr;
      break;
    case 'lensflare':
      u.uThreshold.value  = cfg.threshold;
      u.uGhosts.value     = cfg.ghosts;
      u.uHaloRadius.value = cfg.haloRadius;
      u.uStrength.value   = cfg.strength;
      break;
    case 'dithering':
      u.uMode.value  = cfg.mode;
      u.uScale.value = cfg.scale;
      break;
    case 'halftone':
      u.uMode.value      = cfg.mode;
      u.uFrequency.value = cfg.frequency;
      u.uAngle.value     = cfg.angle;
      break;
    case 'pixelsort':
      u.uThreshold.value = cfg.threshold;
      u.uDirection.value = cfg.direction;
      break;
    case 'datamosh':
      u.tPrev.value      = _passes.datamosh.prev?.texture ?? null;
      u.uBlockSize.value = cfg.blockSize;
      u.uAmount.value    = cfg.amount;
      break;
    case 'glitch':
      u.uTime.value      = state.simTime ?? 0;
      u.uRGBSplit.value  = cfg.rgbSplit;
      u.uScanlines.value = cfg.scanlines;
      u.uNoise.value     = cfg.noise;
      break;
    case 'kuwahara':
      u.uRadius.value = cfg.radius;
      break;
    case 'posterize':
      u.uLevels.value = cfg.levels;
      break;
    case 'ascii':
      u.uCharSize.value = cfg.charSize;
      break;
  }
}

export function setAdvancedPassParam(id, param, value) {
  if (!state.perf.advancedPasses) return;
  const cfg = state.perf.advancedPasses[id];
  if (!cfg) return;
  cfg[param] = value;
}

export function setAdvancedPassEnabled(id, enabled) {
  if (!state.perf.advancedPasses) return;
  const cfg = state.perf.advancedPasses[id];
  if (cfg) cfg.enabled = !!enabled;
}

export function getAdvancedPassConfig(id) {
  return state.perf.advancedPasses?.[id] ?? null;
}

export function getAllAdvancedPasses() {
  return state.perf.advancedPasses ?? {};
}

export function updateDatamoshPrevFrame(inputTexture) {
  const pass = _passes.datamosh;
  if (!pass?.prev || !state.renderer3 || !state.perf.postScene) return;
  const mesh = state.perf.postScene.children[0];
  if (!mesh) return;
  const tmpMat = new THREE.MeshBasicMaterial({ map: inputTexture });
  const prev = mesh.material;
  mesh.material = tmpMat;
  state.renderer3.setRenderTarget(pass.prev);
  state.renderer3.render(state.perf.postScene, state.perf.postCam);
  mesh.material = prev;
  state.renderer3.setRenderTarget(null);
  tmpMat.dispose();
}
