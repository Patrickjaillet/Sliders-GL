/**
 * src/render/gpu-program-cache.test.js
 *
 * Tests unitaires — Phase 22.2 : Cache persistant de programmes GPU
 *
 * On mock IndexedDB avec `fake-indexeddb` (disponible dans le projet via vitest).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

import {
  initGpuCache,
  isCached,
  recordSuccess,
  shaderCacheKey,
  purgeStalEntries,
  clearGpuCache,
  getGpuCacheStats,
  _resetForTests,
} from './gpu-program-cache.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const GPU_VENDOR   = 'NVIDIA Corporation';
const GPU_RENDERER = 'GeForce RTX 4090/PCIe/SSE2';
const SRC_SIMPLE   = 'void main() { gl_FragColor = vec4(1.0); }';
const SRC_OTHER    = 'void main() { gl_FragColor = vec4(0.0); }';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function freshInit(renderer = GPU_RENDERER, vendor = GPU_VENDOR) {
  _resetForTests(); // reset singleton state so a new IDB connection is opened
  await initGpuCache(renderer, vendor);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('shaderCacheKey', () => {
  it('returns a 64-char hex string', async () => {
    const key = await shaderCacheKey(SRC_SIMPLE);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different keys for different sources', async () => {
    const k1 = await shaderCacheKey(SRC_SIMPLE);
    const k2 = await shaderCacheKey(SRC_OTHER);
    expect(k1).not.toBe(k2);
  });

  it('produces the same key for identical sources', async () => {
    const k1 = await shaderCacheKey(SRC_SIMPLE);
    const k2 = await shaderCacheKey(SRC_SIMPLE);
    expect(k1).toBe(k2);
  });
});

describe('isCached / recordSuccess', () => {
  beforeEach(() => freshInit());

  it('returns false for a never-seen shader', async () => {
    const key = await shaderCacheKey(SRC_SIMPLE);
    expect(await isCached(key)).toBe(false);
  });

  it('returns true after recordSuccess', async () => {
    const key = await shaderCacheKey(SRC_SIMPLE);
    await recordSuccess(key, SRC_SIMPLE);
    expect(await isCached(key)).toBe(true);
  });

  it('returns false for a different shader even after another is cached', async () => {
    const k1 = await shaderCacheKey(SRC_SIMPLE);
    const k2 = await shaderCacheKey(SRC_OTHER);
    await recordSuccess(k1, SRC_SIMPLE);
    expect(await isCached(k2)).toBe(false);
  });
});

describe('purgeStalEntries', () => {
  it('cache miss after switching GPU (stale entries purged on init)', async () => {
    // Record with GPU A
    await freshInit('GPU-A', 'Vendor-A');
    const key = await shaderCacheKey(SRC_SIMPLE);
    await recordSuccess(key, SRC_SIMPLE);
    // Confirm cached under GPU A
    expect(await isCached(key)).toBe(true);

    // Switch to GPU B — initGpuCache calls purgeStalEntries internally
    await freshInit('GPU-B', 'Vendor-B');
    // The entry was written for GPU-A fingerprint, so it should not be visible
    expect(await isCached(key)).toBe(false);
  });

  it('explicit purgeStalEntries returns 0 when cache already clean', async () => {
    await freshInit('GPU-C', 'Vendor-C');
    const { purged } = await purgeStalEntries();
    // Nothing to purge — cache was already clean after freshInit
    expect(purged).toBe(0);
  });
});

describe('clearGpuCache', () => {
  beforeEach(() => freshInit());

  it('removes all entries', async () => {
    const k1 = await shaderCacheKey(SRC_SIMPLE);
    const k2 = await shaderCacheKey(SRC_OTHER);
    await recordSuccess(k1, SRC_SIMPLE);
    await recordSuccess(k2, SRC_OTHER);

    await clearGpuCache();

    expect(await isCached(k1)).toBe(false);
    expect(await isCached(k2)).toBe(false);
  });
});

describe('getGpuCacheStats', () => {
  beforeEach(() => freshInit());

  it('reports 0 entries on a fresh cache', async () => {
    const stats = await getGpuCacheStats();
    expect(stats.entries).toBe(0);
  });

  it('counts entries correctly', async () => {
    const k1 = await shaderCacheKey(SRC_SIMPLE);
    const k2 = await shaderCacheKey(SRC_OTHER);
    await recordSuccess(k1, SRC_SIMPLE);
    await recordSuccess(k2, SRC_OTHER);
    const stats = await getGpuCacheStats();
    expect(stats.entries).toBe(2);
  });

  it('includes zglVersion and gpuFingerprint', async () => {
    const stats = await getGpuCacheStats();
    expect(stats.zglVersion).toMatch(/\d+\.\d+\.\d+/);
    expect(stats.gpuFingerprint).toContain(GPU_VENDOR);
  });
});
