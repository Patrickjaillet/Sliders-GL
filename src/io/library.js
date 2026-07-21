import { state, notify } from '../core/state.js';
import { toast, openModalDialog, closeModalDialog, shouldConfirmShaderReplacement, applyAndParse } from './actions.js';
import { loadUserPresets, saveUserPresets, findPreset, applyImportedPreset as _applyImportedPreset } from './presets.js';
import { pushHistory } from './history.js';
import { setWindowTitle, openFileDialog, isTauri } from '../native/tauri.js';
import { loadCustomizations } from '../ui/slider-customizations.js';

export function loadPreset(id) {
  const p = findPreset(id);
  if (!p) return;
  const currentCode = state.editor ? state.editor.getValue() : '';
  const doLoad = () => {
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
  };
  if (shouldConfirmShaderReplacement(p.code)) {
    showConfirm(`Load "${p.name}"?`, 'Your current shader will be moved to history. This cannot be undone.', doLoad);
  } else {
    doLoad();
  }
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
  }
}

export function applyImportedPreset(p) {
  _applyImportedPreset(p, /** @type {any} */ ({ toast }));
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
