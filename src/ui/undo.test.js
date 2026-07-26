import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let resetSliderHistory;
let slPushHistory;
let slUndo;
let slRedo;
let slHistory;
let getSlHistIdx;

beforeAll(async () => {
  globalThis.window = globalThis;
  globalThis.document = {
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
  };

  const mod = await import('./undo.js');
  resetSliderHistory = mod.resetSliderHistory;
  slPushHistory      = mod.slPushHistory;
  slUndo             = mod.slUndo;
  slRedo             = mod.slRedo;
  slHistory          = mod.slHistory;

  Object.defineProperty(globalThis, '__undoIdx__', {
    configurable: true,
    get: () => mod.slHistIdx,
  });

  getSlHistIdx = () => mod.slHistIdx;
});

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function advance(ms = 1000) {
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + ms);
}

describe('ui/undo — slPushHistory', () => {
  beforeEach(() => {
    resetSliderHistory();
    vi.restoreAllMocks();
  });

  it('adds an entry to the history', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    slPushHistory('v0', 0, 1);
    expect(slHistory).toHaveLength(1);
    expect(slHistory[0]).toEqual({ id: 'v0', oldVal: 0, newVal: 1 });
  });

  it('index moves forward on each distinct push', () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => { now += 1000; return now; });
    slPushHistory('v0', 0, 1);
    slPushHistory('v1', 0, 2);
    expect(getSlHistIdx()).toBe(1);
  });

  it('coalesces rapid changes on the same slider within 500 ms', () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1200);
    slPushHistory('v0', 0, 0.25);
    slPushHistory('v0', 0.25, 0.5);
    expect(slHistory).toHaveLength(1);
    expect(slHistory[0]).toEqual({ id: 'v0', oldVal: 0, newVal: 0.5 });
  });

  it('does NOT coalesce after 500 ms gap', () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1600);
    slPushHistory('v0', 0, 0.5);
    slPushHistory('v0', 0.5, 1.0);
    expect(slHistory).toHaveLength(2);
  });

  it('does NOT coalesce different slider ids', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    slPushHistory('v0', 0, 1);
    slPushHistory('v1', 0, 1);
    expect(slHistory).toHaveLength(2);
  });

  it('trims forward history when pushing after undo', () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => { now += 1000; return now; });
    slPushHistory('v0', 0, 1);
    slPushHistory('v1', 0, 2);
    slUndo();
    slPushHistory('v2', 0, 3);
    expect(slHistory).toHaveLength(2);
    expect(slHistory[1].id).toBe('v2');
  });

  it('caps history at 100 entries', () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => { now += 1000; return now; });
    for (let i = 0; i < 105; i++) slPushHistory(`v${i}`, i, i + 1);
    expect(slHistory).toHaveLength(100);
  });

  it('keeps the index aligned when capping at 100', () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => { now += 1000; return now; });
    for (let i = 0; i < 101; i++) slPushHistory(`v${i}`, i, i + 1);
    expect(slHistory).toHaveLength(100);
    expect(getSlHistIdx()).toBe(99);
    expect(slHistory[0].id).toBe('v1');
    expect(slHistory.at(-1).id).toBe('v100');
  });
});

// --------------------------------------------------------------------------
// slUndo / slRedo — structural tests (no DOM / applySliderValue side-effects)
// --------------------------------------------------------------------------

describe('ui/undo — slUndo & slRedo (index management)', () => {
  beforeEach(() => {
    resetSliderHistory();
    vi.restoreAllMocks();
  });

  it('slUndo decrements the index', () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => { now += 1000; return now; });
    slPushHistory('v0', 0, 1);
    slPushHistory('v1', 1, 2);
    slUndo();
    expect(getSlHistIdx()).toBe(0);
  });

  it('slUndo does nothing when index is already -1', () => {
    expect(() => slUndo()).not.toThrow();
    expect(getSlHistIdx()).toBe(-1);
  });

  it('slRedo increments the index after undo', () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => { now += 1000; return now; });
    slPushHistory('v0', 0, 1);
    slPushHistory('v1', 1, 2);
    slUndo();
    slRedo();
    expect(getSlHistIdx()).toBe(1);
  });

  it('slRedo does nothing when at the tip of history', () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => { now += 1000; return now; });
    slPushHistory('v0', 0, 1);
    expect(() => slRedo()).not.toThrow();
    expect(getSlHistIdx()).toBe(0);
  });

  it('multiple undos move index back correctly', () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => { now += 1000; return now; });
    slPushHistory('v0', 0, 1);
    slPushHistory('v1', 1, 2);
    slPushHistory('v2', 2, 3);
    slUndo();
    slUndo();
    expect(getSlHistIdx()).toBe(0);
  });

  it('undo then redo returns to tip', () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => { now += 1000; return now; });
    slPushHistory('v0', 0, 1);
    slPushHistory('v1', 1, 2);
    slUndo();
    slUndo();
    slRedo();
    slRedo();
    expect(getSlHistIdx()).toBe(1);
  });

  it('cannot undo past index -1', () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => { now += 1000; return now; });
    slPushHistory('v0', 0, 1);
    slUndo();
    slUndo();
    slUndo();
    expect(getSlHistIdx()).toBe(-1);
  });
});

// --------------------------------------------------------------------------
// resetSliderHistory
// --------------------------------------------------------------------------

describe('ui/undo — resetSliderHistory', () => {
  it('empties the history array', () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => { now += 1000; return now; });
    slPushHistory('v0', 0, 1);
    resetSliderHistory();
    expect(slHistory).toHaveLength(0);
  });

  it('resets the index to -1', () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => { now += 1000; return now; });
    slPushHistory('v0', 0, 1);
    resetSliderHistory();
    expect(getSlHistIdx()).toBe(-1);
  });

  it('allows coalescing to start fresh after reset', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    slPushHistory('v0', 0, 0.5);
    resetSliderHistory();
    vi.spyOn(Date, 'now').mockReturnValue(1100);
    slPushHistory('v0', 0.5, 1.0);
    expect(slHistory).toHaveLength(1);
    expect(slHistory[0].oldVal).toBe(0.5);
  });
});
