import { beforeEach, describe, expect, it } from 'vitest';
import { getParseWarnings, parseShader } from './parser.js';
import { state } from '../core/state.js';

function labels(entries) {
  return entries.map((e) => e.label);
}

describe('shader/parser', () => {
  beforeEach(() => {
    state.pinnedIds.clear();
    state.parseWarnings = [];
  });

  it('parses simple define', () => {
    const entries = parseShader('#define SPEED 2.5');
    expect(entries.length).toBe(1);
    expect(entries[0].value).toBe(2.5);
    expect(entries[0].isDefine).toBe(true);
  });

  it('parses negative define', () => {
    const entries = parseShader('#define OFFSET -1.0');
    expect(entries[0].value).toBe(-1);
  });

  it('parses const float global', () => {
    const entries = parseShader('const float R = 3.14;');
    expect(entries.length).toBe(1);
    expect(entries[0].isConst).toBe(true);
    expect(entries[0].value).toBe(3.14);
  });

  it('skips loop initializer literals', () => {
    const code = 'void main(){ for(float i = 0.0; i < 99.0; i++){} }';
    const entries = parseShader(code);
    expect(entries.some((e) => e.value === 0)).toBe(false);
    expect(entries.some((e) => e.value === 99)).toBe(true);
  });

  it('parses multiple defines', () => {
    const code = '#define A 1.0\n#define B 2.0\n#define C 3.0';
    const entries = parseShader(code);
    expect(entries.length).toBe(3);
  });

  it('skips comment-only lines', () => {
    const entries = parseShader('// x 2.0\n/* 3.0 */');
    expect(entries.length).toBe(0);
  });

  it('skips function declaration lines', () => {
    const entries = parseShader('float map(vec3 p) {');
    expect(entries.length).toBe(0);
  });

  it('infers vector component labels', () => {
    const entries = parseShader('vec3 c = vec3(0.1, 0.2, 0.3);');
    expect(labels(entries)).toContain('vec3.x');
    expect(labels(entries)).toContain('vec.y');
    expect(labels(entries)).toContain('vec.z');
  });

  it('infers assignment labels', () => {
    const entries = parseShader('float glow = 2.0;');
    expect(labels(entries)).toContain('glow');
  });

  it('keeps integers above 10 as entries', () => {
    const entries = parseShader('int n = 42;');
    expect(entries.some((e) => e.value === 42)).toBe(true);
  });

  it('marks category iterations for for loops', () => {
    const entries = parseShader('for(int k=0; k<32; k++){}');
    expect(entries.some((e) => e.category === 'iterations')).toBe(true);
  });

  it('marks pinned entries by stableKey, not the volatile runtime id', () => {
    // Pinning must key on stableKey ('def:SPEED') so it survives reparse —
    // the runtime id ('v0','v1'…) is reassigned fresh on every parse.
    state.pinnedIds.add('def:SPEED');
    const entries = parseShader('#define SPEED 2.0');
    expect(entries[0].pinned).toBe(true);
    expect(entries[0].stableKey).toBe('def:SPEED');
  });

  it('keeps an entry pinned after a reparse that shifts its runtime id', () => {
    state.pinnedIds.add('def:SPEED');
    // First parse: SPEED is entry 0 (id v0).
    const before = parseShader('#define SPEED 2.0');
    expect(before[0].id).toBe('v0');
    expect(before[0].pinned).toBe(true);
    // Second parse: a new define pushed in front shifts SPEED to id v1.
    const after = parseShader('#define NEWVAR 1.0\n#define SPEED 2.0');
    const speedEntry = after.find(e => e.defineName === 'SPEED');
    expect(speedEntry.id).not.toBe('v0'); // id did shift
    expect(speedEntry.pinned).toBe(true); // but pin followed the stableKey
  });

  it('captures unary minus with numeric literal tokens', () => {
    const code = 'vec3 p = vec3(0.0, 9.0, -3.0);';
    const entries = parseShader(code);
    const neg = entries.find((e) => e.value === -3);
    expect(neg).toBeTruthy();
    expect(neg.matchLen).toBe(4); // "-3.0"
    expect(code.slice(neg.col, neg.col + neg.matchLen)).toBe('-3.0');
  });

  it('parses scientific notation as a single token', () => {
    const code = 'float freq = 1.5e-3;';
    const entries = parseShader(code);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBeCloseTo(0.0015);
    expect(entries[0].isScientific).toBe(true);
    expect(code.slice(entries[0].col, entries[0].col + entries[0].matchLen)).toBe('1.5e-3');
  });

  it('parses scientific notation in defines', () => {
    const entries = parseShader('#define FREQ 1e4');
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe(10000);
    expect(entries[0].isScientific).toBe(true);
  });

  it('tracks unparseable #define expressions as warnings', () => {
    const entries = parseShader('#define TWO_PI (2.0 * 3.14159)');
    const warnings = getParseWarnings();
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].name).toBe('TWO_PI');
  });

  it('does not apply rotation range to unrelated vec component literals', () => {
    const entries = parseShader('vec3 color = vec3(cos(uv.x), sin(uv.y), 0.5);');
    const constant = entries.find((e) => Math.abs(e.value - 0.5) < 1e-9);
    expect(constant).toBeTruthy();
    expect(constant.min).toBe(0);
    expect(constant.max).toBe(1);
  });

  it('stores tokenRaw for stable slider patching', () => {
    const entries = parseShader('float a = -1.25e-2;');
    expect(entries).toHaveLength(1);
    expect(entries[0].tokenRaw).toBe('-1.25e-2');
  });

  it('gives rotation literals the ±2π angle range (drives the dial widget)', () => {
    const entries = parseShader('float a = rotate(0.5);');
    const ang = entries.find((e) => Math.abs(e.value - 0.5) < 1e-9);
    expect(ang).toBeTruthy();
    expect(ang.min).toBeCloseTo(-Math.PI * 2, 4);
    expect(ang.max).toBeCloseTo(Math.PI * 2, 4);
  });
});

describe('shader/parser — annotations (roadmap Phase A)', () => {
  beforeEach(() => {
    state.pinnedIds.clear();
    state.parseWarnings = [];
  });

  it('applies @range and @step to a #define', () => {
    const entries = parseShader('#define SPEED 1.5 // @range(0, 5) @step(0.05)');
    expect(entries[0].min).toBe(0);
    expect(entries[0].max).toBe(5);
    expect(entries[0].step).toBe(0.05);
  });

  it('applies @group and @label to a #define', () => {
    const entries = parseShader('#define SPEED 1.5 // @group(Motion) @label("Vitesse")');
    expect(entries[0].category).toBe('Motion');
    expect(entries[0].label).toBe('Vitesse');
  });

  it('applies annotations to a const global', () => {
    const entries = parseShader('const float GLOW = 0.3; // @range(0,1)');
    expect(entries[0].min).toBe(0);
    expect(entries[0].max).toBe(1);
  });

  it('applies @color to inline vec3 literals on the same line', () => {
    const entries = parseShader('vec3 col = vec3(1.0, 0.5, 0.2); // @color');
    expect(entries.length).toBe(3);
    expect(entries.every((e) => e.isColor)).toBe(true);
  });

  it('does not mark entries as color without the @color tag (non-color var name)', () => {
    // `v` is not a color-named variable, so the Phase B heuristic won't fire either.
    const entries = parseShader('vec3 v = vec3(1.0, 0.5, 0.2);');
    expect(entries.every((e) => !e.isColor)).toBe(true);
  });

  it('falls back to heuristic range when @range is malformed', () => {
    const withBad = parseShader('#define SPEED 1.5 // @range(oops)');
    const withoutAnnotation = parseShader('#define SPEED 1.5');
    expect(withBad[0].min).toBe(withoutAnnotation[0].min);
    expect(withBad[0].max).toBe(withoutAnnotation[0].max);
  });

  it('ignores @range with a single argument', () => {
    const withBad = parseShader('#define SPEED 1.5 // @range(5)');
    const withoutAnnotation = parseShader('#define SPEED 1.5');
    expect(withBad[0].min).toBe(withoutAnnotation[0].min);
    expect(withBad[0].max).toBe(withoutAnnotation[0].max);
  });

  it('ignores unknown tags without throwing', () => {
    expect(() => parseShader('#define SPEED 1.5 // @bogus(1,2) @range(0,5)')).not.toThrow();
    const entries = parseShader('#define SPEED 1.5 // @bogus(1,2) @range(0,5)');
    expect(entries[0].min).toBe(0);
    expect(entries[0].max).toBe(5);
  });

  it('normalises a reversed @range(max, min)', () => {
    const entries = parseShader('#define SPEED 1.5 // @range(5, 0)');
    expect(entries[0].min).toBe(0);
    expect(entries[0].max).toBe(5);
  });

  it('leaves shadertoy.com paste-compatibility intact (annotation is a plain comment)', () => {
    const code = '#define SPEED 1.5 // @range(0, 5) @step(0.05) @group(Motion) @label("Vitesse")';
    // The annotation must not alter the GLSL token itself.
    const entries = parseShader(code);
    expect(entries[0].tokenRaw).toBe('1.5');
  });
});

describe('shader/parser — stable keys (roadmap Phase C)', () => {
  beforeEach(() => {
    state.pinnedIds.clear();
    state.parseWarnings = [];
  });

  it('keys a #define by its macro name', () => {
    const entries = parseShader('#define SPEED 1.5');
    expect(entries[0].stableKey).toBe('def:SPEED');
  });

  it('keys a const global by its identifier', () => {
    const entries = parseShader('const float RADIUS = 0.8;');
    expect(entries[0].stableKey).toBe('const:RADIUS');
  });

  it('keys inline literals by source-order index', () => {
    const entries = parseShader('void mainImage(out vec4 o, vec2 u){ float a = 3.0; float b = 7.0; }');
    const keys = entries.map(e => e.stableKey);
    expect(keys).toContain('lit:0');
    expect(keys).toContain('lit:1');
  });

  it('keeps named-entry keys stable when an unrelated line is edited', () => {
    const a = parseShader('#define SPEED 1.5\nfloat x = 2.0;');
    const b = parseShader('#define SPEED 1.5\nfloat x = 2.0;\nfloat y = 4.0;');
    const ka = a.find(e => e.defineName === 'SPEED').stableKey;
    const kb = b.find(e => e.defineName === 'SPEED').stableKey;
    expect(ka).toBe(kb);
    expect(ka).toBe('def:SPEED');
  });
});

describe('shader/parser — color heuristic (roadmap Phase B)', () => {
  beforeEach(() => {
    state.pinnedIds.clear();
    state.parseWarnings = [];
  });

  it('marks a normalised vec3 assigned to a color-named var', () => {
    const entries = parseShader('vec3 color = vec3(1.0, 0.5, 0.2);');
    expect(entries.length).toBe(3);
    expect(entries.every(e => e.isColor)).toBe(true);
  });

  it('marks a vec4 (RGBA) color', () => {
    const entries = parseShader('vec4 tint = vec4(0.1, 0.2, 0.3, 0.5);');
    expect(entries.length).toBe(4);
    expect(entries.every(e => e.isColor)).toBe(true);
  });

  it('does NOT mark a vec3 with a non-color variable name', () => {
    const entries = parseShader('vec3 pos = vec3(0.1, 0.2, 0.3);');
    expect(entries.every(e => !e.isColor)).toBe(true);
  });

  it('does NOT mark a vec3 with an out-of-[0,1] component', () => {
    const entries = parseShader('vec3 color = vec3(0.1, 2.0, 0.3);');
    expect(entries.every(e => !e.isColor)).toBe(true);
  });

  it('does NOT mark when the RHS is not a bare vecN constructor', () => {
    const entries = parseShader('vec3 color = vec3(0.1, 0.2, 0.3) * 2.0;');
    expect(entries.every(e => !e.isColor)).toBe(true);
  });

  it('still honours the explicit @color annotation regardless of var name', () => {
    const entries = parseShader('vec3 p = vec3(1.0, 0.5, 0.2); // @color');
    expect(entries.every(e => e.isColor)).toBe(true);
  });
});

describe('shader/parser — XY heuristic (roadmap Phase B)', () => {
  beforeEach(() => {
    state.pinnedIds.clear();
    state.parseWarnings = [];
  });

  it('marks a vec2 assigned to a position/offset-named var', () => {
    const entries = parseShader('vec2 offset = vec2(0.3, -0.2);');
    expect(entries.length).toBe(2);
    expect(entries.every(e => e.isXY)).toBe(true);
  });

  it('does NOT mark a vec2 with a neutral variable name', () => {
    const entries = parseShader('vec2 v = vec2(0.3, 0.2);');
    expect(entries.every(e => !e.isXY)).toBe(true);
  });

  it('does NOT mark when the RHS is not a bare vec2 constructor', () => {
    const entries = parseShader('vec2 offset = vec2(0.3, 0.2) * scale;');
    expect(entries.every(e => !e.isXY)).toBe(true);
  });

  it('honours the explicit @xy annotation regardless of var name', () => {
    const entries = parseShader('vec2 v = vec2(0.3, 0.2); // @xy');
    expect(entries.length).toBe(2);
    expect(entries.every(e => e.isXY)).toBe(true);
  });

  it('does not mark a colour line as XY (color takes precedence)', () => {
    const entries = parseShader('vec3 color = vec3(1.0, 0.5, 0.2);');
    expect(entries.every(e => e.isColor && !e.isXY)).toBe(true);
  });
});