// §J.2 (UI v2) — Modes focus en un geste
//
// Compose les bascules existantes en 3 préréglages :
//   • Zen         — l'éditeur domine (code focus), canvas en vignette
//   • Performance — canvas seul plein écran, HUD visible
//   • Teaching    — grande police + guides, pour démonstration
// Ré-appeler le même mode revient au mode normal.

import { state } from '../core/state.js';
import { toggleCodeFocus, toggleFullscreenVP, vpFullscreen } from './viewport.js';
import { toggleGuides } from './canvas-tools.js';
import { toast } from '../io/actions.js';

let _mode = 'normal';

function _baseFont() {
  const f = parseInt(localStorage.getItem('sl_editorFont') || '12', 10);
  return f >= 8 && f <= 32 ? f : 12;
}

function _reset() {
  toggleCodeFocus(false);
  if (vpFullscreen) toggleFullscreenVP(); // sortir du plein écran s'il est actif
  toggleGuides(false);
  if (state.editor) state.editor.updateOptions({ fontSize: _baseFont() });
}

export function setFocusMode(name) {
  _reset();
  if (name === _mode || name === 'normal') {
    _mode = 'normal';
    toast('Focus: Normal', 'info');
    return 'normal';
  }
  _mode = name;
  if (name === 'zen') {
    toggleCodeFocus(true);
    toast('Focus: Zen — editor', 'ok');
  } else if (name === 'performance') {
    if (!vpFullscreen) toggleFullscreenVP();
    toast('Focus: Performance — canvas', 'ok');
  } else if (name === 'teaching') {
    if (state.editor) state.editor.updateOptions({ fontSize: Math.min(_baseFont() + 5, 22) });
    toggleGuides(true);
    toast('Focus: Teaching', 'ok');
  }
  return _mode;
}

export const focusZen = () => setFocusMode('zen');
export const focusPerformance = () => setFocusMode('performance');
export const focusTeaching = () => setFocusMode('teaching');
export const focusNormal = () => setFocusMode('normal');
