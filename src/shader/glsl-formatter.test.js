/**
 * src/shader/glsl-formatter.test.js
 *
 * Regression tests for `formatGLSL()`, in particular the for-loop-header
 * and struct-trailing-semicolon fixes made while building the §2
 * dégolfage feature (ROADMAP-GOLF.md) — the dégolfeur's output funnels
 * through this formatter, and both bugs were pre-existing here (not
 * introduced by dégolf), affecting the existing auto-format-on-compile
 * feature too.
 */

import { describe, it, expect } from 'vitest';
import { formatGLSL } from './glsl-formatter.js';

describe('formatGLSL — for loops', () => {
  it('keeps a for-loop header on one line instead of splitting its init/condition/operation clauses', () => {
    const out = formatGLSL('void f(){for(float i=0.;i<10.;i++){x+=i;}}');
    expect(out).toContain('for(float i = 0.; i < 10.; i ++){');
    expect(out.split('\n').filter((l) => l.includes('for(')).length).toBe(1);
  });

  it('still splits ordinary statements onto their own lines around a for loop', () => {
    const out = formatGLSL('void f(){float a=1.;float b=2.;if(a>b){a=b;}}');
    expect(out).toContain('float a = 1.;\n  float b = 2.;');
  });

  it('handles nested for loops without breaking either header', () => {
    const out = formatGLSL('void f(){for(float i=0.;i<5.;i++){for(float j=0.;j<5.;j++){x+=1.;}}}');
    const forLines = out.split('\n').filter((l) => l.trim().startsWith('for('));
    expect(forLines.length).toBe(2);
  });
});

describe('formatGLSL — struct declarations', () => {
  it("keeps a struct declaration's trailing semicolon on the closing brace line", () => {
    const out = formatGLSL('struct Ray{vec3 o;vec3 d;};');
    expect(out).toContain('};');
    expect(out).not.toMatch(/^\s*;\s*$/m);
  });
});
