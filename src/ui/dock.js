import { safeLocalGet, safeLocalSet } from '../core/utils.js';
import { doResize } from '../gl/renderer.js';

const PW_MIN = 180;
const PW_MAX = 520;
const PW_DEFAULT = 320;
const IW_MIN = 200;
const IW_MAX = 520;
const IW_DEFAULT = 260;

// §1 Window/area chrome — shared "collapsed sliver" width for every
// drag-to-zero handle (tool shelf, sidebar, inspector). Deliberately NOT
// literal 0: every one of these handles is an absolutely-positioned child
// straddling its own panel's edge (`.dock-resize-handle`'s `right:-4px`/
// `width:8px`, or `left:0`/`width:8px` for the `-left` variant), inside a
// panel that itself has `overflow:hidden`. If the panel's own box shrinks
// to literally 0px, that overflow:hidden clips the handle away along with
// everything else — there would be nothing left on screen to grab to
// reopen it. A small sliver keeps ~4-8px of the handle inside the panel's
// own clipped box at all times, so it stays visible/clickable however far
// it's collapsed. (See also the TS_COLLAPSED bug fix note just below —
// the tool shelf had exactly this problem before this change.)
const COLLAPSE_SLIVER = 10;

// §1 Window/area chrome — tool shelf collapse (drag-to-zero on its own handle).
// The shelf is a fixed-width icon strip (no in-between sizes, unlike the
// sidebar/inspector), so it only ever snaps between these two widths.
const TS_EXPANDED = 40;
// Bug fix: this used to be a literal 0 — collapsing the shelf shrank its
// own box (and thus its overflow:hidden clip region) to nothing, which
// silently clipped away the very handle needed to drag it back open (see
// COLLAPSE_SLIVER above). Only a plain click on the *last known pixel* of
// the handle (if the mouse happened to still be over that exact spot)
// could have reopened it — dragging to reopen was effectively impossible
// once fully collapsed. Sharing COLLAPSE_SLIVER fixes it and keeps all
// three collapsible regions visually consistent.
const TS_COLLAPSED = COLLAPSE_SLIVER;
const TS_COLLAPSE_THRESHOLD = 20; // px dragged past which the shelf snaps shut

// §1 Window/area chrome — collapse-via-drag thresholds for the sidebar and
// inspector (in addition to their pre-existing continuous width-resize).
// Below these widths on release, the drag snaps fully collapsed to
// COLLAPSE_SLIVER rather than settling at an awkwardly narrow in-between
// size; comfortably below each panel's own PW_MIN/IW_MIN so a deliberate
// "resize to roughly minimum" drag doesn't accidentally collapse instead.
const SW_COLLAPSE_THRESHOLD = PW_MIN - 60; // 120
const IW_COLLAPSE_THRESHOLD = IW_MIN - 60; // 140

// §2.1 — largeurs des panneaux mémorisées PAR workspace (preset de layout actif).
function _wsKey() {
  return safeLocalGet('sl_layoutPreset', '') || '__default';
}
function _loadWidthMap(storageKey) {
  try {
    const obj = JSON.parse(safeLocalGet(storageKey, '{}') || '{}');
    return (obj && typeof obj === 'object') ? obj : {};
  } catch {
    return {};
  }
}
function _saveWidthForWs(storageKey, value) {
  const map = _loadWidthMap(storageKey);
  map[_wsKey()] = Math.round(value);
  safeLocalSet(storageKey, JSON.stringify(map));
}

let _activeTabId = 'uniforms';

const PANEL_TABS = [
  { id: 'uniforms', label: 'Uniforms', icon: '◈' },
];

function _getPanel()      { return document.querySelector('#layout > .panel'); }
function _getEditorZone() { return document.getElementById('editorZone'); }

function _setPanelWidth(px) {
  const w = Math.max(0, Math.min(px, PW_MAX));
  // Bug fix: the grid (`.layout { grid-template-columns: var(--tsw) var(--sw) 1fr ... }`)
  // reads --sw for the sidebar column width. --pw is only a one-way alias
  // defined in tokens.css (`--pw: var(--sw)`) for legacy/back-compat
  // reference — setting --pw here never fed back into --sw, so dragging
  // this handle updated localStorage but never actually resized the
  // sidebar column. Write --sw directly, same as _setInspectorWidth
  // already correctly does for --iw.
  document.documentElement.style.setProperty('--sw', w + 'px');
  safeLocalSet('sl_panelW', String(Math.round(w)));
  doResize();
}

function _setInspectorWidth(px) {
  const w = Math.max(IW_MIN, Math.min(px, IW_MAX));
  document.documentElement.style.setProperty('--iw', w + 'px');
  doResize();
  return w;
}

// §1 Window/area chrome — free-drag variant of _setInspectorWidth used while
// actively dragging the collapse handle: unlike _setInspectorWidth (which
// clamps to IW_MIN so normal resizing never goes below the usable minimum),
// this allows the raw width down to COLLAPSE_SLIVER so the handle can be
// dragged all the way to the collapsed sliver in one continuous motion,
// mirroring _initPanelResizeHandle's mousemove handler for the sidebar.
function _setInspectorWidthRaw(px) {
  const w = Math.max(COLLAPSE_SLIVER, Math.min(px, IW_MAX));
  document.documentElement.style.setProperty('--iw', w + 'px');
  doResize();
  return w;
}

let _lastSidebarWidth = PW_DEFAULT;
let _lastInspectorWidth = IW_DEFAULT;

// §1 Window/area chrome — apply/persist the sidebar's collapsed state.
// Mirrors _applyCollapsed in _initToolShelfCollapseHandle below, but for a
// panel that (unlike the shelf) also supports continuous width resize —
// so unlike the shelf's two fixed widths, re-expanding here restores
// whatever width the user last had it at, not a fixed constant.
function _applySidebarCollapsed(isCollapsed, persist) {
  const panel = _getPanel();
  if (!panel) return;
  panel.classList.toggle('sb-collapsed', isCollapsed);
  if (isCollapsed) {
    document.documentElement.style.setProperty('--sw', COLLAPSE_SLIVER + 'px');
    doResize();
  } else {
    _setPanelWidth(_lastSidebarWidth);
  }
  if (persist) safeLocalSet('sl_sidebarCollapsed', isCollapsed ? '1' : '0');
}

function _initPanelResizeHandle() {
  const panel = _getPanel();
  if (!panel) return;

  const handle = document.createElement('div');
  handle.className = 'dock-resize-handle';
  handle.title = 'Drag to resize panel (drag to the edge to collapse)';
  handle.setAttribute('aria-hidden', 'true');
  panel.appendChild(handle);

  let dragging = false;
  let moved = false;
  let startX = 0;
  let startW = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    moved = false;
    startX = e.clientX;
    startW = panel.classList.contains('sb-collapsed') ? COLLAPSE_SLIVER : panel.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    handle.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    if (Math.abs(delta) > 3) moved = true;
    // Free-drag all the way down to the collapsed sliver — clamped to
    // PW_MIN only once the drag ends (see mouseup below), same two-phase
    // pattern as the tool shelf handle.
    const raw = Math.max(COLLAPSE_SLIVER, Math.min(startW + delta, PW_MAX));
    document.documentElement.style.setProperty('--sw', raw + 'px');
    panel.classList.toggle('sb-collapsed', raw <= SW_COLLAPSE_THRESHOLD);
    doResize();
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    handle.classList.remove('dragging');

    if (!moved) {
      // Plain click while already split/expanded — toggle instantly, same
      // affordance as the tool shelf's collapsed sliver.
      _applySidebarCollapsed(!panel.classList.contains('sb-collapsed'), true);
      return;
    }

    const w = panel.getBoundingClientRect().width;
    if (w <= SW_COLLAPSE_THRESHOLD) {
      _applySidebarCollapsed(true, true);
    } else {
      _lastSidebarWidth = Math.max(PW_MIN, Math.round(w));
      _saveWidthForWs('sl_panelW_map', _lastSidebarWidth);
      _applySidebarCollapsed(false, true); // clamps back up to PW_MIN and persists
    }
  });
}

// §1 Window/area chrome — restore the sidebar's persisted collapsed state.
// Deliberately run *after* _restoreWorkspaceWidths (see initDock), so that
// whichever width was just restored becomes _lastSidebarWidth (the width
// to snap back to on re-expand) instead of being immediately overwritten
// by the collapsed sliver applying its own width restoration order.
function _restoreSidebarCollapsed() {
  const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sw'));
  if (current > COLLAPSE_SLIVER) _lastSidebarWidth = current;
  if (safeLocalGet('sl_sidebarCollapsed', '0') === '1') {
    _applySidebarCollapsed(true, false);
  }
}

// §1 Window/area chrome — apply/persist the inspector column's collapsed
// state. Mirrors _applySidebarCollapsed, but for the right-hand column
// (Outliner + Inspector stack) — collapsing shrinks --iw down to the shared
// COLLAPSE_SLIVER instead of hiding the column outright, keeping the handle
// grabbable to reopen it (same rationale as COLLAPSE_SLIVER's comment above).
function _applyInspectorCollapsed(isCollapsed, persist) {
  const inspector = document.getElementById('inspectorCol') || document.getElementById('inspector');
  if (!inspector) return;
  inspector.classList.toggle('iw-collapsed', isCollapsed);
  if (isCollapsed) {
    document.documentElement.style.setProperty('--iw', COLLAPSE_SLIVER + 'px');
    doResize();
  } else {
    _setInspectorWidth(_lastInspectorWidth);
  }
  if (persist) safeLocalSet('sl_inspectorColCollapsed', isCollapsed ? '1' : '0');
}

// §2.1 — poignée de redimensionnement du panneau inspecteur (colonne droite).
// §1 Window/area chrome — also drag-to-zero collapsible, same two-phase
// pattern (free-drag down to COLLAPSE_SLIVER, snap-clamp on release) as the
// sidebar's _initPanelResizeHandle, plus a plain click toggling instantly.
function _initInspectorResizeHandle() {
  const inspector = document.getElementById('inspectorCol') || document.getElementById('inspector');
  if (!inspector) return;

  const handle = document.createElement('div');
  handle.className = 'dock-resize-handle dock-resize-handle-left';
  handle.title = 'Drag to resize inspector (drag to the edge to collapse)';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', 'Inspector column collapse handle');
  inspector.appendChild(handle);

  let dragging = false;
  let moved = false;
  let startX = 0;
  let startW = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    moved = false;
    startX = e.clientX;
    startW = inspector.classList.contains('iw-collapsed') ? COLLAPSE_SLIVER : inspector.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    handle.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    // L'inspecteur est à droite : glisser vers la gauche l'élargit.
    const delta = startX - e.clientX;
    if (Math.abs(delta) > 3) moved = true;
    const raw = _setInspectorWidthRaw(startW + delta);
    inspector.classList.toggle('iw-collapsed', raw <= IW_COLLAPSE_THRESHOLD);
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    handle.classList.remove('dragging');

    if (!moved) {
      // Plain click while already expanded/collapsed — toggle instantly,
      // same affordance as the tool shelf's/sidebar's collapsed sliver.
      _applyInspectorCollapsed(!inspector.classList.contains('iw-collapsed'), true);
      return;
    }

    const w = inspector.getBoundingClientRect().width;
    if (w <= IW_COLLAPSE_THRESHOLD) {
      _applyInspectorCollapsed(true, true);
    } else {
      _lastInspectorWidth = Math.max(IW_MIN, Math.round(w));
      _saveWidthForWs('sl_iw_map', _lastInspectorWidth);
      _applyInspectorCollapsed(false, true); // clamps back up to IW_MIN and persists
    }
  });
}

// §1 Window/area chrome — restore the inspector column's persisted collapsed
// state. Run after _restoreWorkspaceWidths (see initDock), same ordering
// rationale as _restoreSidebarCollapsed: whichever width was just restored
// becomes _lastInspectorWidth (the width to snap back to on re-expand)
// instead of being clobbered by the collapsed sliver's own restoration.
function _restoreInspectorCollapsed() {
  const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--iw'));
  if (current > COLLAPSE_SLIVER) _lastInspectorWidth = current;
  if (safeLocalGet('sl_inspectorColCollapsed', '0') === '1') {
    _applyInspectorCollapsed(true, false);
  }
}

function _setToolShelfWidth(px) {
  const w = Math.max(TS_COLLAPSED, Math.min(px, TS_EXPANDED));
  document.documentElement.style.setProperty('--tsw', w + 'px');
  doResize();
  return w;
}

// §1 Window/area chrome — collapsible tool shelf via its own drag handle.
// Two ways in: drag the handle past the threshold to snap collapsed/expanded,
// or click it without dragging to toggle instantly (same affordance Blender
// uses to reopen a region from its collapsed sliver).
function _initToolShelfCollapseHandle() {
  const shelf = document.getElementById('toolShelf');
  if (!shelf) return;

  const handle = document.createElement('div');
  handle.className = 'dock-resize-handle ts-resize-handle';
  handle.title = 'Drag to collapse / expand the tool shelf';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', 'Tool shelf collapse handle');
  shelf.appendChild(handle);

  function _applyCollapsed(isCollapsed, persist) {
    shelf.classList.toggle('ts-collapsed', isCollapsed);
    _setToolShelfWidth(isCollapsed ? TS_COLLAPSED : TS_EXPANDED);
    shelf.querySelectorAll('.ts-tool').forEach(btn => {
      btn.tabIndex = isCollapsed ? -1 : 0;
    });
    if (persist) safeLocalSet('sl_toolShelfCollapsed', isCollapsed ? '1' : '0');
  }

  let dragging = false;
  let moved = false;
  let startX = 0;
  let startW = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    moved = false;
    startX = e.clientX;
    startW = shelf.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    handle.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    if (Math.abs(delta) > 3) moved = true;
    const next = _setToolShelfWidth(startW + delta);
    shelf.classList.toggle('ts-collapsed', next <= TS_COLLAPSE_THRESHOLD);
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    handle.classList.remove('dragging');

    if (moved) {
      // No in-between sizes — snap fully open or fully shut depending on
      // which side of the threshold the drag ended on.
      const isCollapsed = shelf.getBoundingClientRect().width <= TS_COLLAPSE_THRESHOLD;
      _applyCollapsed(isCollapsed, true);
    } else {
      _applyCollapsed(!shelf.classList.contains('ts-collapsed'), true);
    }
  });

  // Restore persisted collapse state.
  _applyCollapsed(safeLocalGet('sl_toolShelfCollapsed', '0') === '1', false);
}

// §2.1 — restaure les largeurs mémorisées pour le workspace courant.
// onlyIfStored : ne touche à rien si aucune largeur custom n'est mémorisée
// (le défaut du preset, déjà appliqué, prévaut alors).
function _restoreWorkspaceWidths(onlyIfStored) {
  const pwMap = _loadWidthMap('sl_panelW_map');
  const pw = pwMap[_wsKey()];
  if (pw >= PW_MIN && pw <= PW_MAX) {
    _setPanelWidth(pw);
  } else if (!onlyIfStored) {
    const saved = parseInt(safeLocalGet('sl_panelW', ''), 10);
    if (saved >= PW_MIN && saved <= PW_MAX) _setPanelWidth(saved);
  }

  const iwMap = _loadWidthMap('sl_iw_map');
  const iw = iwMap[_wsKey()];
  if (iw >= IW_MIN && iw <= IW_MAX) {
    _setInspectorWidth(iw);
  } else if (!onlyIfStored) {
    document.documentElement.style.setProperty('--iw', IW_DEFAULT + 'px');
  }
}

function _switchPanelTab(id) {
  _activeTabId = id;
  safeLocalSet('sl_panelTab', id);

  const sw = document.getElementById('sw');

  if (id === 'uniforms') {
    if (sw) sw.style.display = '';
  }

  document.querySelectorAll('.panel-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tabId === id);
    btn.setAttribute('aria-selected', String(btn.dataset.tabId === id));
  });
}

function _initPanelTabs() {
  const panel = _getPanel();
  if (!panel) return;

  const tabBar = document.createElement('div');
  tabBar.className = 'panel-tab-bar';
  tabBar.setAttribute('role', 'tablist');
  tabBar.setAttribute('aria-label', 'Panel sections');

  PANEL_TABS.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'panel-tab-btn';
    btn.dataset.tabId = tab.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(tab.id === _activeTabId));
    btn.setAttribute('aria-controls', 'sw');
    btn.innerHTML = `<span class="ptab-icon">${tab.icon}</span><span class="ptab-label">${tab.label}</span>`;
    btn.addEventListener('click', () => _switchPanelTab(tab.id));
    tabBar.appendChild(btn);
  });

  const ph = panel.querySelector('.ph');
  if (ph) {
    // Phase O — insère relativement au parent réel de .ph (et non panel), pour
    // rester correct même si .ph est nichée dans #sidebar-pane-uniforms.
    ph.parentElement.insertBefore(tabBar, ph.nextSibling);
  } else {
    panel.prepend(tabBar);
  }

  const savedTab = safeLocalGet('sl_panelTab', 'uniforms');
  _switchPanelTab(PANEL_TABS.find(t => t.id === savedTab) ? savedTab : 'uniforms');
}

function _restoreSavedWidth() {
  const saved = parseInt(safeLocalGet('sl_panelW', ''), 10);
  if (!isNaN(saved) && saved >= PW_MIN && saved <= PW_MAX) {
    document.documentElement.style.setProperty('--sw', saved + 'px');
  }
}

export function initDock() {
  _restoreSavedWidth();

  _initPanelResizeHandle();
  _initInspectorResizeHandle();
  _initToolShelfCollapseHandle();
  _initPanelTabs();

  // §2.1 — restaure les largeurs custom du workspace mémorisées.
  _restoreWorkspaceWidths(false);

  // §1 Window/area chrome — restore drag-to-zero collapsed state for the
  // sidebar and inspector, run after the width restoration above so each
  // panel's _lastXWidth snapshots the just-restored width (see the ordering
  // note on _restoreSidebarCollapsed/_restoreInspectorCollapsed).
  // Bug fix: _restoreSidebarCollapsed already existed but was never called
  // from here, so a collapsed sidebar never came back collapsed on reload.
  _restoreSidebarCollapsed();
  _restoreInspectorCollapsed();
}
