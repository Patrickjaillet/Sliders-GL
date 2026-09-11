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
import {
  setTimelineLoop,
  isTimelineLoopEnabled,
  setTimelineLoopDuration,
} from '../render/raf-loop.js';

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
    btn.setAttribute(
      'aria-label',
      vpFullscreen ? 'Exit fullscreen viewport' : 'Toggle fullscreen viewport'
    );
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

document.addEventListener('keydown', (e) => {
  if (trapModalFocus(e)) return;
  if (e.key === 'F11') {
    e.preventDefault();
    toggleFullscreenVP();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
    e.preventDefault();
    toggleCodeFocus();
    return;
  }
  // Fix 3.4 — Ctrl+Shift+S dupliqué entre viewport.js et io/project-ui.js.
  // En mode navigateur (!isTauri()) les deux handlers se déclenchaient en cascade.
  // Utiliser stopImmediatePropagation() pour qu'un seul handler s'exécute.
  if (
    (e.ctrlKey || e.metaKey) &&
    !e.shiftKey &&
    e.key === 'z' &&
    e.target.tagName !== 'INPUT' &&
    e.target.tagName !== 'TEXTAREA'
  ) {
    e.preventDefault();
    slUndo();
    return;
  }
  if (
    (e.ctrlKey || e.metaKey) &&
    ((e.shiftKey && e.key === 'z') || e.key === 'y') &&
    e.target.tagName !== 'INPUT' &&
    e.target.tagName !== 'TEXTAREA'
  ) {
    e.preventDefault();
    slRedo();
    return;
  }
  if (e.key === 'Escape') {
    if (document.getElementById('ctxMenu')?.classList.contains('open')) {
      document.getElementById('ctxMenu').classList.remove('open');
      return;
    }
    if (document.getElementById('stModal')?.classList.contains('open')) {
      closeSTModal();
      return;
    }
    if (document.getElementById('confirmModal')?.classList.contains('open')) {
      closeConfirmModal();
      return;
    }
    if (document.getElementById('exportModal')?.classList.contains('open')) {
      closeExportModal();
      return;
    }
    if (_codeFocus) {
      toggleCodeFocus(false);
      return;
    }
    if (vpFullscreen) {
      toggleFullscreenVP();
      return;
    }
  }
  if (
    e.key === ' ' &&
    e.target.tagName !== 'INPUT' &&
    e.target.tagName !== 'TEXTAREA' &&
    !e.target.closest('.monaco-editor')
  ) {
    e.preventDefault();
    togglePause();
  }
});

// Editor/viewport are now a fixed-width two-column layout (editor left,
// viewport right — see layout.css .editor-col/.viewport-col) instead of a
// vertically resizable stack, so the old drag-to-resize splitter and its
// height persistence (sl_editorH / sl_editorH_map) no longer apply.

let pausedB = false;
function togglePause() {
  pausedB = !pausedB;
  state.paused = pausedB;
  const btn = document.getElementById('pbtn');
  if (btn) {
    // Phase 3: swap SVG icon pause <-> play
    const iconUse = btn.querySelector('svg use');
    if (iconUse) {
      iconUse.setAttribute('href', pausedB ? '#icon-play' : '#icon-pause');
    }
    // Update text node
    const textNode = [...btn.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (textNode) textNode.textContent = pausedB ? ' paused' : ' pause';
    // Phase Y — strong visual differentiation vs the play state (reuses the
    // existing .hb.active styling: accent-dim background, accent text/icon)
    btn.classList.toggle('active', pausedB);
  }
  // §6 roadmap — keep the timeline strip's own play/pause button in sync
  // regardless of which trigger (topbar #pbtn, Space, #tpill) called this.
  const tlBtn = document.getElementById('tlPlayPauseBtn');
  if (tlBtn) {
    const iconUse = tlBtn.querySelector('svg use');
    if (iconUse) iconUse.setAttribute('href', pausedB ? '#icon-play' : '#icon-pause');
    tlBtn.setAttribute('aria-pressed', String(pausedB));
    tlBtn.title = pausedB ? 'Play (Space)' : 'Pause (Space)';
  }
}

// ── Phase R — Time scrubber bar ───────────────────────────────────────────────
// Revealed on hover near the bottom of the canvas (.cw:hover). Lets the user
// seek/scrub state.simTime directly without opening a separate panel.
function _initTimeScrubber() {
  const bar = document.getElementById('timelineStrip');
  const range = document.getElementById('timeScrubber');
  const resetBtn = document.getElementById('timeScrubberReset');
  const label = document.getElementById('vpScrubT');
  const tpill = document.getElementById('tpill');
  const fpspill = document.getElementById('fpspill');
  if (!bar || !range) return;

  // §6 roadmap — play/pause and loop directly in the timeline strip,
  // instead of only the topbar's global pause button (#pbtn).
  const playPauseBtn = document.getElementById('tlPlayPauseBtn');
  playPauseBtn?.addEventListener('click', () => togglePause());

  const loopBtn = document.getElementById('tlLoopBtn');
  const loopOn = safeLocalGet('sl_timelineLoop', '0') === '1';
  setTimelineLoop(loopOn);
  loopBtn?.classList.toggle('active', loopOn);
  loopBtn?.setAttribute('aria-pressed', String(loopOn));
  loopBtn?.addEventListener('click', () => {
    const on = !isTimelineLoopEnabled();
    if (on) setTimelineLoopDuration(parseFloat(range.max) || 10);
    setTimelineLoop(on);
    safeLocalSet('sl_timelineLoop', on ? '1' : '0');
    loopBtn.classList.toggle('active', on);
    loopBtn.setAttribute('aria-pressed', String(on));
  });
  setTimelineLoopDuration(parseFloat(range.max) || 10);

  // §6 roadmap — keyframe markers from state.timeline.keys (populated only
  // by a project .zgl that already had a timeline — there is no in-app
  // keyframe editor yet, so this is usually empty and renders nothing).
  function _renderMarkers() {
    const wrap = document.getElementById('tlMarkers');
    if (!wrap) return;
    const keys = state.timeline?.keys;
    if (!keys || typeof keys !== 'object') {
      wrap.innerHTML = '';
      return;
    }
    const max = parseFloat(range.max) || 1;
    wrap.innerHTML = Object.keys(keys)
      .map(Number)
      .filter((t) => Number.isFinite(t) && t >= 0 && t <= max)
      .map(
        (t) =>
          `<div class="tl-marker" style="left:${(t / max) * 100}%" title="Keyframe at t=${t.toFixed(2)}s"></div>`
      )
      .join('');
  }
  _renderMarkers();
  window.addEventListener('zgl:project-loaded', _renderMarkers);

  let dragging = false;

  range.addEventListener('pointerdown', () => {
    dragging = true;
    bar.classList.add('active');
    // Scrubbing only makes sense while paused — otherwise the RAF loop's
    // `state.simTime += dt` immediately overrides whatever the user dragged to.
    if (!state.paused) {
      togglePause();
      tpill?.classList.add('scrub-active');
    }
  });
  range.addEventListener('pointerup', () => {
    dragging = false;
  });
  range.addEventListener('input', () => {
    const v = parseFloat(range.value) || 0;
    state.simTime = v;
    if (label) label.textContent = `t = ${v.toFixed(2)} s`;
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
      if (label) label.textContent = `t = ${v.toFixed(2)} s`;
    }
    requestAnimationFrame(_sync);
  }
  requestAnimationFrame(_sync);
}

// §2 roadmap rework — the monitor (.cw) now fills #viewportCol at its real
// size instead of staying fixed at 800×450 with a CSS scale-fit shrink (see
// layout.css .cw and gl/renderer.js doResize()/_measureViewportSize()).
// This observer's job is now simply to trigger a real GL resize whenever
// the column's box changes — splitter drags, sidebar/inspector open-close,
// window resize, code-focus toggle — none of which fire a `window resize`
// event on their own, so `doResize()`'s own `window.addEventListener`
// (gl/renderer.js initGL()) isn't enough by itself.
export function initPasteboardObserver() {
  const zone = document.getElementById('viewportCol');
  if (!zone) {
    document.addEventListener('zgl:ui-ready', initPasteboardObserver, { once: true });
    return;
  }

  let queued = false;
  const ro = new ResizeObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      doResize();
    });
  });
  ro.observe(zone);
}

export {
  vpFullscreen,
  toggleFullscreenVP,
  pausedB,
  togglePause,
  _initTimeScrubber as initTimeScrubber,
};
