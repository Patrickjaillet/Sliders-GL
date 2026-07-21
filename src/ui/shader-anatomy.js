// §G.3 (UI v2) — Overlay « anatomie du shader »
//
// Couche pédagogique : annote en ligne les éléments clés du code (point
// d'entrée mainImage, uniforms, constantes, lectures de canaux, fonctions)
// pour aider les nouveaux venus. Bascule via la palette ; n'écrit jamais
// dans le code (décorations Monaco uniquement).

import * as monaco from 'monaco-editor';
import { state } from '../core/state.js';

let _enabled = false;
let _ids = [];
let _deb = null;

// [regex, note] — premier match par ligne
/** @type {Array<[RegExp, string | ((m: RegExpExecArray) => string)]>} */
const RULES = [
  [/\bvoid\s+mainImage\s*\(/, 'entry point — runs once per pixel'],
  [/\bvoid\s+main\s*\(/, 'entry point'],
  [/\buniform\s+\w+/, 'uniform input (set from outside)'],
  [/#define\s+\w+/, 'compile-time constant'],
  [/\bconst\s+\w+\s+\w+\s*=/, 'constant'],
  [/\btexture\s*\(\s*iChannel([0-3])/, (m) => `samples channel ${m[1]}`],
  [/\biChannel([0-3])\b/, (m) => `input channel ${m[1]}`],
  [/\b(?:float|vec[234]|mat[234]|int|bool)\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*\{?\s*$/, (m) => `function · ${m[1]}()`],
];

function _scan() {
  const model = state.editor?.getModel();
  if (!model) { _ids = state.editor ? state.editor.deltaDecorations(_ids, []) : []; return; }
  const decos = [];
  const lineCount = model.getLineCount();
  for (let ln = 1; ln <= lineCount; ln++) {
    const text = model.getLineContent(ln);
    if (!text.trim() || text.trim().startsWith('//')) continue;
    for (const [re, note] of RULES) {
      const m = re.exec(text);
      if (m) {
        const label = typeof note === 'function' ? note(m) : note;
        decos.push({
          range: new monaco.Range(ln, 1, ln, model.getLineMaxColumn(ln)),
          options: { after: { content: `   ◂ ${label}`, inlineClassName: 'anatomy-note' } },
        });
        break; // une seule note par ligne
      }
    }
  }
  _ids = state.editor.deltaDecorations(_ids, decos);
}

function _scanDebounced() { clearTimeout(_deb); _deb = setTimeout(() => { if (_enabled) _scan(); }, 250); }

export function toggleShaderAnatomy(force) {
  _enabled = force !== undefined ? force : !_enabled;
  if (_enabled) _scan();
  else if (state.editor) _ids = state.editor.deltaDecorations(_ids, []);
  return _enabled;
}

export function initShaderAnatomy() {
  if (!state.editor) return;
  state.editor.onDidChangeModelContent(_scanDebounced);
}
