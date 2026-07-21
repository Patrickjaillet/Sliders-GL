import { state, notify } from '../core/state.js';
import { parseShader } from '../shader/parser.js';
import { buildUI } from '../ui/slider.js';
import { applyGLShader } from '../gl/renderer.js';
import { esc, escAttr, encArg } from '../core/utils.js';
import { toast, openModalDialog, closeModalDialog, shouldConfirmShaderReplacement, applyAndParse } from './actions.js';
import { stParseId, stLoadApiKey, openSTModal, doSTImport } from './shadertoy.js';
import { BUILTIN_PRESETS, WIZARD_TEMPLATES, loadUserPresets, saveUserPresets,
  findPreset, applyImportedPreset as _applyImportedPreset } from './presets.js';
import { loadHistory, pushHistory } from './history.js';
import { setWindowTitle, openFileDialog, isTauri } from '../native/tauri.js';
import { loadCustomizations, serializeCustomizations } from '../ui/slider-customizations.js';
import { openShaderComposer, closeShaderComposer } from '../shader/composer/composer-ui.js';

export { openShaderComposer, closeShaderComposer };

export { BUILTIN_PRESETS, WIZARD_TEMPLATES, loadUserPresets, saveUserPresets,
  findPreset, loadHistory, pushHistory };

export let libOpen = false;
let libActiveTag = null;
let previewPresetId = null;
let previewPreviousCode = null;


// Returns HTML for N skeleton cards mimicking preset-card layout
function _skeletonHTML(count = 5) {
  const card = `
<div class="preset-card-skeleton" aria-hidden="true">
  <div class="sk-top">
    <div class="sk-line sk-title"></div>
    <div class="sk-line sk-badge"></div>
  </div>
  <div class="sk-line sk-author"></div>
  <div class="sk-tags">
    <div class="sk-line sk-tag"></div>
    <div class="sk-line sk-tag-b"></div>
  </div>
  <div class="sk-acts">
    <div class="sk-line sk-btn"></div>
    <div class="sk-line sk-btn-sm"></div>
  </div>
</div>`;
  return Array.from({ length: count }, () => card).join('');
}

export function openLibrary() {
  libOpen = true;
  document.getElementById('libOverlay').classList.add('open');
  document.getElementById('libBtn').classList.add('active');

  // Show skeleton immediately so the grid is never blank on open
  const grid = document.getElementById('libGrid');
  if (grid && !grid.querySelector('.preset-card, .lib-empty')) {
    grid.innerHTML = _skeletonHTML(6);
  }

  // Defer real render one microtask so the skeleton paints first
  Promise.resolve().then(renderLibrary);
}

export function closeLibrary() {
  libOpen = false;
  document.getElementById('libOverlay').classList.remove('open');
  document.getElementById('libBtn').classList.remove('active');
  if (previewPresetId !== null) cancelPreview();
}

export function onLibOverlayClick(e) {
  if (e.target === document.getElementById('libOverlay')) closeLibrary();
}

function getAllTags() {
  const all = [...BUILTIN_PRESETS, ...loadUserPresets()];
  const set = new Set();
  all.forEach(p => (p.tags || []).forEach(t => set.add(t)));
  return [...set].sort();
}

function renderTagsBar() {
  const tags = getAllTags();
  const bar = document.getElementById('libTagsBar');
  if (!tags.length) { bar.innerHTML = ''; return; }
  bar.innerHTML = tags.map(t => {
    const tagArg = encArg(t);
    return `<button class="lib-tag${libActiveTag === t ? ' active' : ''}" data-action="toggleLibTag" data-args="${encArg(t)}" aria-label="Filter by tag: ${esc(t)}" aria-pressed="${libActiveTag === t ? 'true' : 'false'}">${esc(t)}</button>`;
  }).join('');
}

export function toggleLibTag(tag) {
  libActiveTag = (libActiveTag === tag) ? null : tag;
  renderLibrary();
}

export function renderLibrary() {
  renderTagsBar();
  const query = (document.getElementById('libSearch')?.value || '').toLowerCase().trim();
  const userPresets = loadUserPresets();
  const history = loadHistory();

  const filterPreset = p => {
    if (libActiveTag && !(p.tags || []).includes(libActiveTag)) return false;
    if (query) {
      const hay = (p.name + ' ' + (p.tags || []).join(' ')).toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  };

  const builtins = BUILTIN_PRESETS.filter(filterPreset);
  const user = userPresets.filter(filterPreset);
  const grid = document.getElementById('libGrid');
  let html = '';

  html += `<button class="lib-btn accent" style="width:100%;margin-bottom:4px;padding:8px;font-size:10px" data-action="openWizardModal" aria-label="Create new effect">✦ New Effect…</button>`;

  if (!builtins.length && !user.length && !history.length) {
    html += `<div class="lib-empty"><div class="lib-empty-icon">◈</div>No presets match your filter.</div>`;
    grid.innerHTML = html;
    return;
  }

  if (builtins.length) {
    html += `<div class="lib-section-title">Built-in Presets</div>`;
    html += builtins.map(p => presetCardHTML(p)).join('');
  }

  if (user.length) {
    html += `<div class="lib-section-title">My Presets</div>`;
    html += user.map(p => presetCardHTML(p)).join('');
  }

  if (!query && !libActiveTag && history.length) {
    html += `<div class="lib-section-title">Recent History</div>`;
    html += history.map((h, i) => `
      <div class="preset-card" style="opacity:.75">
        <div class="pc-top"><div class="pc-name">${esc(h.name)}</div><div class="pc-readonly">history</div></div>
        <div class="pc-author" style="font-size:7px">${h.created ? new Date(h.created).toLocaleDateString() : ''}</div>
        <div class="pc-actions">
          <button class="pc-btn load" data-action="loadHistoryEntry" data-args="${i}" aria-label="Load history entry: ${esc(h.name)}">Load</button>
        </div>
      </div>`).join('');
  }

  grid.innerHTML = html;
}

function presetCardHTML(p) {
  const isPrev = previewPresetId === p.id;
  const idArg = encArg(p.id);
  const tagsHtml = (p.tags || []).map(t => `<span class="pc-tag">${esc(t)}</span>`).join('');
  const actions = p.readonly
    ? `<button class="pc-btn load" data-action="loadPreset" data-args="${idArg}" aria-label="Load preset: ${esc(p.name)}">Load</button>
       <button class="pc-btn exp" data-action="exportPreset" data-args="${idArg}" aria-label="Export preset: ${esc(p.name)}">Export</button>`
    : `<button class="pc-btn load" data-action="loadPreset" data-args="${idArg}" aria-label="Load preset: ${esc(p.name)}">Load</button>
       <button class="pc-btn exp" data-action="exportPreset" data-args="${idArg}" aria-label="Export preset: ${esc(p.name)}">Export</button>
       <button class="pc-btn del" data-action="deletePreset" data-args="${idArg}" aria-label="Delete preset: ${esc(p.name)}">Delete</button>`;
  return `
<div class="preset-card${isPrev ? ' preview-active' : ''}${p.readonly ? ' readonly-card' : ''}" id="pcard-${escAttr(p.id)}">
  <div class="pc-top">
    <div class="pc-name">${esc(p.name)}</div>
    ${p.readonly ? '<div class="pc-readonly">built-in</div>' : ''}
  </div>
  <div class="pc-author">by ${esc(p.author || 'local')}</div>
  ${tagsHtml ? `<div class="pc-tags">${tagsHtml}</div>` : ''}
  <div class="pc-actions">
    <button class="pc-btn" data-action="previewPreset" data-args="${idArg}" aria-label="${isPrev ? 'Stop preview of' : 'Preview'} preset: ${esc(p.name)}">${isPrev ? '◉ previewing' : '◎ preview'}</button>
    ${actions}
  </div>
</div>`;
}

export function previewPreset(id) {
  if (previewPresetId === id) { cancelPreview(); return; }
  const p = findPreset(id);
  if (!p) return;
  if (previewPresetId !== null) cancelPreview(false);
  previewPresetId = id;
  if (previewPreviousCode === null) {
    previewPreviousCode = state.editor ? state.editor.getValue() : '';
  }
  applyGLShader(p.code);
  toast(`Previewing: ${p.name}`, 'warn');
  renderLibrary();
}

export function cancelPreview(doRestore = true) {
  previewPresetId = null;
  if (doRestore && previewPreviousCode !== null) applyGLShader(previewPreviousCode);
  previewPreviousCode = null;
  renderLibrary();
}

export function loadPreset(id) {
  const p = findPreset(id);
  if (!p) return;
  const currentCode = state.editor ? state.editor.getValue() : '';
  const doLoad = () => {
    previewPresetId = null;
    previewPreviousCode = null;
    if (state.editor) {
      pushHistory('Previous', currentCode);
      state.editor.setValue(p.code);
      state.pinnedIds.clear();
      if (Array.isArray(p.pinnedIds)) p.pinnedIds.forEach(id => state.pinnedIds.add(id));
      notify('pinnedIds', state.pinnedIds);
      // Restore slider customizations bundled with the preset (or clear if none).
      loadCustomizations(p.sliderMeta || null);
      setTimeout(() => applyAndParse(), 80);
    }
    state.activePresetId = p.readonly ? null : p.id;
    setWindowTitle(p.name);
    toast(`Loaded: ${p.name}`, 'ok');
    closeLibrary();
  };
  if (shouldConfirmShaderReplacement(p.code)) {
    showConfirm(`Load "${p.name}"?`, 'Your current shader will be moved to history. This cannot be undone.', doLoad);
  } else {
    doLoad();
  }
}

export function loadHistoryEntry(i) {
  const h = loadHistory()[Number(i)];
  if (!h) return;
  const doLoad = () => {
    if (state.editor) {
      state.editor.setValue(h.code);
      state.pinnedIds.clear();
      notify('pinnedIds', state.pinnedIds);
      setTimeout(() => applyAndParse(), 80);
    }
    toast('Loaded from history', 'ok');
    closeLibrary();
  };
  if (shouldConfirmShaderReplacement(h.code)) {
    showConfirm('Load from history?', 'Your current shader will be replaced.', doLoad);
  } else {
    doLoad();
  }
}

export function deletePreset(id) {
  showConfirm('Delete preset?', 'This cannot be undone.', () => {
    const presets = loadUserPresets().filter(p => p.id !== id);
    saveUserPresets(presets);
    toast('Preset deleted', 'warn');
    renderLibrary();
  });
}

export function exportPreset(id) {
  const p = findPreset(id);
  if (!p) return;
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (p.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'preset') + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`Exported: ${p.name}`, 'ok');
}

let _saveModalOpen = false;

export function openSaveModal() {
  document.getElementById('saveName').value = '';
  document.getElementById('saveTags').value = '';
  openModalDialog('saveModal', '#saveName');
}

export function closeSaveModal() {
  closeModalDialog('saveModal');
}

export function confirmSavePreset() {
  const name = document.getElementById('saveName').value.trim();
  if (!name) { toast('Please enter a name', 'err'); return; }
  const tags = document.getElementById('saveTags').value
    .split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const code = state.editor ? state.editor.getValue() : '';
  if (!code.trim()) { toast('No shader to save', 'err'); return; }
  const id = 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const sliderMeta = serializeCustomizations();
  const preset = { id, name, tags, author: 'local', code, version: '1.0.0',
    created: new Date().toISOString().slice(0, 10),
    pinnedIds: [...state.pinnedIds] };
  if (Object.keys(sliderMeta).length > 0) preset.sliderMeta = sliderMeta;
  const presets = loadUserPresets();
  presets.push(preset);
  saveUserPresets(presets);
  closeSaveModal();
  toast(`Saved: ${name}`, 'ok');
  renderLibrary();
}

export function libImportST() {
  const raw = document.getElementById('libStUrl')?.value.trim() || '';
  if (!raw) { toast('Paste a ShaderToy URL or ID first', 'err'); return; }
  let id;
  try {
    id = stParseId(raw);
  } catch (err) {
    toast(err.message, 'err');
    return;
  }
  const savedKey = stLoadApiKey();
  closeLibrary();
  openSTModal();
  document.getElementById('stShaderId').value = id;
  if (savedKey) doSTImport();
}

export function importPreset() {
  const url = prompt('Paste JSON preset URL (or use the file button):');
  if (!url) return;
  fetch(url)
    .then(r => r.json())
    .then(p => applyImportedPreset(p))
    .catch(() => toast('Failed to fetch preset', 'err'));
}

export async function importPresetFile(input) {
  // ── Tauri desktop: use native file dialog ──────────────────────────────────
  if (isTauri()) {
    const paths = await openFileDialog({
      filters: [
        { name: 'Shader / Preset', extensions: ['glsl', 'frag', 'fs', 'json'] },
        { name: 'All Files',       extensions: ['*'] },
      ],
    });
    if (!paths.length) return;
    const filePath = paths[0];
    try {
      const text = await window.__TAURI__.fs.readTextFile(filePath);
      const fileName = filePath.split(/[\\/]/).pop() ?? 'shader';
      processImportedText(text, fileName);
    } catch (err) {
      toast('Failed to read file', 'err');
      console.error('[importPresetFile]', err);
    }
    return;
  }

  // ── Browser / PWA: classic <input type="file"> path ────────────────────────
  const file = input?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => processImportedText(e.target.result, file.name);
  reader.readAsText(file);
  if (input) input.value = '';
}

export function processImportedText(text, fileName) {
  if (fileName.endsWith('.json')) {
    try { applyImportedPreset(JSON.parse(text)); }
    catch { toast('Invalid JSON', 'err'); }
  } else {
    const name = fileName.replace(/\.\w+$/, '');
    const id   = 'user-' + Date.now();
    const preset = { id, name, tags: ['imported'], author: 'local', code: text,
      version: '1.0.0', created: new Date().toISOString().slice(0, 10) };
    const presets = loadUserPresets();
    presets.push(preset);
    saveUserPresets(presets);
    toast(`Imported: ${name}`, 'ok');
    renderLibrary();
  }
}

export function applyImportedPreset(p) {
  _applyImportedPreset(p, /** @type {any} */ ({ toast, loadUserPresets, saveUserPresets, renderLibrary }));
}

let _confirmCallback = null;

export function showConfirm(title, msg, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  _confirmCallback = callback;
  openModalDialog('confirmModal', '.modal-btn');
}

export function closeConfirmModal() {
  _confirmCallback = null;
  closeModalDialog('confirmModal');
}

export function executeConfirm() {
  const cb = _confirmCallback;
  closeConfirmModal();
  if (cb) cb();
}

export function openWizardModal() {
  document.getElementById('wizardName').value = '';
  document.getElementById('wizardTemplate').value = 'blank';
  openModalDialog('wizardModal', '#wizardName');
}

export function closeWizardModal() {
  closeModalDialog('wizardModal');
}

export function confirmWizard() {
  const name = document.getElementById('wizardName').value.trim() || 'New Shader';
  const tmpl = document.getElementById('wizardTemplate').value;
  const code = WIZARD_TEMPLATES[tmpl] || WIZARD_TEMPLATES.blank;
  const doCreate = () => {
    if (state.editor) {
      pushHistory('Previous', state.editor.getValue());
      state.editor.setValue(code);
      state.pinnedIds.clear();
      notify('pinnedIds', state.pinnedIds);
      setTimeout(() => applyAndParse(), 80);
    }
    closeWizardModal();
    closeLibrary();
    toast(`Created: ${name}`, 'ok');
  };
  if (shouldConfirmShaderReplacement(code)) {
    showConfirm(`Create "${name}"?`, 'Your current shader will be moved to history.', doCreate);
  } else {
    doCreate();
  }
}

(function initViewportDrop() {
  const cw = document.getElementById('cwrap');
  if (!cw) return;
  cw.addEventListener('dragover', e => {
    e.preventDefault();
    cw.style.outline = '2px dashed var(--ac)';
  });
  cw.addEventListener('dragleave', () => { cw.style.outline = ''; });
  cw.addEventListener('drop', e => {
    e.preventDefault();
    cw.style.outline = '';
    const files = [...e.dataTransfer.files].filter(f => /\.(glsl|frag|fs)$/i.test(f.name));
    if (!files.length) { toast('Drop a .glsl or .frag file', 'warn'); return; }
    const file = files[0];
    const reader = new FileReader();
    reader.onload = ev => {
      const code = ev.target.result;
      const currentCode = state.editor ? state.editor.getValue() : '';
      const doLoad = () => {
        if (state.editor) {
          pushHistory('Previous', currentCode);
          state.editor.setValue(code);
          state.pinnedIds.clear();
          notify('pinnedIds', state.pinnedIds);
          setTimeout(() => applyAndParse(), 80);
        }
        toast(`Loaded: ${file.name}`, 'ok');
        setWindowTitle(file.name.replace(/\.\w+$/, ''));
      };
      if (shouldConfirmShaderReplacement(code)) {
        showConfirm(`Load "${file.name}"?`, 'Your current shader will be moved to history.', doLoad);
      } else {
        doLoad();
      }
    };
    reader.readAsText(file);
  });
})();
