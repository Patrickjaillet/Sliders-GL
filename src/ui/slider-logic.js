// Slider logic — shader patching, sync from Monaco, hooks for undo history

import * as monaco from 'monaco-editor';
import { state } from '../core/state.js';
import { parseShader } from '../shader/parser.js';
import { applyGLShader } from '../gl/renderer.js';

let _fromSlider = false;
let _fromMonaco = false;
export let _liveDebounce = null;

// Hook container: set via setSliderHooks, read by slider.js's onSlide/onValChange
export const sliderHooks = { afterSlide: null, afterValChange: null };
const NUMERIC_TOKEN_RE = /^-?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?$/;

export function setFromMonaco(val) { _fromMonaco = val; }
export function isFromSlider() { return _fromSlider; }
export function isFromMonaco() { return _fromMonaco; }

export function setSliderHooks(nextAfterSlide, nextAfterValChange) {
  sliderHooks.afterSlide = nextAfterSlide;
  sliderHooks.afterValChange = nextAfterValChange;
}

function _syncEntryFromModel(model, entry) {
  const reparsed = parseShader(model.getValue());
  const fresh = reparsed.find(v => v.id === entry.id);
  if (!fresh) return false;
  entry.line = fresh.line;
  entry.col = fresh.col;
  entry.matchLen = fresh.matchLen;
  entry.tokenRaw = fresh.tokenRaw;
  entry.isScientific = fresh.isScientific;
  entry.scientificDecimals = fresh.scientificDecimals;
  return true;
}

function _isStableTokenAt(entry, lineContent) {
  const raw = lineContent.slice(entry.col, entry.col + entry.matchLen);
  if (!NUMERIC_TOKEN_RE.test(raw)) return false;
  const prev = entry.col > 0 ? lineContent[entry.col - 1] : '';
  const next = entry.col + entry.matchLen < lineContent.length ? lineContent[entry.col + entry.matchLen] : '';
  if ((prev && /[.\w]/.test(prev)) || (next && /[.\w]/.test(next))) return false;
  if (entry.tokenRaw && raw !== entry.tokenRaw) return false;
  return true;
}

// ── Patch shader line ────────────────────────────────────────────────────────
export function patchLine(e) {
  if (!state.editor || _fromMonaco) return;
  _fromSlider = true;
  const model = state.editor.getModel();
  if (!model) {
    _fromSlider = false;
    return;
  }

  let lineContent = model.getLineContent(e.line + 1);
  if (!_isStableTokenAt(e, lineContent)) {
    const synced = _syncEntryFromModel(model, e);
    if (!synced) {
      _fromSlider = false;
      console.warn('[patchLine] token drift detected and could not resync entry');
      return;
    }
    lineContent = model.getLineContent(e.line + 1);
    if (!_isStableTokenAt(e, lineContent)) {
      _fromSlider = false;
      console.warn('[patchLine] token drift persists after resync; patch skipped');
      return;
    }
  }

  const newTxt = fmtNum(e.value, e);
  const oldMatchLen = e.matchLen;
  const range = new monaco.Range(e.line + 1, e.col + 1, e.line + 1, e.col + 1 + oldMatchLen);
  model.pushEditOperations([], [{ range, text: newTxt }], () => null);
  const delta = newTxt.length - oldMatchLen;
  e.matchLen = newTxt.length;
  if (delta !== 0 && state.vars) {
    for (const v of state.vars) {
      if (v !== e && v.line === e.line && v.col > e.col) v.col += delta;
    }
  }
  e.tokenRaw = newTxt;
  _fromSlider = false;
  clearTimeout(_liveDebounce);
  _liveDebounce = setTimeout(() => { applyGLShader(state.editor.getValue()); }, 80);
}

// ── Step snapping — pure helper shared by the scrub-drag and keyboard nudge
// paths (§3 "high-precision sliders"). Extracted out of slider.js so the
// precision/step behavior is unit-testable without a DOM.
export function snapToStep(val, min, max, step) {
  if (!(step > 0)) return Math.max(min, Math.min(max, val));
  const stepped = Math.round((val - min) / step) * step + min;
  return Math.max(min, Math.min(max, stepped));
}

export function fmtNum(val, e) {
  if (e.isScientific) {
    const fractionDigits = Math.max(0, e.scientificDecimals || 0);
    return Number(val)
      .toExponential(fractionDigits)
      .replace('e+', 'e')
      .replace(/e(-?)0+(\d+)/, 'e$1$2');
  }
  if (e.decimals > 0) return val.toFixed(Math.max(1, e.decimals));
  return Math.round(val).toString();
}
