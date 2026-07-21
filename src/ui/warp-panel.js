/**
 * warp-panel.js — F-4.1 (Axe 4)
 *
 * Panneau de contrôle du UV Warp.
 * Permet d'ajouter/supprimer/réordonner des warps et d'en ajuster les params.
 * Bouton "Injecter" insère la fonction applyWarps() dans le shader via smartInsert.
 *
 * API publique :
 *   openWarpPanel()
 *   closeWarpPanel()
 *   toggleWarpPanel()
 */

import {
  UV_WARP_TYPES, addWarp, removeWarp, moveWarp,
  setWarpParam, setWarpEnabled, getWarps, buildWarpGLSL,
} from '../render/uv-warp.js';
import { state } from '../core/state.js';

let _panelEl = null;

// ── API publique ───────────────────────────────────────────────────────────────

export function openWarpPanel() {
  if (!_panelEl) _build();
  _panelEl.hidden = false;
  _refresh();
}

export function closeWarpPanel() {
  if (_panelEl) _panelEl.hidden = true;
}

export function toggleWarpPanel() {
  if (!_panelEl || _panelEl.hidden) openWarpPanel();
  else closeWarpPanel();
}

// ── Construction ──────────────────────────────────────────────────────────────

function _build() {
  _injectStyles();
  const el = document.createElement('div');
  el.id = 'warpPanel';
  el.hidden = true;

  const typeOptions = UV_WARP_TYPES.map(t =>
    `<option value="${_esc(t.id)}">${_esc(t.icon)} ${_esc(t.name)} — ${_esc(t.desc)}</option>`
  ).join('');

  el.innerHTML = `
    <div id="warpHeader">
      <span id="warpTitle">〜 UV Warp</span>
      <button id="warpClose" type="button">✕</button>
    </div>
    <div id="warpAddRow">
      <select id="warpTypeSelect">${typeOptions}</select>
      <button id="warpAddBtn" type="button">+ Ajouter</button>
    </div>
    <div id="warpList"></div>
    <div id="warpFooter">
      <button id="warpInjectBtn" type="button">⇩ Inject into shader</button>
      <span id="warpInjectStatus"></span>
    </div>
  `;
  document.body.appendChild(el);
  _panelEl = el;

  el.querySelector('#warpClose').addEventListener('click', closeWarpPanel);
  el.querySelector('#warpAddBtn').addEventListener('click', () => {
    const sel = el.querySelector('#warpTypeSelect');
    addWarp(sel.value);
    _refresh();
  });
  el.querySelector('#warpInjectBtn').addEventListener('click', _inject);
}

// ── Rendu ─────────────────────────────────────────────────────────────────────

function _refresh() {
  if (!_panelEl || _panelEl.hidden) return;
  const list = _panelEl.querySelector('#warpList');
  if (!list) return;
  list.innerHTML = '';

  const warps = getWarps();
  if (warps.length === 0) {
    list.innerHTML = '<div class="warp-empty">No active warps — add one above.</div>';
    return;
  }

  warps.forEach((w, idx) => {
    const def = UV_WARP_TYPES.find(t => t.id === w.typeId);
    if (!def) return;

    const item = document.createElement('div');
    item.className = 'warp-item' + (w.enabled ? '' : ' warp-disabled');
    item.dataset.id = w.id;

    const paramsHTML = Object.entries(def.params).map(([key, pd]) => {
      const val = w.params[key] ?? pd.default;
      return `
        <label class="warp-param-row">
          <span class="warp-param-label">${_esc(pd.label)}</span>
          <input class="warp-param-slider" type="range"
            min="${pd.min}" max="${pd.max}" step="${pd.step}" value="${val}"
            data-id="${_esc(w.id)}" data-key="${_esc(key)}">
          <span class="warp-param-val" id="wpv-${_esc(w.id)}-${_esc(key)}">${Number(val).toFixed(pd.step < 0.1 ? 3 : 0)}</span>
        </label>`;
    }).join('');

    item.innerHTML = `
      <div class="warp-row">
        <span class="warp-icon">${_esc(def.icon)}</span>
        <span class="warp-name">${_esc(def.name)}</span>
        <div class="warp-actions">
          ${idx > 0 ? `<button class="warp-up" type="button" data-id="${_esc(w.id)}" title="Move up">▲</button>` : '<span class="warp-ph"></span>'}
          ${idx < warps.length - 1 ? `<button class="warp-dn" type="button" data-id="${_esc(w.id)}" title="Move down">▼</button>` : '<span class="warp-ph"></span>'}
          <label class="warp-toggle" title="${w.enabled ? 'Disable' : 'Enable'}">
            <input type="checkbox" class="warp-enable" data-id="${_esc(w.id)}" ${w.enabled ? 'checked' : ''}>
            <span class="warp-toggle-knob"></span>
          </label>
          <button class="warp-rm" type="button" data-id="${_esc(w.id)}" title="Delete">×</button>
        </div>
      </div>
      <div class="warp-params">${paramsHTML}</div>
    `;
    list.appendChild(item);
  });

  // Events
  list.querySelectorAll('.warp-up').forEach(b =>
    b.addEventListener('click', () => { moveWarp(b.dataset.id, -1); _refresh(); }));
  list.querySelectorAll('.warp-dn').forEach(b =>
    b.addEventListener('click', () => { moveWarp(b.dataset.id, +1); _refresh(); }));
  list.querySelectorAll('.warp-rm').forEach(b =>
    b.addEventListener('click', () => { removeWarp(b.dataset.id); _refresh(); }));
  list.querySelectorAll('.warp-enable').forEach(cb =>
    cb.addEventListener('change', () => { setWarpEnabled(cb.dataset.id, cb.checked); _refresh(); }));
  list.querySelectorAll('.warp-param-slider').forEach(sl => {
    sl.addEventListener('input', () => {
      const val = parseFloat(sl.value);
      setWarpParam(sl.dataset.id, sl.dataset.key, val);
      const vEl = list.querySelector(`#wpv-${sl.dataset.id}-${sl.dataset.key}`);
      if (vEl) vEl.textContent = val.toFixed(parseFloat(sl.step) < 0.1 ? 3 : 0);
    });
  });
}

// ── Injection dans le shader ──────────────────────────────────────────────────

async function _inject() {
  const glsl = buildWarpGLSL();
  const status = _panelEl.querySelector('#warpInjectStatus');
  if (!glsl) {
    status.textContent = '⚠ No active warps';
    setTimeout(() => { status.textContent = ''; }, 2500);
    return;
  }

  const editor = state.editor;
  if (!editor) {
    status.textContent = '⚠ Éditeur non disponible';
    return;
  }

  const model = editor.getModel();
  if (!model) return;

  let code = model.getValue();

  // Insérer ou remplacer la fonction applyWarps()
  const existingFnRe = /vec2\s+applyWarps\s*\([^)]*\)\s*\{[^}]*(?:\{[^}]*\}[^}]*)?\}/s;
  if (existingFnRe.test(code)) {
    code = code.replace(existingFnRe, glsl.funcBlock);
    model.setValue(code);
    status.textContent = '✓ Fonction mise à jour';
  } else {
    // Chercher mainImage pour insérer avant
    const lines = code.split('\n');
    let insertAt = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/void\s+mainImage\s*\(/.test(lines[i])) { insertAt = i; break; }
    }
    if (insertAt < 0) insertAt = lines.length;
    lines.splice(insertAt, 0, glsl.funcBlock, '');
    model.setValue(lines.join('\n'));
    status.textContent = '✓ Fonction insérée';
  }

  // Vérifier si l'appel uv = applyWarps(uv) est déjà présent
  const updatedCode = model.getValue();
  if (!updatedCode.includes('applyWarps(uv)')) {
    // Insérer juste après la normalisation des UV dans mainImage
    const newCode = updatedCode.replace(
      /(void\s+mainImage\s*\([^)]*\)\s*\{[^\n]*\n)([ \t]*vec2\s+uv\s*=[^;]+;)/,
      (_, head, uvLine) => `${head}${uvLine}\n    uv = applyWarps(uv);`
    );
    if (newCode !== updatedCode) {
      model.setValue(newCode);
      status.textContent = '✓ Fonction insérée + appel ajouté';
    }
  }

  setTimeout(() => { status.textContent = ''; }, 3000);

  // Déclencher le parse
  if (state.callbacks?.applyAndParse) state.callbacks.applyAndParse();
}

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Styles ────────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('warpStyles')) return;
  const s = document.createElement('style');
  s.id = 'warpStyles';
  s.textContent = `
    #warpPanel {
      position: fixed; top: 80px; right: 16px; z-index: 800;
      background: var(--bg-surface, #1a1d22);
      border: 1px solid var(--border, #2a2d32);
      border-radius: var(--radius-md); width: 270px;
      font-family: 'JetBrains Mono', monospace; font-size: 11px;
      color: var(--prose, #ccc);
      box-shadow: 0 8px 32px rgba(0,0,0,.5);
      max-height: 78vh; display: flex; flex-direction: column;
    }
    #warpPanel[hidden] { display: none; }
    #warpHeader {
      display: flex; align-items: center; padding: 8px 10px;
      border-bottom: 1px solid var(--border, #2a2d32); flex-shrink: 0;
    }
    #warpTitle { font-weight: 700; flex: 1; font-size: 12px; }
    #warpClose { background: none; border: none; color: var(--t3, #666); cursor: pointer; }
    #warpAddRow {
      display: flex; gap: 6px; padding: 7px 10px;
      border-bottom: 1px solid var(--border, #2a2d32); flex-shrink: 0;
    }
    #warpTypeSelect {
      flex: 1; background: var(--bg-deep, #111); border: 1px solid var(--border, #2a2d32);
      border-radius: 4px; color: var(--prose, #ccc); padding: 3px 5px; font: inherit; font-size: 10px;
    }
    #warpAddBtn {
      background: var(--accent, #5b8df6); border: none; border-radius: 4px;
      color: #fff; cursor: pointer; padding: 3px 8px; font: inherit; font-size: 10px;
    }
    #warpList { overflow-y: auto; flex: 1; }
    .warp-empty { padding: 12px 10px; color: var(--t3, #666); font-size: 10px; text-align: center; }
    .warp-item { border-bottom: 1px solid rgba(255,255,255,.04); }
    .warp-disabled { opacity: 0.45; }
    .warp-row {
      display: flex; align-items: center; gap: 5px; padding: 6px 8px;
    }
    .warp-icon { font-size: 13px; color: var(--accent, #5b8df6); min-width: 16px; }
    .warp-name { font-size: 11px; font-weight: 600; flex: 1; }
    .warp-actions { display: flex; align-items: center; gap: 3px; }
    .warp-up, .warp-dn, .warp-rm {
      background: none; border: none; color: var(--t3, #666); cursor: pointer; padding: 1px 3px; font-size: 9px;
    }
    .warp-up:hover, .warp-dn:hover { color: var(--accent, #5b8df6); }
    .warp-rm:hover { color: #e06c75; }
    .warp-ph { display: inline-block; width: 16px; }
    .warp-toggle { position: relative; width: 28px; height: 15px; flex-shrink: 0; cursor: pointer; }
    .warp-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
    .warp-toggle-knob {
      position: absolute; inset: 0; background: var(--bg-deep, #111);
      border: 1px solid var(--border, #2a2d32); border-radius: 15px; transition: background .15s;
    }
    .warp-toggle-knob::after {
      content: ''; position: absolute; width: 9px; height: 9px;
      background: var(--t3, #888); border-radius: 50%; top: 2px; left: 2px; transition: all .15s;
    }
    .warp-toggle input:checked + .warp-toggle-knob { background: var(--accent, #5b8df6); border-color: var(--accent, #5b8df6); }
    .warp-toggle input:checked + .warp-toggle-knob::after { background: #fff; left: 15px; }
    .warp-params { padding: 0 8px 7px 28px; display: flex; flex-direction: column; gap: 4px; }
    .warp-param-row { display: flex; align-items: center; gap: 5px; }
    .warp-param-label { font-size: 10px; color: var(--t3, #888); min-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .warp-param-slider { flex: 1; accent-color: var(--accent, #5b8df6); }
    .warp-param-val { font-size: 10px; color: var(--accent, #5b8df6); min-width: 32px; text-align: right; }
    #warpFooter {
      display: flex; align-items: center; gap: 8px; padding: 7px 10px;
      border-top: 1px solid var(--border, #2a2d32); flex-shrink: 0;
    }
    #warpInjectBtn {
      background: none; border: 1px solid var(--accent, #5b8df6); border-radius: 4px;
      color: var(--accent, #5b8df6); cursor: pointer; padding: 4px 10px; font: inherit; font-size: 10px;
    }
    #warpInjectBtn:hover { background: var(--accent, #5b8df6); color: #fff; }
    #warpInjectStatus { font-size: 10px; color: var(--t3, #888); }
  `;
  document.head.appendChild(s);
}
