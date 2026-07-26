// Slider color grouping + conversion helpers — roadmap Phase B
//
// Pure functions only (no DOM, no imports from slider.js) so they stay unit
// testable and free of import cycles. `slider.js` consumes these to render a
// single colour-swatch widget in place of 3 (RGB) / 4 (RGBA) flat sliders.
//
// A literal is a colour component when its parsed entry carries `isColor`
// (set by the `@color` annotation or the parser's colour heuristic). Within a
// category we group *maximal runs* of consecutive `isColor` entries that share
// a source line; a run of exactly 3 → RGB, exactly 4 → RGBA. Any other run
// length falls back to individual sliders (never force a broken grouping).

/**
 * @typedef {import('../shader/parser.js').ParsedEntry} ParsedEntry
 * @typedef {{kind:'slider', entry:ParsedEntry}
 *          |{kind:'color', entries:ParsedEntry[], alpha:boolean}
 *          |{kind:'xy', entries:ParsedEntry[]}} RenderUnit
 */

/**
 * Turn an ordered entry array (one category) into render units, grouping
 * colour component runs (3/4) and vec2 XY pairs into single units.
 * @param {ParsedEntry[]} entries
 * @returns {RenderUnit[]}
 */
export function groupEntriesForRender(entries) {
  /** @type {RenderUnit[]} */
  const units = [];
  let i = 0;
  while (i < entries.length) {
    const e = entries[i];
    // Colour run (3 → RGB, 4 → RGBA)
    if (e && e.isColor) {
      let j = i + 1;
      while (j < entries.length && entries[j].isColor && entries[j].line === e.line) j++;
      const run = entries.slice(i, j);
      if (run.length === 3 || run.length === 4) {
        units.push({ kind: 'color', entries: run, alpha: run.length === 4 });
      } else {
        for (const r of run) units.push({ kind: 'slider', entry: r });
      }
      i = j;
      continue;
    }
    // XY pair (exactly 2)
    if (e && e.isXY) {
      let j = i + 1;
      while (j < entries.length && entries[j].isXY && entries[j].line === e.line) j++;
      const run = entries.slice(i, j);
      if (run.length === 2) {
        units.push({ kind: 'xy', entries: run });
      } else {
        for (const r of run) units.push({ kind: 'slider', entry: r });
      }
      i = j;
      continue;
    }
    units.push({ kind: 'slider', entry: e });
    i++;
  }
  return units;
}

/**
 * Detect the numeric scale of a colour's components.
 * @param {number[]} values
 * @returns {1|255}  1 = normalised float [0,1], 255 = 8-bit [0,255]
 */
export function detectColorScale(values) {
  return values.some(v => v > 1 + 1e-6) ? 255 : 1;
}

/** Clamp + round to a 0..255 integer. */
function _to255(v, scale) {
  const n = scale === 1 ? v * 255 : v;
  return Math.max(0, Math.min(255, Math.round(n)));
}

/**
 * Build an `#rrggbb` string from the first three component values.
 * @param {number[]} values
 * @param {1|255} scale
 */
export function componentsToHex(values, scale) {
  const [r, g, b] = values;
  return '#' + [r, g, b]
    .map(v => _to255(v, scale).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Parse `#rrggbb` (or `rrggbb`) into three component values in the given scale.
 * @param {string} hex
 * @param {1|255} scale
 * @returns {number[]|null}  [r,g,b] in `scale` units, or null if malformed
 */
export function hexToComponents(hex, scale) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex).trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  const conv = c => (scale === 1 ? c / 255 : c);
  return [conv(r), conv(g), conv(b)];
}
