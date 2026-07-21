/**
 * partial-preset-dialog.js — F-3.9 (Axe 3)
 *
 * Dialog "Export preset partiel" : liste tous les sliders du shader courant
 * avec des checkboxes, permet de les sélectionner et les sauvegarder comme
 * un preset partiel.
 *
 * API publique :
 *   openPartialPresetDialog()  — ouvre le dialog
 *   closePartialPresetDialog() — ferme
 */

import { state } from '../core/state.js';
import { savePartialPreset, loadUserPresets, saveUserPresets } from '../io/presets.js';
import { serializeCustomizations } from './slider-customizations.js';
import { renderLibrary } from '../io/library.js';
import { toast } from '../io/actions.js';

let _el = null;

// ── API publique ──────────────────────────────────────────────────────────────

export function openPartialPresetDialog() {
  if (!_el) _build();
  _populate();
  _el.hidden = false;
  _el.querySelector('#ppdName')?.focus();
}

export function closePartialPresetDialog() {
  if (_el) _el.hidden = true;
}

// ── Construction ──────────────────────────────────────────────────────────────

function _build() {
  _injectStyles();
  const el = document.createElement('div');
  el.id = 'ppdOverlay';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Save partial preset');
  el.innerHTML = `
    <div id="ppdModal">
      <div id="ppdHeader">
        <span id="ppdTitle">⊂ Partial Preset</span>
        <button id="ppdClose" aria-label="Close">✕</button>
      </div>
      <div id="ppdBody">
        <div class="ppd-field">
          <label class="ppd-label">Preset name *</label>
          <input id="ppdName" class="ppd-input" placeholder="My partial preset" maxlength="80" spellcheck="false">
        </div>
        <div class="ppd-controls">
          <button class="ppd-small-btn" id="ppdSelectAll">Select all</button>
          <button class="ppd-small-btn" id="ppdSelectNone">Deselect all</button>
          <button class="ppd-small-btn" id="ppdSelectModified">Modified only</button>
          <span id="ppdCount" class="ppd-count">0 selected</span>
        </div>
        <div id="ppdList" class="ppd-list"></div>
      </div>
      <div id="ppdFooter">
        <button class="ppd-btn" id="ppdCancel">Cancel</button>
        <button class="ppd-btn ppd-btn-confirm" id="ppdSave">Save ✓</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  _el = el;

  el.querySelector('#ppdClose').addEventListener('click', closePartialPresetDialog);
  el.querySelector('#ppdCancel').addEventListener('click', closePartialPresetDialog);
  el.querySelector('#ppdSave').addEventListener('click', _doSave);
  el.addEventListener('click', e => { if (e.target === el) closePartialPresetDialog(); });

  el.querySelector('#ppdSelectAll').addEventListener('click', () => _checkAll(true));
  el.querySelector('#ppdSelectNone').addEventListener('click', () => _checkAll(false));
  el.querySelector('#ppdSelectModified').addEventListener('click', _checkModified);

  el.querySelector('#ppdName').addEventListener('keydown', e => {
    if (e.key === 'Enter') _doSave();
    if (e.key === 'Escape') closePartialPresetDialog();
  });
}

function _populate() {
  const vars = state.vars || [];
  const list = _el.querySelector('#ppdList');
  list.innerHTML = '';

  if (vars.length === 0) {
    list.innerHTML = '<div class="ppd-empty">No sliders in the current shader.</div>';
    return;
  }

  for (const e of vars) {
    const isModified = Math.abs(e.value - e.defaultValue) > 1e-9;
    const row = document.createElement('label');
    row.className = 'ppd-row' + (isModified ? ' modified' : '');
    row.dataset.id = e.id;
    row.innerHTML = `
      <input type="checkbox" class="ppd-check" value="${e.id}" ${isModified ? 'checked' : ''}>
      <span class="ppd-name">${_esc(e.label || e.id)}</span>
      <span class="ppd-cat">${_esc(e.category || '')}</span>
      <span class="ppd-val">${typeof e.value === 'number' ? e.value.toFixed(3) : e.value}</span>
    `;
    list.appendChild(row);
  }

  list.addEventListener('change', _updateCount);
  _updateCount();
}

function _checkAll(checked) {
  _el.querySelectorAll('.ppd-check').forEach(cb => { cb.checked = checked; });
  _updateCount();
}

function _checkModified() {
  _el.querySelectorAll('.ppd-row').forEach(row => {
    const cb = row.querySelector('.ppd-check');
    if (cb) cb.checked = row.classList.contains('modified');
  });
  _updateCount();
}

function _updateCount() {
  const total = _el.querySelectorAll('.ppd-check:checked').length;
  const countEl = _el.querySelector('#ppdCount');
  if (countEl) countEl.textContent = `${total} sélectionné${total !== 1 ? 's' : ''}`;
}

function _doSave() {
  const name = (_el.querySelector('#ppdName')?.value || '').trim();
  const checked = [..._el.querySelectorAll('.ppd-check:checked')].map(cb => cb.value);

  savePartialPreset(name, checked, {
    state,
    serializeCustomizations,
    loadUserPresets,
    saveUserPresets,
    renderLibrary,
    toast,
  });

  if (checked.length > 0 && name) closePartialPresetDialog();
}

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Styles ────────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('ppdStyles')) return;
  const s = document.createElement('style');
  s.id = 'ppdStyles';
  s.textContent = `
    #ppdOverlay {
      position: fixed; inset: 0; z-index: 1600;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,.55); backdrop-filter: blur(3px);
    }
    #ppdOverlay[hidden] { display: none; }
    #ppdModal {
      background: var(--bg-surface, #1a1d22);
      border: 1px solid var(--border, #2a2d32);
      border-radius: var(--radius-md);
      width: min(500px, 96vw);
      max-height: 80vh;
      display: flex; flex-direction: column;
      box-shadow: 0 16px 48px rgba(0,0,0,.5);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px; color: var(--prose, #ccc);
    }
    #ppdHeader {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px; border-bottom: 1px solid var(--border, #2a2d32);
      flex-shrink: 0;
    }
    #ppdTitle { font-weight: 700; font-size: 13px; }
    #ppdClose { background: none; border: none; color: var(--t3, #666); cursor: pointer; font-size: 14px; }
    #ppdBody { padding: 14px; display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
    .ppd-field { display: flex; flex-direction: column; gap: 4px; }
    .ppd-label { font-size: 11px; color: var(--t3, #666); }
    .ppd-input {
      background: var(--bg-deep, #111); border: 1px solid var(--border, #2a2d32);
      color: var(--prose, #ccc); border-radius: 4px; padding: 6px 8px;
      font-family: inherit; font-size: 12px; outline: none;
    }
    .ppd-input:focus { border-color: var(--accent, #5b8df6); }
    .ppd-controls {
      display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
    }
    .ppd-small-btn {
      padding: 3px 8px; font-size: 10px; border-radius: 3px;
      background: var(--bg-deep, #111); border: 1px solid var(--border, #2a2d32);
      color: var(--t3, #888); cursor: pointer; font-family: inherit;
    }
    .ppd-small-btn:hover { color: var(--prose, #ccc); }
    .ppd-count { font-size: 10px; color: var(--accent, #5b8df6); margin-left: auto; }
    .ppd-list {
      overflow-y: auto; max-height: 40vh; min-height: 60px;
      border: 1px solid var(--border, #2a2d32); border-radius: 4px;
      background: var(--bg-deep, #111);
    }
    .ppd-row {
      display: grid; grid-template-columns: 20px 1fr auto auto;
      align-items: center; gap: 8px;
      padding: 5px 10px; cursor: pointer;
      border-bottom: 1px solid rgba(255,255,255,.04);
    }
    .ppd-row:hover { background: rgba(255,255,255,.04); }
    .ppd-row.modified { background: rgba(91,141,246,.05); }
    .ppd-check { cursor: pointer; accent-color: var(--accent, #5b8df6); }
    .ppd-name { font-size: 11px; }
    .ppd-cat { font-size: 9px; color: var(--t3, #666); }
    .ppd-val { font-size: 10px; color: var(--accent, #5b8df6); min-width: 50px; text-align: right; }
    .ppd-empty { padding: 20px; text-align: center; color: var(--t3, #666); font-size: 11px; }
    #ppdFooter {
      display: flex; gap: 8px; justify-content: flex-end;
      padding: 12px 14px; border-top: 1px solid var(--border, #2a2d32); flex-shrink: 0;
    }
    .ppd-btn {
      padding: 6px 14px; border-radius: 4px;
      border: 1px solid var(--border, #2a2d32);
      background: var(--bg-deep, #111); color: var(--prose, #ccc);
      cursor: pointer; font-family: inherit; font-size: 12px;
    }
    .ppd-btn:hover { background: var(--hover, rgba(255,255,255,.07)); }
    .ppd-btn-confirm { background: var(--accent, #5b8df6); color: #fff; border-color: transparent; }
    .ppd-btn-confirm:hover { opacity: 0.9; }
  `;
  document.head.appendChild(s);
}
