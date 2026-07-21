/**
 * src/render/adaptive-debounce.test.js
 *
 * Tests unitaires — Phase 22.1 : Debounce adaptatif
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { adaptiveDebounce, cancelAdaptiveDebounce, getAdaptiveDelay } from './adaptive-debounce.js';

// ── Fixtures GLSL ─────────────────────────────────────────────────────────────

const SIMPLE_SRC = `
void main() {
  gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
}
`;

// Score ≈ 75 (boucle + texture + trig) → Heavy
const HEAVY_SRC = `
uniform sampler2D iChannel0;
void main() {
  vec4 col = vec4(0.0);
  for (int i = 0; i < 10; i++) {
    col += texture2D(iChannel0, gl_FragCoord.xy / 100.0);
    col.rgb *= sin(float(i) * 0.1);
  }
  gl_FragColor = col;
}
`;

// Score très élevé (plusieurs boucles, textures, fonctions) → Complex
const COMPLEX_SRC = `
uniform sampler2D iChannel0;
vec3 rayMarch(vec3 ro, vec3 rd) {
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * float(i) * 0.1;
    float d = length(p) - 1.0;
    if (d < 0.001) break;
  }
  return vec3(0.0);
}
vec3 shade(vec3 p) {
  for (int j = 0; j < 32; j++) {
    p += texture2D(iChannel0, p.xy).rgb * sin(p.z);
  }
  return p;
}
void main() {
  vec3 col = rayMarch(vec3(0.0), vec3(0.0, 0.0, 1.0));
  col += shade(col);
  gl_FragColor = vec4(col, 1.0);
}
`;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('adaptiveDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes the callback after the computed delay', () => {
    const fn = vi.fn();
    const delay = adaptiveDebounce('test-simple', SIMPLE_SRC, fn);

    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(delay);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('cancels a pending debounce when called again with the same key', () => {
    const fn = vi.fn();
    adaptiveDebounce('test-cancel', SIMPLE_SRC, fn);
    adaptiveDebounce('test-cancel', SIMPLE_SRC, fn); // second call — should reset
    vi.runAllTimers();
    expect(fn).toHaveBeenCalledOnce(); // only once, not twice
  });

  it('uses a shorter delay for simple shaders than for complex ones', () => {
    const simpleDelay  = getAdaptiveDelay(SIMPLE_SRC);
    const complexDelay = getAdaptiveDelay(COMPLEX_SRC);
    expect(simpleDelay).toBeLessThan(complexDelay);
  });

  it('uses a shorter delay for simple shaders than for heavy ones', () => {
    const simpleDelay = getAdaptiveDelay(SIMPLE_SRC);
    const heavyDelay  = getAdaptiveDelay(HEAVY_SRC);
    expect(simpleDelay).toBeLessThan(heavyDelay);
  });

  it('independent keys do not interfere', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const d1 = adaptiveDebounce('key-1', SIMPLE_SRC, fn1);
    const d2 = adaptiveDebounce('key-2', SIMPLE_SRC, fn2);
    vi.advanceTimersByTime(Math.max(d1, d2));
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
  });
});

describe('cancelAdaptiveDebounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(()  => { vi.useRealTimers(); });

  it('prevents the callback from firing after cancellation', () => {
    const fn = vi.fn();
    adaptiveDebounce('cancel-test', SIMPLE_SRC, fn);
    cancelAdaptiveDebounce('cancel-test');
    vi.runAllTimers();
    expect(fn).not.toHaveBeenCalled();
  });

  it('is a no-op for unknown keys', () => {
    expect(() => cancelAdaptiveDebounce('non-existent-key')).not.toThrow();
  });
});

describe('getAdaptiveDelay', () => {
  it('returns a positive number for any source', () => {
    expect(getAdaptiveDelay(SIMPLE_SRC)).toBeGreaterThan(0);
    expect(getAdaptiveDelay(HEAVY_SRC)).toBeGreaterThan(0);
    expect(getAdaptiveDelay(COMPLEX_SRC)).toBeGreaterThan(0);
  });

  it('returns a fallback for empty source', () => {
    const delay = getAdaptiveDelay('');
    expect(delay).toBeGreaterThan(0);
  });
});
