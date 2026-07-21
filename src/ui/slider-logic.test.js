import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../gl/renderer.js', () => ({
  applyGLShader: vi.fn(),
}));

import { state } from '../core/state.js';
import { parseShader } from '../shader/parser.js';
import { applyGLShader } from '../gl/renderer.js';
import { patchLine, fmtNum, setFromMonaco } from './slider-logic.js';

// ── Minimal Monaco model stub ─────────────────────────────────────────────
// Lines are 1-indexed for the public API (mirrors monaco.editor.ITextModel),
// matching how patchLine/parseShader interact (parseShader's `line` is
// 0-based, patchLine converts with `+1`).
function makeModel(initialLines) {
  const lines = initialLines.slice();
  return {
    getLineContent: (ln) => lines[ln - 1] ?? '',
    getValue: () => lines.join('\n'),
    pushEditOperations: (_before, edits) => {
      for (const { range, text } of edits) {
        const li = range.startLineNumber - 1;
        const line = lines[li];
        const before = line.slice(0, range.startColumn - 1);
        const after = line.slice(range.endColumn - 1);
        lines[li] = before + text + after;
      }
      return [];
    },
    // Test-only helper: mutate a line directly, bypassing patchLine, to
    // simulate an external edit (e.g. the user typing in Monaco) that the
    // slider entry hasn't been resynced against yet.
    _setLine: (ln, text) => { lines[ln - 1] = text; },
  };
}

function setEditor(model) {
  state.editor = { getModel: () => model, getValue: () => model.getValue() };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  setFromMonaco(false);
  state.editor = null;
  state.vars = [];
  state.pinnedIds = new Set();
});

// ── fmtNum ───────────────────────────────────────────────────────────────

describe('ui/slider-logic — fmtNum', () => {
  it('formats with the entry decimal count', () => {
    expect(fmtNum(3.14159, { decimals: 2 })).toBe('3.14');
    expect(fmtNum(2, { decimals: 3 })).toBe('2.000');
  });

  it('clamps decimals to at least 1 when decimals > 0', () => {
    // toFixed(Math.max(1, decimals)) — guards against a stray decimals:0.4 etc.
    expect(fmtNum(2, { decimals: 1 })).toBe('2.0');
  });

  it('rounds to an integer string when decimals is 0', () => {
    expect(fmtNum(4.6, { decimals: 0 })).toBe('5');
    expect(fmtNum(-1.2, { decimals: 0 })).toBe('-1');
  });

  it('formats scientific notation and strips the "+" sign', () => {
    expect(fmtNum(1500, { isScientific: true, scientificDecimals: 2 })).toBe('1.50e3');
  });

  it('keeps negative exponents as-is', () => {
    expect(fmtNum(0.0015, { isScientific: true, scientificDecimals: 2 })).toBe('1.50e-3');
  });

  it('defaults missing scientificDecimals to 0', () => {
    expect(fmtNum(2, { isScientific: true })).toBe('2e0');
  });
});

// ── patchLine — happy path ───────────────────────────────────────────────

describe('ui/slider-logic — patchLine (stable token)', () => {
  it('writes the formatted value back into the model at the entry position', () => {
    const code = '#define SPEED 1.5';
    const [e] = parseShader(code);
    const model = makeModel([code]);
    setEditor(model);

    e.value = 2;
    patchLine(e);

    expect(model.getLineContent(1)).toBe('#define SPEED 2.0');
  });

  it('updates the entry tokenRaw/matchLen after a same-length replacement', () => {
    const code = '#define SPEED 1.5';
    const [e] = parseShader(code);
    const model = makeModel([code]);
    setEditor(model);

    e.value = 2;
    patchLine(e);

    expect(e.tokenRaw).toBe('2.0');
    expect(e.matchLen).toBe(3);
  });

  it('shifts the column of later same-line entries when the new text is longer', () => {
    const code = 'float x = 1.5 + 22.0;';
    const [e0, e1] = parseShader(code);
    const model = makeModel([code]);
    setEditor(model);
    state.vars = [e0, e1];

    e0.value = 100; // "1.5" (len 3) -> "100.0" (len 5), delta +2
    patchLine(e0);

    expect(model.getLineContent(1)).toBe('float x = 100.0 + 22.0;');
    expect(e1.col).toBe(/* original col 16 */ 16 + 2);
    // the shifted entry's token is still correctly located
    const shiftedRaw = model.getLineContent(1).slice(e1.col, e1.col + e1.matchLen);
    expect(shiftedRaw).toBe('22.0');
  });

  it('schedules a debounced recompile via applyGLShader', () => {
    vi.useFakeTimers();
    const code = '#define SPEED 1.5';
    const [e] = parseShader(code);
    const model = makeModel([code]);
    setEditor(model);

    e.value = 3;
    patchLine(e);
    expect(applyGLShader).not.toHaveBeenCalled();

    vi.advanceTimersByTime(80);
    expect(applyGLShader).toHaveBeenCalledWith('#define SPEED 3.0');
    vi.useRealTimers();
  });
});

// ── patchLine — guards ───────────────────────────────────────────────────

describe('ui/slider-logic — patchLine (guards)', () => {
  it('is a no-op when there is no editor', () => {
    state.editor = null;
    expect(() => patchLine({ line: 0, col: 0, matchLen: 1, value: 1, decimals: 0 })).not.toThrow();
  });

  it('is a no-op while a Monaco-originated sync is in progress', () => {
    const code = '#define SPEED 1.5';
    const [e] = parseShader(code);
    const model = makeModel([code]);
    setEditor(model);
    setFromMonaco(true);

    e.value = 9;
    patchLine(e);

    expect(model.getLineContent(1)).toBe(code);
    setFromMonaco(false);
  });
});

// ── patchLine — token drift / resync ──────────────────────────────────────

describe('ui/slider-logic — patchLine (token drift & resync)', () => {
  it('resyncs the entry against a fresh parse when its column has drifted, then patches', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const original = ['#define A 1.0', '#define SPEED 1.5'];
    const entries = parseShader(original.join('\n'));
    const e = entries[1]; // SPEED
    expect(e.tokenRaw).toBe('1.5');

    const model = makeModel(original);
    setEditor(model);

    // Simulate an external edit on the entry's own line that shifts the
    // value's column without the entry being told about it (stale col/matchLen).
    model._setLine(2, '#define SPEEDX 1.5');

    e.value = 9;
    patchLine(e);

    expect(model.getLineContent(2)).toBe('#define SPEEDX 9.0');
    expect(warn).not.toHaveBeenCalled();
  });

  it('skips the patch and warns when the drifted entry cannot be resynced (id no longer present)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const code = '#define SPEED 1.5';
    const [e] = parseShader(code);
    e.id = 'v999'; // forces _syncEntryFromModel's reparse lookup to fail
    const model = makeModel([code]);
    setEditor(model);

    // Drift the stale column so the stability check fails and a resync is attempted.
    model._setLine(1, '#define SPEEDX 1.5');

    e.value = 9;
    patchLine(e);

    expect(model.getLineContent(1)).toBe('#define SPEEDX 1.5'); // unchanged
    expect(warn).toHaveBeenCalledWith('[patchLine] token drift detected and could not resync entry');
  });
});
