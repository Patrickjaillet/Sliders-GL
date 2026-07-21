/**
 * add-uniform-dialog.js — F-2.3 (Axe 2)
 *
 * Dialog "+ Ajouter uniform" dans le panneau Sliders.
 * Génère une ligne GLSL avec annotations @range @label @group et l'insère
 * en tête du shader (après les #define existants).
 *
 * API publique :
 *   openAddUniformDialog()  — ouvre le dialog
 *   closeAddUniformDialog() — ferme
 */

import { state } from '../core/state.js';
import { applyAndParse } from '../io/actions.js';
import { toast } from '../io/actions.js';

let _dialogEl = null;

// ── API publique ──────────────────────────────────────────────────────────────

export function openAddUniformDialog() {
  if (!_dialogEl) _buildDialog();
  _dialogEl.hidden = false;
  _dialogEl.querySelector('#audName')?.focus();
}

export function closeAddUniformDialog() {
  if (_dialogEl) _dialogEl.hidden = true;
}

// ── Construction du dialog ────────────────────────────────────────────────────

function _buildDialog() {
  _injectStyles();

  const el = document.createElement('div');
  el.id = 'audOverlay';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Add uniform');
  el.innerHTML = `
    <div id="audModal">
      <div id="audHeader">
        <span id="audTitle">+ Add uniform</span>
        <button id="audClose" aria-label="Close">✕</button>
      </div>
      <div id="audBody">
        <div class="aud-field">
          <label class="aud-label">Variable name *</label>
          <input id="audName" class="aud-input" placeholder="uMyParam" maxlength="64" autocomplete="off" spellcheck="false">
        </div>
        <div class="aud-field">
          <label class="aud-label">Type</label>
          <select id="audType" class="aud-input">
            <option value="float">float</option>
            <option value="int">int</option>
            <option value="bool">bool</option>
            <option value="vec2">vec2</option>
            <option value="vec3">vec3</option>
            <option value="vec4">vec4</option>
          </select>
        </div>
        <div class="aud-row" id="audRangeRow">
          <div class="aud-field">
            <label class="aud-label">Min</label>
            <input id="audMin" class="aud-input aud-num" type="number" value="0" step="any">
          </div>
          <div class="aud-field">
            <label class="aud-label">Max</label>
            <input id="audMax" class="aud-input aud-num" type="number" value="1" step="any">
          </div>
          <div class="aud-field">
            <label class="aud-label">Default</label>
            <input id="audDefault" class="aud-input aud-num" type="number" value="0" step="any">
          </div>
        </div>
        <div class="aud-field">
          <label class="aud-label">Label (optional)</label>
          <input id="audLabel" class="aud-input" placeholder="My parameter" maxlength="60">
        </div>
        <div class="aud-field">
          <label class="aud-label">Group (optional)</label>
          <input id="audGroup" class="aud-input" placeholder="globals" maxlength="40">
        </div>
        <div class="aud-preview" id="audPreview"></div>
      </div>
      <div id="audFooter">
        <button class="aud-btn" id="audCancel">Cancel</button>
        <button class="aud-btn aud-btn-confirm" id="audInsert">Insert into shader ✓</button>
      </div>
    </div>
  `;

  document.body.appendChild(el);
  _dialogEl = el;

  el.querySelector('#audClose').addEventListener('click', closeAddUniformDialog);
  el.querySelector('#audCancel').addEventListener('click', closeAddUniformDialog);
  el.querySelector('#audInsert').addEventListener('click', _doInsert);
  el.addEventListener('click', e => { if (e.target === el) closeAddUniformDialog(); });

  // Live preview
  const inputs = ['audName', 'audType', 'audMin', 'audMax', 'audDefault', 'audLabel', 'audGroup'];
  inputs.forEach(id => {
    el.querySelector('#' + id)?.addEventListener('input', _updatePreview);
    el.querySelector('#' + id)?.addEventListener('change', _updatePreview);
  });

  // Toggle range row visibility for bool type
  el.querySelector('#audType').addEventListener('change', e => {
    const isBool = e.target.value === 'bool';
    el.querySelector('#audRangeRow').style.display = isBool ? 'none' : '';
    _updatePreview();
  });

  el.querySelector('#audName').addEventListener('keydown', e => {
    if (e.key === 'Enter') _doInsert();
    if (e.key === 'Escape') closeAddUniformDialog();
  });

  _updatePreview();
}

function _updatePreview() {
  const preview = _dialogEl.querySelector('#audPreview');
  if (preview) preview.textContent = _generateLine();
}

function _generateLine() {
  const name = (_dialogEl.querySelector('#audName')?.value || 'uMyParam').trim();
  const type = _dialogEl.querySelector('#audType')?.value || 'float';
  const min  = parseFloat(_dialogEl.querySelector('#audMin')?.value) || 0;
  const max  = parseFloat(_dialogEl.querySelector('#audMax')?.value) || 1;
  const def  = parseFloat(_dialogEl.querySelector('#audDefault')?.value) || 0;
  const label = (_dialogEl.querySelector('#audLabel')?.value || '').trim();
  const group = (_dialogEl.querySelector('#audGroup')?.value || '').trim();

  if (type === 'bool') {
    const annots = [label ? `@label("${label}")` : '', group ? `@group(${group})` : '@bool'].filter(Boolean);
    return `uniform ${type} ${name}; // @bool${label ? ` @label("${label}")` : ''}${group ? ` @group(${group})` : ''}`;
  }

  if (type === 'vec2' || type === 'vec3' || type === 'vec4') {
    const annots = [label ? `@label("${label}")` : '', group ? `@group(${group})` : ''].filter(Boolean);
    const ann = annots.length ? ' // ' + annots.join(' ') : '';
    return `uniform ${type} ${name};${ann}`;
  }

  const annots = [
    `@range(${min}, ${max})`,
    label ? `@label("${label}")` : '',
    group ? `@group(${group})` : '',
  ].filter(Boolean);

  return `uniform ${type} ${name} = ${def}; // ${annots.join(' ')}`;
}

function _doInsert() {
  if (!state.editor) { toast('Editor not ready', 'warn'); return; }

  const name = (_dialogEl.querySelector('#audName')?.value || '').trim();
  if (!name || !/^[A-Za-z_]\w*$/.test(name)) {
    toast('Invalid variable name', 'warn');
    return;
  }

  const line = _generateLine();
  const code = state.editor.getValue();

  // Insert after last #define or at top
  const insertedCode = _insertUniformInCode(code, line);
  state.editor.setValue(insertedCode);
  setTimeout(() => applyAndParse(), 80);

  toast(`Uniform "${name}" added`, 'ok');
  closeAddUniformDialog();
}

/**
 * Insère la ligne d'uniform après le dernier #define existant (ou en ligne 1 si aucun).
 */
function _insertUniformInCode(code, uniformLine) {
  const lines = code.split('\n');
  let lastDefine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*#define\s/.test(lines[i]) || /^\s*uniform\s/.test(lines[i])) lastDefine = i;
  }
  const insertAt = lastDefine >= 0 ? lastDefine + 1 : 0;
  lines.splice(insertAt, 0, uniformLine);
  return lines.join('\n');
}

// ── Styles ────────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('audStyles')) return;
  const s = document.createElement('style');
  s.id = 'audStyles';
  s.textContent = `
    #audOverlay {
      position: fixed; inset: 0; z-index: 1600;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,.55); backdrop-filter: blur(3px);
    }
    #audOverlay[hidden] { display: none; }
    #audModal {
      background: var(--bg-surface, #1a1d22);
      border: 1px solid var(--border, #2a2d32);
      border-radius: var(--radius-md);
      width: min(420px, 94vw);
      display: flex; flex-direction: column;
      box-shadow: 0 16px 48px rgba(0,0,0,.5);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px; color: var(--prose, #ccc);
    }
    #audHeader {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px; border-bottom: 1px solid var(--border, #2a2d32);
    }
    #audTitle { font-weight: 700; font-size: 13px; }
    #audClose { background: none; border: none; color: var(--t3, #666); cursor: pointer; font-size: 14px; }
    #audBody { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .aud-field { display: flex; flex-direction: column; gap: 4px; }
    .aud-label { font-size: 11px; color: var(--t3, #666); }
    .aud-input {
      background: var(--bg-deep, #111); border: 1px solid var(--border, #2a2d32);
      color: var(--prose, #ccc); border-radius: 4px; padding: 6px 8px;
      font-family: inherit; font-size: 12px; outline: none;
    }
    .aud-input:focus { border-color: var(--accent, #5b8df6); }
    .aud-num { width: auto; }
    .aud-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .aud-preview {
      font-size: 10px; color: var(--accent, #5b8df6);
      background: var(--bg-deep, #111);
      border: 1px solid var(--border, #2a2d32);
      border-radius: 4px; padding: 8px; white-space: pre; font-family: inherit;
    }
    #audFooter {
      display: flex; gap: 8px; justify-content: flex-end;
      padding: 12px 14px; border-top: 1px solid var(--border, #2a2d32);
    }
    .aud-btn {
      padding: 6px 14px; border-radius: 4px;
      border: 1px solid var(--border, #2a2d32);
      background: var(--bg-deep, #111); color: var(--prose, #ccc);
      cursor: pointer; font-family: inherit; font-size: 12px;
    }
    .aud-btn:hover { background: var(--hover, rgba(255,255,255,.07)); }
    .aud-btn-confirm { background: var(--accent, #5b8df6); color: #fff; border-color: transparent; }
    .aud-btn-confirm:hover { opacity: 0.9; }
  `;
  document.head.appendChild(s);
}
