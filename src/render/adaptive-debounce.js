/**
 * src/render/adaptive-debounce.js
 *
 * Phase 22.1 — Debounce adaptatif
 *
 * Calcule le délai de debounce en fonction de la complexité du shader GLSL.
 * - Shader Simple  (score ≤  30) → 150 ms  (réponse quasi-immédiate)
 * - Shader Medium  (score ≤  70) → 350 ms
 * - Shader Heavy   (score ≤ 120) → 600 ms
 * - Shader Complex (score > 120) → 900 ms  (évite les freezes UI)
 *
 * Usage :
 *   import { adaptiveDebounce, cancelAdaptiveDebounce } from '../render/adaptive-debounce.js';
 *
 *   // Dans un handler onDidChangeModelContent :
 *   adaptiveDebounce(myKey, glslSource, () => { compile(); });
 *
 *   // Pour annuler (ex. destruction du composant) :
 *   cancelAdaptiveDebounce(myKey);
 */

import { scoreGLSL } from '../shader/glsl-complexity.js';

// ─── Délais par bande de complexité ──────────────────────────────────────────

const DEBOUNCE_DELAYS = {
  Simple:  150,
  Medium:  350,
  Heavy:   600,
  Complex: 900,
  _default: 400,   // fallback si scoreGLSL renvoie null
};

// ─── État interne ─────────────────────────────────────────────────────────────

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const _timers = new Map();

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Planifie l'exécution de `fn` après un délai adapté à la complexité de `src`.
 *
 * Si un appel précédent pour la même `key` est en attente, il est annulé.
 *
 * @param {string}   key  — identifiant unique du contexte (ex. 'main', 'bufA')
 * @param {string}   src  — source GLSL courante (utilisée pour scorer)
 * @param {Function} fn   — callback à exécuter après le délai
 * @returns {number}      délai utilisé en ms (utile pour les tests / logs)
 */
export function adaptiveDebounce(key, src, fn) {
  cancelAdaptiveDebounce(key);

  const result = scoreGLSL(src);
  const delay  = result
    ? (DEBOUNCE_DELAYS[result.label] ?? DEBOUNCE_DELAYS._default)
    : DEBOUNCE_DELAYS._default;

  const id = setTimeout(() => {
    _timers.delete(key);
    fn();
  }, delay);

  _timers.set(key, id);
  return delay;
}

/**
 * Annule le debounce en cours pour la clé donnée (sans-op si absent).
 *
 * @param {string} key
 */
export function cancelAdaptiveDebounce(key) {
  const existing = _timers.get(key);
  if (existing !== undefined) {
    clearTimeout(existing);
    _timers.delete(key);
  }
}

/**
 * Retourne le délai qui serait utilisé pour un source GLSL donné,
 * sans déclencher de timer. Utile pour l'affichage dans le perf panel.
 *
 * @param {string} src
 * @returns {number} délai en ms
 */
export function getAdaptiveDelay(src) {
  const result = scoreGLSL(src);
  return result
    ? (DEBOUNCE_DELAYS[result.label] ?? DEBOUNCE_DELAYS._default)
    : DEBOUNCE_DELAYS._default;
}
