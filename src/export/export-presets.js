// §10.3 roadmap UI/UX — Presets de réglages d'export
//
// Sauvegarde les valeurs des champs du modal d'export (résolution, durée, fps,
// palette GIF…) sous des noms ("Twitter 1080p", "4K Master"…), restaurables
// depuis un menu déroulant. Stocké dans localStorage.

import { toast } from '../io/actions.js';

const KEY = 'sl_exportPresets';
const FIELD_SEL = '#exportModal select, #exportModal input[type="checkbox"], #exportModal input[type="number"], #exportModal input[type="text"]';

function _load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
  catch { return {}; }
}
function _save(o) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* noop */ }
}

function _captureFields() {
  const out = {};
  document.querySelectorAll(FIELD_SEL).forEach(el => {
    if (!(el instanceof HTMLElement) || !el.id) return;
    const inp = /** @type {HTMLInputElement} */ (el);
    out[el.id] = inp.type === 'checkbox' ? inp.checked : inp.value;
  });
  return out;
}

function _applyFields(vals) {
  for (const [id, v] of Object.entries(vals || {})) {
    const el = /** @type {HTMLInputElement} */ (document.getElementById(id));
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = String(v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function _renderSelect() {
  const sel = document.getElementById('exp-preset-select');
  if (!(sel instanceof HTMLSelectElement)) return;
  const presets = _load();
  const names = Object.keys(presets).sort();
  sel.innerHTML = '<option value="">— Presets —</option>'
    + names.map(n => `<option value="${n.replace(/"/g, '&quot;')}">${n}</option>`).join('');
}

export function initExportPresets() {
  const modal = document.querySelector('#exportModal .export-modal');
  const tabs = document.querySelector('#exportModal .export-tabs');
  if (!modal || !tabs || document.getElementById('exp-preset-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'exp-preset-bar';
  bar.className = 'exp-preset-bar';
  bar.innerHTML = `
    <select id="exp-preset-select" class="exp-select" aria-label="Export preset" style="flex:1"></select>
    <input id="exp-preset-name" type="text" placeholder="Preset name…" maxlength="28" aria-label="New preset name" style="flex:1;min-width:0">
    <button id="exp-preset-save" class="exp-preset-btn" type="button" title="Save current settings as preset">＋ Save</button>
    <button id="exp-preset-del" class="exp-preset-btn" type="button" title="Delete selected preset">✕</button>`;
  tabs.after(bar);
  _renderSelect();

  const selEl = /** @type {HTMLSelectElement} */ (document.getElementById('exp-preset-select'));
  const nameEl = /** @type {HTMLInputElement} */ (document.getElementById('exp-preset-name'));

  selEl.addEventListener('change', () => {
    const name = selEl.value;
    if (!name) return;
    const presets = _load();
    if (presets[name]) { _applyFields(presets[name]); toast(`Loaded export preset "${name}"`, 'ok'); }
  });

  document.getElementById('exp-preset-save')?.addEventListener('click', () => {
    const name = (nameEl.value || selEl.value || '').trim();
    if (!name) { toast('Enter a preset name first', 'warn'); return; }
    const presets = _load();
    presets[name] = _captureFields();
    _save(presets);
    _renderSelect();
    selEl.value = name;
    nameEl.value = '';
    toast(`Saved export preset "${name}"`, 'ok');
  });

  document.getElementById('exp-preset-del')?.addEventListener('click', () => {
    const name = selEl.value;
    if (!name) return;
    const presets = _load();
    delete presets[name];
    _save(presets);
    _renderSelect();
    toast(`Deleted export preset "${name}"`, 'warn');
  });
}
