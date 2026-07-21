/**
 * render/colorblindness-ui.js — Phase 21.2
 *
 * UI panel pour le mode daltonisme avec overlay indiquant la perception de chaque type.
 *
 * Usage :
 *   import { initColorBlindnessUI, toggleColorBlindnessPanel, openColorBlindnessPanel, closeColorBlindnessPanel } from './colorblindness-ui.js';
 */

import { state } from '../core/state.js';
import {
  COLORBLINDNESS_MODES,
  setColorBlindnessMode,
  getColorBlindnessMode,
  toggleColorBlindness,
  setColorBlindnessOverlay,
  isColorBlindnessEnabled,
  registerColorBlindnessAsStyleLayer,
} from './colorblindness.js';

let _panel = null;
let _initialized = false;

const CSS = `
#colorblindness-panel {
  position: fixed;
  top: 60px;
  right: 10px;
  width: 280px;
  background: rgba(20, 20, 20, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  z-index: 1000;
  display: none;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
}

#colorblindness-panel.visible {
  display: flex;
}

#colorblindness-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  cursor: move;
  user-select: none;
}

#colorblindness-panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

#colorblindness-panel-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  font-size: 18px;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.2s;
}

#colorblindness-panel-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

#colorblindness-panel-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

#colorblindness-panel-content label {
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 6px;
  display: block;
}

#colorblindness-mode-select {
  width: 100%;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #ffffff;
  font-size: 13px;
  cursor: pointer;
  outline: none;
}

#colorblindness-mode-select:hover {
  border-color: rgba(255, 255, 255, 0.3);
}

#colorblindness-mode-select:focus {
  border-color: rgba(100, 150, 255, 0.6);
}

#colorblindness-overlay-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

#colorblindness-overlay-toggle input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

#colorblindness-overlay-toggle span {
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
}

#colorblindness-preview {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.colorblindness-preview-swatch {
  flex: 1;
  height: 40px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
}

#colorblindness-status {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
}

#colorblindness-wcag {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  overflow: hidden;
}

#colorblindness-wcag-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
}

#colorblindness-wcag-btn {
  background: rgba(100, 150, 255, 0.15);
  border: 1px solid rgba(100, 150, 255, 0.4);
  border-radius: 4px;
  color: rgba(150, 180, 255, 0.9);
  cursor: pointer;
  font-size: 10px;
  padding: 3px 8px;
}

#colorblindness-wcag-btn:hover {
  background: rgba(100, 150, 255, 0.3);
}

#colorblindness-wcag-results {
  padding: 6px 10px;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-height: 0;
}

#colorblindness-wcag-results div {
  display: flex;
  align-items: center;
  gap: 5px;
}

.wcag-ok { color: #6fda6f; }
.wcag-warn { color: #f0c060; }
.wcag-fail { color: #e06060; }
.wcag-info { color: rgba(255,255,255,0.5); font-size: 10px; }

#colorblindness-style-row {
  display: flex;
}

#colorblindness-register-style {
  flex: 1;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  color: rgba(255,255,255,0.6);
  cursor: pointer;
  font-size: 11px;
  padding: 7px;
  transition: background 0.2s, color 0.2s;
}

#colorblindness-register-style:hover {
  background: rgba(100,150,255,0.15);
  color: #fff;
}

#colorblindness-register-style:disabled {
  opacity: 0.5;
  cursor: default;
}
`;

function _injectCSS() {
  if (document.getElementById('colorblindness-ui-css')) return;
  const style = document.createElement('style');
  style.id = 'colorblindness-ui-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function _createPanel() {
  _panel = document.createElement('div');
  _panel.id = 'colorblindness-panel';

  _panel.innerHTML = `
    <div id="colorblindness-panel-header">
      <h3>Mode Daltonisme</h3>
      <button id="colorblindness-panel-close">×</button>
    </div>
    <div id="colorblindness-panel-content">
      <div>
        <label>Mode de simulation</label>
        <select id="colorblindness-mode-select">
          <option value="none">Normal (désactivé)</option>
          <option value="protanopia">Protanopie (rouge)</option>
          <option value="deuteranopia">Deutéranopie (vert)</option>
          <option value="tritanopia">Tritanopie (bleu)</option>
        </select>
      </div>
      <div id="colorblindness-overlay-toggle">
        <input type="checkbox" id="colorblindness-overlay-checkbox" checked>
        <span>Afficher l'overlay</span>
      </div>
      <div id="colorblindness-preview">
        <div class="colorblindness-preview-swatch" style="background: #ff0000;">R</div>
        <div class="colorblindness-preview-swatch" style="background: #00ff00;">V</div>
        <div class="colorblindness-preview-swatch" style="background: #0000ff;">B</div>
        <div class="colorblindness-preview-swatch" style="background: #ffff00;">J</div>
      </div>
      <div id="colorblindness-status">
        Mode actuel : Normal
      </div>
      <div id="colorblindness-wcag">
        <div id="colorblindness-wcag-header">
          <span>⬡ Color Safe Design</span>
          <button id="colorblindness-wcag-btn">Analyser WCAG</button>
        </div>
        <div id="colorblindness-wcag-results"></div>
      </div>
      <div id="colorblindness-style-row">
        <button id="colorblindness-register-style">+ Ajouter au stack de style</button>
      </div>
    </div>
  `;

  document.body.appendChild(_panel);
  _bindEvents();
  _makeDraggable();
}

function _bindEvents() {
  const closeBtn = document.getElementById('colorblindness-panel-close');
  const modeSelect = document.getElementById('colorblindness-mode-select');
  const overlayCheckbox = document.getElementById('colorblindness-overlay-checkbox');

  closeBtn?.addEventListener('click', closeColorBlindnessPanel);

  modeSelect?.addEventListener('change', (e) => {
    setColorBlindnessMode(e.target.value);
    _updateStatus();
  });

  overlayCheckbox?.addEventListener('change', (e) => {
    setColorBlindnessOverlay(e.target.checked);
  });

  document.getElementById('colorblindness-wcag-btn')
    ?.addEventListener('click', _runWcagCheck);

  document.getElementById('colorblindness-register-style')
    ?.addEventListener('click', () => {
      registerColorBlindnessAsStyleLayer();
      const btn = document.getElementById('colorblindness-register-style');
      if (btn) { btn.textContent = '✓ Ajouté au stack'; btn.disabled = true; }
    });
}

const _CB_MODE_NAMES = {
  none: 'Normal',
  protanopia: 'Protanopia',
  deuteranopia: 'Deuteranopia',
  tritanopia: 'Tritanopia',
};
const _CB_MODE_NAMES_EN = {
  protanopia: 'Protanopia',
  deuteranopia: 'Deuteranopia',
  tritanopia: 'Tritanopia',
};

function _updateStatus() {
  const mode = getColorBlindnessMode();

  // Panneau dédié (si présent)
  const statusEl = document.getElementById('colorblindness-status');
  const modeSelect = document.getElementById('colorblindness-mode-select');
  if (statusEl) statusEl.textContent = `Mode actuel : ${_CB_MODE_NAMES[mode] || 'Normal'}`;
  if (modeSelect) modeSelect.value = mode;

  // §6.5 — indicateur dans la barre de statut (découvrabilité hors panneau)
  const ind = document.getElementById('cbIndicator');
  if (ind) {
    if (mode && mode !== 'none') {
      ind.hidden = false;
      ind.textContent = `👁 ${_CB_MODE_NAMES_EN[mode] || mode}`;
      ind.setAttribute('aria-label', `Color blindness simulation: ${_CB_MODE_NAMES_EN[mode] || mode} — click to open panel`);
    } else {
      ind.hidden = true;
    }
  }
}

// §6.5 — exposé pour rafraîchir l'indicateur depuis l'extérieur (init, etc.)
export function refreshColorBlindStatus() { _updateStatus(); }

// ── WCAG Color Safe Analysis ─────────────────────────────────────────────────

function _srgbLinear(v) {
  v /= 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function _luminance(r, g, b) {
  return 0.2126 * _srgbLinear(r) + 0.7152 * _srgbLinear(g) + 0.0722 * _srgbLinear(b);
}

function _contrastRatio(l1, l2) {
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function _runWcagCheck() {
  const canvas = state.gl?.renderer?.domElement || document.querySelector('canvas');
  const resultsEl = document.getElementById('colorblindness-wcag-results');
  if (!resultsEl) return;

  if (!canvas) {
    resultsEl.innerHTML = '<span class="wcag-warn">Canvas non disponible</span>';
    return;
  }

  try {
    const S = 48;
    const tmp = document.createElement('canvas');
    tmp.width = S; tmp.height = S;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(canvas, 0, 0, S, S);
    const pix = ctx.getImageData(0, 0, S, S).data;

    // Collect luminances from a sampled grid
    const lums = [];
    for (let i = 0; i < pix.length; i += 4 * 3) {
      lums.push(_luminance(pix[i], pix[i + 1], pix[i + 2]));
    }
    lums.sort((a, b) => a - b);
    const darkL = lums[Math.floor(lums.length * 0.1)];   // 10th percentile
    const lightL = lums[Math.floor(lums.length * 0.9)];  // 90th percentile
    const medL = lums[Math.floor(lums.length * 0.5)];    // median

    const ratioExtremes = _contrastRatio(lightL, darkL);
    const ratioDarkMid = _contrastRatio(medL, darkL);

    const lines = [];
    const icon = (r) => r >= 7 ? '✓✓' : r >= 4.5 ? '✓' : r >= 3 ? '⚠' : '✗';
    const cls = (r) => r >= 4.5 ? 'wcag-ok' : r >= 3 ? 'wcag-warn' : 'wcag-fail';

    lines.push(`<div class="${cls(ratioExtremes)}"><span>${icon(ratioExtremes)}</span> Plage totale : ${ratioExtremes.toFixed(1)}:1${ratioExtremes < 3 ? ' — faible contraste global' : ''}</div>`);
    lines.push(`<div class="${cls(ratioDarkMid)}"><span>${icon(ratioDarkMid)}</span> Médiane/sombre : ${ratioDarkMid.toFixed(1)}:1</div>`);

    if (ratioExtremes < 4.5) {
      lines.push(`<div class="wcag-info">WCAG AA texte normal requis ≥ 4.5:1</div>`);
    }
    if (ratioExtremes >= 7) {
      lines.push(`<div class="wcag-ok">AAA atteint</div>`);
    }

    resultsEl.innerHTML = lines.join('');
  } catch (e) {
    resultsEl.innerHTML = `<span class="wcag-warn">Erreur: ${e.message}</span>`;
  }
}

function _makeDraggable() {
  const header = document.getElementById('colorblindness-panel-header');
  if (!header || !_panel) return;

  let isDragging = false;
  let startX, startY, initialX, initialY;

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialX = _panel.offsetLeft;
    initialY = _panel.offsetTop;
    header.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    _panel.style.left = `${initialX + dx}px`;
    _panel.style.top = `${initialY + dy}px`;
    _panel.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    header.style.cursor = 'move';
  });
}

export function initColorBlindnessUI() {
  if (_initialized) return;
  _injectCSS();
  _createPanel();
  _initialized = true;
  _updateStatus();
}

export function openColorBlindnessPanel() {
  if (!_initialized) initColorBlindnessUI();
  if (_panel) _panel.classList.add('visible');
  _updateStatus();
}

export function closeColorBlindnessPanel() {
  if (_panel) _panel.classList.remove('visible');
}

export function toggleColorBlindnessPanel() {
  if (!_initialized) initColorBlindnessUI();
  if (_panel?.classList.contains('visible')) {
    closeColorBlindnessPanel();
  } else {
    openColorBlindnessPanel();
  }
}

export function isColorBlindnessPanelOpen() {
  return _panel?.classList.contains('visible') ?? false;
}
