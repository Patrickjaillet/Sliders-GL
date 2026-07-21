import { safeLocalGet, safeLocalSet } from '../core/utils.js';
import { doResize } from '../gl/renderer.js';

const PRESET_DEFS = {
  coder:     { pw: 340, editorH: null, editorFlex: true,  label: 'Coder' },
  performer: { pw: 0,   editorH: 0,    editorFlex: false, label: 'Performer' },
  animator:  { pw: 300, editorH: 140,  editorFlex: false, label: 'Animator' },
  minimal:   { pw: 0,   editorH: 0,    editorFlex: false, label: 'Minimal' },
};

const PW_MIN = 180;
const PW_MAX = 520;
const PW_DEFAULT = 320;
const IW_MIN = 200;
const IW_MAX = 520;
const IW_DEFAULT = 260;
const MAX_CUSTOM_LAYOUTS = 5;

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

let _currentPreset = safeLocalGet('sl_layoutPreset', null);
let _floatOpen = false;
let _floatEl = null;
let _floatDragOffX = 0;
let _floatDragOffY = 0;
let _floatDragging = false;
let _activeTabId = 'uniforms';

const PANEL_TABS = [
  { id: 'uniforms', label: 'Uniforms', icon: '◈' },
  { id: 'channels', label: 'Channels', icon: '⬡' },
];

function _getLayout()     { return document.getElementById('layout'); }
function _getPanel()      { return document.querySelector('#layout > .panel'); }
function _getEditorZone() { return document.getElementById('editorZone'); }

function _setPanelWidth(px) {
  const w = Math.max(0, Math.min(px, PW_MAX));
  document.documentElement.style.setProperty('--pw', w + 'px');
  safeLocalSet('sl_panelW', String(Math.round(w)));
  doResize();
}

function _setInspectorWidth(px) {
  const w = Math.max(IW_MIN, Math.min(px, IW_MAX));
  document.documentElement.style.setProperty('--iw', w + 'px');
  doResize();
  return w;
}

function _setEditorHeight(px, flex) {
  const ez = _getEditorZone();
  if (!ez) return;
  if (flex || px === null) {
    ez.style.height = '';
    ez.style.flex = '1';
  } else {
    const clamped = Math.max(0, Math.min(px, window.innerHeight * 0.75));
    ez.style.height = clamped + 'px';
    ez.style.flex = 'none';
    safeLocalSet('sl_editorH', String(Math.round(clamped)));
  }
  doResize();
}

export function applyLayoutPreset(name) {
  const def = PRESET_DEFS[name];
  if (!def) return;
  _currentPreset = name;
  safeLocalSet('sl_layoutPreset', name);
  _setPanelWidth(def.pw);
  if (def.editorFlex || def.editorH === null) {
    _setEditorHeight(null, true);
  } else {
    _setEditorHeight(def.editorH, false);
  }
  const layout = _getLayout();
  if (layout) layout.classList.toggle('vp-fullscreen', def.pw === 0);
  _syncPresetButtons(name);
  // §1.5 — notifie le splitter (viewport.js) du changement de workspace
  // pour qu'il restaure la hauteur d'éditeur mémorisée pour ce preset.
  window.dispatchEvent(new CustomEvent('zgl:layoutchange'));
}

function _syncPresetButtons(name) {
  document.querySelectorAll('[data-layout-preset]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.layoutPreset === name);
  });
  // Phase Y — main toggle button shows the active preset's name instead of
  // the generic "layout" label (falls back to generic for custom layouts).
  const label = document.getElementById('layoutPresetLabel');
  if (label) label.textContent = (name && PRESET_DEFS[name]) ? PRESET_DEFS[name].label : 'layout';
}

function _getCurrentLayoutSnapshot() {
  const pw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--pw'), 10) || PW_DEFAULT;
  const ez = _getEditorZone();
  let editorH = null;
  let editorFlex = true;
  if (ez && ez.style.flex === 'none') {
    editorH = parseInt(ez.style.height, 10) || 0;
    editorFlex = false;
  }
  return { pw, editorH, editorFlex };
}

// §2.5 — génère une vignette SVG du layout à partir d'un snapshot
// { pw, editorH, editorFlex }. Boîte 28×18 (= .lp-icon), full-bleed.
function _layoutThumbnailSVG(snap) {
  const W = 28, H = 18, pad = 1.5;
  const innerH = H - 2 * pad;
  const pw = snap.pw || 0;
  const leftW = pw <= 0 ? 0 : Math.round(Math.min(Math.max(pw, PW_MIN), PW_MAX) / PW_MAX * 9);
  const rightX = pad + (leftW > 0 ? leftW + 1 : 0);
  const rightW = Math.max(0, W - pad - rightX);

  let editorFrac;
  if (snap.editorFlex) editorFrac = 0.55;
  else if (!snap.editorH || snap.editorH <= 0) editorFrac = 0;
  else editorFrac = Math.min(0.7, Math.max(0.12, snap.editorH / 480));
  const editorH = Math.round(editorFrac * innerH);
  const canvasH = innerH - editorH;

  const parts = [`<svg class="lp-thumb" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">`];
  if (leftW > 0) {
    parts.push(`<rect x="${pad}" y="${pad}" width="${leftW}" height="${innerH}" rx="1" fill="var(--accent)" opacity="0.45"/>`);
  }
  if (canvasH > 0) {
    parts.push(`<rect x="${rightX}" y="${pad}" width="${rightW}" height="${canvasH}" rx="1" fill="var(--text-primary)" opacity="0.16"/>`);
  }
  if (editorH > 0) {
    parts.push(`<rect x="${rightX}" y="${pad + canvasH}" width="${rightW}" height="${editorH}" rx="1" fill="var(--accent)" opacity="0.30"/>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

// §2.5 — remplace les icônes statiques des presets intégrés par des
// vignettes générées, pour un rendu cohérent avec les layouts custom.
function _renderBuiltinThumbnails() {
  Object.entries(PRESET_DEFS).forEach(([name, def]) => {
    const item = document.querySelector(`[data-layout-preset="${name}"]`);
    if (!item) return;
    const icon = item.querySelector('.lp-icon');
    if (!icon) return;
    icon.style.padding = '0';
    icon.innerHTML = _layoutThumbnailSVG(def);
  });
}

function _loadCustomLayouts() {
  try { return JSON.parse(safeLocalGet('sl_customLayouts', '[]')); }
  catch (_) { return []; }
}

function _saveCustomLayouts(layouts) {
  safeLocalSet('sl_customLayouts', JSON.stringify(layouts));
}

export function saveCustomLayout(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return false;
  const snap = _getCurrentLayoutSnapshot();
  const layouts = _loadCustomLayouts();
  const existing = layouts.findIndex(l => l.name === trimmed);
  if (existing >= 0) {
    layouts[existing] = { name: trimmed, ...snap };
  } else {
    if (layouts.length >= MAX_CUSTOM_LAYOUTS) layouts.shift();
    layouts.push({ name: trimmed, ...snap });
  }
  _saveCustomLayouts(layouts);
  _renderCustomLayouts();
  return true;
}

export function deleteCustomLayout(name) {
  const layouts = _loadCustomLayouts().filter(l => l.name !== name);
  _saveCustomLayouts(layouts);
  _renderCustomLayouts();
}

export function applyCustomLayout(name) {
  const layouts = _loadCustomLayouts();
  const def = layouts.find(l => l.name === name);
  if (!def) return;
  _currentPreset = null;
  safeLocalSet('sl_layoutPreset', '');
  _setPanelWidth(def.pw);
  _setEditorHeight(def.editorH, def.editorFlex);
  const layout = _getLayout();
  if (layout) layout.classList.toggle('vp-fullscreen', def.pw === 0);
  _syncPresetButtons(null);
  // §1.5 — voir applyLayoutPreset
  window.dispatchEvent(new CustomEvent('zgl:layoutchange'));
}

function _renderCustomLayouts() {
  const container = document.getElementById('customLayoutsList');
  if (!container) return;
  const layouts = _loadCustomLayouts();
  container.innerHTML = '';
  if (layouts.length === 0) return;

  const sep = document.createElement('div');
  sep.className = 'lp-sep';
  container.appendChild(sep);

  const sectionLabel = document.createElement('div');
  sectionLabel.className = 'lp-section-label';
  sectionLabel.textContent = 'Saved';
  container.appendChild(sectionLabel);

  layouts.forEach(l => {
    const row = document.createElement('div');
    row.className = 'lp-item lp-custom-item';
    row.setAttribute('role', 'menuitem');
    row.setAttribute('tabindex', '-1');
    row.dataset.action = 'applyCustomLayout';
    row.dataset.args = l.name;
    row.title = l.name;

    // §2.5 — vignette générée à partir du snapshot mémorisé
    const icon = document.createElement('div');
    icon.className = 'lp-icon';
    icon.style.padding = '0';
    icon.innerHTML = _layoutThumbnailSVG(l);
    row.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'lp-custom-name';
    label.textContent = l.name;
    row.appendChild(label);

    const del = document.createElement('button');
    del.className = 'lp-custom-del';
    del.title = 'Delete layout';
    del.textContent = '✕';
    del.addEventListener('click', e => {
      e.stopPropagation();
      deleteCustomLayout(l.name);
    });
    row.appendChild(del);
    container.appendChild(row);
  });
}

function _initSaveLayoutUI() {
  const btn = document.getElementById('saveLayoutBtn');
  const input = document.getElementById('saveLayoutInput');
  if (!btn || !input) return;

  btn.addEventListener('click', () => {
    const name = input.value.trim() || `Layout ${_loadCustomLayouts().length + 1}`;
    saveCustomLayout(name);
    input.value = '';
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); btn.click(); }
  });

  _renderCustomLayouts();
}

function _initPanelResizeHandle() {
  const panel = _getPanel();
  if (!panel) return;

  const handle = document.createElement('div');
  handle.className = 'dock-resize-handle';
  handle.title = 'Drag to resize panel';
  handle.setAttribute('aria-hidden', 'true');
  panel.appendChild(handle);

  let dragging = false;
  let startX = 0;
  let startW = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = panel.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    handle.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    const next = Math.max(PW_MIN, Math.min(startW + delta, PW_MAX));
    _setPanelWidth(next);
    // §2.1 — mémorise la largeur pour le workspace courant
    _saveWidthForWs('sl_panelW_map', next);
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    handle.classList.remove('dragging');
  });
}

// §2.1 — poignée de redimensionnement du panneau inspecteur (colonne droite).
function _initInspectorResizeHandle() {
  const inspector = document.getElementById('inspector');
  if (!inspector) return;

  const handle = document.createElement('div');
  handle.className = 'dock-resize-handle dock-resize-handle-left';
  handle.title = 'Drag to resize inspector';
  handle.setAttribute('aria-hidden', 'true');
  inspector.appendChild(handle);

  let dragging = false;
  let startX = 0;
  let startW = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = inspector.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    handle.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    // L'inspecteur est à droite : glisser vers la gauche l'élargit.
    const delta = startX - e.clientX;
    const next = _setInspectorWidth(startW + delta);
    _saveWidthForWs('sl_iw_map', next);
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    handle.classList.remove('dragging');
  });
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

function _buildFloatPanel() {
  const panel = _getPanel();
  if (!panel || _floatEl) return;

  _floatEl = document.createElement('div');
  _floatEl.className = 'dock-float';
  _floatEl.setAttribute('role', 'dialog');
  _floatEl.setAttribute('aria-label', 'Detached panel');

  const titlebar = document.createElement('div');
  titlebar.className = 'dock-float-titlebar';

  const label = document.createElement('span');
  label.className = 'dock-float-label';
  label.textContent = 'Constants & Uniforms';

  const redock = document.createElement('button');
  redock.className = 'dock-float-redock';
  redock.title = 'Re-dock panel';
  redock.textContent = '⊡ dock';
  redock.addEventListener('click', () => detachPanel(false));

  titlebar.appendChild(label);
  titlebar.appendChild(redock);
  _floatEl.appendChild(titlebar);
  document.body.appendChild(_floatEl);

  titlebar.addEventListener('mousedown', e => {
    if (e.target === redock) return;
    _floatDragging = true;
    const r = _floatEl.getBoundingClientRect();
    _floatDragOffX = e.clientX - r.left;
    _floatDragOffY = e.clientY - r.top;
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!_floatDragging) return;
    const x = Math.max(0, Math.min(e.clientX - _floatDragOffX, window.innerWidth - 40));
    const y = Math.max(0, Math.min(e.clientY - _floatDragOffY, window.innerHeight - 40));
    _floatEl.style.left = x + 'px';
    _floatEl.style.top  = y + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!_floatDragging) return;
    _floatDragging = false;
    document.body.style.userSelect = '';
  });
}

export function detachPanel(open) {
  const panel = _getPanel();
  if (!panel) return;

  if (open === undefined) open = !_floatOpen;
  _floatOpen = open;

  if (open) {
    if (!_floatEl) _buildFloatPanel();
    const r = panel.getBoundingClientRect();
    _floatEl.style.left  = r.left + 'px';
    _floatEl.style.top   = r.top  + 'px';
    _floatEl.style.width = r.width + 'px';
    _floatEl.appendChild(panel.querySelector('.sw'));
    _floatEl.appendChild(panel.querySelector('.ch-section'));
    _floatEl.classList.add('open');
    _setPanelWidth(0);
    _getLayout()?.classList.add('panel-detached');
  } else {
    if (_floatEl) {
      const sw = _floatEl.querySelector('.sw');
      const ch = _floatEl.querySelector('.ch-section');
      if (sw) panel.appendChild(sw);
      if (ch) panel.appendChild(ch);
      _floatEl.classList.remove('open');
    }
    const saved = parseInt(safeLocalGet('sl_panelW', String(PW_DEFAULT)), 10);
    _setPanelWidth(isNaN(saved) || saved < PW_MIN ? PW_DEFAULT : saved);
    _getLayout()?.classList.remove('panel-detached');
  }

  const btn = document.getElementById('detachPanelBtn');
  if (btn) {
    btn.classList.toggle('active', _floatOpen);
    btn.title = _floatOpen ? 'Re-dock panel' : 'Detach panel';
  }
  doResize();
}

function _switchPanelTab(id) {
  _activeTabId = id;
  safeLocalSet('sl_panelTab', id);

  const sw = document.getElementById('sw');
  const chSection = document.getElementById('chSection');

  if (id === 'uniforms') {
    if (sw) sw.style.display = '';
    if (chSection) chSection.style.display = 'none';
  } else if (id === 'channels') {
    if (sw) sw.style.display = 'none';
    if (chSection) chSection.style.display = '';
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
    btn.setAttribute('aria-controls', tab.id === 'uniforms' ? 'sw' : 'chSection');
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
    document.documentElement.style.setProperty('--pw', saved + 'px');
  }
}

function _initPanelHeaderDblClick() {
  const ph = document.querySelector('#layout > .panel > .ph');
  if (!ph) return;
  ph.addEventListener('dblclick', () => detachPanel());
}


export function initDock() {
  _restoreSavedWidth();

  const saved = safeLocalGet('sl_layoutPreset', '');
  if (saved && PRESET_DEFS[saved]) {
    applyLayoutPreset(saved);
  } else {
    _syncPresetButtons(null);
  }

  _initPanelResizeHandle();
  _initInspectorResizeHandle();
  _initPanelHeaderDblClick();
  _initPanelTabs();
  _renderBuiltinThumbnails(); // §2.5
  _initSaveLayoutUI();

  // §2.1 — restaure les largeurs custom du workspace, et réagit aux
  // changements de workspace (preset de layout).
  _restoreWorkspaceWidths(false);
  window.addEventListener('zgl:layoutchange', () => _restoreWorkspaceWidths(true));
}
