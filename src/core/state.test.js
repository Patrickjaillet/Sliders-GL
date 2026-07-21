import { afterEach, describe, expect, it, vi } from 'vitest';
import { state, subscribe, notify, setState, getState, setStateBatched } from './state.js';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function cleanupKey(key) {
  const keys = key.split('.');
  const lastKey = keys.pop();
  const obj = keys.reduce((acc, k) => acc[k], state);
  obj[lastKey] = undefined;
}

// --------------------------------------------------------------------------
// subscribe / notify
// --------------------------------------------------------------------------

describe('subscribe / notify', () => {
  it('subscribe returns an unsubscribe function', () => {
    const unsub = subscribe('paused', () => {});
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('notified callback receives the published value', () => {
    const received = [];
    const unsub = subscribe('paused', (v) => received.push(v));
    notify('paused', true);
    notify('paused', false);
    unsub();
    expect(received).toEqual([true, false]);
  });

  it('multiple subscribers on the same key all receive the value', () => {
    const a = [];
    const b = [];
    const u1 = subscribe('theme', (v) => a.push(v));
    const u2 = subscribe('theme', (v) => b.push(v));
    notify('theme', 'light');
    u1();
    u2();
    expect(a).toEqual(['light']);
    expect(b).toEqual(['light']);
  });

  it('unsubscribed callback is not called after removal', () => {
    const calls = [];
    const unsub = subscribe('theme', (v) => calls.push(v));
    unsub();
    notify('theme', 'light');
    expect(calls).toHaveLength(0);
  });

  it('notify on a key with no subscribers does not throw', () => {
    expect(() => notify('__no_such_key__', 42)).not.toThrow();
  });

  it('a callback that throws does not prevent others from being called', () => {
    const ok = [];
    const u1 = subscribe('paused', () => { throw new Error('boom'); });
    const u2 = subscribe('paused', (v) => ok.push(v));
    expect(() => notify('paused', true)).not.toThrow();
    expect(ok).toEqual([true]);
    u1();
    u2();
  });

  it('subscribing the same function twice results in it being called twice', () => {
    const calls = [];
    const fn = (v) => calls.push(v);
    const u1 = subscribe('paused', fn);
    const u2 = subscribe('paused', fn);
    notify('paused', 99);
    u1();
    u2();
    expect(calls).toEqual([99, 99]);
  });
});

// --------------------------------------------------------------------------
// setState
// --------------------------------------------------------------------------

describe('setState', () => {
  it('updates a top-level key', () => {
    setState('paused', true);
    expect(state.paused).toBe(true);
    setState('paused', false);
  });

  it('updates a nested key using dot notation', () => {
    setState('ai.loadProgress', 120);
    expect(state.ai.loadProgress).toBe(120);
  });

  it('triggers subscribers synchronously', () => {
    const calls = [];
    const unsub = subscribe('paused', (v) => calls.push(v));
    setState('paused', true);
    expect(calls).toEqual([true]);
    unsub();
    setState('paused', false);
  });

  it('subscribers receive exact value passed to setState', () => {
    const received = [];
    const unsub = subscribe('paused', (v) => received.push(v));
    setState('paused', false);
    setState('paused', true);
    unsub();
    expect(received).toEqual([false, true]);
  });

  it('setting the same value twice fires the subscriber twice', () => {
    const calls = [];
    const unsub = subscribe('paused', (v) => calls.push(v));
    setState('paused', false);
    setState('paused', false);
    unsub();
    expect(calls).toHaveLength(2);
    setState('paused', false);
  });
});

// --------------------------------------------------------------------------
// getState
// --------------------------------------------------------------------------

describe('getState', () => {
  it('reads a top-level key', () => {
    state.paused = false;
    expect(getState('paused')).toBe(false);
  });

  it('reads a nested key via dot notation', () => {
    state.ai.loadProgress = 30;
    expect(getState('ai.loadProgress')).toBe(30);
  });

  it('returns undefined for a missing key', () => {
    expect(getState('nonexistent')).toBeUndefined();
  });

  it('returns undefined safely for a missing nested key', () => {
    expect(getState('nonexistent.deep.key')).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// setStateBatched
// --------------------------------------------------------------------------

describe('setStateBatched', () => {
  it('updates the state value synchronously', () => {
    setStateBatched('paused', true);
    expect(state.paused).toBe(true);
    state.paused = false;
  });

  it('batches multiple updates and calls subscriber once per microtask flush', async () => {
    const calls = [];
    const unsub = subscribe('paused', (v) => calls.push(v));

    setStateBatched('paused', true);
    setStateBatched('paused', false);
    setStateBatched('paused', true);

    expect(calls).toHaveLength(0);
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(true);

    unsub();
    state.paused = false;
  });

  it('last write wins when the same key is batched multiple times', async () => {
    const received = [];
    const unsub = subscribe('paused', (v) => received.push(v));

    setStateBatched('paused', false);
    setStateBatched('paused', true);
    setStateBatched('paused', false);

    await Promise.resolve();
    expect(received).toEqual([false]);

    unsub();
    state.paused = false;
  });
});

// --------------------------------------------------------------------------
// initial state shape
// --------------------------------------------------------------------------

describe('initial state shape', () => {
  it('pinnedIds is a Set', () => {
    expect(state.pinnedIds).toBeInstanceOf(Set);
  });

  it('channels is an array of length 4', () => {
    expect(Array.isArray(state.channels)).toBe(true);
    expect(state.channels).toHaveLength(4);
  });

  it('each channel has an index matching its position', () => {
    for (let i = 0; i < 4; i++) {
      expect(state.channels[i].i).toBe(i);
      expect(state.channels[i].type).toBe('none');
    }
  });

  it('multipass state has the expected pass keys', () => {
    const expectedPasses = ['bufA', 'bufB', 'bufC', 'bufD', 'cubeA', 'cubeB', 'sound', 'image'];
    for (const p of expectedPasses) {
      expect(state.mp.passes).toHaveProperty(p);
    }
  });

  it('image pass is enabled by default, other buffer passes are not', () => {
    expect(state.mp.passes.image.enabled).toBe(true);
    expect(state.mp.passes.bufA.enabled).toBe(false);
    expect(state.mp.passes.bufB.enabled).toBe(false);
  });

  it('all callbacks initialise to null', () => {
    for (const [key, val] of Object.entries(state.callbacks)) {
      expect(val, `state.callbacks.${key} should be null`).toBeNull();
    }
  });
});
