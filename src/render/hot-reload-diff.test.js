/**
 * src/render/hot-reload-diff.test.js
 *
 * Tests unitaires — Phase 22.1 : Hot-reload différentiel
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  passNeedsRecompile,
  markPassCompiled,
  invalidatePass,
  invalidateAll,
  getDiffStats,
} from './hot-reload-diff.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SRC_A = 'void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }';
const SRC_B = 'void main() { gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); }';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('passNeedsRecompile', () => {
  beforeEach(() => invalidateAll());

  it('returns true for a never-compiled pass', () => {
    expect(passNeedsRecompile('bufA', SRC_A)).toBe(true);
  });

  it('returns false after markPassCompiled with the same source', () => {
    markPassCompiled('bufA', SRC_A);
    expect(passNeedsRecompile('bufA', SRC_A)).toBe(false);
  });

  it('returns true after markPassCompiled when source changes', () => {
    markPassCompiled('bufA', SRC_A);
    expect(passNeedsRecompile('bufA', SRC_B)).toBe(true);
  });

  it('is independent per passId', () => {
    markPassCompiled('bufA', SRC_A);
    // bufB was never compiled
    expect(passNeedsRecompile('bufA', SRC_A)).toBe(false);
    expect(passNeedsRecompile('bufB', SRC_A)).toBe(true);
  });

  it('handles identical source hashes consistently (no false collisions)', () => {
    const longSrc1 = SRC_A.repeat(200);
    const longSrc2 = SRC_B.repeat(200);
    markPassCompiled('image', longSrc1);
    expect(passNeedsRecompile('image', longSrc1)).toBe(false);
    expect(passNeedsRecompile('image', longSrc2)).toBe(true);
  });
});

describe('invalidatePass', () => {
  beforeEach(() => invalidateAll());

  it('forces recompile on the invalidated pass only', () => {
    markPassCompiled('bufA', SRC_A);
    markPassCompiled('bufB', SRC_A);
    invalidatePass('bufA');
    expect(passNeedsRecompile('bufA', SRC_A)).toBe(true);  // invalidated
    expect(passNeedsRecompile('bufB', SRC_A)).toBe(false); // untouched
  });

  it('is a no-op for unknown pass ids', () => {
    expect(() => invalidatePass('does-not-exist')).not.toThrow();
  });
});

describe('invalidateAll', () => {
  it('forces recompile on every pass', () => {
    markPassCompiled('bufA',  SRC_A);
    markPassCompiled('bufB',  SRC_A);
    markPassCompiled('image', SRC_A);
    invalidateAll();
    expect(passNeedsRecompile('bufA',  SRC_A)).toBe(true);
    expect(passNeedsRecompile('bufB',  SRC_A)).toBe(true);
    expect(passNeedsRecompile('image', SRC_A)).toBe(true);
  });
});

describe('getDiffStats', () => {
  beforeEach(() => invalidateAll());

  it('returns 0 passes after invalidateAll', () => {
    expect(getDiffStats().passes).toBe(0);
  });

  it('counts compiled passes correctly', () => {
    markPassCompiled('bufA', SRC_A);
    markPassCompiled('image', SRC_B);
    const stats = getDiffStats();
    expect(stats.passes).toBe(2);
    expect(stats.ids).toContain('bufA');
    expect(stats.ids).toContain('image');
  });
});
