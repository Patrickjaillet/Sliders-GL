import { state } from '../core/state.js';
import { fmtN } from '../core/utils.js';
import { setSliderHooks, updateFill, patchLine } from './slider.js';

export const slHistory = [];
export let slHistIdx = -1;
export let _suppressHist = false;
const COALESCE_MS = 500;
let _lastHistMeta = null;

export function slPushHistory(id, oldVal, newVal) {
  if (_suppressHist) return;
  const now = Date.now();

  if (
    _lastHistMeta &&
    _lastHistMeta.id === id &&
    slHistIdx === slHistory.length - 1 &&
    (now - _lastHistMeta.ts) < COALESCE_MS
  ) {
    slHistory[slHistIdx].newVal = newVal;
    _lastHistMeta.ts = now;
    return;
  }

  slHistory.splice(slHistIdx + 1);
  slHistory.push({ id, oldVal, newVal });
  slHistIdx = slHistory.length - 1;
  if (slHistory.length > 100) {
    slHistory.shift();
    slHistIdx = Math.max(-1, slHistIdx - 1);
  }
  _lastHistMeta = { id, ts: now };
}

export function slUndo() {
  if (slHistIdx < 0) return;
  const { id, oldVal } = slHistory[slHistIdx--];
  applySliderValue(id, oldVal);
}

export function slRedo() {
  if (slHistIdx >= slHistory.length - 1) return;
  slHistIdx++;
  const { id, newVal } = slHistory[slHistIdx];
  applySliderValue(id, newVal);
}

export function applySliderValue(id, val) {
  const e = state.varMap[id];
  if (!e) return;
  _suppressHist = true;
  e.value = val;
  const sv = document.getElementById('sv-' + id);
  if (sv) sv.value = fmtN(val, e.decimals);
  updateFill(id, e);
  patchLine(e);
  _suppressHist = false;
}

export function resetSliderHistory() {
  slHistory.length = 0;
  slHistIdx = -1;
  _lastHistMeta = null;
}

export function hook6() {
  if (hook6['_installed']) return;
  hook6['_installed'] = true;
  setSliderHooks(function(id, oldVal, newVal) {
    if (oldVal !== undefined && newVal !== undefined) slPushHistory(id, oldVal, newVal);
  }, function(id, oldVal, newVal) {
    if (oldVal !== undefined && newVal !== undefined) slPushHistory(id, oldVal, newVal);
  });
}
