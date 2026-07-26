// Fullscreen viewport toggle & editor/canvas splitter

import { state } from '../core/state.js';
import { trapModalFocus } from '../io/actions.js';
import { slUndo, slRedo } from './undo.js';
import { closeConfirmModal } from '../io/library.js';
import { closeExportModal } from '../export/export.js';
import { closeSTModal } from '../io/shadertoy.js';
import { doResize } from '../gl/renderer.js';
import { safeLocalGet, safeLocalSet } from '../core/utils.js';
import { toggleInspectorPanel } from './inspector-context.js';

let vpFullscreen = false;
function toggleFullscreenVP() {
  vpFullscreen = !vpFullscreen;
  const layout = document.getElementById('layout');
  const btn = document.getElementById('vpfbtn');
  layout.classList.toggle('vp-fullscreen', vpFullscreen);
  if (btn) {
    btn.classList.toggle('active', vpFullscreen);
    const label = btn.querySelector('.hb-label');
    if (label) label.textContent = vpFullscreen ? 'exit full' : 'fullscreen';
    btn.setAttribute('aria-label', vpFullscreen ? 'Exit fullscreen viewport' : 'Toggle fullscreen viewport');
  }
  setTimeout(doResize, 50);
  safeLocalSet('sl_vpFull', vpFullscreen ? '1' : '0');
}

// §2.3 — Mode « code focus » : l'éditeur occupe l'essentiel de l'espace, le
// canvas est réduit à une vignette (coin haut-droit). Distinct du plein écran
// viewport (qui masque l'éditeur).
let _codeFocus = false;
export function toggleCodeFocus(force) {
  _codeFocus = force !== undefined ? force : !_codeFocus;
  const right = document.getElementById('viewport-zone');
  if (right) right.classList.toggle('code-focus', _codeFocus);
  const btn = document.getElementById('codeFocusBtn');
  if (btn) {
    btn.classList.toggle('active', _codeFocus);
    btn.setAttribute('aria-pressed', String(_codeFocus));
  }
  // Laisse le layout se stabiliser avant de redimensionner le rendu GL.
  setTimeout(doResize, 60);
}

document.addEventListener('keydown', e => {
  if (trapModalFocus(e)) return;
  if (e.key === 'F11') { e.preventDefault(); toggleFullscreenVP(); }
  if ((e.ctrlKey||e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); toggleCodeFocus(); return; }
  // Fix 3.4 — Ctrl+Shift+S dupliqué entre viewport.js et io/project-ui.js.
  // En mode navigateur (!isTauri()) les deux handlers se déclenchaient en cascade.
  // Utiliser stopImmediatePropagation() pour qu'un seul handler s'exécute.
  if ((e.ctrlKey||e.metaKey) && !e.shiftKey && e.key === 'z' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault(); slUndo(); return;
  }
  if ((e.ctrlKey||e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y') && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault(); slRedo(); return;
  }
  if (e.key === 'Escape') {
    if (document.getElementById('ctxMenu')?.classList.contains('open')) { document.getElementById('ctxMenu').classList.remove('open'); return; }
    if (document.getElementById('stModal')?.classList.contains('open')) { closeSTModal(); return; }
    if (document.getElementById('confirmModal')?.classList.contains('open')) { closeConfirmModal(); return; }
    if (document.getElementById('exportModal')?.classList.contains('open')) { closeExportModal(); return; }
    if (_codeFocus) { toggleCodeFocus(false); return; }
    if (vpFullscreen) { toggleFullscreenVP(); return; }
  }
  if (e.key === ' ' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && !e.target.closest('.monaco-editor')) { e.preventDefault(); togglePause(); }
});

// Editor/viewport are now a fixed-width two-column layout (editor left,
// viewport right — see layout.css .editor-col/.viewport-col) instead of a
// vertically resizable stack, so the old drag-to-resize splitter and its
// height persistence (sl_editorH / sl_editorH_map) no longer apply.

let pausedB = false;
function togglePause() {
  pausedB = !pausedB; state.paused = pausedB;
  const btn = document.getElementById('pbtn');
  if (btn) {
    // Phase 3: swap SVG icon pause <-> play
    const iconUse = btn.querySelector('svg use');
    if (iconUse) {
      iconUse.setAttribute('href', pausedB ? '#icon-play' : '#icon-pause');
    }
    // Update text node
    const textNode = [...btn.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (textNode) textNode.textContent = pausedB ? ' paused' : ' pause';
    // Phase Y — strong visual differentiation vs the play state (reuses the
    // existing .hb.active styling: accent-dim background, accent text/icon)
    btn.classList.toggle('active', pausedB);
  }
}

// ── Phase R — Time scrubber bar ───────────────────────────────────────────────
// Revealed on hover near the bottom of the canvas (.cw:hover). Lets the user
// seek/scrub state.simTime directly without opening a separate panel.
function _initTimeScrubber() {
  const bar      = document.getElementById('timelineStrip');
  const range    = document.getElementById('timeScrubber');
  const resetBtn = document.getElementById('timeScrubberReset');
  const label    = document.getElementById('vpScrubT');
  const tpill    = document.getElementById('tpill');
  const fpspill  = document.getElementById('fpspill');
  if (!bar || !range) return;

  let dragging = false;

  range.addEventListener('pointerdown', () => {
    dragging = true;
    bar.classList.add('active');
    // Scrubbing only makes sense while paused — otherwise the RAF loop's
    // `state.simTime += dt` immediately overrides whatever the user dragged to.
    if (!state.paused) { togglePause(); tpill?.classList.add('scrub-active'); }
  });
  range.addEventListener('pointerup',   () => { dragging = false; });
  range.addEventListener('input', () => {
    const v = parseFloat(range.value) || 0;
    state.simTime = v;
    if (label) label.textContent = 't = ' + v.toFixed(2) + ' s';
  });

  resetBtn?.addEventListener('click', () => {
    state.simTime = 0;
    state.fidx = 0;
    range.value = '0';
    if (label) label.textContent = 't = 0.00 s';
  });

  // §R — clic sur le pill #tpill → bascule pause + met le scrubber en évidence
  tpill?.addEventListener('click', () => {
    togglePause();
    tpill.classList.toggle('scrub-active', state.paused);
    bar.classList.toggle('active', state.paused);
  });

  // §R — clic sur le pill FPS → ouvre/ferme le panneau inspector
  fpspill?.addEventListener('click', () => toggleInspectorPanel());

  // Sync inverse : reflète state.simTime sur le scrubber tant qu'il n'est pas
  // en cours de drag (sinon la valeur affichée se battrait avec le doigt/la souris).
  function _sync() {
    if (!dragging) {
      const v = state.simTime || 0;
      if (v > parseFloat(range.max)) range.max = String(Math.ceil(v / 10) * 10 + 10);
      range.value = String(v);
      if (label) label.textContent = 't = ' + v.toFixed(2) + ' s';
    }
    requestAnimationFrame(_sync);
  }
  requestAnimationFrame(_sync);
}

const COMP_W = 800;
const COMP_MARGIN = 40;

export function initPasteboardObserver() {
  const zone = document.getElementById('viewportCol');
  const cw   = document.getElementById('cwrap');
  if (!zone || !cw) {
    document.addEventListener('zgl:ui-ready', initPasteboardObserver, { once: true });
    return;
  }

  const minColWidth = COMP_W + COMP_MARGIN;

  function update(availableWidth) {
    if (availableWidth < minColWidth) {
      const scale = Math.max(0.25, (availableWidth - COMP_MARGIN) / COMP_W);
      cw.style.setProperty('--cw-scale', scale.toFixed(4));
      cw.classList.add('scale-fit');
    } else {
      cw.style.removeProperty('--cw-scale');
      cw.classList.remove('scale-fit');
    }
  }

  const ro = new ResizeObserver(entries => {
    const entry = entries[0];
    update(entry ? entry.contentRect.width : zone.clientWidth);
  });
  ro.observe(zone);
  update(zone.clientWidth);
}

export { vpFullscreen, toggleFullscreenVP, pausedB, togglePause, _initTimeScrubber as initTimeScrubber };
