import { safeLocalGet, safeLocalSet } from '../core/utils.js';
import { doResize } from '../gl/renderer.js';

const PW_MIN = 180;
const PW_MAX = 520;
const PW_DEFAULT = 320;
const IW_MIN = 200;
const IW_MAX = 520;
const IW_DEFAULT = 260;

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
  { id: 'channels', label: 'Channels', icon: '⬡' },
];

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

export function initDock() {
  _restoreSavedWidth();

  _initPanelResizeHandle();
  _initInspectorResizeHandle();
  _initPanelTabs();

  // §2.1 — restaure les largeurs custom du workspace mémorisées.
  _restoreWorkspaceWidths(false);
}
