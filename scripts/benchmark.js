#!/usr/bin/env node
/**
 * scripts/benchmark.js — Phase 12.4
 *
 * Transpiler throughput benchmark.
 * Measures: shaders/sec for the GLSL→WGSL transpiler.
 *
 * Run:  npm run benchmark
 * CI:   Reports result to stdout; fails if throughput drops below threshold.
 *
 * Add to package.json:
 *   "benchmark": "node scripts/benchmark.js"
 */

import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark shaders — a representative set of GLSL programs
// ─────────────────────────────────────────────────────────────────────────────

const BENCHMARK_SHADERS = [
  // § Trivial
  `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    fragColor = vec4(1.0, 0.0, 0.5, 1.0);
  }`,

  // § Simple UV
  `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    fragColor = vec4(uv, 0.5 * sin(iTime), 1.0);
  }`,

  // § #define constants
  `#define SPEED 2.5
  #define SCALE 3.0
  void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime * SPEED;
    fragColor = vec4(fract(uv * SCALE + t), 0.0, 1.0);
  }`,

  // § Texture sampling
  `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 col = texture(iChannel0, uv);
    col.rgb = mix(col.rgb, vec3(1.0) - col.rgb, 0.5 * sin(iTime));
    fragColor = col;
  }`,

  // § Multi-function + ternary
  `float sdf(vec2 p, float r) { return length(p) - r; }
  vec3 palette(float t) {
    vec3 a = vec3(0.5);
    vec3 b = vec3(0.5);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec3(0.0, 0.333, 0.667);
    return a + b * cos(6.28318 * (c * t + d));
  }
  void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float d = sdf(uv, 0.3 + 0.1 * sin(iTime));
    float mask = d > 0.0 ? 1.0 : 0.0;
    vec3 col = palette(mask * 0.5 + iTime * 0.1);
    fragColor = vec4(col, 1.0);
  }`,

  // § #ifdef preprocessor
  `#define FAST_MODE
  #ifdef FAST_MODE
  #define AA 1
  #else
  #define AA 4
  #endif
  void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float v = mod(uv.x * float(AA) + iTime, 1.0);
    fragColor = vec4(v, 1.0 - v, 0.5, 1.0);
  }`,

  // § Struct + array
  `struct Ray { vec3 origin; vec3 dir; };
  Ray makeRay(vec2 uv) {
    Ray r;
    r.origin = vec3(0.0, 0.0, 3.0);
    r.dir = normalize(vec3(uv, -1.0));
    return r;
  }
  void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    Ray r = makeRay(uv);
    fragColor = vec4(abs(r.dir), 1.0);
  }`,

  // § Full ShaderToy clone
  `#define TAU 6.28318530718
  #define PI 3.14159265359
  float circle(vec2 p, float r) { return smoothstep(0.01, -0.01, length(p) - r); }
  float box(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }
  void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime;
    float angle = t * 0.5;
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    uv = rot * uv;
    float c = circle(uv, 0.3);
    float b = 1.0 - step(0.0, box(uv, vec2(0.2, 0.15)));
    vec3 col = vec3(c) * vec3(0.2, 0.8, 1.0) + vec3(b) * vec3(1.0, 0.5, 0.1);
    float vignette = 1.0 - dot(uv * 1.5, uv * 1.5);
    col *= clamp(vignette, 0.0, 1.0);
    fragColor = vec4(col, 1.0);
  }`,
];

// ─────────────────────────────────────────────────────────────────────────────
// Load transpiler
// ─────────────────────────────────────────────────────────────────────────────

let glslToWGSL;

try {
  // Dynamic import of the ES module transpiler
  const mod = await import('../src/shader/glsl-to-wgsl.js');
  glslToWGSL = mod.glslToWGSL;
} catch (e) {
  console.error('[benchmark] Could not import transpiler:', e.message);
  console.error('Make sure to run from the project root: node scripts/benchmark.js');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark runner
// ─────────────────────────────────────────────────────────────────────────────

const WARMUP_ROUNDS = 3;
const BENCHMARK_ROUNDS = 50;
const MIN_ACCEPTABLE_SHADERS_PER_SEC = 500; // CI fail threshold

console.log('\n┌─────────────────────────────────────────────────────┐');
console.log('│  Sliders GL GLSL→WGSL Transpiler Benchmark               │');
console.log('└─────────────────────────────────────────────────────┘\n');

// Warmup
process.stdout.write('Warming up...');
for (let w = 0; w < WARMUP_ROUNDS; w++) {
  for (const shader of BENCHMARK_SHADERS) {
    glslToWGSL(shader);
  }
}
console.log(' done.\n');

// Individual shader benchmarks
const results = [];
for (let i = 0; i < BENCHMARK_SHADERS.length; i++) {
  const shader = BENCHMARK_SHADERS[i];
  const name = `Shader ${i + 1} (${shader.split('\n').length} lines)`;

  const t0 = performance.now();
  for (let r = 0; r < BENCHMARK_ROUNDS; r++) {
    glslToWGSL(shader);
  }
  const elapsed = performance.now() - t0;
  const shadersPerSec = Math.round((BENCHMARK_ROUNDS / elapsed) * 1000);

  results.push({ name, shadersPerSec, elapsedMs: elapsed });
  console.log(`  ${name.padEnd(38)} ${String(shadersPerSec).padStart(7)} shaders/sec`);
}

// Overall aggregate
const totalShaders = BENCHMARK_ROUNDS * BENCHMARK_SHADERS.length;
const t0All = performance.now();
for (let r = 0; r < BENCHMARK_ROUNDS; r++) {
  for (const shader of BENCHMARK_SHADERS) {
    glslToWGSL(shader);
  }
}
const elapsedAll = performance.now() - t0All;
const aggregate = Math.round((totalShaders / elapsedAll) * 1000);

console.log('\n' + '─'.repeat(55));
console.log(`  AGGREGATE (all shaders)              ${String(aggregate).padStart(7)} shaders/sec`);
console.log(`  Total: ${totalShaders} transpilations in ${elapsedAll.toFixed(1)}ms`);
console.log('─'.repeat(55));

// Min/max
const sorted = [...results].sort((a, b) => a.shadersPerSec - b.shadersPerSec);
console.log(`  Slowest: ${sorted[0].name} — ${sorted[0].shadersPerSec} shaders/sec`);
console.log(`  Fastest: ${sorted[sorted.length - 1].name} — ${sorted[sorted.length - 1].shadersPerSec} shaders/sec`);
console.log();

// CI threshold check
if (aggregate < MIN_ACCEPTABLE_SHADERS_PER_SEC) {
  console.error(
    `❌  BENCHMARK FAILED: ${aggregate} shaders/sec < threshold ${MIN_ACCEPTABLE_SHADERS_PER_SEC} shaders/sec`
  );
  console.error('   Performance regression detected. Investigate before merging.');
  process.exit(1);
} else {
  console.log(`✅  Benchmark passed: ${aggregate} shaders/sec ≥ ${MIN_ACCEPTABLE_SHADERS_PER_SEC} shaders/sec threshold`);
}
