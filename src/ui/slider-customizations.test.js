import { beforeEach, describe, expect, it } from 'vitest';
import {
  setSliderMeta,
  getSliderMeta,
  clearSliderCustomizations,
  hasSliderCustomizations,
  applyCustomizations,
  captureOrder,
  serializeCustomizations,
  loadCustomizations,
} from './slider-customizations.js';

function entry(stableKey, over = {}) {
  return {
    id: 'v' + Math.random().toString(36).slice(2, 6),
    stableKey,
    label: stableKey,
    category: 'globals',
    value: 1, defaultValue: 1, min: 0, max: 2, step: 0.01,
    ...over,
  };
}

describe('slider-customizations (roadmap Phase C)', () => {
  beforeEach(() => clearSliderCustomizations());

  it('stores and reads a meta patch', () => {
    setSliderMeta('def:SPEED', { label: 'Vitesse' });
    expect(getSliderMeta('def:SPEED')).toEqual({ label: 'Vitesse' });
  });

  it('merges successive patches for the same key', () => {
    setSliderMeta('def:SPEED', { label: 'Vitesse' });
    setSliderMeta('def:SPEED', { category: 'Motion' });
    expect(getSliderMeta('def:SPEED')).toEqual({ label: 'Vitesse', category: 'Motion' });
  });

  it('removes a field when patched with undefined and drops empty entries', () => {
    setSliderMeta('def:SPEED', { label: 'Vitesse' });
    setSliderMeta('def:SPEED', { label: undefined });
    expect(getSliderMeta('def:SPEED')).toBeUndefined();
    expect(hasSliderCustomizations()).toBe(false);
  });

  it('ignores patches without a stableKey', () => {
    setSliderMeta('', { label: 'x' });
    setSliderMeta(undefined, { label: 'x' });
    expect(hasSliderCustomizations()).toBe(false);
  });

  it('applyCustomizations overrides label / category / range / step in place', () => {
    setSliderMeta('def:SPEED', { label: 'Vitesse', category: 'Motion', min: -1, max: 9, step: 0.5 });
    const e = entry('def:SPEED');
    const out = applyCustomizations([e]);
    expect(out[0].label).toBe('Vitesse');
    expect(out[0].category).toBe('Motion');
    expect(out[0].min).toBe(-1);
    expect(out[0].max).toBe(9);
    expect(out[0].step).toBe(0.5);
  });

  it('applyCustomizations ignores a non-positive step', () => {
    setSliderMeta('def:SPEED', { step: 0 });
    const e = entry('def:SPEED', { step: 0.01 });
    const out = applyCustomizations([e]);
    expect(out[0].step).toBe(0.01);
  });

  it('applyCustomizations leaves entries untouched when store is empty', () => {
    const e = entry('def:SPEED', { label: 'orig' });
    const arr = [e];
    const out = applyCustomizations(arr);
    expect(out[0].label).toBe('orig');
    expect(out).toBe(arr); // same array returned when nothing to apply
  });

  it('reorders entries by stored order, keeping un-ordered ones in source order', () => {
    const a = entry('def:A');
    const b = entry('def:B');
    const c = entry('def:C');
    // Want visual order C, A, B
    captureOrder([c, a, b]);
    const out = applyCustomizations([a, b, c]); // source order A, B, C
    expect(out.map(e => e.stableKey)).toEqual(['def:C', 'def:A', 'def:B']);
  });

  it('captureOrder + reparse round-trips a drag reorder', () => {
    const a = entry('def:A');
    const b = entry('def:B');
    captureOrder([b, a]);             // user dragged B above A
    const reparsed = applyCustomizations([entry('def:A'), entry('def:B')]);
    expect(reparsed.map(e => e.stableKey)).toEqual(['def:B', 'def:A']);
  });

  it('serializes and reloads the store as a plain object', () => {
    setSliderMeta('def:SPEED', { label: 'Vitesse', min: 0, max: 5 });
    setSliderMeta('const:GLOW', { category: 'Light' });
    const blob = serializeCustomizations();
    expect(blob).toEqual({
      'def:SPEED': { label: 'Vitesse', min: 0, max: 5 },
      'const:GLOW': { category: 'Light' },
    });

    clearSliderCustomizations();
    expect(hasSliderCustomizations()).toBe(false);

    loadCustomizations(blob);
    expect(getSliderMeta('def:SPEED')).toEqual({ label: 'Vitesse', min: 0, max: 5 });
    expect(getSliderMeta('const:GLOW')).toEqual({ category: 'Light' });
  });

  it('loadCustomizations(null) clears the store', () => {
    setSliderMeta('def:SPEED', { label: 'x' });
    loadCustomizations(null);
    expect(hasSliderCustomizations()).toBe(false);
  });

  it('serialized blobs are independent copies (no shared refs)', () => {
    setSliderMeta('def:SPEED', { label: 'Vitesse' });
    const blob = serializeCustomizations();
    blob['def:SPEED'].label = 'mutated';
    expect(getSliderMeta('def:SPEED').label).toBe('Vitesse');
  });
});
