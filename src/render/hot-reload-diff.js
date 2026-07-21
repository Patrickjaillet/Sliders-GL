/**
 * src/render/hot-reload-diff.js
 *
 * Phase 22.1 — Hot-reload différentiel
 *
 * Maintient un hash FNV-1a par passe multipass (image, bufA, bufB, bufC, bufD,
 * cubeA, sound, compute…). Avant toute recompilation, on compare le hash du
 * nouveau source à celui mémorisé : si identique, on court-circuite le pipeline.
 *
 * Cela garantit que seule la passe dont le code a vraiment changé est recompilée,
 * évitant le coût inutile des autres passes (surtout les plus lourdes).
 *
 * Usage :
 *   import { passNeedsRecompile, markPassCompiled, invalidatePass, invalidateAll }
 *     from '../render/hot-reload-diff.js';
 *
 *   // Avant de recompiler la passe 'bufA' :
 *   if (!passNeedsRecompile('bufA', newCode)) return; // source inchangée
 *   // … compilation …
 *   markPassCompiled('bufA', newCode);
 *
 *   // Forcer la recompilation au prochain appel (ex. changement de résolution) :
 *   invalidatePass('bufA');
 *
 *   // Reset complet (ex. rechargement de projet) :
 *   invalidateAll();
 */

// ─── FNV-1a 32-bit (identique à shader-cache.js, inline pour éviter la dépendance) ─

const FNV_PRIME  = 0x01000193;
const FNV_OFFSET = 0x811c9dc5;

/**
 * @param {string} str
 * @returns {string} 8-character hex digest
 */
function _fnv1a(str) {
  let h = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h  = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ─── État interne ─────────────────────────────────────────────────────────────

/** @type {Map<string, string>} passId → dernière hash compilée */
const _hashes = new Map();

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Retourne `true` si le source de la passe a changé depuis la dernière
 * compilation mémorisée (ou si la passe n'a jamais été compilée).
 *
 * @param {string} passId   — ex. 'image', 'bufA', 'cubeA', 'sound'
 * @param {string} source   — source GLSL / WGSL brut (avant wrap)
 * @returns {boolean}
 */
export function passNeedsRecompile(passId, source) {
  const h = _fnv1a(source);
  return _hashes.get(passId) !== h;
}

/**
 * Enregistre la hash de la source compilée avec succès pour cette passe.
 * À appeler juste après une compilation réussie.
 *
 * @param {string} passId
 * @param {string} source
 */
export function markPassCompiled(passId, source) {
  _hashes.set(passId, _fnv1a(source));
}

/**
 * Invalide la passe : la prochain appel à `passNeedsRecompile` retournera
 * `true` même si le source n'a pas changé.
 *
 * Utile lors d'un changement de résolution, d'un rechargement de channel,
 * ou d'une reconstruction du renderer.
 *
 * @param {string} passId
 */
export function invalidatePass(passId) {
  _hashes.delete(passId);
}

/**
 * Invalide toutes les passes (ex. rechargement de projet, reset complet).
 */
export function invalidateAll() {
  _hashes.clear();
}

/**
 * Statistiques pour le perf panel.
 * @returns {{ passes: number, ids: string[] }}
 */
export function getDiffStats() {
  return {
    passes: _hashes.size,
    ids:    [..._hashes.keys()],
  };
}

// ─── Function-level diff ──────────────────────────────────────────────────────
// Extracts top-level function bodies from GLSL source and hashes each one
// independently. Callers can then determine which specific functions changed
// and skip rebuilding downstream passes that only depend on unchanged functions.

const _FUNC_RE = /^(?:(?:void|vec[234]|mat[234]|float|int|bool)\s+(\w+)\s*\([^)]*\)\s*\{)/gm;

/**
 * Parse `source` into a map of { functionName → FNV-1a hash of its body }.
 * Only top-level functions are extracted; nested braces are counted to find the
 * closing `}` of each function body.
 *
 * @param {string} source   Raw GLSL source
 * @returns {Map<string, string>}
 */
export function hashFunctions(source) {
  const result = new Map();
  let m;
  _FUNC_RE.lastIndex = 0;
  while ((m = _FUNC_RE.exec(source)) !== null) {
    const name  = m[1];
    const start = m.index;
    // Find the matching closing brace by counting depth.
    let depth = 0, i = start;
    while (i < source.length) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') { depth--; if (depth === 0) break; }
      i++;
    }
    const body = source.slice(start, i + 1);
    result.set(name, _fnv1a(body));
  }
  return result;
}

/**
 * Given two function-hash maps (old and new), return the set of function names
 * that were added, removed, or changed.
 *
 * @param {Map<string,string>} oldMap
 * @param {Map<string,string>} newMap
 * @returns {Set<string>}
 */
export function diffFunctions(oldMap, newMap) {
  const changed = new Set();
  for (const [name, hash] of newMap) {
    if (oldMap.get(name) !== hash) changed.add(name);
  }
  for (const name of oldMap.keys()) {
    if (!newMap.has(name)) changed.add(name);
  }
  return changed;
}
