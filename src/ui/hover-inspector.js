// §E.1 (UI v2) — Inspecteur au survol
//
// Fournit un hover Monaco enrichi : survoler un uniform runtime (iTime…) ou un
// nom de constante pilotée par slider affiche sa valeur courante, sa plage et
// la ligne de définition — rendre le runtime du shader lisible d'un coup d'œil.
//
// Phase X — étendu avec : swatch couleur sur les littéraux vecN(...), infos
// du channel assigné sur iChannel0–3, et la doc `// @brief …` des fonctions
// custom définies dans le shader.

import * as monaco from 'monaco-editor';
import { state } from '../core/state.js';
import { esc } from '../core/utils.js';
import { VEC_RE, isColor, toHex } from './color-inline.js';

function _u(name) { return state.mat3?.uniforms?.[name]?.value; }

function _channelInfo(i) {
  return `**iChannel${i}** — _(unassigned)_`;
}

// Exporté pour réutilisation par inspector-context.js (Phase Q, mode "uniform").
export const RUNTIME = {
  iTime: () => { const v = _u('iTime'); return `**iTime** — \`${(typeof v === 'number' ? v : state.simTime || 0).toFixed(2)} s\` _(elapsed time)_`; },
  iTimeDelta: () => { const v = _u('iTimeDelta'); return `**iTimeDelta** — \`${typeof v === 'number' ? (v * 1000).toFixed(1) : '—'} ms\` _(frame delta)_`; },
  iFrame: () => { const v = _u('iFrame'); return `**iFrame** — \`${Number.isFinite(v) ? v : state.fidx || 0}\` _(frame index)_`; },
  iResolution: () => { const v = _u('iResolution'); return `**iResolution** — \`${v ? `${Math.round(v.x)}×${Math.round(v.y)}` : '—'}\` _(viewport px)_`; },
  // iMouse already reflected the live cursor position (state.mat3.uniforms.iMouse
  // is updated every frame in renderer.js's updateUniforms) — no change needed here.
  iMouse: () => { const v = _u('iMouse'); return `**iMouse** — \`${v ? `${Math.round(v.x)}, ${Math.round(v.y)}` : '—'}\` _(xy + buttons)_`; },
  iChannel0: () => _channelInfo(0),
  iChannel1: () => _channelInfo(1),
  iChannel2: () => _channelInfo(2),
  iChannel3: () => _channelInfo(3),
};

// Exporté pour inspector-context.js (Phase Q).
export function findSliderEntry(name) { return _sliderEntry(name); }

function _sliderEntry(name) {
  for (const e of state.vars || []) {
    if (e.label === name || e.defineName === name) return e;
  }
  return null;
}

// ── Phase X — color swatch on hovered vecN(...) literals ─────────────────────
function _swatchMarkdown(hex) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12'><rect width='11' height='11' x='.5' y='.5' rx='2' fill='${hex}' stroke='rgba(128,128,128,.6)'/></svg>`;
  return `![](data:image/svg+xml,${encodeURIComponent(svg)})`;
}

function _vecSwatchAt(model, position) {
  const text = model.getLineContent(position.lineNumber);
  VEC_RE.lastIndex = 0;
  let m;
  while ((m = VEC_RE.exec(text)) !== null) {
    const startCol = m.index + 1;
    const endCol = m.index + m[0].length + 1;
    if (position.column < startCol || position.column > endCol) continue;
    const comps = [m[2], m[3], m[4], m[5]].filter(x => x !== undefined).map(parseFloat);
    let r, g, b;
    if (comps.length === 1) { r = g = b = comps[0]; }
    else if (comps.length >= 3) { [r, g, b] = comps; }
    else continue;
    if (!isColor([r, g, b])) continue;
    return { hex: toHex(r, g, b), startCol, endCol };
  }
  return null;
}

// ── Phase X — `// @brief …` doc comment on custom function definitions ───────
function _functionBrief(model, name) {
  if (!/^[A-Za-z_]\w*$/.test(name)) return null;
  const defRe = new RegExp('^\\s*[\\w]+[\\w\\s\\[\\]]*\\b' + name + '\\s*\\(');
  const lineCount = model.getLineCount();
  for (let ln = 1; ln <= lineCount; ln++) {
    if (!defRe.test(model.getLineContent(ln))) continue;
    const briefLines = [];
    let i = ln - 1;
    while (i >= 1) {
      const prev = model.getLineContent(i).trim();
      const m = prev.match(/^\/\/\s*@brief\s?(.*)$/);
      if (m) { briefLines.unshift(m[1]); i--; continue; }
      if (briefLines.length && prev.startsWith('//')) { briefLines.unshift(prev.replace(/^\/\/\s?/, '')); i--; continue; }
      break;
    }
    return briefLines.length ? briefLines.join(' ') : null;
  }
  return null;
}

export function initHoverInspector() {
  monaco.languages.registerHoverProvider('glsl', {
    provideHover(model, position) {
      const vecHit = _vecSwatchAt(model, position);
      if (vecHit) {
        return {
          range: new monaco.Range(position.lineNumber, vecHit.startCol, position.lineNumber, vecHit.endCol),
          contents: [{ value: `${_swatchMarkdown(vecHit.hex)} \`${vecHit.hex}\`` }],
        };
      }

      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const name = word.word;

      if (RUNTIME[name]) {
        return { contents: [{ value: RUNTIME[name]() }] };
      }

      const e = _sliderEntry(name);
      if (e) {
        const lines = [
          `**${name}** — current \`${(+e.value).toPrecision(4).replace(/\.?0+$/, '')}\``,
          `range \`${e.min} … ${e.max}\` · default \`${e.defaultValue}\``,
        ];
        if (e.line) lines.push(`_defined at line ${e.line}_`);
        return {
          range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          contents: lines.map(value => ({ value })),
        };
      }

      const brief = _functionBrief(model, name);
      if (brief) {
        return {
          range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          contents: [{ value: `**${esc(name)}()**` }, { value: esc(brief) }],
        };
      }

      return null;
    },
  });
}
