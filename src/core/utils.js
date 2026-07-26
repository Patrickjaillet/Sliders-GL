export function clampPct(v, min, max) {
  return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100)).toFixed(2);
}

export function fmtN(v, d) {
  return parseFloat(v).toFixed(Math.max(0, d));
}

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escAttr(s) {
  return esc(s).replace(/'/g, '&#39;');
}

export function encArg(s) {
  return encodeURIComponent(String(s));
}

// Phase R — shared FPS color threshold, used by both raf-loop.js and renderer.js
// (which independently update #fpspill depending on which render path is active).
export function fpsColorClass(fps) {
  if (fps >= 50) return 'fps-good';
  if (fps >= 30) return 'fps-warn';
  return 'fps-bad';
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const LOCAL_STORAGE_SCHEMA_VERSION = 'v3';

export function getVersionedLocalKey(key) {
  const rawKey = String(key);
  if (!rawKey.startsWith('sl_')) return rawKey;
  return `sl_${LOCAL_STORAGE_SCHEMA_VERSION}_${rawKey.slice(3)}`;
}

export function safeLocalGet(key, fallback = null) {
  try {
    const versionedKey = getVersionedLocalKey(key);
    const currentValue = localStorage.getItem(versionedKey);
    if (currentValue !== null) return currentValue;

    if (versionedKey !== key) {
      const legacyValue = localStorage.getItem(key);
      if (legacyValue !== null) {
        localStorage.setItem(versionedKey, legacyValue);
        localStorage.removeItem(key);
        return legacyValue;
      }
    }

    return fallback;
  } catch (_) {
    return fallback;
  }
}

export function safeLocalSet(key, val) {
  try {
    const versionedKey = getVersionedLocalKey(key);
    localStorage.setItem(versionedKey, val);
    if (versionedKey !== key) localStorage.removeItem(key);
  } catch (_) {
    return undefined;
  }
}

export function safeLocalRemove(key) {
  try {
    const versionedKey = getVersionedLocalKey(key);
    localStorage.removeItem(versionedKey);
    if (versionedKey !== key) localStorage.removeItem(key);
  } catch (_) {
    return undefined;
  }
}
