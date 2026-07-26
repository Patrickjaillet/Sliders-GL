/**
 * src/render/gpu-program-cache.js
 *
 * Phase 22.2 — Cache persistant de programmes GPU
 *
 * Stratégie :
 *   - Clé de cache = SHA-256 du source GLSL wrappé (SubtleCrypto, async, non bloquant).
 *   - Stockage IndexedDB (persist entre les sessions, survit au rechargement).
 *   - Invalidation automatique si la version de Sliders GL ou la chaîne GPU change.
 *   - Réduction visée du temps de compilation au démarrage : ~80 %.
 *
 * Ce module ne stocke PAS les objets WebGL (non sérialisables). Il stocke
 * les métadonnées nécessaires pour détecter qu'un shader a déjà été compilé
 * avec succès sur ce GPU, et donc court-circuiter `checkFragCompile()`.
 *
 * Architecture :
 *   - Les programmes compilés avec succès sont enregistrés via `recordSuccess()`.
 *   - Au démarrage ou avant une compilation, `isCached()` permet d'éviter la
 *     recompilation WebGL si on sait qu'elle a déjà réussi.
 *   - `purgeStalEntries()` nettoie les entrées d'une ancienne version/GPU.
 *
 * Usage :
 *   import { initGpuCache, isCached, recordSuccess, purgeStalEntries }
 *     from '../render/gpu-program-cache.js';
 *
 *   // Au démarrage du renderer :
 *   await initGpuCache(gpuRenderer, gpuVendor);
 *
 *   // Avant de compiler un shader :
 *   const key = await shaderCacheKey(wrappedSource);
 *   if (await isCached(key)) return true; // déjà compilé sur ce GPU
 *
 *   // ... compilation WebGL ...
 *
 *   // Après succès :
 *   await recordSuccess(key, wrappedSource);
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const IDB_NAME    = 'z-gl-gpu-cache';
const IDB_VERSION = 1;
const IDB_STORE   = 'programs';

/** Version interne Sliders GL. Incrémenter lors de changements majeurs de wrapFrag. */
const ZGL_CACHE_VERSION = '22.2.0';

// ─── État interne ─────────────────────────────────────────────────────────────

/** @type {IDBDatabase|null} */
let _db = null;

/** Chaîne GPU active (vendor + renderer). Null avant init. */
let _gpuFingerprint = null;

/** Clés déjà vérifiées comme présentes dans IDB (évite des allers-retours répétés). */
const _memHits = new Set();

// ─── Initialisation ───────────────────────────────────────────────────────────

/**
 * Initialise la connexion IDB et purge les entrées obsolètes.
 * À appeler une seule fois, juste après la création du renderer WebGL.
 *
 * @param {string} gpuRenderer  — caps.renderer (WEBGL_debug_renderer_info)
 * @param {string} gpuVendor    — caps.vendor
 * @returns {Promise<void>}
 */
export async function initGpuCache(gpuRenderer = 'unknown', gpuVendor = 'unknown') {
  _gpuFingerprint = `${gpuVendor}::${gpuRenderer}`;
  try {
    _db = await _idbOpen();
    await purgeStalEntries();
  } catch (err) {
    // IDB indisponible (ex. mode privé strict, Tauri sans permission) — dégradation silencieuse.
    console.warn('[gpu-program-cache] IndexedDB unavailable, cache disabled:', err.message);
    _db = null;
  }
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Calcule la clé SHA-256 du source wrappé.
 * Retourne un hex string de 64 caractères.
 *
 * @param {string} wrappedSource
 * @returns {Promise<string>}
 */
export async function shaderCacheKey(wrappedSource) {
  const buf = new TextEncoder().encode(wrappedSource);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Vérifie si un shader (identifié par sa clé SHA-256) est déjà en cache
 * pour la version Sliders GL et le GPU courants.
 *
 * @param {string} key  — résultat de `shaderCacheKey()`
 * @returns {Promise<boolean>}
 */
export async function isCached(key) {
  if (_memHits.has(key)) return true;
  if (!_db) return false;

  try {
    const entry = await _idbGet(key);
    if (!entry) return false;
    if (entry.zglVersion !== ZGL_CACHE_VERSION) return false;
    if (entry.gpuFingerprint !== _gpuFingerprint) return false;
    _memHits.add(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Enregistre qu'un shader a été compilé avec succès.
 * À appeler juste après une compilation WebGL réussie.
 *
 * @param {string} key           — résultat de `shaderCacheKey()`
 * @param {string} wrappedSource — source wrappé (pour stats / debug)
 * @returns {Promise<void>}
 */
export async function recordSuccess(key, wrappedSource) {
  if (!_db) return;
  _memHits.add(key);
  const entry = {
    key,
    zglVersion:     ZGL_CACHE_VERSION,
    gpuFingerprint: _gpuFingerprint,
    sourceLen:      wrappedSource.length,
    compiledAt:     Date.now(),
  };
  try {
    await _idbPut(key, entry);
  } catch (err) {
    console.warn('[gpu-program-cache] recordSuccess IDB write failed:', err.message);
  }
}

/**
 * Supprime toutes les entrées qui ne correspondent plus à la version Sliders GL
 * courante ou à la chaîne GPU courante.
 *
 * Doit être appelé après `initGpuCache()`.
 *
 * @returns {Promise<{ purged: number }>}
 */
export async function purgeStalEntries() {
  if (!_db) return { purged: 0 };
  try {
    const all    = await _idbGetAll();
    const stale  = all.filter(e =>
      e.zglVersion !== ZGL_CACHE_VERSION ||
      e.gpuFingerprint !== _gpuFingerprint
    );
    await Promise.all(stale.map(e => _idbDelete(e.key)));
    if (stale.length > 0) {
      console.info(`[gpu-program-cache] Purged ${stale.length} stale entries (version or GPU changed).`);
    }
    return { purged: stale.length };
  } catch (err) {
    console.warn('[gpu-program-cache] purgeStalEntries failed:', err.message);
    return { purged: 0 };
  }
}

/**
 * Supprime toutes les entrées du cache (reset complet).
 * @returns {Promise<void>}
 */
export async function clearGpuCache() {
  _memHits.clear();
  if (!_db) return;
  try {
    await _idbClear();
    console.info('[gpu-program-cache] Cache cleared.');
  } catch (err) {
    console.warn('[gpu-program-cache] clearGpuCache failed:', err.message);
  }
}

/**
 * Statistiques du cache pour le perf panel.
 * @returns {Promise<{ entries: number, zglVersion: string, gpuFingerprint: string, memHits: number }>}
 */
export async function getGpuCacheStats() {
  const entries = _db ? (await _idbGetAll()).length : 0;
  return {
    entries,
    zglVersion:     ZGL_CACHE_VERSION,
    gpuFingerprint: _gpuFingerprint ?? 'not initialized',
    memHits:        _memHits.size,
  };
}

// ─── IDB helpers ──────────────────────────────────────────────────────────────

/**
 * Réinitialise l'état interne du module (usage test uniquement).
 * Permet de simuler un changement de GPU / version entre deux appels à initGpuCache.
 * @internal
 */
export function _resetForTests() {
  _db = null;
  _gpuFingerprint = null;
  _memHits.clear();
}

function _idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db    = e.target.result;
      const store = db.createObjectStore(IDB_STORE, { keyPath: 'key' });
      store.createIndex('zglVersion',     'zglVersion',     { unique: false });
      store.createIndex('gpuFingerprint', 'gpuFingerprint', { unique: false });
      store.createIndex('compiledAt',     'compiledAt',     { unique: false });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

function _idbGet(key) {
  return new Promise((resolve, reject) => {
    const tx  = _db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = (e) => resolve(e.target.result ?? null);
    req.onerror   = (e) => reject(e.target.error);
  });
}

function _idbPut(key, value) {
  return new Promise((resolve, reject) => {
    const tx  = _db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(value);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

function _idbDelete(key) {
  return new Promise((resolve, reject) => {
    const tx  = _db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

function _idbGetAll() {
  return new Promise((resolve, reject) => {
    const tx  = _db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = (e) => resolve(e.target.result ?? []);
    req.onerror   = (e) => reject(e.target.error);
  });
}

function _idbClear() {
  return new Promise((resolve, reject) => {
    const tx  = _db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}
