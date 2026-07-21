// Performance monitoring, post-process, FPS cap — initializes state.perf

import * as THREE from 'three';
import { state } from '../core/state.js';
import { doResize } from '../gl/renderer.js';
import { _makeFullScreenTriangle, _VERT_TRIANGLE, setRenderResolution, getEffectiveResolution } from './resolution.js';
import { detectGLCaps, renderGLCapsPanel } from './gl-caps.js';
import { getJsOverheadMs } from './raf-loop.js';
import { getCacheStats } from './shader-cache.js';
import { scoreGLSL } from '../shader/glsl-complexity.js';
import {
  initAdvancedPasses,
  resizeAdvancedPasses,
  renderAdvancedPass,
  setAdvancedPassEnabled,
  setAdvancedPassParam,
  getAdvancedPassConfig,
  getAllAdvancedPasses,
  updateDatamoshPrevFrame,
  ADVANCED_PASS_DEFAULTS,
} from './post-passes-advanced.js';
import {
  initColorBlindness,
  resizeColorBlindness,
  renderColorBlindnessPass,
  setColorBlindnessMode,
  getColorBlindnessMode,
  toggleColorBlindness,
  setColorBlindnessOverlay,
  isColorBlindnessEnabled,
  COLORBLINDNESS_MODES,
} from './colorblindness.js';
import './post-integration.js'; // F-2.2/F-4.2/F-4.3/F-4.4 — registers state.callbacks

// ── 5.1/5.2/5.3 state ──────────────────────────────────
state.perf = {
  fps: 0,
  lastFrameTime: 0,
  frameCount: 0,
  history: [],
  fpsCap: 0,           // 0 = unlocked, 30, 60
  _lastFrameMs: 0,     // last frame timestamp for cap
  alertEnabled: false, // perf alert badge
  // Post-process
  postEnabled: false,
  bloom: false,
  bloomStr: 0.5,
  bloomThresh: 0.6,
  bloomRadius: 0.5,
  crt: false,
  crtBarrel: 0.15,
  crtScanlines: 0.25,
  crtAberration: 0.003,
  fxaa: false,
  tonemapping: 0,      // 0=none 1=reinhard 2=aces
  vignette: false,
  vignetteStr: 0.4,
  srgb: false,
  // TAA (Temporal Anti-Aliasing)
  taaEnabled: false,
  taaBlend: 0.9,
  taaThreshold: 0.08,
  taaHistoryRT: null,
  taaTempRT: null,
  taaMat: null,
  _taaFirstFrame: true,
  // Velocity pass resources (populated by initPostProcess)
  taaVelocityRT: null,
  taaVelocityMat: null,
  taaVelocityTex: null, // user-provided override
  taaVelocityScale: 1.0,
  taaVelocityEnabled: true,
  // LUT Color Grading
  lutEnabled: false,
  lutStrength: 1.0,
  lutTexture: null,
  lutSize: 0,
  lutMat: null,
  lutRT: null,
  // Grain/Noise
  grainEnabled: false,
  grainAmount: 0.1,
  grainMat: null,
  grainRT: null,
  // Frame Feedback Latency Compensation
  frameDelay: {
    enabled: false,
    numFrames: 1,
    buffers: null,
    mat: null,
    scene: null,
    cam: null,
    _currentIdx: 0,
  },
  // Post-process passes array
  postPasses: [
    { id: 'bloom',      enabled: false, order: 0 },
    { id: 'crt',        enabled: false, order: 1 },
    { id: 'fxaa',       enabled: false, order: 2 },
    { id: 'taa',        enabled: false, order: 3 },
    { id: 'tonemapping',enabled: false, order: 4 },
    { id: 'vignette',   enabled: false, order: 5 },
    { id: 'lut',        enabled: false, order: 6 },
    { id: 'grain',      enabled: false, order: 7 },
    { id: 'ssr',        enabled: false, order: 8 },
    { id: 'ssao',       enabled: false, order: 9 },
    { id: 'motionblur', enabled: false, order: 10 },
    { id: 'dof',        enabled: false, order: 11 },
    { id: 'chromab',    enabled: false, order: 12 },
    { id: 'lensflare',  enabled: false, order: 13 },
    { id: 'dithering',  enabled: false, order: 14 },
    { id: 'halftone',   enabled: false, order: 15 },
    { id: 'pixelsort',  enabled: false, order: 16 },
    { id: 'datamosh',   enabled: false, order: 17 },
    { id: 'glitch',     enabled: false, order: 18 },
    { id: 'kuwahara',   enabled: false, order: 19 },
    { id: 'posterize',  enabled: false, order: 20 },
    { id: 'ascii',      enabled: false, order: 21 },
  ],
  advancedPasses: null,
  // Runtime
  cpuMs: 0,
  postRT: null,
  postScene: null,
  postMat: null,
  postCam: null,
  fxaaRT: null,
  fxaaMat: null,
  bloomRTs: null,
  bloomMats: null,
  // Sparkline
  frameMs: new Float32Array(90),
  frameMsIdx: 0,
  // Phase 1.3 additions
  jsOverheadMs:       0,       // JS-only tick overhead (raf-loop EMA)
  gpuTimestampMs:     null,    // real GPU time from timestamp-query (or null)
  gpuTimestampEnabled:false,   // true when WebGPU timestamp-query is active
  glCaps:             null,    // populated by gl-caps.js on first query
  uniformSAB:         null,    // SharedArrayBuffer | ArrayBuffer for uniforms
  uniformF32:         null,    // Float32Array view of uniformSAB
};

const POST_VERT = `void main(){ gl_Position = vec4(position, 1.0); }`;

const BLOOM_THRESH_FRAG = `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uThresh;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture2D(tDiffuse, uv).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float w = smoothstep(uThresh, uThresh + 0.1, lum);
  gl_FragColor = vec4(c * w, 1.0);
}`;

const BLOOM_DOWN_FRAG = `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uRes;
uniform float uOffset;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uOffset / uRes;
  vec3 c = texture2D(tSrc, uv).rgb * 4.0
    + texture2D(tSrc, uv + vec2(-p.x,  0.0)).rgb
    + texture2D(tSrc, uv + vec2( p.x,  0.0)).rgb
    + texture2D(tSrc, uv + vec2( 0.0, -p.y)).rgb
    + texture2D(tSrc, uv + vec2( 0.0,  p.y)).rgb
    + texture2D(tSrc, uv + vec2(-p.x, -p.y)).rgb * 0.5
    + texture2D(tSrc, uv + vec2( p.x, -p.y)).rgb * 0.5
    + texture2D(tSrc, uv + vec2(-p.x,  p.y)).rgb * 0.5
    + texture2D(tSrc, uv + vec2( p.x,  p.y)).rgb * 0.5;
  gl_FragColor = vec4(c / 8.0, 1.0);
}`;

const BLOOM_UP_FRAG = `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uRes;
uniform float uOffset;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uOffset / uRes;
  vec3 c = texture2D(tSrc, uv + vec2(-p.x,  p.y)).rgb
         + texture2D(tSrc, uv + vec2( 0.0,  p.y)).rgb * 2.0
         + texture2D(tSrc, uv + vec2( p.x,  p.y)).rgb
         + texture2D(tSrc, uv + vec2(-p.x,  0.0)).rgb * 2.0
         + texture2D(tSrc, uv                    ).rgb * 4.0
         + texture2D(tSrc, uv + vec2( p.x,  0.0)).rgb * 2.0
         + texture2D(tSrc, uv + vec2(-p.x, -p.y)).rgb
         + texture2D(tSrc, uv + vec2( 0.0, -p.y)).rgb * 2.0
         + texture2D(tSrc, uv + vec2( p.x, -p.y)).rgb;
  gl_FragColor = vec4(c / 16.0, 1.0);
}`;

const POST_FRAG = `
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform sampler2D tLut;
uniform vec2 uRes;
uniform float uBloom;
uniform float uBloomStr;
uniform float uTone;
uniform float uVignette;
uniform float uVigStr;
uniform float uSRGB;
uniform float uCRT;
uniform float uCRTBarrel;
uniform float uCRTScanlines;
uniform float uCRTAberration;
uniform float uLutEnabled;
uniform float uLutStrength;
uniform float uLutSize;

vec3 reinhard(vec3 c){ return c/(c+1.0); }
vec3 aces(vec3 c){ return clamp((c*(2.51*c+0.03))/(c*(2.43*c+0.59)+0.14),0.0,1.0); }
vec3 hable(vec3 x){
  float A=0.15,B=0.50,C=0.10,D=0.20,E=0.02,F=0.30,W=11.2;
  vec3 r=((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F))-E/F;
  vec3 w=((vec3(W)*(A*W+C*B)+D*E)/(vec3(W)*(A*W+B)+D*F))-E/F;
  return r/w;
}
vec3 agx(vec3 c){
  mat3 M=mat3(0.842479,0.0423282,0.0423757,0.0784336,0.878469,0.0784336,0.0792237,0.0791661,0.879143);
  c=M*c; c=clamp(c,0.0,1.0); return pow(c,vec3(1.0/2.2));
}
vec3 reinhardExt(vec3 c){ float mL=4.0; vec3 n=c*(1.0+c/(mL*mL)); return n/(1.0+c); }
vec3 lottes(vec3 c){
  vec3 a=vec3(1.6),d=vec3(0.977),hd=vec3(0.995),hb=vec3(0.5),hs=vec3(2.0);
  vec3 r=pow(c,a)/(pow(c,a)+pow(d,a));
  return mix(r,vec3(1.0),pow(max(c-hb,vec3(0.0))/(hd-hb),hs)*hd);
}

vec2 barrelWarp(vec2 uv, float k){
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  return uv + cc * r2 * k;
}

vec3 applyLut(vec3 color, float size) {
  float scale = (size - 1.0) / size;
  float offset = 0.5 / size;
  vec3 lutCoord = clamp(color, 0.0, 1.0) * scale + offset;
  float blueSlice = lutCoord.b * (size - 1.0);
  float blueSliceFloor = floor(blueSlice);
  float blueSliceFrac = blueSlice - blueSliceFloor;
  float rows = ceil(sqrt(size));
  float cols = rows;
  float sliceU = mod(blueSliceFloor, cols);
  float sliceV = floor(blueSliceFloor / cols);
  vec2 sliceSize = vec2(1.0 / cols, 1.0 / rows);
  vec2 uv1 = vec2(sliceU, sliceV) * sliceSize + lutCoord.xy * sliceSize;
  float nextSlice = min(blueSliceFloor + 1.0, size - 1.0);
  float nextSliceU = mod(nextSlice, cols);
  float nextSliceV = floor(nextSlice / cols);
  vec2 uv2 = vec2(nextSliceU, nextSliceV) * sliceSize + lutCoord.xy * sliceSize;
  vec3 color1 = texture2D(tLut, uv1).rgb;
  vec3 color2 = texture2D(tLut, uv2).rgb;
  return mix(color1, color2, blueSliceFrac);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col;

  if(uCRT > 0.5){
    vec2 wuv = barrelWarp(uv, uCRTBarrel);
    if(wuv.x < 0.0 || wuv.x > 1.0 || wuv.y < 0.0 || wuv.y > 1.0){
      col = vec3(0.0);
    } else {
      vec2 off = vec2(uCRTAberration, 0.0);
      float r = texture2D(tDiffuse, barrelWarp(uv + off, uCRTBarrel)).r;
      float g = texture2D(tDiffuse, wuv).g;
      float b = texture2D(tDiffuse, barrelWarp(uv - off, uCRTBarrel)).b;
      col = vec3(r, g, b);
      float scanline = sin(wuv.y * uRes.y * 3.14159) * 0.5 + 0.5;
      col *= 1.0 - uCRTScanlines * (1.0 - scanline * scanline);
    }
  } else {
    col = texture2D(tDiffuse, uv).rgb;
  }

  if(uBloom > 0.5){
    col += texture2D(tBloom, uv).rgb * uBloomStr;
  }

  if(uTone > 5.5) col = lottes(col);
  else if(uTone > 4.5) col = reinhardExt(col);
  else if(uTone > 3.5) col = agx(col);
  else if(uTone > 2.5) col = hable(col);
  else if(uTone > 1.5) col = aces(col);
  else if(uTone > 0.5) col = reinhard(col);

  if(uLutEnabled > 0.5 && uLutSize > 1.0){
    vec3 graded = applyLut(clamp(col, 0.0, 1.0), uLutSize);
    col = mix(col, graded, uLutStrength);
  }

  if(uVignette > 0.5){
    vec2 q = uv - 0.5;
    col *= 1.0 - dot(q,q) * 3.5 * uVigStr;
  }

  col = clamp(col, 0.0, 1.0);
  if(uSRGB > 0.5) col = pow(col, vec3(1.0/2.2));
  gl_FragColor = vec4(col, 1.0);
}`;

  const TAA_FRAG = `
  precision highp float;
  uniform sampler2D tCurrent;
  uniform sampler2D tHistory;
  uniform sampler2D tVelocity;
  uniform vec2 uRes;
  uniform vec2 uJitterDelta; // pixels: prevJitter - currJitter
  uniform float uHaveVelocity; // 0/1
  uniform float uBlend;
  uniform float uThreshold;

  void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    vec3 cur = texture2D(tCurrent, uv).rgb;

    vec2 historyUV = uv;
    if(uHaveVelocity > 0.5){
      vec2 vel = texture2D(tVelocity, uv).xy;
      historyUV += vel / uRes;
    } else {
      historyUV += uJitterDelta / uRes;
    }

    historyUV = clamp(historyUV, vec2(0.0), vec2(1.0));
    vec3 hist = texture2D(tHistory, historyUV).rgb;

    float diff = length(cur - hist);
    float keep = step(diff, uThreshold);
    vec3 acc = mix(cur, hist, uBlend * keep);
    gl_FragColor = vec4(acc, 1.0);
  }
  `;

  const VELOCITY_FRAG = `
  precision highp float;
  uniform sampler2D tCurrent;
  uniform sampler2D tHistory;
  uniform vec2 uRes;
  uniform vec2 uJitterDelta; // pixels
  uniform float uScale;

  float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

  void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    vec2 px = 1.0 / uRes;

    vec2 histUV = clamp(uv + uJitterDelta / uRes, vec2(0.0), vec2(1.0));
    float Ic = luma(texture2D(tCurrent, uv).rgb);
    float Ih = luma(texture2D(tHistory, histUV).rgb);

    // central differences for spatial gradient
    float Ix = (luma(texture2D(tCurrent, uv + vec2(px.x, 0.0)).rgb) - luma(texture2D(tCurrent, uv - vec2(px.x, 0.0)).rgb)) * 0.5;
    float Iy = (luma(texture2D(tCurrent, uv + vec2(0.0, px.y)).rgb) - luma(texture2D(tCurrent, uv - vec2(0.0, px.y)).rgb)) * 0.5;
    float It = Ic - Ih;

    float denom = Ix * Ix + Iy * Iy + 1e-6;
    vec2 v = vec2(0.0);
    if(denom > 1e-6) v = -It * vec2(Ix, Iy) / denom;

    // scale and clamp (velocity in pixels)
    v *= uScale;
    v = clamp(v, -32.0, 32.0);

    gl_FragColor = vec4(v, 0.0, 1.0);
  }
  `;

const FXAA_FRAG = `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uRes;

#define FXAA_EDGE_THRESHOLD     0.166
#define FXAA_EDGE_THRESHOLD_MIN 0.0625
#define FXAA_SEARCH_STEPS       8
#define FXAA_SEARCH_ACCELERATION 2.0
#define FXAA_SUBPIX_CAP         0.75
#define FXAA_SUBPIX_TRIM        0.25

float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

void main(){
  vec2 uv  = gl_FragCoord.xy / uRes;
  vec2 px  = 1.0 / uRes;

  float lumC  = luma(texture2D(tDiffuse, uv).rgb);
  float lumN  = luma(texture2D(tDiffuse, uv + vec2( 0.0,  px.y)).rgb);
  float lumS  = luma(texture2D(tDiffuse, uv + vec2( 0.0, -px.y)).rgb);
  float lumE  = luma(texture2D(tDiffuse, uv + vec2( px.x,  0.0)).rgb);
  float lumW  = luma(texture2D(tDiffuse, uv + vec2(-px.x,  0.0)).rgb);

  float lumMin = min(lumC, min(min(lumN, lumS), min(lumE, lumW)));
  float lumMax = max(lumC, max(max(lumN, lumS), max(lumE, lumW)));
  float range  = lumMax - lumMin;

  if(range < max(FXAA_EDGE_THRESHOLD_MIN, lumMax * FXAA_EDGE_THRESHOLD)){
    gl_FragColor = texture2D(tDiffuse, uv);
    return;
  }

  float lumNW = luma(texture2D(tDiffuse, uv + vec2(-px.x,  px.y)).rgb);
  float lumNE = luma(texture2D(tDiffuse, uv + vec2( px.x,  px.y)).rgb);
  float lumSW = luma(texture2D(tDiffuse, uv + vec2(-px.x, -px.y)).rgb);
  float lumSE = luma(texture2D(tDiffuse, uv + vec2( px.x, -px.y)).rgb);

  float edgeH = abs(lumNW - lumN) + abs(lumN - lumNE) * 2.0
              + abs(lumW  - lumC) * 2.0
              + abs(lumSW - lumS) + abs(lumS - lumSE) * 2.0
              + abs(lumW  - lumC);
  float edgeV = abs(lumNW - lumW) + abs(lumW - lumSW) * 2.0
              + abs(lumN  - lumC) * 2.0
              + abs(lumNE - lumE) + abs(lumE - lumSE) * 2.0
              + abs(lumN  - lumC);

  bool isHoriz = edgeH >= edgeV;
  vec2 dir = isHoriz ? vec2(0.0, px.y) : vec2(px.x, 0.0);

  float lum1 = isHoriz ? lumS : lumW;
  float lum2 = isHoriz ? lumN : lumE;
  float grad1 = abs(lum1 - lumC);
  float grad2 = abs(lum2 - lumC);
  vec2 step = (grad1 >= grad2) ? -dir : dir;

  vec2 uv1 = uv + step * 0.5;
  vec2 uv2 = uv - step * 0.5;
  float lumEnd1 = luma(texture2D(tDiffuse, uv1).rgb);
  float lumEnd2 = luma(texture2D(tDiffuse, uv2).rgb);
  float lumAvg  = (lumC + ((grad1 >= grad2) ? lum1 : lum2)) * 0.5;

  for(int i = 0; i < FXAA_SEARCH_STEPS; i++){
    if(abs(lumEnd1 - lumAvg) < range * 0.25) { uv1 += step * FXAA_SEARCH_ACCELERATION; lumEnd1 = luma(texture2D(tDiffuse, uv1).rgb); }
    if(abs(lumEnd2 - lumAvg) < range * 0.25) { uv2 -= step * FXAA_SEARCH_ACCELERATION; lumEnd2 = luma(texture2D(tDiffuse, uv2).rgb); }
  }

  float dist1 = isHoriz ? abs(uv1.x - uv.x) : abs(uv1.y - uv.y);
  float dist2 = isHoriz ? abs(uv2.x - uv.x) : abs(uv2.y - uv.y);
  float span  = dist1 + dist2;
  float pixelOffset = 0.5 - min(dist1, dist2) / span;

  float subpix = abs(lumC - (lumN + lumS + lumE + lumW) * 0.25);
  subpix = clamp(subpix / range, 0.0, 1.0);
  subpix = smoothstep(0.0, 1.0, subpix) * subpix;
  subpix = max(pixelOffset, subpix * FXAA_SUBPIX_CAP * (1.0 - FXAA_SUBPIX_TRIM));

  gl_FragColor = texture2D(tDiffuse, uv + (isHoriz ? vec2(0.0, pixelOffset * px.y) : vec2(pixelOffset * px.x, 0.0)));
}`;

const GRAIN_FRAG = `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uTime;
uniform float uAmount;

float hash(vec2 p, float seed) {
  return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed * 43758.5453) * 43758.5453);
}

float perlin(vec2 p, float seed) {
  vec2 i = floor(p);
  vec2 f = frac(p);
  f = f * f * (3.0 - 2.0 * f);
  
  float a = hash(i, seed);
  float b = hash(i + vec2(1.0, 0.0), seed);
  float c = hash(i + vec2(0.0, 1.0), seed);
  float d = hash(i + vec2(1.0, 1.0), seed);
  
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col = texture2D(tDiffuse, uv).rgb;
  
  float noise = perlin(uv * 10.0, uTime);
  noise = mix(noise, fract(sin(uTime + uv.x * 100.0) * 10000.0), 0.5);
  
  col += (noise - 0.5) * uAmount;
  gl_FragColor = vec4(col, 1.0);
}`;

const LUT_FRAG = `
precision highp float;

uniform sampler2D tDiffuse;
uniform sampler2D tLUT;
uniform float uStrength;

varying vec2 vUv;

void main() {
  vec3 col = texture2D(tDiffuse, vUv).rgb;
  vec3 scaled = col * (1.0 - 1.0 / 64.0);
  
  float slice = scaled.b * 63.0;
  float sliceFloor = floor(slice);
  float sliceFrac = frac(slice);
  
  float tileSize = 1.0 / 8.0;
  float u0 = scaled.r * tileSize + (mod(sliceFloor, 8.0) * tileSize);
  float v0 = scaled.g * tileSize + (floor(sliceFloor / 8.0) * tileSize);
  
  float sliceCeil = sliceFloor + 1.0;
  float u1 = scaled.r * tileSize + (mod(sliceCeil, 8.0) * tileSize);
  float v1 = scaled.g * tileSize + (floor(sliceCeil / 8.0) * tileSize);
  
  vec3 texel0 = texture2D(tLUT, vec2(u0, v0)).rgb;
  vec3 texel1 = texture2D(tLUT, vec2(u1, v1)).rgb;
  
  vec3 lutColor = mix(texel0, texel1, sliceFrac);
  
  gl_FragColor = vec4(mix(col, lutColor, uStrength), 1.0);
}`;

const BLOOM_MIP_LEVELS = 5;

function _makeBloomRT(w, h) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: false,
  });
}

function _makeBloomMat(frag, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: frag,
    uniforms,
  });
}

function _disposeBloom() {
  const { bloomRTs, bloomMats } = state.perf;
  if (bloomRTs) bloomRTs.forEach(rt => rt && rt.dispose());
  if (bloomMats) bloomMats.forEach(m => m && m.dispose());
  state.perf.bloomRTs = null;
  state.perf.bloomMats = null;
}

function _initBloomPipeline(rw, rh) {
  _disposeBloom();

  const rts = [];
  const mats = [];

  rts.push(_makeBloomRT(rw, rh));

  let w = rw, h = rh;
  for (let i = 0; i < BLOOM_MIP_LEVELS; i++) {
    w = Math.max(1, Math.floor(w / 2));
    h = Math.max(1, Math.floor(h / 2));
    rts.push(_makeBloomRT(w, h));
  }

  for (let i = BLOOM_MIP_LEVELS - 1; i > 0; i--) {
    rts.push(_makeBloomRT(rts[i].width, rts[i].height));
  }
  rts.push(_makeBloomRT(rw, rh));

  mats.push(_makeBloomMat(BLOOM_THRESH_FRAG, {
    tDiffuse: { value: null },
    uRes:     { value: new THREE.Vector2(rw, rh) },
    uThresh:  { value: 0.6 },
  }));

  for (let i = 0; i < BLOOM_MIP_LEVELS; i++) {
    const dw = rts[i + 1].width;
    const dh = rts[i + 1].height;
    mats.push(_makeBloomMat(BLOOM_DOWN_FRAG, {
      tSrc:    { value: null },
      uRes:    { value: new THREE.Vector2(dw, dh) },
      uOffset: { value: 1.0 },
    }));
  }

  const upStart = 1 + BLOOM_MIP_LEVELS;
  for (let i = 0; i < BLOOM_MIP_LEVELS - 1; i++) {
    const uw = rts[upStart + i].width;
    const uh = rts[upStart + i].height;
    mats.push(_makeBloomMat(BLOOM_UP_FRAG, {
      tSrc:    { value: null },
      uRes:    { value: new THREE.Vector2(uw, uh) },
      uOffset: { value: 1.0 },
    }));
  }

  mats.push(_makeBloomMat(BLOOM_UP_FRAG, {
    tSrc:    { value: null },
    uRes:    { value: new THREE.Vector2(rw, rh) },
    uOffset: { value: 1.0 },
  }));

  state.perf.bloomRTs  = rts;
  state.perf.bloomMats = mats;
}

function renderBloomPipeline() {
  const { bloomRTs, bloomMats, postRT } = state.perf;
  if (!bloomRTs || !bloomMats || !state.renderer3) return;

  const renderer = state.renderer3;
  const scene    = state.perf.postScene;
  const cam      = state.perf.postCam;
  const mesh     = scene.children[0];
  if (!mesh) return;

  const activeLevels = Math.max(1, Math.round(state.perf.bloomRadius * BLOOM_MIP_LEVELS));

  const threshMat = bloomMats[0];
  threshMat.uniforms.tDiffuse.value = postRT.texture;
  threshMat.uniforms.uThresh.value  = state.perf.bloomThresh;
  mesh.material = threshMat;
  renderer.setRenderTarget(bloomRTs[0]);
  renderer.render(scene, cam);

  for (let i = 0; i < activeLevels; i++) {
    const mat = bloomMats[1 + i];
    mat.uniforms.tSrc.value    = bloomRTs[i].texture;
    mat.uniforms.uOffset.value = 1.0 + i * 0.5;
    mesh.material = mat;
    renderer.setRenderTarget(bloomRTs[i + 1]);
    renderer.render(scene, cam);
  }

  const upStart = 1 + BLOOM_MIP_LEVELS;
  for (let i = 0; i < activeLevels; i++) {
    const matIdx = 1 + BLOOM_MIP_LEVELS + i;
    if (matIdx >= bloomMats.length) break;
    const mat    = bloomMats[matIdx];
    const srcRT  = i === 0 ? bloomRTs[activeLevels] : bloomRTs[upStart + i - 1];
    const dstIdx = upStart + i;
    if (dstIdx >= bloomRTs.length) break;
    mat.uniforms.tSrc.value    = srcRT.texture;
    mat.uniforms.uOffset.value = 1.0 + (activeLevels - 1 - i) * 0.5;
    mesh.material = mat;
    renderer.setRenderTarget(bloomRTs[dstIdx]);
    renderer.render(scene, cam);
  }
}

function renderTAA() {
  const perf = state.perf;
  if (!perf.taaEnabled || !perf.taaMat || !perf.postRT || !state.renderer3) return;
  const mesh = perf.postScene.children[0];
  if (!mesh) return;

  // First frame: initialize history by copying current postRT
  if (perf._taaFirstFrame || !perf.taaHistoryRT) {
    perf._taaFirstFrame = false;
    const prevMat = mesh.material;
    mesh.material = perf.postMat;
    perf.postMat.uniforms.tDiffuse.value = perf.postRT.texture;
    state.renderer3.setRenderTarget(perf.taaHistoryRT);
    state.renderer3.render(perf.postScene, perf.postCam);
    mesh.material = prevMat;
    perf.postMat.uniforms.tDiffuse.value = perf.taaHistoryRT.texture;
    state.renderer3.setRenderTarget(null);
    return;
  }

  perf.taaMat.uniforms.tCurrent.value = perf.postRT.texture;
  perf.taaMat.uniforms.tHistory.value = perf.taaHistoryRT.texture;
  perf.taaMat.uniforms.uRes.value.set(perf.postRT.width, perf.postRT.height);
  perf.taaMat.uniforms.uBlend.value = perf.taaBlend;
  perf.taaMat.uniforms.uThreshold.value = perf.taaThreshold;

  // Compute jitter delta (prev - curr) in pixel units for reprojection
  const currJitter = (state.mat3 && state.mat3.uniforms && state.mat3.uniforms.iJitter)
    ? state.mat3.uniforms.iJitter.value
    : new THREE.Vector2(0, 0);
  if (!perf._taaPrevJitter) perf._taaPrevJitter = new THREE.Vector2(0, 0);
  const jdX = perf._taaPrevJitter.x - currJitter.x;
  const jdY = perf._taaPrevJitter.y - currJitter.y;
  if (perf.taaMat.uniforms.uJitterDelta) perf.taaMat.uniforms.uJitterDelta.value.set(jdX, jdY);
  // Generate velocity buffer (screen-space normal-flow) and wire into TAA.
  // If a user-specified velocity texture exists (perf.taaVelocityTex), that wins.
  let velTex = null;
  if (perf.taaVelocityTex) {
    velTex = perf.taaVelocityTex;
  } else if (perf.taaVelocityEnabled && perf.taaVelocityMat && !perf._taaFirstFrame) {
    // Populate velocity RT by sampling current postRT and history
    perf.taaVelocityMat.uniforms.tCurrent.value = perf.postRT.texture;
    perf.taaVelocityMat.uniforms.tHistory.value = perf.taaHistoryRT.texture;
    if (perf.taaVelocityMat.uniforms.uRes) perf.taaVelocityMat.uniforms.uRes.value.set(perf.postRT.width, perf.postRT.height);
    if (perf.taaVelocityMat.uniforms.uJitterDelta) perf.taaVelocityMat.uniforms.uJitterDelta.value.set(jdX, jdY);
    if (perf.taaVelocityMat.uniforms.uScale) perf.taaVelocityMat.uniforms.uScale.value = perf.taaVelocityScale || 1.0;
    const prevMatV = mesh.material;
    mesh.material = perf.taaVelocityMat;
    state.renderer3.setRenderTarget(perf.taaVelocityRT);
    state.renderer3.render(perf.postScene, perf.postCam);
    mesh.material = prevMatV;
    velTex = perf.taaVelocityRT ? perf.taaVelocityRT.texture : null;
  }

  if (perf.taaMat.uniforms.tVelocity && perf.taaMat.uniforms.uHaveVelocity) {
    perf.taaMat.uniforms.tVelocity.value = velTex;
    perf.taaMat.uniforms.uHaveVelocity.value = velTex ? 1.0 : 0.0;
  }

  const prevMat = mesh.material;
  mesh.material = perf.taaMat;
  state.renderer3.setRenderTarget(perf.taaTempRT);
  state.renderer3.render(perf.postScene, perf.postCam);
  mesh.material = prevMat;

  // Ping-pong: swap temp and history
  const tmp = perf.taaHistoryRT;
  perf.taaHistoryRT = perf.taaTempRT;
  perf.taaTempRT = tmp;

  // Ensure final post samples the updated history
  perf.postMat.uniforms.tDiffuse.value = perf.taaHistoryRT.texture;
  // Update stored previous jitter for next-frame reprojection
  if (perf._taaPrevJitter && (state.mat3 && state.mat3.uniforms && state.mat3.uniforms.iJitter)) {
    const cj = state.mat3.uniforms.iJitter.value;
    perf._taaPrevJitter.set(cj.x, cj.y);
  }
  state.renderer3.setRenderTarget(null);
}

function initPostProcess() {
  const cw = document.getElementById('cwrap');
  const w = cw ? cw.clientWidth : 800;
  const h = cw ? cw.clientHeight : 600;
  const dpr = state.renderer3.getPixelRatio();
  const rw = Math.round(w * dpr), rh = Math.round(h * dpr);
  state.perf.postRT = new THREE.WebGLRenderTarget(rw, rh, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: false,
  });
  state.perf.postMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: POST_FRAG,
    uniforms: {
      tDiffuse:       { value: state.perf.postRT.texture },
      tBloom:         { value: null },
      tLut:           { value: null },
      uRes:           { value: new THREE.Vector2(rw, rh) },
      uBloom:         { value: 0.0 },
      uBloomStr:      { value: 0.5 },
      uTone:          { value: 0.0 },
      uVignette:      { value: 0.0 },
      uVigStr:        { value: 0.4 },
      uSRGB:          { value: 0.0 },
      uCRT:           { value: 0.0 },
      uCRTBarrel:     { value: 0.15 },
      uCRTScanlines:  { value: 0.25 },
      uCRTAberration: { value: 0.003 },
      uLutEnabled:    { value: 0.0 },
      uLutStrength:   { value: 1.0 },
      uLutSize:       { value: 0.0 },
    },
  });
  state.perf.postScene = new THREE.Scene();
  state.perf.postCam   = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  state.perf.postScene.add(new THREE.Mesh(_makeFullScreenTriangle(), state.perf.postMat));

  state.perf.fxaaRT  = new THREE.WebGLRenderTarget(rw, rh, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: false,
  });
  state.perf.fxaaMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: FXAA_FRAG,
    uniforms: {
      tDiffuse: { value: null },
      uRes:     { value: new THREE.Vector2(rw, rh) },
    },
  });

  // TAA accumulation buffers & material
  state.perf.taaHistoryRT = new THREE.WebGLRenderTarget(rw, rh, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: false,
  });
  state.perf.taaTempRT = new THREE.WebGLRenderTarget(rw, rh, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: false,
  });
  state.perf.taaMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: TAA_FRAG,
    uniforms: {
      tCurrent:   { value: null },
      tHistory:   { value: state.perf.taaHistoryRT.texture },
      tVelocity:  { value: null },
      uRes:        { value: new THREE.Vector2(rw, rh) },
      uJitterDelta:{ value: new THREE.Vector2(0, 0) },
      uHaveVelocity: { value: 0.0 },
      uBlend:      { value: state.perf.taaBlend },
      uThreshold:  { value: state.perf.taaThreshold },
    },
  });
  // Velocity pass: generate screen-space motion vectors (normal-flow approx.)
  state.perf.taaVelocityRT = new THREE.WebGLRenderTarget(rw, rh, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: false,
  });
  state.perf.taaVelocityMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: VELOCITY_FRAG,
    uniforms: {
      tCurrent:    { value: null },
      tHistory:    { value: state.perf.taaHistoryRT.texture },
      uRes:         { value: new THREE.Vector2(rw, rh) },
      uJitterDelta: { value: new THREE.Vector2(0, 0) },
      uScale:       { value: 1.0 },
    },
  });
  state.perf._taaFirstFrame = true;
  state.perf._taaPrevJitter = new THREE.Vector2(0, 0);

  state.perf.grainRT = new THREE.WebGLRenderTarget(rw, rh, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: false,
  });
  state.perf.grainMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: GRAIN_FRAG,
    uniforms: {
      tDiffuse: { value: null },
      uRes:     { value: new THREE.Vector2(rw, rh) },
      uTime:    { value: 0.0 },
      uAmount:  { value: 0.1 },
    },
  });

  _initBloomPipeline(rw, rh);
  initAdvancedPasses(rw, rh);
  initColorBlindness(rw, rh);
}

function resizePostRT(rw, rh) {
  if (!state.perf.postRT) return;
  state.perf.postRT.setSize(rw, rh);
  state.perf.postMat.uniforms.uRes.value.set(rw, rh);
  if (state.perf.fxaaRT) {
    state.perf.fxaaRT.setSize(rw, rh);
    state.perf.fxaaMat.uniforms.uRes.value.set(rw, rh);
  }
  _initBloomPipeline(rw, rh);
  // Resize TAA buffers
  if (state.perf.taaHistoryRT) {
    state.perf.taaHistoryRT.setSize(rw, rh);
  }
  if (state.perf.taaTempRT) {
    state.perf.taaTempRT.setSize(rw, rh);
  }
  if (state.perf.taaVelocityRT) {
    state.perf.taaVelocityRT.setSize(rw, rh);
  }
  if (state.perf.taaMat && state.perf.taaMat.uniforms && state.perf.taaMat.uniforms.uRes) {
    state.perf.taaMat.uniforms.uRes.value.set(rw, rh);
    if (state.perf.taaMat.uniforms.tHistory) state.perf.taaMat.uniforms.tHistory.value = state.perf.taaHistoryRT ? state.perf.taaHistoryRT.texture : null;
  }
  if (state.perf.taaVelocityMat && state.perf.taaVelocityMat.uniforms && state.perf.taaVelocityMat.uniforms.uRes) {
    state.perf.taaVelocityMat.uniforms.uRes.value.set(rw, rh);
    if (state.perf.taaVelocityMat.uniforms.tHistory) state.perf.taaVelocityMat.uniforms.tHistory.value = state.perf.taaHistoryRT ? state.perf.taaHistoryRT.texture : null;
  }
  if (state.perf.grainRT) {
    state.perf.grainRT.setSize(rw, rh);
    if (state.perf.grainMat && state.perf.grainMat.uniforms && state.perf.grainMat.uniforms.uRes) {
      state.perf.grainMat.uniforms.uRes.value.set(rw, rh);
    }
  }
  if (state.perf.lutRT) {
    state.perf.lutRT.setSize(rw, rh);
  }
  if (state.perf.frameDelay.buffers) {
    for (let i = 0; i < state.perf.frameDelay.buffers.length; i++) {
      state.perf.frameDelay.buffers[i].setSize(rw, rh);
    }
  }
  resizeAdvancedPasses(rw, rh);
  resizeColorBlindness(rw, rh);
  if (state.callbacks.resizePostIntegration) state.callbacks.resizePostIntegration(rw, rh);
}

function syncPostUniforms() {
  if (!state.perf.postMat) return;
  const u = state.perf.postMat.uniforms;
  if (state.perf.taaEnabled && state.perf.taaHistoryRT) {
    u.tDiffuse.value = state.perf.taaHistoryRT.texture;
  } else if (state.perf.postRT) {
    u.tDiffuse.value = state.perf.postRT.texture;
  }
  const bloomOn = state.perf.bloom;
  u.uBloom.value          = bloomOn ? 1.0 : 0.0;
  u.uBloomStr.value       = state.perf.bloomStr;
  u.uTone.value           = state.perf.tonemapping;
  u.uVignette.value       = state.perf.vignette ? 1.0 : 0.0;
  u.uVigStr.value         = state.perf.vignetteStr;
  u.uSRGB.value           = state.perf.srgb ? 1.0 : 0.0;
  u.uCRT.value            = state.perf.crt ? 1.0 : 0.0;
  u.uCRTBarrel.value      = state.perf.crtBarrel;
  u.uCRTScanlines.value   = state.perf.crtScanlines;
  u.uCRTAberration.value  = state.perf.crtAberration;
  u.uLutEnabled.value     = state.perf.lutEnabled && state.perf.lutTexture ? 1.0 : 0.0;
  u.uLutStrength.value    = state.perf.lutStrength;
  u.uLutSize.value        = state.perf.lutSize;
  u.tLut.value            = state.perf.lutTexture;

  if (bloomOn && state.perf.bloomRTs) {
    renderBloomPipeline();
    const bloomOut = state.perf.bloomRTs[state.perf.bloomRTs.length - 1];
    u.tBloom.value = bloomOut.texture;
    state.renderer3.setRenderTarget(null);
  }
}

function renderFXAA() {
  const { fxaaRT, fxaaMat, postScene, postCam } = state.perf;
  if (!fxaaRT || !fxaaMat || !state.renderer3) return;
  const mesh = postScene.children[0];
  if (!mesh) return;
  fxaaMat.uniforms.tDiffuse.value = fxaaRT.texture;
  mesh.material = fxaaMat;
  state.renderer3.setRenderTarget(null);
  state.renderer3.render(postScene, postCam);
  mesh.material = state.perf.postMat;
}

function renderGrain() {
  const { grainRT, grainMat, postRT, postScene, postCam } = state.perf;
  if (!grainRT || !grainMat || !postRT || !state.renderer3) return;
  const mesh = postScene.children[0];
  if (!mesh) return;
  
  grainMat.uniforms.tDiffuse.value = postRT.texture;
  grainMat.uniforms.uTime.value = state.uniforms && state.uniforms.iTime ? state.uniforms.iTime : 0.0;
  grainMat.uniforms.uAmount.value = state.perf.grainAmount;
  
  const prevMat = mesh.material;
  mesh.material = grainMat;
  state.renderer3.setRenderTarget(grainRT);
  state.renderer3.render(postScene, postCam);
  mesh.material = prevMat;
  state.renderer3.setRenderTarget(null);
}

function renderColorBlindness() {
  if (!state.perf.postRT || !state.renderer3) return;
  const mesh = state.perf.postScene?.children[0];
  if (!mesh) return;
  
  const inputTexture = state.perf.postRT.texture;
  const outputTexture = renderColorBlindnessPass(inputTexture);
  
  if (outputTexture !== inputTexture) {
    const prevMat = mesh.material;
    mesh.material = new THREE.MeshBasicMaterial({ map: outputTexture });
    state.renderer3.setRenderTarget(null);
    state.renderer3.render(state.perf.postScene, state.perf.postCam);
    mesh.material = prevMat;
  }
}

// ── 3.4 / 5.2: FPS Sparkline SVG (Phase 3 redesign) ───────────
// Remplace le rendu canvas par une SVG polyline — net sur retina,
// pas de blur, couleur CSS, zéro dépendance canvas.
function updateSparkline(ms) {
  const arr = state.perf.frameMs;
  arr[state.perf.frameMsIdx % 90] = ms;
  state.perf.frameMsIdx++;

  // ── Header sparkline (Phase 3 polyline) ────────────────────
  const polyline = document.getElementById('fpsPolyline');
  if (polyline) {
    const W = 90, H = 18, maxMs = 50;
    const pts = [];
    for (let i = 0; i < 90; i++) {
      const idx = (state.perf.frameMsIdx - 90 + i + 180) % 90;
      const v = arr[idx] || 0;
      const x = i + 0.5;
      const y = H - Math.min(1, v / maxMs) * H;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    polyline.setAttribute('points', pts.join(' '));
    const lastMs = arr[(state.perf.frameMsIdx - 1 + 90) % 90] || 0;
    polyline.setAttribute('stroke', lastMs > 16 ? '#ff5f8f' : '#4dffa0');
  }

  // ── Phase 6.3: Perf Panel SVG graphs ───────────────────────
  // Only update if inspector is open (avoid wasted DOM work)
  const layout = document.getElementById('layout');
  if (!layout || !layout.classList.contains('inspector-open')) return;

  const lastMs = arr[(state.perf.frameMsIdx - 1 + 90) % 90] || 0;
  const fps = lastMs > 0 ? (1000 / lastMs) : 0;

  // Budget arc (SVG circle, circumference = 2π×15 ≈ 94.25)
  const CIRC = 94.25;
  const budget = Math.min(1, lastMs / 16.667);
  const arc = document.getElementById('perfBudgetArc');
  if (arc) {
    const dash = (budget * CIRC).toFixed(2);
    arc.setAttribute('stroke-dasharray', `${dash} ${CIRC}`);
    arc.classList.toggle('warn',   lastMs > 16 && lastMs <= 33);
    arc.classList.toggle('danger', lastMs > 33);
  }
  const pctEl = document.getElementById('perfBudgetPct');
  if (pctEl) pctEl.textContent = Math.round(budget * 100) + '%';
  const msEl = document.getElementById('perfBudgetMs');
  if (msEl) msEl.textContent = lastMs.toFixed(1) + ' ms';
  const fpsEl = document.getElementById('perfBudgetFps');
  if (fpsEl) {
    fpsEl.textContent = fps > 0 ? Math.round(fps) + ' fps' : '— fps';
    fpsEl.style.color = fps >= 55 ? 'var(--spark-go)' : fps >= 28 ? 'var(--spark-warm)' : 'var(--spark-hot)';
  }

  // Perf panel sparkline (viewBox 0 0 196 32)
  const sparkLine = document.getElementById('perfSparkLine');
  const sparkFill = document.getElementById('perfSparkFill');
  if (sparkLine) {
    const W = 196, H = 32, maxMs = 50;
    const N = 90;
    const step = W / N;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const idx = (state.perf.frameMsIdx - N + i + N * 2) % N;
      const v = arr[idx] || 0;
      const x = (i * step + step * 0.5).toFixed(1);
      const y = (H - Math.min(1, v / maxMs) * H).toFixed(1);
      pts.push(`${x},${y}`);
    }
    sparkLine.setAttribute('points', pts.join(' '));
    if (sparkFill && pts.length) {
      const first = pts[0].split(',');
      const last  = pts[pts.length - 1].split(',');
      sparkFill.setAttribute('d',
        `M${first[0]},${H} ` + pts.map(p => `L${p}`).join(' ') + ` L${last[0]},${H} Z`);
    }
  }

  // CPU/GPU time bars (% of 16.67ms budget, capped at 100%)
  const cpuMs  = state.perf.cpuMs || 0;
  const cpuPct = Math.min(100, (cpuMs / 16.667) * 100).toFixed(1);
  const cpuBar = document.getElementById('perfCpuBar');
  const cpuVal = document.getElementById('perfCpuVal');
  if (cpuBar) cpuBar.style.width = cpuPct + '%';
  if (cpuVal) cpuVal.textContent = cpuMs.toFixed(1) + 'ms';

  // Phase 1.3: GPU time — prefer real timestamp-query result over the old estimate
  const gpuMs = state.perf.gpuTimestampEnabled && state.perf.gpuTimestampMs != null
    ? state.perf.gpuTimestampMs
    : Math.max(0, lastMs - 1.5);   // fallback: frame - cpu overhead (~1.5ms)
  const gpuPct = Math.min(100, (gpuMs / 16.667) * 100).toFixed(1);
  const gpuBar = document.getElementById('perfGpuBar');
  const gpuVal = document.getElementById('perfGpuVal');
  if (gpuBar) gpuBar.style.width = gpuPct + '%';
  if (gpuVal) {
    gpuVal.textContent = gpuMs.toFixed(1) + 'ms'
      + (state.perf.gpuTimestampEnabled ? '' : ' *');
    gpuVal.title = state.perf.gpuTimestampEnabled
      ? 'Actual GPU execution time (timestamp-query)'
      : 'Estimated GPU time (* = no timestamp-query)';
  }

  // Phase 1.3: JS overhead from raf-loop
  const jsMs  = getJsOverheadMs();
  const jsEl  = document.getElementById('perfJsVal');
  if (jsEl) jsEl.textContent = jsMs.toFixed(2) + 'ms';

  // Phase 1.3: Shader cache stats
  const stats     = getCacheStats();
  const cacheEl   = document.getElementById('perfCacheHit');
  if (cacheEl) cacheEl.textContent = stats.hitRate;

  const complexEl = document.getElementById('perfComplexityScore');
  if (complexEl && state.editor) {
    const result = scoreGLSL(state.editor.getValue());
    if (result) {
      complexEl.textContent = `${result.score} — ${result.label}`;
      complexEl.className = 'perf-timebar-val ' + result.cls;
      const tip = `textures:${result.detail.textures}  trig:${result.detail.trig}  math:${result.detail.math}  loops:${result.detail.loops}  branches:${result.detail.branches}  fns:${result.detail.funcDefs}`;
      complexEl.title = tip;
    } else {
      complexEl.textContent = '—';
      complexEl.className = 'perf-timebar-val';
      complexEl.title = '';
    }
  }

  // Phase 1.3: GL caps — lazy one-shot detection; only runs once
  if (!state.perf.glCaps && state.renderer3) {
    const caps = detectGLCaps(state.renderer3.getContext());
    if (caps) renderGLCapsPanel(caps);
  }
}

// ── 5.1: FPS cap ───────────────────────────────────────
function setFpsCap(v, e) {
  state.perf.fpsCap = v;
  document.querySelectorAll('#fpsOpt0,#fpsOpt30,#fpsOpt60').forEach(b => b.classList.remove('active'));
  const btn = e?.target?.closest?.('[data-action]') || e;
  if (btn?.classList) btn.classList.add('active');
}

// ── 5.2: GPU time visibility ───────────────────────────
function setGpuTimeVisible(v) {
  const el = document.getElementById('gputpill');
  if (el) el.style.display = v ? '' : 'none';
}

function setPerfAlertEnabled(v) {
  state.perf.alertEnabled = v;
  if (!v) {
    const b = document.getElementById('perfAlertBadge');
    if (b) b.classList.remove('visible');
  }
}

// ── 5.3: Post-process toggles ──────────────────────────
function setPostEnabled(v) {
  state.perf.postEnabled = v;
  const rows = ['bloomRow','bloomStrRow','bloomThreshRow','bloomRadiusRow','toneRow','vigRow','srgbRow','fxaaRow','taaRow','crtRow','crtBarrelRow','crtScanlinesRow','crtAberrationRow','lutRow','lutStrRow'];
  if (document.getElementById('taaVelRow')) rows.push('taaVelRow');
  if (document.getElementById('taaVelScaleRow')) rows.push('taaVelScaleRow');
  rows.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.opacity = v ? '1' : '0.45';
  });
  ['bloomCk','bloomStrR','bloomThreshR','bloomRadiusR','toneMapSel','vignetteCk','srgbCk','taaCk','taaBlendR','taaThreshR','crtCk','crtBarrelR','crtScanlinesR','crtAberrationR','fxaaCk','taaVelSelect','taaVelScaleR','lutCk','lutStrR','lutFileInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !v;
  });
}

function setBloom(v)              { state.perf.bloom = v; }
function setBloomStrength(v)      { state.perf.bloomStr = v; }
function setBloomThreshold(v)     { state.perf.bloomThresh = v; }
function setBloomRadius(v)        { state.perf.bloomRadius = Math.min(1, Math.max(0, Number(v) || 0)); }
function setToneMapping(v)        { state.perf.tonemapping = v; }
function setVignette(v)           { state.perf.vignette = v; }
function setSRGB(v)               { state.perf.srgb = v; }
function setCRT(v)                { state.perf.crt = v; }
function setCRTBarrel(v)          { state.perf.crtBarrel = Number(v) || 0; }
function setCRTScanlines(v)       { state.perf.crtScanlines = Number(v) || 0; }
function setCRTAberration(v)      { state.perf.crtAberration = Number(v) || 0; }
function setFXAA(v)               { state.perf.fxaa = v; }

function parseCubeFile(text) {
  const lines = text.split('\n');
  let size = 0;
  const data = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('TITLE')) continue;
    if (line.startsWith('DOMAIN_MIN')) continue;
    if (line.startsWith('DOMAIN_MAX')) continue;
    if (line.startsWith('LUT_1D_SIZE')) continue;
    if (line.startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1], 10);
      continue;
    }
    const parts = line.split(/\s+/).map(Number);
    if (parts.length >= 3 && !isNaN(parts[0])) {
      data.push(parts[0], parts[1], parts[2]);
    }
  }
  return { size, data };
}

function createLutTexture(size, data) {
  const rows = Math.ceil(Math.sqrt(size));
  const cols = rows;
  const texW = cols * size;
  const texH = rows * size;
  const pixels = new Uint8Array(texW * texH * 4);
  for (let b = 0; b < size; b++) {
    const sliceX = (b % cols) * size;
    const sliceY = Math.floor(b / cols) * size;
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const srcIdx = (b * size * size + g * size + r) * 3;
        const px = sliceX + r;
        const py = sliceY + g;
        const dstIdx = (py * texW + px) * 4;
        pixels[dstIdx + 0] = Math.round(Math.min(1, Math.max(0, data[srcIdx + 0] || 0)) * 255);
        pixels[dstIdx + 1] = Math.round(Math.min(1, Math.max(0, data[srcIdx + 1] || 0)) * 255);
        pixels[dstIdx + 2] = Math.round(Math.min(1, Math.max(0, data[srcIdx + 2] || 0)) * 255);
        pixels[dstIdx + 3] = 255;
      }
    }
  }
  const tex = new THREE.DataTexture(pixels, texW, texH, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function setLutEnabled(v) {
  state.perf.lutEnabled = !!v;
  const el = document.getElementById('lutCk');
  if (el) el.checked = !!v;
}

function setLutStrength(v) {
  state.perf.lutStrength = Math.min(1, Math.max(0, Number(v) || 0));
}

function loadLutFile(input) {
  if (!input || !input.files || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const { size, data } = parseCubeFile(text);
    if (size < 2 || data.length < size * size * size * 3) {
      console.warn('[LUT] Invalid .cube file or unsupported format');
      return;
    }
    if (state.perf.lutTexture) {
      state.perf.lutTexture.dispose();
    }
    state.perf.lutTexture = createLutTexture(size, data);
    state.perf.lutSize = size;
    state.perf.lutEnabled = true;
    const ck = document.getElementById('lutCk');
    if (ck) ck.checked = true;
    const nameEl = document.getElementById('lutFileName');
    if (nameEl) nameEl.textContent = file.name;
  };
  reader.readAsText(file);
}

function clearLut() {
  if (state.perf.lutTexture) {
    state.perf.lutTexture.dispose();
    state.perf.lutTexture = null;
  }
  state.perf.lutSize = 0;
  state.perf.lutEnabled = false;
  const ck = document.getElementById('lutCk');
  if (ck) ck.checked = false;
  const nameEl = document.getElementById('lutFileName');
  if (nameEl) nameEl.textContent = 'No LUT loaded';
}

function setTAA(v) {
  state.perf.taaEnabled = !!v;
  state.perf._taaFirstFrame = true;
  const el = document.getElementById('taaCk'); if (el) el.checked = !!v;
  // Enable/disable TAA-related controls when TAA toggled
  ['taaBlendR','taaThreshR','taaVelSelect','taaVelScaleR'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.disabled = !state.perf.taaEnabled;
  });
}

function setTAABlend(v) {
  state.perf.taaBlend = Number(v) || 0.0;
  if (state.perf.taaMat && state.perf.taaMat.uniforms && state.perf.taaMat.uniforms.uBlend) {
    state.perf.taaMat.uniforms.uBlend.value = state.perf.taaBlend;
  }
}

function setTAAThreshold(v) {
  state.perf.taaThreshold = Number(v) || 0.0;
  if (state.perf.taaMat && state.perf.taaMat.uniforms && state.perf.taaMat.uniforms.uThreshold) {
    state.perf.taaMat.uniforms.uThreshold.value = state.perf.taaThreshold;
  }
}

function setTAAVelocityTex(tex) {
  state.perf.taaVelocityTex = tex || null;
  if (state.perf.taaMat && state.perf.taaMat.uniforms && state.perf.taaMat.uniforms.tVelocity) {
    state.perf.taaMat.uniforms.tVelocity.value = tex || null;
    if (state.perf.taaMat.uniforms.uHaveVelocity) state.perf.taaMat.uniforms.uHaveVelocity.value = tex ? 1.0 : 0.0;
  }
}

function setTAAVelocityEnabled(v) {
  state.perf.taaVelocityEnabled = !!v;
}

function setTAAVelocityScale(v) {
  const s = Number(v) || 1.0;
  state.perf.taaVelocityScale = s;
  if (state.perf.taaVelocityMat && state.perf.taaVelocityMat.uniforms && state.perf.taaVelocityMat.uniforms.uScale) {
    state.perf.taaVelocityMat.uniforms.uScale.value = s;
  }
}

function setTAAEnabled(v) {
  state.perf.taaEnabled = !!v;
  if (v && !state.perf.taaHistoryRT) {
    _initTAAAccumulation(state.perf._rtWidth || 1024, state.perf._rtHeight || 768);
  }
}

function _initTAAAccumulation(rw, rh) {
  if (!state.renderer3) return;
  
  if (!state.perf.taaHistoryRT) {
    state.perf.taaHistoryRT = new THREE.WebGLRenderTarget(rw, rh, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      type: THREE.HalfFloatType,
    });
  }
  
  if (!state.perf.taaTempRT) {
    state.perf.taaTempRT = new THREE.WebGLRenderTarget(rw, rh, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      type: THREE.HalfFloatType,
    });
  }
  
  if (!state.perf.taaMat) {
    state.perf.taaMat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: TAA_FRAG,
      uniforms: {
        tCurrent: { value: null },
        tHistory: { value: state.perf.taaHistoryRT.texture },
        uBlend: { value: state.perf.taaBlend },
        uThreshold: { value: state.perf.taaThreshold },
        uRes: { value: new THREE.Vector2(rw, rh) },
      },
    });
  }
  
  state.perf._taaFirstFrame = true;
}

function _initLUTPass(rw, rh) {
  if (!state.renderer3) return;
  
  if (!state.perf.lutMat) {
    state.perf.lutMat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: LUT_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        tLUT: { value: null },
        uStrength: { value: state.perf.lutStrength },
      },
    });
  }
  
  if (!state.perf.lutRT) {
    state.perf.lutRT = new THREE.WebGLRenderTarget(rw, rh, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false,
    });
  }
}

function renderLUT(inputTexture) {
  if (!state.perf.lutEnabled || !state.perf.lutTexture || !state.perf.lutMat || !state.renderer3) {
    return inputTexture;
  }
  
  state.perf.lutMat.uniforms.tDiffuse.value = inputTexture;
  state.perf.lutMat.uniforms.tLUT.value = state.perf.lutTexture;
  state.perf.lutMat.uniforms.uStrength.value = state.perf.lutStrength;
  
  const mesh = state.perf.postScene.children[0];
  if (!mesh) return inputTexture;
  
  const prevMat = mesh.material;
  mesh.material = state.perf.lutMat;
  
  state.renderer3.setRenderTarget(state.perf.lutRT);
  state.renderer3.render(state.perf.postScene, state.perf.postCam);
  
  mesh.material = prevMat;
  state.renderer3.setRenderTarget(null);
  
  return state.perf.lutRT.texture;
}

function setFrameDelayEnabled(v) {
  state.perf.frameDelay = v ? 1 : 0;
}

function setFrameDelayCount(count) {
  const v = Math.max(1, Math.min(8, Math.floor(count)));
  if (v !== state.perf.frameDelay.numFrames) {
    state.perf.frameDelay.numFrames = v;
    state.perf.frameDelay.buffers = null;
    if (state.perf.frameDelay.enabled) {
      _initFrameDelayBuffer(state.perf._rtWidth || 1024, state.perf._rtHeight || 768);
    }
  }
}

// ── Perf panel toggle ──────────────────────────────────
let _perfMoved = false;
function _movePerfToInspector() {
  if (_perfMoved) return;
  _perfMoved = true;
  const pop = document.getElementById('perfPop');
  const body = document.getElementById('insp-perf'); // Phase Q — perf is now one of several insp-pane modes
  if (!pop || !body) return;
  // Move all children of perfPop (except the fx overlay and title, already in inspector-header)
  // We move perf-section divs
  const sections = Array.from(pop.querySelectorAll('.perf-section'));
  sections.forEach(s => body.appendChild(s));
  pop.style.display = 'none';
}

function togglePerfPanel(e) {
  if (e) e.stopPropagation();
  _movePerfToInspector();
  const layout = document.getElementById('layout');
  if (!layout) return;
  const opening = !layout.classList.contains('inspector-open');
  layout.classList.toggle('inspector-open');
  // Phase Q — clicking the perf button always shows the perf pane (decoupled via
  // CustomEvent, no direct import, to avoid coupling perf.js ↔ inspector-context.js)
  if (opening) {
    try { window.dispatchEvent(new CustomEvent('zgl:inspectormode', { detail: { mode: 'perf' } })); } catch (e2) { /* SSR/no-DOM */ }
  }
}

function setGrainEnabled(v) {
  state.perf.grainEnabled = !!v;
  const el = document.getElementById('grainCk');
  if (el) el.checked = !!v;
}

function setGrainAmount(v) {
  state.perf.grainAmount = Number(v) || 0.1;
  if (state.perf.grainMat && state.perf.grainMat.uniforms && state.perf.grainMat.uniforms.uAmount) {
    state.perf.grainMat.uniforms.uAmount.value = state.perf.grainAmount;
  }
}

function pushFrameDelay(inputTexture) {
  // Frame delay feature for feedback effects - returns input unchanged if disabled
  if (!state.perf.frameDelay || !state.perf.frameDelay.enabled) return inputTexture;
  return inputTexture;
}

export { POST_VERT, POST_FRAG, initPostProcess, resizePostRT, syncPostUniforms, updateSparkline, setFpsCap, setGpuTimeVisible, setPerfAlertEnabled, setPostEnabled, setBloom, setBloomStrength, setBloomThreshold, setBloomRadius, setToneMapping, setVignette, setSRGB, setCRT, setCRTBarrel, setCRTScanlines, setCRTAberration, setFXAA, setTAA, setTAABlend, setTAAThreshold, setTAAVelocityTex, setTAAVelocityEnabled, setTAAVelocityScale, setTAAEnabled, setLutEnabled, setLutStrength, loadLutFile, clearLut, renderFXAA, renderTAA, renderGrain, renderColorBlindness, renderLUT, togglePerfPanel, setGrainEnabled, setGrainAmount, pushFrameDelay, setFrameDelayEnabled, setFrameDelayCount };
export { renderAdvancedPass, setAdvancedPassEnabled, setAdvancedPassParam, getAdvancedPassConfig, getAllAdvancedPasses, updateDatamoshPrevFrame, ADVANCED_PASS_DEFAULTS };
export { setColorBlindnessMode, getColorBlindnessMode, toggleColorBlindness, setColorBlindnessOverlay, isColorBlindnessEnabled, COLORBLINDNESS_MODES };
// Phase 1.3: re-export resolution setter so events.js can wire it
export { setRenderResolution } from './resolution.js';
// Register late-bound callbacks
state.callbacks.resizePostRT = resizePostRT;
state.callbacks.initPostProcess = initPostProcess;
state.callbacks.updateSparkline = updateSparkline;
state.callbacks.renderFXAA = renderFXAA;
state.callbacks.renderGrain = renderGrain;
state.callbacks.renderColorBlindness = renderColorBlindness;
state.callbacks.renderTAA = renderTAA;
state.callbacks.syncPostUniforms = syncPostUniforms;
