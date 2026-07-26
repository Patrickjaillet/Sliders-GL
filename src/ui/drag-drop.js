import { state } from '../core/state.js';
import { buildUI } from './slider.js';
import { captureOrder } from './slider-customizations.js';

let _dragId = null;

export function slDragStart(e, id) {
  _dragId = id;
  e.dataTransfer.effectAllowed = 'move';
  // Phase Y — also expose the variable name as plain text, so dropping the
  // row onto the Monaco editor (handled separately in editor.js) can insert
  // it at the cursor. The sidebar reorder drop handlers below ignore this.
  const entry = state.varMap?.[id];
  const name = entry?.defineName || entry?.label;
  if (name) e.dataTransfer.setData('text/plain', name);
}

export function slDragOver(e, id) {
  if (_dragId && _dragId !== id) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.getElementById('sr-' + id)?.classList.add('drag-over');
  }
}

export function slDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

export function slDrop(e, toId) {
  e.preventDefault();
  document.getElementById('sr-' + toId)?.classList.remove('drag-over');
  if (!_dragId || _dragId === toId) { _dragId = null; return; }
  const fromIdx = state.vars.findIndex(v => v.id === _dragId);
  const toIdx   = state.vars.findIndex(v => v.id === toId);
  if (fromIdx < 0 || toIdx < 0) { _dragId = null; return; }
  const [item] = state.vars.splice(fromIdx, 1);
  state.vars.splice(toIdx, 0, item);
  // Persist the new order so it survives the next reparse (roadmap Phase C).
  captureOrder(state.vars);
  buildUI(state.vars);
  _dragId = null;
}
