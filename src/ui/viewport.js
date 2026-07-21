// Fullscreen viewport toggle & editor/canvas splitter

import { state } from '../core/state.js';
import { trapModalFocus } from '../io/actions.js';
import { slUndo, slRedo } from './undo.js';
import { openLibrary, closeLibrary, libOpen, openSaveModal, closeSaveModal, closeConfirmModal, closeWizardModal } from '../io/library.js';
import { closeExportModal } from '../export/export.js';
import { closeSTModal } from '../io/shadertoy.js';
import { doResize } from '../gl/renderer.js';
import { safeLocalGet, safeLocalSet } from '../core/utils.js';
import { isTauri } from '../native/tauri.js';
import { togglePerfPanel } from '../render/perf.js';

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

let _presentationMode = false;
let _presHud = null;

function _buildPresHud() {
  if (_presHud) return _presHud;
  const hud = document.createElement('div');
  hud.id = 'presHud';
  hud.className = 'pres-hud';
  hud.setAttribute('aria-label', 'Presentation HUD');

  const fps = document.createElement('div');
  fps.className = 'pres-hud-pill pres-hud-fps';
  fps.id = 'presHudFps';
  fps.textContent = '-- FPS';

  const res = document.createElement('div');
  res.className = 'pres-hud-pill';
  res.id = 'presHudRes';
  res.textContent = '-- × --';

  const exit = document.createElement('button');
  exit.className = 'pres-hud-exit';
  exit.title = 'Exit presentation mode (Escape or F)';
  exit.textContent = '✕';
  exit.addEventListener('click', () => togglePresentation(false));

  hud.appendChild(fps);
  hud.appendChild(res);
  hud.appendChild(exit);
  document.body.appendChild(hud);
  _presHud = hud;
  return hud;
}

function _syncPresHud() {
  if (!_presHud) return;
  const fpsPill = document.getElementById('fpspill');
  const resPill = document.getElementById('respill');
  if (fpsPill) _presHud.querySelector('.pres-hud-fps').textContent = fpsPill.textContent;
  if (resPill) _presHud.querySelector('[id="presHudRes"]').textContent = resPill.textContent;
}

let _presHudInterval = null;

export function togglePresentation(force) {
  const next = force !== undefined ? force : !_presentationMode;
  _presentationMode = next;

  document.body.classList.toggle('pres-mode', next);

  if (next) {
    _buildPresHud();
    _presHud.classList.add('visible');
    _presHudInterval = setInterval(_syncPresHud, 200);
  } else {
    if (_presHud) _presHud.classList.remove('visible');
    clearInterval(_presHudInterval);
    _presHudInterval = null;
  }

  setTimeout(doResize, 50);
}

document.addEventListener('keydown', e => {
  if (trapModalFocus(e)) return;
  if (e.key === 'F11') { e.preventDefault(); toggleFullscreenVP(); }
  if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && !e.target.closest('.monaco-editor')) {
    e.preventDefault();
    togglePresentation();
    return;
  }
  if ((e.ctrlKey||e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); toggleCodeFocus(); return; }
  // Fix 3.4 — Ctrl+Shift+S dupliqué entre viewport.js et io/project-ui.js.
  // En mode navigateur (!isTauri()) les deux handlers se déclenchaient en cascade.
  // Utiliser stopImmediatePropagation() pour qu'un seul handler s'exécute.
  if ((e.ctrlKey||e.metaKey) && e.shiftKey && e.key === 'S' && !isTauri()) { e.preventDefault(); e.stopImmediatePropagation(); openSaveModal(); return; }
  if ((e.ctrlKey||e.metaKey) && !e.shiftKey && e.key === 'o' && !isTauri()) { e.preventDefault(); e.stopImmediatePropagation(); openLibrary(); return; }
  if ((e.ctrlKey||e.metaKey) && !e.shiftKey && e.key === 'z' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault(); slUndo(); return;
  }
  if ((e.ctrlKey||e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y') && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault(); slRedo(); return;
  }
  if (e.key === 'Escape') {
    if (document.getElementById('ctxMenu')?.classList.contains('open')) { document.getElementById('ctxMenu').classList.remove('open'); return; }
    const snippetsMenu = document.getElementById('snippetsMenu');
    if (snippetsMenu?.classList.contains('open')) {
      snippetsMenu.classList.remove('open');
      const snipBtn = document.getElementById('snipBtn');
      snipBtn?.setAttribute('aria-expanded', 'false');
      snipBtn?.focus();
      return;
    }
    const layoutPopup = document.getElementById('layoutPresetPopup');
    if (layoutPopup?.classList.contains('open')) {
      layoutPopup.classList.remove('open');
      const layoutBtn = document.getElementById('layoutPresetBtn');
      layoutBtn?.setAttribute('aria-expanded', 'false');
      layoutBtn?.focus();
      return;
    }
    if (document.getElementById('stModal')?.classList.contains('open')) { closeSTModal(); return; }
    if (document.getElementById('wizardModal')?.classList.contains('open')) { closeWizardModal(); return; }
    if (document.getElementById('saveModal')?.classList.contains('open')) { closeSaveModal(); return; }
    if (document.getElementById('confirmModal')?.classList.contains('open')) { closeConfirmModal(); return; }
    if (document.getElementById('exportModal')?.classList.contains('open')) { closeExportModal(); return; }
    if (libOpen) { closeLibrary(); return; }
    if (_presentationMode) { togglePresentation(false); return; }
    if (_codeFocus) { toggleCodeFocus(false); return; }
    if (vpFullscreen) { toggleFullscreenVP(); return; }
  }
  if (e.key === ' ' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && !e.target.closest('.monaco-editor')) { e.preventDefault(); togglePause(); }
});

function _initSplitter() {
  const splitter   = document.getElementById('splitter');
  const editorZone = document.getElementById('editorZone');
  // Bug fix: this used to look up id="rightPanel", which doesn't exist
  // anywhere in ui.html (the element was renamed to id="viewport-zone" at
  // some point without updating this lookup) — the guard below silently
  // failed every time and the splitter never initialized, so the editor
  // could never be resized by dragging or with the arrow keys.
  const rightPanel = document.getElementById('viewport-zone');
  // Guard: may run before setup.js injects ui.html (module-load race in Vite 8).
  // setup.js dispatches 'zgl:ui-ready' after injection; we retry then.
  if (!splitter || !editorZone || !rightPanel) {
    document.addEventListener('zgl:ui-ready', _initSplitter, { once: true });
    return;
  }

  let dragging = false;
  let startY = 0;
  let startH = 0;

  // §1.5 — hauteur de l'éditeur mémorisée PAR workspace / preset de layout.
  // La clé du workspace courant est le preset de layout actif (dock.js,
  // localStorage 'sl_layoutPreset'). Un layout custom / vide utilise '__default'.
  function currentWorkspaceKey() {
    return safeLocalGet('sl_layoutPreset', '') || '__default';
  }

  function loadHeightMap() {
    try {
      const raw = safeLocalGet('sl_editorH_map', '{}');
      const obj = JSON.parse(raw || '{}');
      return (obj && typeof obj === 'object') ? obj : {};
    } catch {
      return {};
    }
  }

  function saveHeightForWorkspace(h) {
    const map = loadHeightMap();
    map[currentWorkspaceKey()] = Math.round(h);
    safeLocalSet('sl_editorH_map', JSON.stringify(map));
    // Conserve la clé legacy pour rétrocompatibilité / fallback global.
    safeLocalSet('sl_editorH', String(Math.round(h)));
  }

  function clampEditorHeight(height) {
    return Math.max(80, Math.min(height, window.innerHeight * 0.75));
  }

  function applyEditorHeight(height, persist = true) {
    const nextHeight = clampEditorHeight(height);
    editorZone.style.height = nextHeight + 'px';
    editorZone.style.flex = 'none';
    splitter.setAttribute('aria-valuemin', '80');
    splitter.setAttribute('aria-valuemax', String(Math.round(window.innerHeight * 0.75)));
    splitter.setAttribute('aria-valuenow', String(Math.round(nextHeight)));
    if (state.renderer3) doResize();
    if (persist) saveHeightForWorkspace(nextHeight);
    return nextHeight;
  }

  // Applique la hauteur mémorisée pour le workspace courant (sans la
  // re-persister). `onlyIfStored` : si true, ne touche à rien quand aucune
  // hauteur n'a été explicitement mémorisée pour ce workspace — ainsi le
  // défaut du preset de layout (déjà posé par dock.js) reste intact.
  function restoreWorkspaceHeight(onlyIfStored) {
    const map = loadHeightMap();
    const stored = map[currentWorkspaceKey()];
    if (stored > 80 && stored < window.innerHeight * 0.8) {
      applyEditorHeight(stored, false);
      return;
    }
    if (onlyIfStored) return;
    const legacy = parseInt(safeLocalGet('sl_editorH', ''), 10);
    const h = (legacy > 80 && legacy < window.innerHeight * 0.8)
      ? legacy : window.innerHeight * 0.30;
    applyEditorHeight(h, false);
  }

  restoreWorkspaceHeight(false);

  // §1.5 — quand le workspace / preset de layout change, recharge la hauteur
  // mémorisée pour ce workspace (dock.js émet 'zgl:layoutchange'). On ne
  // surcharge que si l'utilisateur a déjà personnalisé la hauteur de ce
  // workspace, sinon le défaut du preset prévaut.
  window.addEventListener('zgl:layoutchange', () => restoreWorkspaceHeight(true));

  splitter.addEventListener('mousedown', e => {
    dragging = true;
    startY = e.clientY;
    startH = editorZone.getBoundingClientRect().height;
    splitter.classList.add('dragging');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta = startY - e.clientY; // drag up = bigger editor
    applyEditorHeight(startH + delta);
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    doResize();
  });

  splitter.addEventListener('keydown', e => {
    const step = e.shiftKey ? 25 : 10;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      applyEditorHeight(editorZone.getBoundingClientRect().height + step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      applyEditorHeight(editorZone.getBoundingClientRect().height - step);
    }
  });
}
_initSplitter();

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
  const bar      = document.getElementById('vpScrubberBar');
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

  // §R — clic sur le pill FPS → ouvre l'inspector en mode perf
  fpspill?.addEventListener('click', () => togglePerfPanel());

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
  const zone = document.getElementById('viewport-zone');
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
