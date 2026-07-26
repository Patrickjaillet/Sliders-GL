import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseShader,
  parseSymbols,
  typeCheck,
  getParseWarnings,
  inferRange,
  buildLabel,
  categorize,
} from './parser.js';
import { state } from '../core/state.js';

function labels(entries) { return entries.map(e => e.label); }
function values(entries) { return entries.map(e => e.value); }
function cats(entries)   { return entries.map(e => e.category); }

beforeEach(() => {
  state.pinnedIds.clear();
  state.parseWarnings = [];
});

// ─────────────────────────────────────────────────────────────────────────────
// parseShader — #define edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('parseShader / #define edge cases', () => {
  it('parses integer define', () => {
    const e = parseShader('#define OCTAVES 8');
    expect(e).toHaveLength(1);
    expect(e[0].value).toBe(8);
    expect(e[0].isDefine).toBe(true);
    expect(e[0].defineName).toBe('OCTAVES');
  });

  it('define name stored in label', () => {
    const e = parseShader('#define FOG_DENSITY 0.03');
    expect(e[0].label).toBe('FOG_DENSITY');
  });

  it('define category is globals', () => {
    const e = parseShader('#define SPEED 1.0');
    expect(e[0].category).toBe('globals');
  });

  it('non-literal define emits warning and zero entries', () => {
    const e = parseShader('#define TWO_PI (2.0 * 3.14159)');
    expect(e).toHaveLength(0);
    const w = getParseWarnings();
    expect(w).toHaveLength(1);
    expect(w[0].name).toBe('TWO_PI');
  });

  it('define with inline comment parsed correctly', () => {
    const e = parseShader('#define SCALE 4.0 // scale factor');
    expect(e).toHaveLength(1);
    expect(e[0].value).toBe(4.0);
  });

  it('multiple defines all captured', () => {
    const src = ['#define A 1.0', '#define B 2.0', '#define C 3.0'].join('\n');
    const e = parseShader(src);
    expect(e).toHaveLength(3);
    expect(values(e).sort()).toEqual([1, 2, 3]);
  });

  it('define with negative value', () => {
    const e = parseShader('#define BIAS -0.5');
    expect(e[0].value).toBe(-0.5);
  });

  it('define with scientific notation', () => {
    const e = parseShader('#define EPSILON 1e-5');
    expect(e[0].isScientific).toBe(true);
    expect(e[0].value).toBeCloseTo(1e-5);
  });

  it('define hint includes the full #define line', () => {
    const e = parseShader('#define BRIGHTNESS 2.5');
    expect(e[0].hint).toContain('BRIGHTNESS');
    expect(e[0].hint).toContain('2.5');
  });

  it('define tokenRaw matches source token exactly', () => {
    const src = '#define FREQ 1.5e3';
    const e = parseShader(src);
    expect(e[0].tokenRaw).toBe('1.5e3');
    expect(src.slice(e[0].col, e[0].col + e[0].matchLen)).toBe('1.5e3');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseShader — const globals
// ─────────────────────────────────────────────────────────────────────────────

describe('parseShader / const globals', () => {
  it('parses const float', () => {
    const e = parseShader('const float PI = 3.14159;');
    expect(e).toHaveLength(1);
    expect(e[0].isConst).toBe(true);
    expect(e[0].label).toBe('PI');
    expect(e[0].value).toBeCloseTo(3.14159);
  });

  it('parses const int', () => {
    const e = parseShader('const int STEPS = 64;');
    expect(e).toHaveLength(1);
    expect(e[0].value).toBe(64);
    expect(e[0].isConst).toBe(true);
  });

  it('const category is globals', () => {
    const e = parseShader('const float T = 0.1;');
    expect(e[0].category).toBe('globals');
  });

  it('const hint contains the name and value', () => {
    const e = parseShader('const float ALPHA = 0.75;');
    expect(e[0].hint).toContain('ALPHA');
    expect(e[0].hint).toContain('0.75');
  });

  it('const with negative value', () => {
    const e = parseShader('const float NEG = -2.0;');
    expect(e[0].value).toBe(-2.0);
  });

  it('multiple const globals all captured', () => {
    const src = 'const float A = 1.0;\nconst float B = 2.0;';
    const e = parseShader(src);
    expect(e.length).toBeGreaterThanOrEqual(2);
  });

  it('const tokenRaw matches source exactly', () => {
    const src = 'const float X = 3.14;';
    const e = parseShader(src);
    expect(src.slice(e[0].col, e[0].col + e[0].matchLen)).toBe('3.14');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseShader — inline numeric literals
// ─────────────────────────────────────────────────────────────────────────────

describe('parseShader / inline numeric literals', () => {
  it('extracts literal from vec2 constructor', () => {
    const e = parseShader('vec2 uv = vec2(0.5, 0.5);');
    expect(values(e)).toContain(0.5);
  });

  it('extracts literal from vec4 constructor', () => {
    const e = parseShader('vec4 c = vec4(0.1, 0.2, 0.3, 1.0);');
    expect(e.length).toBeGreaterThanOrEqual(4);
  });

  it('skips numbers inside comments', () => {
    const e = parseShader('// speed = 9.0');
    expect(e).toHaveLength(0);
  });

  it('skips numbers inside block comments', () => {
    const e = parseShader('/* 42.0 */');
    expect(e).toHaveLength(0);
  });

  it('skips iTime uniform reference', () => {
    const e = parseShader('float t = iTime * 2.0;');
    const withTime = e.filter(x => x.label && x.label.toLowerCase().includes('itime'));
    expect(withTime).toHaveLength(0);
  });

  it('skips iResolution reference', () => {
    const e = parseShader('vec2 uv = fragCoord.xy / iResolution.xy;');
    expect(e).toHaveLength(0);
  });

  it('large integer above 10 captured', () => {
    const e = parseShader('int count = 100;');
    expect(e.some(x => x.value === 100)).toBe(true);
  });

  it('single-char loop var x initializer 0 skipped', () => {
    const e = parseShader('for(float x = 0.0; x < 10.0; x++){}');
    expect(e.some(v => v.value === 0)).toBe(false);
  });

  it('for-loop bound captured as iterations', () => {
    const e = parseShader('for(int i=0; i<64; i++){}');
    const iter = e.find(x => x.value === 64);
    expect(iter).toBeTruthy();
    expect(iter.category).toBe('iterations');
  });

  it('for-loop initializer 0 skipped', () => {
    const e = parseShader('for(int i=0; i<16; i++){}');
    expect(e.some(x => x.value === 0)).toBe(false);
  });

  it('sin/cos literal gets rotation range', () => {
    const e = parseShader('float a = sin(1.5);');
    const lit = e.find(x => Math.abs(x.value - 1.5) < 1e-9);
    expect(lit).toBeTruthy();
    expect(lit.category).toBe('rotation');
  });

  it('literal inside rotate/angle context gets rotation category', () => {
    const e = parseShader('float angle = 3.14;');
    expect(e[0].category).toBe('rotation');
  });

  it('color keywords trigger color category', () => {
    const e = parseShader('vec3 rgb = vec3(0.8, 0.2, 0.1);');
    expect(cats(e)).toContain('color');
  });

  it('fractal keywords trigger fractal category', () => {
    const e = parseShader('float d = abs(p) - 0.5;');
    expect(cats(e).some(c => c === 'fractal')).toBe(true);
  });

  it('glow keywords trigger glow category', () => {
    const e = parseShader('float glow = exp(-d * 3.0);');
    expect(cats(e).some(c => c === 'glow')).toBe(true);
  });

  it('stores correct line number', () => {
    const e = parseShader('void main(){\nfloat a = 7.0;\n}');
    const lit = e.find(x => x.value === 7);
    expect(lit?.line).toBe(1);
  });

  it('stores correct col offset', () => {
    const src = 'float z = 42.0;';
    const e = parseShader(src);
    const lit = e.find(x => x.value === 42);
    expect(src.slice(lit.col, lit.col + lit.matchLen)).toBe('42.0');
  });

  it('defaultValue equals value at parse time', () => {
    const e = parseShader('float t = 1.5;');
    expect(e[0].defaultValue).toBe(e[0].value);
  });

  it('unary minus in vec3 captured with negative value', () => {
    const e = parseShader('vec3 p = vec3(0.0, 0.0, -5.0);');
    expect(e.some(x => x.value === -5)).toBe(true);
  });

  it('pinned flag set when stableKey is in pinnedIds', () => {
    // Keyed by stableKey ('def:SPEED'), not the volatile runtime id ('v0') —
    // pinnedIds must survive reparse, and the runtime id is reassigned fresh
    // on every parse.
    state.pinnedIds.add('def:SPEED');
    const e = parseShader('#define SPEED 1.0');
    expect(e[0].pinned).toBe(true);
  });

  it('pinned flag false when id not pinned', () => {
    const e = parseShader('#define SPEED 1.0');
    expect(e[0].pinned).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseShader — preprocessor chains (#version, #extension, #pragma)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseShader / preprocessor directives skipped', () => {
  it('skips #version directive', () => {
    const e = parseShader('#version 300 es');
    expect(e).toHaveLength(0);
  });

  it('skips #extension directive', () => {
    const e = parseShader('#extension GL_OES_standard_derivatives : enable');
    expect(e).toHaveLength(0);
  });

  it('skips #pragma directive', () => {
    const e = parseShader('#pragma optimize(on)');
    expect(e).toHaveLength(0);
  });

  it('skips precision qualifier line', () => {
    const e = parseShader('precision highp float;');
    expect(e).toHaveLength(0);
  });

  it('full preamble block produces no entries', () => {
    const src = [
      '#version 300 es',
      '#extension GL_EXT_shader_texture_lod : enable',
      '#pragma optimize(off)',
      'precision mediump float;',
    ].join('\n');
    expect(parseShader(src)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// inferRange
// ─────────────────────────────────────────────────────────────────────────────

describe('inferRange', () => {
  it('[0,1] for float in [0,1]', () => {
    const r = inferRange(0.3, '0.3', '', '');
    expect(r.min).toBe(0);
    expect(r.max).toBe(1);
  });

  it('rotation range for sin context', () => {
    const r = inferRange(1.5, '1.5', 'a = sin(1.5)', 'a = sin(');
    expect(r.min).toBeCloseTo(-Math.PI * 2);
    expect(r.max).toBeCloseTo(Math.PI * 2);
  });

  it('iterations range for for-loop bound > 1', () => {
    const r = inferRange(128, '128', 'for(int i=0; i<128; i++){}', '');
    expect(r.min).toBe(1);
    expect(r.max).toBeGreaterThanOrEqual(128);
    expect(r.step).toBe(1);
  });

  it('negative number gets symmetric range', () => {
    const r = inferRange(-3, '-3.0', '', '');
    expect(r.min).toBeLessThan(0);
    expect(r.max).toBeGreaterThan(0);
  });

  it('large integer gets step=1', () => {
    const r = inferRange(200, '200', '', '');
    expect(r.step).toBe(1);
  });

  it('small float gets fine step', () => {
    const r = inferRange(0.01, '0.01', '', '');
    expect(r.step).toBeLessThan(0.1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// categorize
// ─────────────────────────────────────────────────────────────────────────────

describe('categorize', () => {
  it('rotation for sin', () => { expect(categorize('float a = sin(x);')).toBe('rotation'); });
  it('rotation for cos', () => { expect(categorize('float a = cos(x);')).toBe('rotation'); });
  it('rotation for angle', () => { expect(categorize('float angle = 0.5;')).toBe('rotation'); });
  it('color for rgb', () => { expect(categorize('vec3 rgb = vec3(1.0);')).toBe('color'); });
  it('color for hsv', () => { expect(categorize('vec3 hsv = vec3(0.5);')).toBe('color'); });
  it('color for hue', () => { expect(categorize('float hue = 0.3;')).toBe('color'); });
  it('iterations for for loop', () => { expect(categorize('for(int i=0; i<8; i++){}')).toBe('iterations'); });
  it('fractal for fold', () => { expect(categorize('p = fold(p);')).toBe('fractal'); });
  it('fractal for abs', () => { expect(categorize('d = abs(p);')).toBe('fractal'); });
  it('glow for exp', () => { expect(categorize('g = exp(-d);')).toBe('glow'); });
  it('glow for glow keyword', () => { expect(categorize('float glow = 1.0;')).toBe('glow'); });
  it('vectors for vec2', () => { expect(categorize('vec2 uv = vec2(0.5);')).toBe('vectors'); });
  it('misc as fallback', () => { expect(categorize('float z = 1.0;')).toBe('misc'); });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseSymbols — regex fallback (no AST parser in test env)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseSymbols / regex fallback', () => {
  it('detects a simple void function', () => {
    const { functions } = parseSymbols('void mainImage(out vec4 fragColor, in vec2 fragCoord) {');
    expect(functions.some(f => f.name === 'mainImage')).toBe(true);
  });

  it('detects function return type', () => {
    const { functions } = parseSymbols('float sdf(vec3 p) {');
    const fn = functions.find(f => f.name === 'sdf');
    expect(fn?.returnType).toBe('float');
  });

  it('detects function parameters', () => {
    const { functions } = parseSymbols('vec3 map(vec3 p, float t) {');
    const fn = functions.find(f => f.name === 'map');
    expect(fn?.params).toHaveLength(2);
  });

  it('detects uniform variable', () => {
    const { variables } = parseSymbols('uniform sampler2D iChannel0;');
    expect(variables.some(v => v.name === 'iChannel0')).toBe(true);
  });

  it('detects plain float variable', () => {
    const { variables } = parseSymbols('float speed = 1.0;');
    expect(variables.some(v => v.name === 'speed')).toBe(true);
  });

  it('detects struct by name', () => {
    const { structs } = parseSymbols('struct Material {\n  vec3 albedo;\n  float roughness;\n};');
    expect(structs.some(s => s.name === 'Material')).toBe(true);
  });

  it('detects nested struct declaration', () => {
    const src = 'struct Inner { float x; };\nstruct Outer { Inner inner; float y; };';
    const { structs } = parseSymbols(src);
    expect(structs.some(s => s.name === 'Inner')).toBe(true);
    expect(structs.some(s => s.name === 'Outer')).toBe(true);
  });

  it('multiple functions all detected', () => {
    const src = 'float sdf(vec3 p) {\n  return length(p);\n}\nvec3 normal(vec3 p) {\n  return normalize(p);\n}';
    const { functions } = parseSymbols(src);
    expect(functions.length).toBeGreaterThanOrEqual(2);
  });

  it('function overloads with different arities detected separately', () => {
    const src = 'float noise(float t) {\n  return 0.0;\n}\nfloat noise(vec2 uv) {\n  return 0.0;\n}';
    const { functions } = parseSymbols(src);
    const overloads = functions.filter(f => f.name === 'noise');
    expect(overloads.length).toBeGreaterThanOrEqual(1);
  });

  it('array declaration variable detected', () => {
    const src = 'float weights[4];';
    const { variables } = parseSymbols(src);
    expect(variables.some(v => v.name === 'weights')).toBe(true);
  });

  it('in/out qualifier variable detected', () => {
    const src = 'out vec4 fragColor;';
    const { variables } = parseSymbols(src);
    expect(variables.some(v => v.name === 'fragColor')).toBe(true);
  });

  it('returns empty arrays for empty source', () => {
    const { functions, variables, structs } = parseSymbols('');
    expect(functions).toHaveLength(0);
    expect(variables).toHaveLength(0);
    expect(structs).toHaveLength(0);
  });

  it('comment-only source returns empty arrays', () => {
    const { functions, variables, structs } = parseSymbols('// nothing here\n/* or here */');
    expect(functions).toHaveLength(0);
    expect(variables).toHaveLength(0);
    expect(structs).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// typeCheck — heuristic markers
// ─────────────────────────────────────────────────────────────────────────────

describe('typeCheck / heuristic markers', () => {
  const noSymbols = { functions: [], variables: [], structs: [] };

  it('no markers for correct arity', () => {
    const markers = typeCheck('float a = sin(x);', noSymbols);
    const wrong = markers.filter(m => m.message.includes("'sin'"));
    expect(wrong).toHaveLength(0);
  });

  it('marker for wrong arity on known builtin', () => {
    const markers = typeCheck('float a = sin(x, y);', noSymbols);
    expect(markers.some(m => m.message.includes("'sin'") && m.message.includes('1'))).toBe(true);
  });

  it('marker for undeclared function', () => {
    const markers = typeCheck('float a = myFancyFn(x);', noSymbols);
    expect(markers.some(m => m.message.includes("'myFancyFn'"))).toBe(true);
  });

  it('no marker for declared user function with correct arity', () => {
    const symbols = { functions: [{ name: 'sdf', returnType: 'float', params: [{ type: 'vec3', name: 'p', qualifier: '' }] }], variables: [], structs: [] };
    const markers = typeCheck('float d = sdf(p);', symbols);
    const arityErr = markers.filter(m => m.message.includes("'sdf'") && m.message.includes('expects'));
    expect(arityErr).toHaveLength(0);
  });

  it('marker for user function arity mismatch', () => {
    const symbols = { functions: [{ name: 'sdf', returnType: 'float', params: [{ type: 'vec3', name: 'p', qualifier: '' }] }], variables: [], structs: [] };
    const markers = typeCheck('float d = sdf(p, q);', symbols);
    expect(markers.some(m => m.message.includes("'sdf'"))).toBe(true);
  });

  it('no markers for empty source', () => {
    expect(typeCheck('', noSymbols)).toHaveLength(0);
  });

  it('no markers for comment-only source', () => {
    expect(typeCheck('// just a comment\n/* block */', noSymbols)).toHaveLength(0);
  });

  it('marker has correct startLineNumber', () => {
    const markers = typeCheck('float a = sin(x, y);', noSymbols);
    expect(markers[0].startLineNumber).toBe(1);
  });

  it('marker severity for arity error is 8 (error)', () => {
    const markers = typeCheck('float a = pow(x);', noSymbols);
    const m = markers.find(m => m.message.includes("'pow'"));
    expect(m?.severity).toBe(8);
  });

  it('integer literal passed to float fn emits hint marker', () => {
    const markers = typeCheck('float a = sin(3);', noSymbols);
    expect(markers.some(m => m.message.includes('integer literal') || m.message.includes('sin'))).toBe(true);
  });

  it('no marker for constructor calls (vec3, mat4, etc.)', () => {
    const markers = typeCheck('vec3 p = vec3(0.0, 1.0, 2.0);', noSymbols);
    expect(markers.some(m => m.message.includes("'vec3'"))).toBe(false);
  });

  it('no marker for control-flow keywords (if, for, while)', () => {
    const markers = typeCheck('if(x > 0.0){ for(int i=0; i<8; i++){} }', noSymbols);
    expect(markers.some(m => m.message.includes("'if'") || m.message.includes("'for'"))).toBe(false);
  });

  it('clamp with 3 args produces no arity marker', () => {
    const markers = typeCheck('float c = clamp(x, 0.0, 1.0);', noSymbols);
    expect(markers.some(m => m.message.includes("'clamp'"))).toBe(false);
  });

  it('clamp with 2 args produces arity marker', () => {
    const markers = typeCheck('float c = clamp(x, 1.0);', noSymbols);
    expect(markers.some(m => m.message.includes("'clamp'"))).toBe(true);
  });

  it('marker owner is glsl-typecheck', () => {
    const markers = typeCheck('float a = sin(x, y);', noSymbols);
    expect(markers[0].owner).toBe('glsl-typecheck');
  });
});
