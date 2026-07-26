// §1 Main editor area — Blender-style area split/join + per-area "area
// type" header dropdowns, adapted to this app's fixed viewport/editor pair
// (see ROADMAP.md, "Main editor area").
//
// This app only ever has exactly two candidate areas (the 800×450 viewport
// and the GLSL editor, now side by side as editor-col | viewport-col — see
// layout.css) — so rather than a general-purpose area tree, this is a
// small state machine with exactly three states:
//   'split'    — normal view, both areas visible (default)
//   'viewport' — joined into the viewport; the editor pane is hidden
//   'editor'   — joined into the editor; reuses the pre-existing
//                "code focus" mode (Ctrl+Shift+F), which already shrinks
//                the canvas to a floating thumbnail
//
// The area-type dropdowns in each area's header (click/keyboard) are the
// entry point into this state machine — selecting the *other* area's entry
// "takes over" the region, exactly like picking a different editor type in
// a real Blender area header.

import { doResize } from '../gl/renderer.js';
import { toggleCodeFocus } from './viewport.js';

function _zone()   { return document.getElementById('viewport-zone'); }

function _isViewportJoined() { return _zone()?.classList.contains('viewport-focus') === true; }
function _isEditorJoined()   { return _zone()?.classList.contains('code-focus') === true; }

function _setViewportJoined(on) {
  const zone = _zone();
  if (zone) zone.classList.toggle('viewport-focus', on);
  setTimeout(doResize, 60);
}

// Applies one of the three states, going through whichever underlying
// mechanism owns it (code-focus is pre-existing and used as-is).
function _applyMode(mode) {
  if (mode === 'viewport') {
    if (_isEditorJoined()) toggleCodeFocus(false);
    _setViewportJoined(true);
  } else if (mode === 'editor') {
    _setViewportJoined(false);
    if (!_isEditorJoined()) toggleCodeFocus(true);
  } else {
    _setViewportJoined(false);
    if (_isEditorJoined()) toggleCodeFocus(false);
  }
}

// ── Per-area header dropdown (area-type selector) ─────────────────────
function _wireAreaTypeMenu(btnId, menuId) {
  const btn  = document.getElementById(btnId);
  const menu = document.getElementById(menuId);
  if (!btn || !menu) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });

  menu.querySelectorAll('[data-area-choice]').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      _applyMode(item.dataset.areaChoice);
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    });
  });

  document.addEventListener('click', e => {
    if (btn.contains(/** @type {Node} */ (e.target)) || menu.contains(/** @type {Node} */ (e.target))) return;
    if (menu.classList.contains('open')) {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

// Each header dropdown's "active" checkmark reflects that area's own fixed
// identity (the viewport header always self-describes as "Viewport", the
// editor header as "Shader Editor") — picking the *other* entry is an
// action (join elsewhere), not a state this area can be in itself, so
// there is nothing here that needs to change when the join mode changes:
// whichever area gets taken over simply disappears (its header included),
// exactly like a joined-away area vanishing in Blender.
function _initAreaTypeMenus() {
  _wireAreaTypeMenu('vpAreaTypeBtn', 'vpAreaTypeMenu');
  _wireAreaTypeMenu('edAreaTypeBtn', 'edAreaTypeMenu');
}

export function initAreaSplit() {
  const zone = _zone();
  if (!zone) {
    document.addEventListener('zgl:ui-ready', initAreaSplit, { once: true });
    return;
  }
  _initAreaTypeMenus();

  // Escape already exits code-focus / viewport fullscreen (viewport.js) —
  // extend the same key to also split back out of "joined into viewport".
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _isViewportJoined()) {
      _applyMode('split');
    }
  });
}
