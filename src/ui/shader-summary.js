// §H.2 (UI v2) — Résumé du shader pour lecteurs d'écran
//
// Maintient une région aria-live (polite) décrivant la structure : nombre de
// passes actives, d'uniforms exposés. Mis à jour uniquement sur changements
// structurels (passes, variables) pour ne pas spammer le lecteur d'écran —
// le FPS, qui change en continu, en est volontairement exclu.

import { state } from '../core/state.js';

let _region = null;
let _deb = null;

function _summary() {
  const uniforms = (state.vars || []).length;
  return `Shader: 1 pass (Image); `
    + `${uniforms} uniform${uniforms !== 1 ? 's' : ''}.`;
}

function _update() {
  if (!_region) return;
  const txt = _summary();
  if (_region.textContent !== txt) _region.textContent = txt;
}

function _updateDebounced() { clearTimeout(_deb); _deb = setTimeout(_update, 300); }

export function initShaderSummary() {
  if (document.getElementById('shader-summary')) return;
  _region = document.createElement('div');
  _region.id = 'shader-summary';
  _region.className = 'sr-only';
  _region.setAttribute('role', 'status');
  _region.setAttribute('aria-live', 'polite');
  _region.setAttribute('aria-atomic', 'true');
  document.body.appendChild(_region);

  window.addEventListener('zgl:passchange', _updateDebounced);
  document.addEventListener('variables-updated', _updateDebounced);
  setTimeout(_update, 800);
}
