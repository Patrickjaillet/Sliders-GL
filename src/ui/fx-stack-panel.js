/**
 * fx-stack-panel.js — F-2.2 (Axe 2)
 *
 * Panneau de contrôle du stack post-FX.
 * Permet d'activer/désactiver chaque effet, et d'ajuster ses paramètres.
 * Drag-and-drop pour réordonner les passes (TODO v2).
 *
 * API publique :
 *   openFXPanel()
 *   closeFXPanel()
 *   toggleFXPanel()
 */

import { FX_DEFINITIONS, getFXState, setFXEnabled, setFXParam } from '../render/fx-stack.js';

let _panelEl = null;

// ── API publique ──────────────────────────────────────────────────────────────

export function openFXPanel() {
  if (!_panelEl) _build();
  _panelEl.hidden = false;
  _refresh();
}

export function closeFXPanel() {
  if (_panelEl) _panelEl.hidden = true;
}

export function toggleFXPanel() {
  if (!_panelEl || _panelEl.hidden) openFXPanel();
  else closeFXPanel();
}

// ── Construction ──────────────────────────────────────────────────────────────

function _build() {
  _injectStyles();

  const el = document.createElement('div');
  el.id = 'fxPanel';
  el.hidden = true;
  el.innerHTML = `
    <div id="fxHeader">
      <span id="fxTitle">⬡ Post-FX Stack</span>
      <button id="fxClose">✕</button>
    </div>
    <div id="fxList"></div>
  `;
  document.body.appendChild(el);
  _panelEl = el;

  el.querySelector('#fxClose').addEventListener('click', closeFXPanel);
  _buildEffectList();
}

function _buildEffectList() {
  const list = _panelEl.querySelector('#fxList');
  list.innerHTML = '';

  for (const fx of FX_DEFINITIONS) {
    const state = getFXState()[fx.id] || { enabled: false, params: {} };

    const item = document.createElement('div');
    item.className = 'fx-item';
    item.dataset.id = fx.id;

    const paramsHTML = Object.entries(fx.params || {}).map(([key, def]) => {
      const val = state.params[key] ?? def.default;
      return `
        <label class="fx-param-row">
          <span class="fx-param-label">${_esc(def.label)}</span>
          <input class="fx-param-slider" type="range"
            min="${def.min}" max="${def.max}" step="${def.step}" value="${val}"
            data-fx="${fx.id}" data-key="${key}">
          <span class="fx-param-val" id="fxpv-${fx.id}-${key}">${val}</span>
        </label>`;
    }).join('');

    item.innerHTML = `
      <div class="fx-row">
        <span class="fx-icon">${_esc(fx.icon || '◈')}</span>
        <span class="fx-name">${_esc(fx.name)}</span>
        <span class="fx-desc">${_esc(fx.desc)}</span>
        <label class="fx-toggle" title="${state.enabled ? 'Disable' : 'Enable'}">
          <input type="checkbox" class="fx-enable" data-fx="${fx.id}" ${state.enabled ? 'checked' : ''}>
          <span class="fx-toggle-knob"></span>
        </label>
      </div>
      <div class="fx-params${state.enabled ? '' : ' fx-params-hidden'}" id="fxp-${fx.id}">
        ${paramsHTML}
      </div>
    `;

    list.appendChild(item);
  }

  // Events
  list.querySelectorAll('.fx-enable').forEach(cb => {
    cb.addEventListener('change', () => {
      const fxId = cb.dataset.fx;
      setFXEnabled(fxId, cb.checked);
      const paramsEl = list.querySelector('#fxp-' + fxId);
      if (paramsEl) paramsEl.classList.toggle('fx-params-hidden', !cb.checked);
    });
  });

  list.querySelectorAll('.fx-param-slider').forEach(inp => {
    inp.addEventListener('input', () => {
      const fxId = inp.dataset.fx;
      const key = inp.dataset.key;
      const val = parseFloat(inp.value);
      setFXParam(fxId, key, val);
      const valEl = list.querySelector(`#fxpv-${fxId}-${key}`);
      if (valEl) valEl.textContent = val.toFixed(inp.step < 0.1 ? 3 : inp.step < 1 ? 2 : 0);
    });
  });
}

function _refresh() {
  const state = getFXState();
  for (const fx of FX_DEFINITIONS) {
    const fxState = state[fx.id];
    if (!fxState) continue;
    const cb = _panelEl.querySelector(`.fx-enable[data-fx="${fx.id}"]`);
    if (cb) cb.checked = fxState.enabled;
    const paramsEl = _panelEl.querySelector(`#fxp-${fx.id}`);
    if (paramsEl) paramsEl.classList.toggle('fx-params-hidden', !fxState.enabled);
    for (const [key, val] of Object.entries(fxState.params || {})) {
      const slider = _panelEl.querySelector(`.fx-param-slider[data-fx="${fx.id}"][data-key="${key}"]`);
      if (slider) slider.value = String(val);
      const valEl = _panelEl.querySelector(`#fxpv-${fx.id}-${key}`);
      if (valEl) valEl.textContent = String(val);
    }
  }
}

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Styles ────────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('fxStyles')) return;
  const s = document.createElement('style');
  s.id = 'fxStyles';
  s.textContent = `
    #fxPanel {
      position: fixed; top: 80px; right: 16px; z-index: 800;
      background: var(--bg-surface, #1a1d22);
      border: 1px solid var(--border, #2a2d32);
      border-radius: var(--radius-md); width: 260px;
      font-family: 'JetBrains Mono', monospace; font-size: 11px;
      color: var(--prose, #ccc);
      box-shadow: 0 8px 32px rgba(0,0,0,.5);
      max-height: 70vh; display: flex; flex-direction: column;
    }
    #fxPanel[hidden] { display: none; }
    #fxHeader {
      display: flex; align-items: center; padding: 8px 10px;
      border-bottom: 1px solid var(--border, #2a2d32); flex-shrink: 0;
    }
    #fxTitle { font-weight: 700; flex: 1; font-size: 12px; }
    #fxClose { background: none; border: none; color: var(--t3, #666); cursor: pointer; }
    #fxList { overflow-y: auto; flex: 1; }
    .fx-item { border-bottom: 1px solid rgba(255,255,255,.04); }
    .fx-row {
      display: flex; align-items: center; gap: 6px; padding: 7px 10px;
      cursor: default;
    }
    .fx-icon { font-size: 12px; color: var(--accent, #5b8df6); min-width: 14px; }
    .fx-name { font-size: 11px; font-weight: 600; flex: 1; }
    .fx-desc { font-size: 9px; color: var(--t3, #666); flex: 2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fx-toggle { position: relative; width: 28px; height: 15px; flex-shrink: 0; cursor: pointer; }
    .fx-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
    .fx-toggle-knob {
      position: absolute; inset: 0; background: var(--bg-deep, #111);
      border: 1px solid var(--border, #2a2d32); border-radius: 15px; transition: background 0.15s;
    }
    .fx-toggle-knob::after {
      content: ''; position: absolute; width: 9px; height: 9px;
      background: var(--t3, #888); border-radius: 50%; top: 2px; left: 2px; transition: all 0.15s;
    }
    .fx-toggle input:checked + .fx-toggle-knob { background: var(--accent, #5b8df6); border-color: var(--accent, #5b8df6); }
    .fx-toggle input:checked + .fx-toggle-knob::after { background: #fff; left: 15px; }
    .fx-params { padding: 0 10px 8px 30px; display: flex; flex-direction: column; gap: 5px; }
    .fx-params-hidden { display: none; }
    .fx-param-row { display: flex; align-items: center; gap: 6px; }
    .fx-param-label { font-size: 10px; color: var(--t3, #888); min-width: 80px; }
    .fx-param-slider { flex: 1; accent-color: var(--accent, #5b8df6); }
    .fx-param-val { font-size: 10px; color: var(--accent, #5b8df6); min-width: 35px; text-align: right; }
  `;
  document.head.appendChild(s);
}
