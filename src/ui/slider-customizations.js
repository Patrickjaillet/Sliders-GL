// Slider customizations — roadmap Phase C
//
// Persists per-slider tweaks (renamed label, custom group, manual range/step,
// custom order) keyed by the entry's `stableKey` (see parser.js), so they
// survive a reparse (Ctrl+Enter) and — once serialized into a preset — a reload.
//
// Design notes:
//  • Keyed by `stableKey` (`def:NAME` / `const:NAME` / `lit:N`), never by the
//    volatile runtime `id` (`v0`, `v1`…) which is regenerated every parse.
//  • Purely a metadata layer: it never touches the GLSL source or the value.
//    A renamed label or moved slider does NOT rewrite the shader.
//  • `applyCustomizations` is called from `applyAndParse` after every parse,
//    just before `buildUI`, so freshly parsed entries pick the tweaks back up.

/**
 * @typedef {Object} SliderMeta
 * @property {string}  [label]     Custom display name (rename).
 * @property {string}  [category]  Custom group.
 * @property {number}  [min]       Manual range minimum.
 * @property {number}  [max]       Manual range maximum.
 * @property {number}  [step]      Manual step.
 * @property {number}  [decimals]  Explicit decimal-precision override (readout + shader
 *                                 literal formatting) — replaces the parser's guessed value
 *                                 (mantissa length of the original literal / forced 0 for @int).
 * @property {string}  [unit]      Explicit unit/suffix override (e.g. "m", "°", "px") shown
 *                                 next to the readout — replaces the label-derived `(unit)` guess.
 * @property {number}  [order]     Sort position within the panel (lower = earlier).
 */

/** @type {Map<string, SliderMeta>} */
const _store = new Map();

/** Merge a partial meta patch for one slider, ignoring entries without a key. */
export function setSliderMeta(stableKey, patch) {
  if (!stableKey || !patch) return;
  const prev = _store.get(stableKey) || {};
  const next = { ...prev };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) delete next[k];
    else next[k] = v;
  }
  if (Object.keys(next).length === 0) _store.delete(stableKey);
  else _store.set(stableKey, next);
}

/** Read the stored meta for one slider (or undefined). */
export function getSliderMeta(stableKey) {
  return stableKey ? _store.get(stableKey) : undefined;
}

/** Wipe every stored customization — call when a genuinely new shader loads. */
export function clearSliderCustomizations() {
  _store.clear();
}

/** True when at least one slider has a stored customization. */
export function hasSliderCustomizations() {
  return _store.size > 0;
}

/**
 * Apply stored customizations onto a freshly parsed entry array, in place,
 * and return the (possibly reordered) array. Entries keep source order unless
 * an `order` was stored; stored orders sort first, in ascending order, with
 * un-ordered entries keeping their relative source position after them.
 *
 * @param {import('../shader/parser.js').ParsedEntry[]} entries
 * @returns {import('../shader/parser.js').ParsedEntry[]}
 */
export function applyCustomizations(entries) {
  if (!Array.isArray(entries) || _store.size === 0) return entries;

  for (const e of entries) {
    const meta = _store.get(e.stableKey);
    if (!meta) continue;
    if (typeof meta.label === 'string') e.label = meta.label;
    if (typeof meta.category === 'string') e.category = meta.category;
    if (Number.isFinite(meta.min)) e.min = meta.min;
    if (Number.isFinite(meta.max)) e.max = meta.max;
    if (Number.isFinite(meta.step) && meta.step > 0) e.step = meta.step;
    // Explicit precision/unit — takes priority over the parser's guess
    // (literal mantissa length / label-derived `(unit)` suffix) for every
    // uniform type (float/int/vector-component/colour-channel), since a
    // component entry is just a regular entry with its own stableKey.
    if (Number.isFinite(meta.decimals) && meta.decimals >= 0) e.decimals = meta.decimals;
    if (typeof meta.unit === 'string') e.unit = meta.unit;
  }

  // Stable reorder: anything with a stored `order` sorts by it; the rest keep
  // their source-relative order. We use a decorate-sort-undecorate so the sort
  // is deterministic and preserves source order for ties / un-ordered entries.
  const hasAnyOrder = entries.some(e => Number.isFinite(_store.get(e.stableKey)?.order));
  if (!hasAnyOrder) return entries;

  const decorated = entries.map((e, i) => {
    const ord = _store.get(e.stableKey)?.order;
    return { e, srcIdx: i, ord: Number.isFinite(ord) ? ord : null };
  });
  decorated.sort((a, b) => {
    if (a.ord !== null && b.ord !== null) return a.ord - b.ord || a.srcIdx - b.srcIdx;
    if (a.ord !== null) return -1;
    if (b.ord !== null) return 1;
    return a.srcIdx - b.srcIdx;
  });
  return decorated.map(d => d.e);
}

/**
 * Record the current visual order of `state.vars` into the store, so a
 * drag-reorder survives the next reparse. Pass the ordered entry array.
 */
export function captureOrder(entries) {
  if (!Array.isArray(entries)) return;
  entries.forEach((e, i) => {
    if (e.stableKey) setSliderMeta(e.stableKey, { order: i });
  });
}

/** Serialize the store to a plain object for embedding in a preset. */
export function serializeCustomizations() {
  /** @type {Record<string, SliderMeta>} */
  const obj = {};
  for (const [k, v] of _store) obj[k] = { ...v };
  return obj;
}

/** Replace the store from a serialized object (preset load). Clears first. */
export function loadCustomizations(obj) {
  _store.clear();
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object') _store.set(k, { ...v });
    }
  }
}
