/**
 * src/render/texture-compressor.test.js
 *
 * Phase 22.3 — Tests unitaires du compresseur de textures natives
 *
 * Stratégie :
 *   - Environnement Node.js / Vitest (pas de WebGL réel).
 *   - Les APIs WebGL et IndexedDB sont mockées.
 *   - On teste la logique de détection de format, de compression par blocs,
 *     de mise en cache et de purge.
 *
 * Lancer : npx vitest run src/render/texture-compressor.test.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mocks globaux ────────────────────────────────────────────────────────────

// Mock SubtleCrypto pour SHA-256
const _sha256Counter = { n: 0 };
Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  writable: true,
  value: {
    subtle: {
      digest: vi.fn(async (_alg, buf) => {
        // Retourne un hash déterministe basé sur le contenu
        const arr = new Uint8Array(32);
        const src = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer ?? buf);
        for (let i = 0; i < src.length && i < 32; i++) arr[i] = src[i] ^ (i * 7);
        return arr.buffer;
      }),
    },
  },
});

// Mock TextEncoder
globalThis.TextEncoder = class {
  encode(str) { return new Uint8Array([...str].map(c => c.charCodeAt(0))); }
};

// Mock OffscreenCanvas + ImageData
globalThis.ImageData = class {
  constructor(data, w, h) { this.data = data; this.width = w; this.height = h; }
};

class MockCanvas {
  constructor(w, h) { this.width = w; this.height = h; }
  getContext() {
    return {
      drawImage: vi.fn(),
      getImageData: (x, y, w, h) => ({
        data: new Uint8ClampedArray(w * h * 4).fill(128),
        width: w,
        height: h,
      }),
    };
  }
}
globalThis.OffscreenCanvas = MockCanvas;

// Mock createImageBitmap
globalThis.createImageBitmap = vi.fn(async (blob) => ({
  width: 8,
  height: 8,
  close: vi.fn(),
}));

// Mock IndexedDB (fake-idb simple)
function makeFakeIDB() {
  const store = new Map();
  const db = {
    _store: store,
    transaction(storeName, mode) {
      return {
        objectStore() {
          return {
            get(key) {
              const r = { result: store.get(key) ?? null };
              Promise.resolve().then(() => r.onsuccess?.({ target: r }));
              return r;
            },
            put(value) {
              store.set(value.key, value);
              const r = {};
              Promise.resolve().then(() => r.onsuccess?.());
              return r;
            },
            delete(key) {
              store.delete(key);
              const r = {};
              Promise.resolve().then(() => r.onsuccess?.());
              return r;
            },
            getAll() {
              const r = { result: [...store.values()] };
              Promise.resolve().then(() => r.onsuccess?.({ target: r }));
              return r;
            },
            clear() {
              store.clear();
              const r = {};
              Promise.resolve().then(() => r.onsuccess?.());
              return r;
            },
          };
        },
      };
    },
  };
  return db;
}

// Mock indexedDB.open
function mockIndexedDB(fakeDB) {
  globalThis.indexedDB = {
    open(_name, _version) {
      const req = {
        result: fakeDB,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      };
      Promise.resolve().then(() => {
        req.onsuccess?.({ target: req });
      });
      return req;
    },
  };
}

// ─── Import du module à tester ────────────────────────────────────────────────

// On doit mocker gl-caps avant l'import du module
vi.mock('./gl-caps.js', () => ({
  detectGLCaps: vi.fn(() => ({
    bestCompressedFormat: 'bc7',
    bc7: true,
    astc: false,
    etc: false,
    s3tc: false,
  })),
}));

import {
  initTextureCompressor,
  compressAndCacheTexture,
  getActiveFormat,
  purgeTextureCache,
  getTextureCacheStats,
  _resetForTests,
} from './texture-compressor.js';

// ─── Helpers de test ──────────────────────────────────────────────────────────

function makeBlob(size = 64) {
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i++) buf[i] = i % 256;
  return new Blob([buf], { type: 'image/png' });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('texture-compressor — initialisation', () => {
  beforeEach(() => {
    _resetForTests();
    mockIndexedDB(makeFakeIDB());
  });

  it('détecte BC7 comme format actif via gl-caps', async () => {
    const fakeGL = {};
    await initTextureCompressor(fakeGL);
    expect(getActiveFormat()).toBe('bc7');
  });

  it('passe en mode "none" si gl-caps retourne null', async () => {
    const { detectGLCaps } = await import('./gl-caps.js');
    detectGLCaps.mockReturnValueOnce(null);
    _resetForTests();
    await initTextureCompressor({});
    expect(getActiveFormat()).toBe('none');
  });

  it('désactive le cache IDB si indexedDB.open échoue', async () => {
    globalThis.indexedDB = {
      open() {
        const req = {};
        Promise.resolve().then(() => req.onerror?.({ target: { error: new Error('no idb') } }));
        return req;
      },
    };
    _resetForTests();
    await initTextureCompressor({});
    // Doit init sans throw
    expect(getActiveFormat()).toBe('bc7');
  });
});

describe('texture-compressor — compressAndCacheTexture', () => {
  let fakeDB;

  beforeEach(async () => {
    _resetForTests();
    fakeDB = makeFakeIDB();
    mockIndexedDB(fakeDB);
    await initTextureCompressor({});
  });

  it('retourne compressed:true pour un format supporté', async () => {
    const result = await compressAndCacheTexture(makeBlob(), 'test.png');
    expect(result.compressed).toBe(true);
    expect(result.format).toBe('bc7');
    expect(result.data).toBeInstanceOf(ArrayBuffer);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('la taille du buffer BC7 correspond au nombre de blocs × 16 octets', async () => {
    const result = await compressAndCacheTexture(makeBlob(), 'test.png');
    // Image mock = 8×8 → 8 blocs de 16 octets = 128 octets
    const blocksX = Math.ceil(result.width  / 4);
    const blocksY = Math.ceil(result.height / 4);
    expect(result.data.byteLength).toBe(blocksX * blocksY * 16);
  });

  it('retourne compressed:false quand format = none', async () => {
    _resetForTests();
    const { detectGLCaps } = await import('./gl-caps.js');
    detectGLCaps.mockReturnValueOnce({ bestCompressedFormat: 'none' });
    await initTextureCompressor({});
    const result = await compressAndCacheTexture(makeBlob(), 'test.png');
    expect(result.compressed).toBe(false);
    expect(result.url).toBeTruthy();
  });

  it('sert depuis le cache mémoire au 2e appel (sans toucher IDB)', async () => {
    const blob = makeBlob();
    const r1 = await compressAndCacheTexture(blob, 'a.png');
    const idbGetSpy = vi.spyOn(fakeDB._store, 'get');
    const r2 = await compressAndCacheTexture(blob, 'a.png');
    expect(r2.compressed).toBe(true);
    // Le 2e appel ne doit pas lire IDB (cache mémoire suffit)
    expect(idbGetSpy).not.toHaveBeenCalled();
    idbGetSpy.mockRestore();
  });

  it('sert depuis IDB si cache mémoire vide (simulation redémarrage)', async () => {
    const blob = makeBlob();
    await compressAndCacheTexture(blob, 'b.png'); // remplit IDB
    _resetForTests(); // vide le cache mémoire
    mockIndexedDB(fakeDB);
    await initTextureCompressor({}); // reconnecte à la même fakeDB
    const r = await compressAndCacheTexture(blob, 'b.png');
    expect(r.compressed).toBe(true);
    expect(r.format).toBe('bc7');
  });

  it('écrit une entrée IDB avec les bonnes métadonnées', async () => {
    const blob = makeBlob();
    await compressAndCacheTexture(blob, 'meta.png');
    const entries = [...fakeDB._store.values()];
    expect(entries.length).toBeGreaterThan(0);
    const entry = entries[0];
    expect(entry.version).toBe('22.3.0');
    expect(entry.format).toBe('bc7');
    expect(entry.data).toBeInstanceOf(ArrayBuffer);
    expect(entry.cachedAt).toBeTypeOf('number');
  });
});

describe('texture-compressor — formats ASTC et ETC2', () => {
  beforeEach(async () => {
    _resetForTests();
    mockIndexedDB(makeFakeIDB());
  });

  it('produit un buffer ASTC de taille correcte (16 octets/bloc)', async () => {
    const { detectGLCaps } = await import('./gl-caps.js');
    detectGLCaps.mockReturnValueOnce({ bestCompressedFormat: 'astc', astc: true });
    await initTextureCompressor({});
    const result = await compressAndCacheTexture(makeBlob(), 'astc.png');
    expect(result.compressed).toBe(true);
    expect(result.format).toBe('astc');
    const blocksX = Math.ceil(result.width  / 4);
    const blocksY = Math.ceil(result.height / 4);
    expect(result.data.byteLength).toBe(blocksX * blocksY * 16);
  });

  it('produit un buffer ETC2 de taille correcte (8 octets/bloc)', async () => {
    const { detectGLCaps } = await import('./gl-caps.js');
    detectGLCaps.mockReturnValueOnce({ bestCompressedFormat: 'etc2', etc: true });
    await initTextureCompressor({});
    const result = await compressAndCacheTexture(makeBlob(), 'etc2.png');
    expect(result.compressed).toBe(true);
    expect(result.format).toBe('etc2');
    const blocksX = Math.ceil(result.width  / 4);
    const blocksY = Math.ceil(result.height / 4);
    expect(result.data.byteLength).toBe(blocksX * blocksY * 8);
  });
});

describe('texture-compressor — cache management', () => {
  beforeEach(async () => {
    _resetForTests();
    mockIndexedDB(makeFakeIDB());
    await initTextureCompressor({});
  });

  it('purgeTextureCache vide IDB et le cache mémoire', async () => {
    await compressAndCacheTexture(makeBlob(), 'x.png');
    let stats = await getTextureCacheStats();
    expect(stats.memEntries).toBeGreaterThan(0);

    await purgeTextureCache();
    stats = await getTextureCacheStats();
    expect(stats.memEntries).toBe(0);
    expect(stats.entries).toBe(0);
  });

  it('getTextureCacheStats retourne le format actif', async () => {
    const stats = await getTextureCacheStats();
    expect(stats.format).toBe('bc7');
  });

  it('purge les entrées IDB avec une ancienne version', async () => {
    // Insérer manuellement une entrée avec une vieille version
    const fakeDB2 = makeFakeIDB();
    fakeDB2._store.set('oldkey', {
      key: 'oldkey',
      version: '22.0.0', // obsolète
      format: 'bc7',
      width: 8, height: 8,
      data: new ArrayBuffer(128),
      cachedAt: Date.now() - 1e6,
    });
    _resetForTests();
    mockIndexedDB(fakeDB2);
    await initTextureCompressor({});
    // Après init, la purge doit avoir supprimé l'entrée obsolète
    expect(fakeDB2._store.has('oldkey')).toBe(false);
  });
});

describe('texture-compressor — robustesse', () => {
  beforeEach(async () => {
    _resetForTests();
    mockIndexedDB(makeFakeIDB());
    await initTextureCompressor({});
  });

  it('ne throw pas si createImageBitmap échoue', async () => {
    createImageBitmap.mockRejectedValueOnce(new Error('decode failed'));
    const result = await compressAndCacheTexture(makeBlob(), 'bad.png');
    expect(result.compressed).toBe(false);
    expect(result.url).toBeTruthy();
  });

  it('aligne les dimensions sur des multiples de 4', async () => {
    // Image 7×5 → doit être padded à 8×8
    createImageBitmap.mockResolvedValueOnce({ width: 7, height: 5, close: vi.fn() });
    const result = await compressAndCacheTexture(makeBlob(), 'odd.png');
    expect(result.width  % 4).toBe(0);
    expect(result.height % 4).toBe(0);
  });

  it('gère correctement deux blobs différents sans collision de cache', async () => {
    const b1 = makeBlob(64);
    // b2 a un contenu suffisamment différent pour que le mock SHA-256 produise une clé distincte
    const arr2 = new Uint8Array(64);
    arr2.fill(0xFF); // tous les octets à 255, différent de makeBlob
    const b2 = new Blob([arr2], { type: 'image/png' });
    const r1 = await compressAndCacheTexture(b1, 'a2.png');
    const r2 = await compressAndCacheTexture(b2, 'b2.png');
    expect(r1.compressed).toBe(true);
    expect(r2.compressed).toBe(true);
  });
});
