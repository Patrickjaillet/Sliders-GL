/**
 * src/shader/glsl-expand.test.js
 *
 * Unit tests — §2 ROADMAP-GOLF.md: dégolfage (macro expansion + chained
 * declaration splitting + scope-aware renaming + formatting).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { expandGLSL, whenExpandReady } from './glsl-expand.js';

beforeAll(async () => {
  await whenExpandReady();
});

describe('expandGLSL — macro expansion', () => {
  it('expands the exact Shadertoy code-golf macro from ROADMAP-GOLF.md §1', () => {
    const src = `#define v normalize(vec3(

void mainImage(out vec4 o, vec2 u) {
    float T = iTime;
    vec3 W = v sin(T), cos(T), 2.0));
    o = vec4(W, 1.0);
}`;
    const { code, renamed, warnings } = expandGLSL(src);
    expect(warnings).toEqual([]);
    expect(renamed).toBe(true);
    expect(code).not.toContain('#define');
    expect(code).toContain('normalize(vec3(sin(');
  });
});

describe('expandGLSL — chained declaration splitting', () => {
  it('splits a chained declaration into separate statements', () => {
    const src = 'void mainImage(out vec4 o, vec2 u){\n  float a=1.,b=2.,c=3.;\n  o=vec4(a+b+c);\n}';
    const { code } = expandGLSL(src);
    expect(code).toMatch(/float \w+ = 1\.;/);
    expect(code).toMatch(/float \w+ = 2\.;/);
    expect(code).toMatch(/float \w+ = 3\.;/);
    expect(code).not.toMatch(/1\.,.*=.*2\./);
  });

  it('leaves single declarations (nothing to split) alone', () => {
    const src = 'void mainImage(out vec4 o, vec2 u){\n  float a=1.;\n  o=vec4(a);\n}';
    const { code } = expandGLSL(src);
    expect((code.match(/float \w+ = 1\.;/g) || []).length).toBe(1);
  });
});

describe('expandGLSL — scope-aware renaming', () => {
  it('renames a short parameter and local to var1/var2 style fallback names', () => {
    const src = 'void mainImage(out vec4 o, vec2 u){\n  float a=1.;\n  o=vec4(a);\n}';
    const { code } = expandGLSL(src);
    expect(code).not.toContain(' o,');
    expect(code).toMatch(/void mainImage\(out vec4 \w{3,}, vec2 \w{3,}\)/);
  });

  it('never lets two nested variables sharing an original short name collide under one new name', () => {
    // Genuine shadowing: an outer `a` and an unrelated inner `a` in a
    // nested block are two DIFFERENT variables under GLSL scoping rules.
    // A regression here would silently merge them into the same renamed
    // identifier — exactly the class of bug ROADMAP-GOLF.md §4 forbids.
    const src = `void mainImage(out vec4 o, vec2 u){
  float a=1.;
  {
    float a=2.;
    o=vec4(a);
  }
  o+=vec4(a);
}`;
    const { code } = expandGLSL(src);
    // Extract the two declaration names and the two usage names.
    const declMatches = [...code.matchAll(/float (\w+) = [12]\./g)].map((m) => m[1]);
    expect(declMatches.length).toBe(2);
    expect(declMatches[0]).not.toBe(declMatches[1]);
    // The inner block's `o=vec4(a)` must reference the INNER declaration.
    const innerBlockMatch = code.match(/\{\s*float (\w+) = 2\.;\s*(\w+) = vec4\((\w+)\);/);
    expect(innerBlockMatch).toBeTruthy();
    expect(innerBlockMatch[3]).toBe(innerBlockMatch[1]);
    // The final `o += vec4(a)` (outside the block) must reference the
    // OUTER declaration, not the inner one.
    const outerUsageMatch = code.match(/\}\s*\w+ \+= vec4\((\w+)\);/);
    expect(outerUsageMatch).toBeTruthy();
    expect(outerUsageMatch[1]).toBe(declMatches[0]);
  });

  it('gives independent, non-colliding names to nested for-loops reusing the same original loop variable name', () => {
    const src = `void mainImage(out vec4 o, vec2 u){
  float s=0.;
  for(float i=0.;i<5.;i++){
    for(float i=0.;i<5.;i++){
      s+=i;
    }
    s+=i;
  }
  o=vec4(s);
}`;
    const { code } = expandGLSL(src);
    const forVars = [...code.matchAll(/for\(float (\w+) = 0\./g)].map((m) => m[1]);
    expect(forVars.length).toBe(2);
    expect(forVars[0]).not.toBe(forVars[1]);
  });

  it('allows reusing a name after its block scope has closed (not a collision)', () => {
    const src = `void mainImage(out vec4 o, vec2 u){
  float a=1.;
  {
    float b=2.;
    o=vec4(b);
  }
  float c=3.;
  o+=vec4(a+c);
}`;
    // Must not throw and must produce valid-looking, distinctly-scoped
    // output — the only real requirement is no cross-scope corruption of
    // values, checked indirectly via a successful re-parse.
    const { code, warnings } = expandGLSL(src);
    expect(warnings).toEqual([]);
    expect(code).toContain('mainImage');
  });

  it('leaves multi-character (already descriptive) identifiers untouched', () => {
    const src =
      'void mainImage(out vec4 fragColor, vec2 fragCoord){\n  fragColor=vec4(fragCoord,0.,1.);\n}';
    const { code } = expandGLSL(src);
    expect(code).toContain('fragColor');
    expect(code).toContain('fragCoord');
  });

  it('applies the uv contextual heuristic only to a variable whose OWN initializer matches the idiom', () => {
    // `u` is the raw parameter (no initializer); `p` is what actually gets
    // divided by iResolution.xy. Only `p` should become `uv` — naming `u`
    // that way would be misleading (see historical note in the module).
    const src =
      'void mainImage(out vec4 o, in vec2 u){\n  vec2 p=u/iResolution.xy;\n  o=vec4(p,0.,1.);\n}';
    const { code } = expandGLSL(src);
    expect(code).toMatch(/vec2 uv = \w+ \/ iResolution\.xy;/);
    expect(code).not.toMatch(/in vec2 uv\)/);
  });

  it('does not rename swizzle components or struct field access', () => {
    const src = 'void mainImage(out vec4 o, in vec2 u){\n  o=vec4(u.xy,0.,1.);\n}';
    const { code } = expandGLSL(src);
    expect(code).toContain('.xy');
  });
});

describe('expandGLSL — fallback safety', () => {
  it('falls back to formatting-only (no throw) on unparseable input', () => {
    const src = 'this is not valid glsl at all {{{ ###';
    const { code, renamed, warnings } = expandGLSL(src);
    expect(renamed).toBe(false);
    expect(warnings.length).toBeGreaterThan(0);
    expect(typeof code).toBe('string');
  });

  it('warning messages are single-line (no embedded raw parser stack dump)', () => {
    const { warnings } = expandGLSL('not valid glsl {{{ ###');
    for (const w of warnings) {
      expect(w).not.toContain('\n');
    }
  });
});

describe('expandGLSL — globals and structs', () => {
  it('handles global const declarations and struct definitions without throwing', () => {
    const src = `const float PI=3.14159;
struct Ray{vec3 o;vec3 d;};
float sq(float a){return a*a;}
void mainImage(out vec4 o, vec2 u){
  float r=sq(2.);
  o=vec4(r);
}`;
    const { code, warnings } = expandGLSL(src);
    expect(warnings).toEqual([]);
    expect(code).toContain('const float PI = 3.14159;');
    expect(code).toContain('struct Ray');
  });

  it('renames function parameters independently per function (no cross-function collision)', () => {
    const src =
      'float sq(float a){return a*a;}\nvoid mainImage(out vec4 o, vec2 u){\n  float r=sq(2.);\n  o=vec4(r);\n}';
    const { code } = expandGLSL(src);
    // sq's own single param must not have been forced into the same name
    // as mainImage's own locals purely by coincidence of processing order.
    expect(code).toMatch(/float sq\(float \w+\)\{\s*return \w+ \* \w+;\s*\}/);
  });
});
