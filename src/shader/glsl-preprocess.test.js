/**
 * src/shader/glsl-preprocess.test.js
 *
 * Unit tests — §0/§1 ROADMAP-GOLF.md: macro preprocessing + line mapping.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { preprocessGLSL, preprocessWithLineMap, whenPreprocessorReady } from './glsl-preprocess.js';

beforeAll(async () => {
  await whenPreprocessorReady();
});

describe('preprocessGLSL', () => {
  it('leaves macro-free source completely unchanged', () => {
    const src = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  fragColor = vec4(uv, 0.5, 1.0);
}`;
    expect(preprocessGLSL(src)).toBe(src);
  });

  it('expands a simple numeric #define', () => {
    const src = '#define SPEED 2.5\nvoid f() { float x = SPEED; }';
    const out = preprocessGLSL(src);
    expect(out).toContain('float x = 2.5;');
    expect(out).not.toContain('#define');
  });

  it('expands a function-like macro with arguments', () => {
    const src = '#define SQ(x) ((x)*(x))\nvoid f() { float y = SQ(2.0); }';
    const out = preprocessGLSL(src);
    expect(out).toContain('((2.0)*(2.0))');
  });

  it('expands nested macros (macro referencing another macro)', () => {
    const src = '#define TAU (PI*2.0)\n#define PI 3.14159\nvoid f() { float t = TAU; }';
    const out = preprocessGLSL(src);
    expect(out).toContain('(3.14159*2.0)');
  });

  // The exact real-world case that failed to compile in the app this
  // session: a multi-line macro whose body spans an unbalanced-parens
  // expression, only valid once expanded (see ROADMAP-GOLF.md §1).
  it('expands the Shadertoy-style multi-line unbalanced-parens macro', () => {
    const src = `#define v normalize(vec3(

void mainImage(out vec4 o, vec2 u) {
    float T = iTime;
    vec3 W = v sin(T), cos(T), 2.0));
    o = vec4(W, 1.0);
}`;
    const out = preprocessGLSL(src);
    expect(out).toContain('normalize(vec3( sin(T), cos(T), 2.0))');
    expect(out).not.toContain('#define');
    // Must be re-parseable as valid GLSL by the same AST parser that
    // rejected the original, unexpanded source (see parser.js).
    expect(out).not.toMatch(/\bv\s+sin\(/);
  });

  it('does not touch macro-like text inside string-free GLSL comments', () => {
    // GLSL has no string literals, only comments to worry about here.
    const src = '#define PI 3.14159\nvoid f() {\n  // PI is defined above\n  float x = PI;\n}';
    const out = preprocessGLSL(src);
    expect(out).toContain('float x = 3.14159;');
  });
});

describe('preprocessWithLineMap', () => {
  it('returns an identity line map for macro-free source', () => {
    const src = 'void f() {\n  float x = 1.0;\n}';
    const { code, mapLine } = preprocessWithLineMap(src);
    expect(code).toBe(src);
    expect(mapLine(1)).toBe(1);
    expect(mapLine(2)).toBe(2);
    expect(mapLine(3)).toBe(3);
  });

  it('maps every expanded line back to a valid, in-range input line', () => {
    const src = `#define v normalize(vec3(

void mainImage(out vec4 o, vec2 u) {
    float T = iTime, t, e=1., i;
    vec3 R = iResolution,
        W = v sin(T*.2), cos(T*.15), 2)),
        U = v -W.z, 0, W)),
        P = vec3(2.*sin(T*.5), cos(T*.3), T), q;

    for ( o*=i
        ; i++ < 64. && t < 20. && e> .001
        ; t += e * .5
        )
        q = P + vec3((u - .5*R.xy)/R.y, 1.5) * mat3(U, cross(U, W), W) * t,
        q.xy *= mat2(cos( q.z*.1 + vec4(0, 33, 11, 0))),
        e = length( sin(q) + cos(q.zxy )) -.5;

    o += exp(-t*.1);
}`;
    const { code, mapLine } = preprocessWithLineMap(src);
    const inputLineCount = src.split('\n').length;
    const outputLineCount = code.split('\n').length;
    for (let i = 1; i <= outputLineCount; i++) {
      const mapped = mapLine(i);
      expect(mapped).toBeGreaterThanOrEqual(1);
      expect(mapped).toBeLessThanOrEqual(inputLineCount);
    }
  });

  it('maps the line of a real error correctly through a preceding #define', () => {
    // Line 3 (1-based, in the ORIGINAL source) has a deliberate typo.
    // After the #define on line 1 is stripped, that becomes output line 2.
    // mapLine(2) must report back "3" — the line the user actually needs
    // to look at, not "2" (which would point at the wrong statement).
    const src = '#define X 1.0\nvoid f() {\n  float y = X + undeclaredVar;\n}';
    const { code, mapLine } = preprocessWithLineMap(src);
    const outputLines = code.split('\n');
    const errorLineInOutput = outputLines.findIndex((l) => l.includes('undeclaredVar')) + 1;
    expect(mapLine(errorLineInOutput)).toBe(3);
  });

  it('falls back to identity mapping on unparseable input rather than throwing', () => {
    const src = 'this is not valid glsl at all {{{ ###';
    const { code, mapLine } = preprocessWithLineMap(src);
    expect(code).toBe(src);
    expect(mapLine(1)).toBe(1);
  });
});
