// §3.5 roadmap UI/UX — Valeurs live des uniforms en annotation inline
//
// Affiche, à la première occurrence des uniforms runtime (iTime, iFrame,
// iResolution, iMouse, iTimeDelta) dans le code, leur valeur courante sous
// forme d'inlay hint discret — comme les « lens » d'éditeur, mais pour les
// valeurs d'exécution. Les valeurs sont lues depuis state.mat3.uniforms et
// rafraîchies ~3×/seconde via l'événement onDidChangeInlayHints.

import * as monaco from 'monaco-editor';
import { state } from '../core/state.js';

let _enabled = true;
let _emitter = null;
let _timer = null;

function _u(name) {
  return state.mat3?.uniforms?.[name]?.value;
}

// Formatteurs de valeur par uniform (retournent null si indisponible).
const VALUE_FNS = {
  iTime: () => {
    const v = _u('iTime');
    return typeof v === 'number' ? `${v.toFixed(2)}s` : `${(state.simTime || 0).toFixed(2)}s`;
  },
  iTimeDelta: () => {
    const v = _u('iTimeDelta');
    return typeof v === 'number' ? `${(v * 1000).toFixed(1)}ms` : null;
  },
  iFrame: () => {
    const v = _u('iFrame');
    return Number.isFinite(v) ? `${v}` : `${state.fidx || 0}`;
  },
  iResolution: () => {
    const v = _u('iResolution');
    if (v && typeof v.x === 'number') return `${Math.round(v.x)}×${Math.round(v.y)}`;
    return null;
  },
  iMouse: () => {
    const v = _u('iMouse');
    if (v && typeof v.x === 'number') return `${Math.round(v.x)}, ${Math.round(v.y)}`;
    return null;
  },
};

const _NAMES = Object.keys(VALUE_FNS);
// InlayHintKind.Type n'existe pas dans toutes les versions de monaco-editor ;
// on le récupère défensivement (un kind absent ne bloque pas le rendu).
const _HINT_KIND = monaco.languages.InlayHintKind ? monaco.languages.InlayHintKind.Type : undefined;

function _provideInlayHints(model) {
  if (!_enabled) return { hints: [], dispose() {} };
  const hints = [];
  const seen = new Set();
  const lineCount = model.getLineCount();

  for (let ln = 1; ln <= lineCount && seen.size < _NAMES.length; ln++) {
    const text = model.getLineContent(ln);
    if (!text.includes('i')) continue;
    for (const name of _NAMES) {
      if (seen.has(name)) continue;
      const re = new RegExp(`\\b${name}\\b`);
      const m = re.exec(text);
      if (!m) continue;
      const val = VALUE_FNS[name]();
      if (val == null) { seen.add(name); continue; }
      seen.add(name);
      const col = m.index + name.length + 1;
      const hint = { position: { lineNumber: ln, column: col }, label: ` = ${val}`, paddingLeft: true };
      if (_HINT_KIND !== undefined) hint.kind = _HINT_KIND;
      hints.push(hint);
    }
  }

  // Also annotate #define lines with their current slider value (if different from the literal).
  const vars = state.vars;
  if (Array.isArray(vars) && vars.length) {
    const varMap = new Map(vars.map(v => [String(v.label || ''), v]));
    for (let ln = 1; ln <= lineCount; ln++) {
      const text = model.getLineContent(ln);
      if (!text.startsWith('#define')) continue;
      const dm = /^#define\s+(\w+)\s+([-+]?\d*\.?\d+)/.exec(text);
      if (!dm) continue;
      const entry = varMap.get(dm[1]);
      if (!entry) continue;
      const live = typeof entry.value === 'number' ? entry.value : parseFloat(entry.value);
      const literal = parseFloat(dm[2]);
      if (isNaN(live) || live === literal) continue;
      const col = dm[0].length + 1;
      const hint = { position: { lineNumber: ln, column: col }, label: ` [live: ${live.toFixed(4).replace(/\.?0+$/, '')}]`, paddingLeft: true };
      if (_HINT_KIND !== undefined) hint.kind = _HINT_KIND;
      hints.push(hint);
    }
  }

  return { hints, dispose() {} };
}

/** Enregistre le provider d'inlay hints + boucle de rafraîchissement. */
export function initInlayUniformValues() {
  _emitter = new monaco.Emitter();

  const provider = {
    onDidChangeInlayHints: _emitter.event,
    provideInlayHints: (model) => _provideInlayHints(model),
  };
  monaco.languages.registerInlayHintsProvider('glsl', provider);
  monaco.languages.registerInlayHintsProvider('wgsl', provider);

  // Rafraîchit les valeurs ~3×/s tant que c'est activé et que le rendu tourne.
  _timer = setInterval(() => {
    if (_enabled && !state.paused && _emitter) _emitter.fire();
  }, 330);
}

/** Active/désactive l'affichage des valeurs inline. */
export function toggleInlayUniformValues() {
  _enabled = !_enabled;
  const btn = document.getElementById('inlayValBtn');
  if (btn) {
    btn.classList.toggle('active', _enabled);
    btn.setAttribute('aria-pressed', String(_enabled));
  }
  _emitter?.fire();
  return _enabled;
}
