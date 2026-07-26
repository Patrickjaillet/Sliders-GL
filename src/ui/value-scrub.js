// §A.3 (UI v2) — Scrub de n'importe quel nombre dans l'éditeur
//
// Alt+glisser sur un littéral numérique dans Monaco le modifie en direct
// (avec aperçu du rendu). Shift = pas fin (÷10), Ctrl = pas grossier (×10).
// Fonctionne même sur des valeurs non promues en sliders.
//
// Alt est aussi le modificateur multi-curseur de Monaco : on n'intercepte
// (capture + stopImmediatePropagation) QUE lorsque le pointeur est sur un
// nombre ; ailleurs, Alt+clic conserve son comportement multi-curseur.

import * as monaco from 'monaco-editor';
import { state } from '../core/state.js';
import { applyAndParse } from '../io/actions.js';

const NUM_RE = /-?(?:\d+\.\d+|\.\d+|\d+)/g;

let _hudEl = null;
let _applyDeb = null;

function _hud() {
  if (!_hudEl) {
    _hudEl = document.createElement('div');
    _hudEl.id = 'zgl-scrub-hud';
    _hudEl.className = 'zgl-scrub-hud';
    document.body.appendChild(_hudEl);
  }
  _hudEl.style.display = 'block';
  return _hudEl;
}

function _liveApply() {
  clearTimeout(_applyDeb);
  _applyDeb = setTimeout(() => { try { applyAndParse(); } catch { /* noop */ } }, 90);
}

function _numberAt(model, pos) {
  const line = model.getLineContent(pos.lineNumber);
  NUM_RE.lastIndex = 0;
  let m;
  while ((m = NUM_RE.exec(line)) !== null) {
    const start = m.index, end = start + m[0].length;
    if (pos.column - 1 >= start && pos.column - 1 <= end) return { text: m[0], start };
  }
  return null;
}

function _onMouseDown(e) {
  if (!e.altKey || e.button !== 0 || !state.editor) return;
  const tgt = state.editor.getTargetAtClientPoint(e.clientX, e.clientY);
  if (!tgt || !tgt.position) return;
  const model = state.editor.getModel();
  if (!model) return;
  const num = _numberAt(model, tgt.position);
  if (!num) return; // pas sur un nombre → laisser Monaco (multi-curseur)

  e.preventDefault();
  e.stopImmediatePropagation();

  const decimals = (num.text.split('.')[1] || '').length;
  const step = decimals > 0 ? Math.pow(10, -decimals) : 1;
  const startVal = parseFloat(num.text);
  const ln = tgt.position.lineNumber;
  const startX = e.clientX;
  let curLen = num.text.length;

  document.body.style.cursor = 'ew-resize';
  document.body.style.userSelect = 'none';
  const hud = _hud();
  hud.textContent = num.text;

  const onMove = (ev) => {
    const dx = ev.clientX - startX;
    const scale = step * (ev.shiftKey ? 0.1 : (ev.ctrlKey || ev.metaKey) ? 10 : 1);
    const dec = ev.shiftKey && decimals === 0 ? 1 : (ev.shiftKey ? Math.min(decimals + 1, 4) : decimals);
    const v = startVal + Math.round(dx / 4) * scale;
    const str = dec > 0 ? v.toFixed(dec) : String(Math.round(v));
    state.editor.executeEdits('scrub', [{
      range: new monaco.Range(ln, num.start + 1, ln, num.start + 1 + curLen),
      text: str,
      forceMoveMarkers: true,
    }]);
    curLen = str.length;
    hud.textContent = str;
    hud.style.left = (ev.clientX + 14) + 'px';
    hud.style.top = (ev.clientY - 10) + 'px';
    _liveApply();
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mouseup', onUp, true);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (_hudEl) _hudEl.style.display = 'none';
    _liveApply();
  };
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('mouseup', onUp, true);
}

// Roadmap Phase E — keyboard scrub: Alt+↑/↓ on the number under the caret
// nudges it (Shift = finer ×0.1, Ctrl = coarser ×10). Mouse-free alternative
// to Alt+drag. Only intercepts when the caret is actually on a numeric literal.
function _onKeyDown(e) {
  if (!e.altKey) return;
  const isUp = e.keyCode === monaco.KeyCode.UpArrow;
  const isDown = e.keyCode === monaco.KeyCode.DownArrow;
  if (!isUp && !isDown) return;
  const model = state.editor?.getModel();
  const pos = state.editor?.getPosition();
  if (!model || !pos) return;
  const num = _numberAt(model, pos);
  if (!num) return; // not on a number → let Monaco handle Alt+↑/↓ (move line)

  e.preventDefault();
  e.stopPropagation();

  const decimals = (num.text.split('.')[1] || '').length;
  let step = decimals > 0 ? Math.pow(10, -decimals) : 1;
  if (e.shiftKey) step *= 0.1;
  else if (e.ctrlKey || e.metaKey) step *= 10;
  const dec = e.shiftKey ? Math.min(decimals + 1, 4) : decimals;

  const v = parseFloat(num.text) + (isUp ? step : -step);
  const str = dec > 0 ? v.toFixed(dec) : String(Math.round(v));
  const ln = pos.lineNumber;
  state.editor.executeEdits('scrub-kbd', [{
    range: new monaco.Range(ln, num.start + 1, ln, num.start + 1 + num.text.length),
    text: str,
    forceMoveMarkers: true,
  }]);
  // Keep the caret inside the (possibly resized) token.
  state.editor.setPosition({ lineNumber: ln, column: num.start + 1 + str.length });
  _liveApply();
}

export function initValueScrub() {
  if (!state.editor || window._scrubBound) return;
  window._scrubBound = true;
  // Capture global : le handler ne fait quelque chose que si le pointeur (Alt)
  // est au-dessus d'un nombre dans l'éditeur (sinon il laisse passer Monaco).
  document.addEventListener('mousedown', _onMouseDown, true);
  // Keyboard scrub via Monaco's key handler (so we can pre-empt Alt+↑/↓).
  state.editor.onKeyDown(_onKeyDown);
}
