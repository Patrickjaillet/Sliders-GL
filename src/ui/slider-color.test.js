import { describe, it, expect } from 'vitest';
import {
  groupEntriesForRender,
  detectColorScale,
  componentsToHex,
  hexToComponents,
} from './slider-color.js';

function e(over = {}) {
  return { id: 'v' + Math.random().toString(36).slice(2, 6), line: 1, isColor: false, ...over };
}

describe('slider-color — grouping (roadmap Phase B)', () => {
  it('groups a run of 3 same-line color entries into an RGB unit', () => {
    const entries = [e({ isColor: true, line: 5 }), e({ isColor: true, line: 5 }), e({ isColor: true, line: 5 })];
    const units = groupEntriesForRender(entries);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ kind: 'color', alpha: false });
    expect(units[0].entries).toHaveLength(3);
  });

  it('groups a run of 4 into an RGBA unit', () => {
    const entries = [0, 0, 0, 0].map(() => e({ isColor: true, line: 7 }));
    const units = groupEntriesForRender(entries);
    expect(units[0]).toMatchObject({ kind: 'color', alpha: true });
    expect(units[0].entries).toHaveLength(4);
  });

  it('does not group across different source lines', () => {
    const entries = [e({ isColor: true, line: 1 }), e({ isColor: true, line: 2 }), e({ isColor: true, line: 3 })];
    const units = groupEntriesForRender(entries);
    expect(units.every(u => u.kind === 'slider')).toBe(true);
    expect(units).toHaveLength(3);
  });

  it('renders odd-length runs (2, 5…) as individual sliders', () => {
    const run2 = [e({ isColor: true, line: 1 }), e({ isColor: true, line: 1 })];
    expect(groupEntriesForRender(run2).every(u => u.kind === 'slider')).toBe(true);

    const run5 = [0, 0, 0, 0, 0].map(() => e({ isColor: true, line: 9 }));
    const units = groupEntriesForRender(run5);
    expect(units).toHaveLength(5);
    expect(units.every(u => u.kind === 'slider')).toBe(true);
  });

  it('keeps non-color entries as plain sliders and groups a color run between them', () => {
    const entries = [
      e({ isColor: false, line: 1 }),
      e({ isColor: true, line: 4 }), e({ isColor: true, line: 4 }), e({ isColor: true, line: 4 }),
      e({ isColor: false, line: 8 }),
    ];
    const units = groupEntriesForRender(entries);
    expect(units.map(u => u.kind)).toEqual(['slider', 'color', 'slider']);
  });

  it('groups a vec2 XY pair (exactly 2 same-line isXY) into an xy unit', () => {
    const entries = [e({ isXY: true, line: 3 }), e({ isXY: true, line: 3 })];
    const units = groupEntriesForRender(entries);
    expect(units).toHaveLength(1);
    expect(units[0].kind).toBe('xy');
    expect(units[0].entries).toHaveLength(2);
  });

  it('does not group a single isXY entry, or three on one line', () => {
    expect(groupEntriesForRender([e({ isXY: true, line: 1 })])[0].kind).toBe('slider');
    const three = [0, 0, 0].map(() => e({ isXY: true, line: 5 }));
    expect(groupEntriesForRender(three).every(u => u.kind === 'slider')).toBe(true);
  });

  it('does not group an XY pair across different lines', () => {
    const entries = [e({ isXY: true, line: 1 }), e({ isXY: true, line: 2 })];
    expect(groupEntriesForRender(entries).every(u => u.kind === 'slider')).toBe(true);
  });

  // §3 "vector/color uniforms expand into individually precise per-channel
  // sliders" — grouping must not drop or average away each channel's own
  // decimals/unit/step precision metadata; every component keeps its own.
  it('preserves each channel entry\'s own decimals/unit/step metadata through grouping', () => {
    const entries = [
      e({ isColor: true, line: 4, decimals: 3, unit: '', step: 0.001 }),
      e({ isColor: true, line: 4, decimals: 0, unit: '', step: 1 }),
      e({ isColor: true, line: 4, decimals: 2, unit: 'a', step: 0.01 }),
    ];
    const [unit] = groupEntriesForRender(entries);
    expect(unit.kind).toBe('color');
    expect(unit.entries.map(x => x.decimals)).toEqual([3, 0, 2]);
    expect(unit.entries.map(x => x.step)).toEqual([0.001, 1, 0.01]);
    expect(unit.entries[2].unit).toBe('a');
  });

  it('preserves per-channel precision metadata for an XY pair too', () => {
    const entries = [
      e({ isXY: true, line: 2, decimals: 4, step: 0.1 }),
      e({ isXY: true, line: 2, decimals: 1, step: 5 }),
    ];
    const [unit] = groupEntriesForRender(entries);
    expect(unit.kind).toBe('xy');
    expect(unit.entries.map(x => x.decimals)).toEqual([4, 1]);
    expect(unit.entries.map(x => x.step)).toEqual([0.1, 5]);
  });
});

describe('slider-color — conversions', () => {
  it('detects normalised vs 8-bit scale', () => {
    expect(detectColorScale([0.5, 0.2, 1.0])).toBe(1);
    expect(detectColorScale([255, 128, 0])).toBe(255);
    expect(detectColorScale([1, 1, 1])).toBe(1);
  });

  it('componentsToHex round-trips with hexToComponents (normalised)', () => {
    const hex = componentsToHex([1, 127 / 255, 0], 1);
    expect(hex.toLowerCase()).toBe('#ff7f00');
    const back = hexToComponents('#ff7f00', 1);
    expect(back[0]).toBeCloseTo(1, 5);
    expect(back[1]).toBeCloseTo(127 / 255, 5);
    expect(back[2]).toBeCloseTo(0, 5);
  });

  it('componentsToHex handles 8-bit scale', () => {
    expect(componentsToHex([255, 0, 128], 255).toLowerCase()).toBe('#ff0080');
  });

  it('hexToComponents rejects malformed input', () => {
    expect(hexToComponents('nope', 1)).toBeNull();
    expect(hexToComponents('#abc', 1)).toBeNull();
    expect(hexToComponents('#12345g', 1)).toBeNull();
  });

  it('componentsToHex clamps out-of-range values', () => {
    expect(componentsToHex([2.0, -1.0, 0.5], 1).toLowerCase()).toBe('#ff0080');
  });
});
