/**
 * src/render/shader-cache.js
 *
 * Phase 1.3 — Shader Compilation Caching
 *
 * Hashes the GLSL source with FNV-1a (fast, non-cryptographic, string-friendly)
 * and skips the WebGL recompile when the hash matches the previously compiled source.
 *
 * The cache stores the *wrapped* fragment source (post-`wrapFrag`) to ensure
 * preamble changes (e.g. new channel uniforms) also trigger recompilation.
 *
 * Usage:
 *   import { shaderNeedsRecompile, markCompiled } from '../render/shader-cache.js';
 *
 *   const wrapped = wrapFrag(userCode);
 *   if (!shaderNeedsRecompile(wrapped)) return true; // already compiled — skip
 *   // ... compile ...
 *   markCompiled(wrapped);
 */

// ─── FNV-1a 32-bit hash ───────────────────────────────────────────────────────
// Chosen for: single-pass O(n) string scan, no dependencies, < 20 bytes of state.
// 32-bit output is sufficient — collisions on shader text are astronomically unlikely.

const FNV_PRIME  = 0x01000193;  // 16777619
const FNV_OFFSET = 0x811c9dc5;  // 2166136261

/**
 * FNV-1a hash of a string. Returns a hex string.
 * @param {string} str
 * @returns {string}  8-character hex digest
 */
export function hashGLSL(str) {
  let h = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // Unsigned 32-bit multiply — Math.imul avoids 64-bit overflow
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ─── Cache state ──────────────────────────────────────────────────────────────

/** Hash of the last successfully compiled wrapped fragment source. */
let _lastHash = '';

/** Number of recompiles skipped (telemetry). */
let _skippedCount = 0;

/** Number of recompiles performed. */
let _compiledCount = 0;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns `true` if the wrapped source differs from the last compiled version
 * (i.e. recompilation is needed).
 *
 * Call this *before* the WebGL compile path. If it returns `false`,
 * skip compilation and return `true` (success, cached).
 *
 * @param {string} wrappedSource  — output of `wrapFrag(userCode)`
 * @returns {boolean}  `true` → must recompile; `false` → cache hit, skip
 */
export function shaderNeedsRecompile(wrappedSource) {
  const h = hashGLSL(wrappedSource);
  if (h === _lastHash) {
    _skippedCount++;
    return false;
  }
  return true;
}

/**
 * Record that the wrapped source was successfully compiled.
 * Call this *after* a successful WebGL compile to prime the cache.
 *
 * @param {string} wrappedSource
 */
export function markCompiled(wrappedSource) {
  _lastHash = hashGLSL(wrappedSource);
  _compiledCount++;
}

/** Invalidate the cache (e.g. after renderer recreation). */
export function invalidateCache() {
  _lastHash = '';
}

/**
 * Cache hit/miss statistics for the perf panel.
 * @returns {{ compiled: number, skipped: number, hitRate: string }}
 */
export function getCacheStats() {
  const total = _compiledCount + _skippedCount;
  const hitRate = total ? ((_skippedCount / total) * 100).toFixed(0) + '%' : '—';
  return { compiled: _compiledCount, skipped: _skippedCount, hitRate };
}

// ─── Persistent GPU cache ──────────────────────────────────────────────────────
// Persists the last-known-good hash to localStorage so cache survives page reload.
// On reload, if the editor still contains the same shader, recompilation is skipped.

const _PERSIST_KEY = 'zgl_shader_cache_v1';

/**
 * Serialize the current cache state to localStorage.
 * Call this after a successful compile to persist the good-hash.
 */
export function persistCacheToStorage() {
  try {
    localStorage.setItem(_PERSIST_KEY, JSON.stringify({ hash: _lastHash }));
  } catch { /* noop — storage full or unavailable */ }
}

/**
 * Restore the previously persisted cache state from localStorage.
 * Call this once at startup before the first compile.
 */
export function restoreCacheFromStorage() {
  try {
    const raw = localStorage.getItem(_PERSIST_KEY);
    if (!raw) return;
    const { hash } = JSON.parse(raw);
    if (typeof hash === 'string' && hash.length === 8) _lastHash = hash;
  } catch { /* noop */ }
}

// ─── Safe compile mode ────────────────────────────────────────────────────────
// Compiles a candidate shader in the background; switches only on success.
// This eliminates the visible "flash of error" while the user is typing.

let _safeCompilePending = false;

/**
 * Returns true if a background safe-compile is in progress.
 */
export function isSafeCompilePending() { return _safeCompilePending; }

/**
 * Try to compile `wrappedSrc` using `compileFn`. Only calls `onSuccess` if
 * compilation reports no errors; always calls `onError` (with the log) if it
 * fails. The current live shader is never touched on failure.
 *
 * @param {string}   wrappedSrc  Output of wrapFrag(userCode).
 * @param {(src: string) => string|null} compileFn  Returns error log or null on success.
 * @param {() => void}   onSuccess  Called when compile succeeds.
 * @param {(log: string) => void} [onError]  Called on compile error.
 */
export function trySafeCompile(wrappedSrc, compileFn, onSuccess, onError) {
  if (_safeCompilePending) return;
  _safeCompilePending = true;

  // Use a microtask so the call stack returns before the (potentially heavy) compile.
  Promise.resolve().then(() => {
    try {
      const log = compileFn(wrappedSrc);
      if (!log) {
        markCompiled(wrappedSrc);
        persistCacheToStorage();
        onSuccess();
      } else {
        if (typeof onError === 'function') onError(log);
      }
    } finally {
      _safeCompilePending = false;
    }
  });
}
