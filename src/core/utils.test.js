import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clampPct,
  fmtN,
  esc,
  escAttr,
  encArg,
  debounce,
  getVersionedLocalKey,
  LOCAL_STORAGE_SCHEMA_VERSION,
  safeLocalGet,
  safeLocalSet,
  safeLocalRemove,
} from './utils.js';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function createStorageMock() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    _store: store,
  };
}

function withMockStorage(storage, fn) {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  try { fn(); } finally {
    if (prev) Object.defineProperty(globalThis, 'localStorage', prev);
    else delete globalThis.localStorage;
  }
}

// --------------------------------------------------------------------------
// clampPct
// --------------------------------------------------------------------------

describe('clampPct', () => {
  it('returns 50.00 for midpoint', () => {
    expect(clampPct(5, 0, 10)).toBe('50.00');
  });

  it('clamps to 0.00 below minimum', () => {
    expect(clampPct(-5, 0, 10)).toBe('0.00');
  });

  it('clamps to 100.00 above maximum', () => {
    expect(clampPct(15, 0, 10)).toBe('100.00');
  });

  it('returns 0.00 at exact minimum', () => {
    expect(clampPct(0, 0, 10)).toBe('0.00');
  });

  it('returns 100.00 at exact maximum', () => {
    expect(clampPct(10, 0, 10)).toBe('100.00');
  });

  it('works with non-zero minimum', () => {
    expect(clampPct(15, 10, 20)).toBe('50.00');
  });

  it('result is always a string with 2 decimals', () => {
    const result = clampPct(3, 0, 10);
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^\d+\.\d{2}$/);
  });
});

// --------------------------------------------------------------------------
// fmtN
// --------------------------------------------------------------------------

describe('fmtN', () => {
  it('formats to 2 decimal places', () => {
    expect(fmtN(1.23456, 2)).toBe('1.23');
  });

  it('formats to 0 decimal places', () => {
    expect(fmtN(1.9, 0)).toBe('2');
  });

  it('accepts string numbers', () => {
    expect(fmtN('3.14159', 3)).toBe('3.142');
  });

  it('negative decimals treated as 0', () => {
    expect(fmtN(1.9, -1)).toBe('2');
  });

  it('handles zero correctly', () => {
    expect(fmtN(0, 2)).toBe('0.00');
  });

  it('handles negative values', () => {
    expect(fmtN(-1.5, 1)).toBe('-1.5');
  });
});

// --------------------------------------------------------------------------
// esc
// --------------------------------------------------------------------------

describe('esc', () => {
  it('escapes ampersand', () => {
    expect(esc('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than', () => {
    expect(esc('<b>')).toBe('&lt;b&gt;');
  });

  it('escapes double quote', () => {
    expect(esc('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes all special chars together', () => {
    expect(esc('<a & b>"')).toBe('&lt;a &amp; b&gt;&quot;');
  });

  it('returns plain string unchanged', () => {
    expect(esc('hello world')).toBe('hello world');
  });

  it('coerces non-string input via String()', () => {
    expect(esc(42)).toBe('42');
    expect(esc(null)).toBe('null');
  });
});

// --------------------------------------------------------------------------
// escAttr
// --------------------------------------------------------------------------

describe('escAttr', () => {
  it('also escapes single quote', () => {
    expect(escAttr("a'b")).toBe('a&#39;b');
  });

  it('escapes all html chars plus single quote', () => {
    expect(escAttr("<a>'\"")).toBe('&lt;a&gt;&#39;&quot;');
  });

  it('leaves safe strings unchanged', () => {
    expect(escAttr('hello')).toBe('hello');
  });
});

// --------------------------------------------------------------------------
// encArg
// --------------------------------------------------------------------------

describe('encArg', () => {
  it('encodes spaces and slashes', () => {
    expect(encArg('a b/c')).toBe('a%20b%2Fc');
  });

  it('coerces numbers to string', () => {
    expect(encArg(42)).toBe('42');
  });

  it('encodes special URI characters', () => {
    expect(encArg('a+b=c&d')).toBe('a%2Bb%3Dc%26d');
  });
});

// --------------------------------------------------------------------------
// debounce
// --------------------------------------------------------------------------

describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does not call the function before the delay', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);
    debouncedFn();
    expect(fn).not.toHaveBeenCalled();
  });

  it('calls the function after the delay', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);
    debouncedFn();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets the timer on repeated calls', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);
    debouncedFn();
    vi.advanceTimersByTime(50);
    debouncedFn();
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes the last arguments to the function', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);
    debouncedFn('first');
    debouncedFn('second');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('second');
  });
});

// --------------------------------------------------------------------------
// getVersionedLocalKey
// --------------------------------------------------------------------------

describe('getVersionedLocalKey', () => {
  it('prefixes sl_ keys with the schema version', () => {
    const key = getVersionedLocalKey('sl_theme');
    expect(key).toBe(`sl_${LOCAL_STORAGE_SCHEMA_VERSION}_theme`);
  });

  it('returns non-sl_ keys unchanged', () => {
    expect(getVersionedLocalKey('some_other_key')).toBe('some_other_key');
    expect(getVersionedLocalKey('foo')).toBe('foo');
  });

  it('handles empty suffix after sl_', () => {
    const key = getVersionedLocalKey('sl_');
    expect(key).toBe(`sl_${LOCAL_STORAGE_SCHEMA_VERSION}_`);
  });
});

// --------------------------------------------------------------------------
// safeLocalGet / safeLocalSet / safeLocalRemove — with mock storage
// --------------------------------------------------------------------------

describe('safeLocalGet', () => {
  it('returns fallback when key is absent', () => {
    const storage = createStorageMock();
    withMockStorage(storage, () => {
      expect(safeLocalGet('sl_missing', 'default')).toBe('default');
    });
  });

  it('returns stored value when versioned key is present', () => {
    const storage = createStorageMock();
    withMockStorage(storage, () => {
      safeLocalSet('sl_theme', 'light');
      expect(safeLocalGet('sl_theme', 'dark')).toBe('light');
    });
  });

  it('migrates legacy unversioned keys to versioned keys', () => {
    const storage = createStorageMock();
    withMockStorage(storage, () => {
      storage.setItem('sl_theme', 'light');
      const result = safeLocalGet('sl_theme', 'dark');
      expect(result).toBe('light');
      expect(storage.getItem(getVersionedLocalKey('sl_theme'))).toBe('light');
      expect(storage.getItem('sl_theme')).toBeNull();
    });
  });

  it('returns fallback when localStorage throws', () => {
    const broken = { getItem() { throw new Error('nope'); } };
    withMockStorage(broken, () => {
      expect(safeLocalGet('sl_theme', 'dark')).toBe('dark');
    });
  });
});

describe('safeLocalSet', () => {
  it('stores value under the versioned key', () => {
    const storage = createStorageMock();
    withMockStorage(storage, () => {
      safeLocalSet('sl_theme', 'dark');
      expect(storage.getItem(getVersionedLocalKey('sl_theme'))).toBe('dark');
    });
  });

  it('removes legacy key after migrating', () => {
    const storage = createStorageMock();
    withMockStorage(storage, () => {
      storage.setItem('sl_theme', 'light');
      safeLocalSet('sl_theme', 'dark');
      expect(storage.getItem('sl_theme')).toBeNull();
    });
  });

  it('does not throw when localStorage is unavailable', () => {
    const broken = { setItem() { throw new Error('full'); }, removeItem() {} };
    withMockStorage(broken, () => {
      expect(() => safeLocalSet('sl_theme', 'dark')).not.toThrow();
    });
  });
});

describe('safeLocalRemove', () => {
  it('removes the versioned key', () => {
    const storage = createStorageMock();
    withMockStorage(storage, () => {
      safeLocalSet('sl_theme', 'dark');
      safeLocalRemove('sl_theme');
      expect(storage.getItem(getVersionedLocalKey('sl_theme'))).toBeNull();
    });
  });

  it('also removes any legacy unversioned key', () => {
    const storage = createStorageMock();
    withMockStorage(storage, () => {
      storage.setItem('sl_theme', 'light');
      safeLocalRemove('sl_theme');
      expect(storage.getItem('sl_theme')).toBeNull();
    });
  });

  it('does not throw when localStorage is unavailable', () => {
    const broken = { removeItem() { throw new Error('nope'); } };
    withMockStorage(broken, () => {
      expect(() => safeLocalRemove('sl_theme')).not.toThrow();
    });
  });
});
