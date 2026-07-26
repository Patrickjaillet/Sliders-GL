/**
 * src/io/project.js
 *
 * Phase 1.2 — File System & Project Model
 *
 * Implements:
 *   - .zgl project format  (ZIP: shader.glsl + meta.json + presets/)
 *   - File → New / Open / Save / Save As via native dialogs
 *   - MRU (most-recently-used) list — last 10 projects, persisted in Tauri store
 *   - Project auto-save — temp file every 30 s; recovery offered on crash
 *   - .glsl/.frag/.fs file-association opening (registered by NSIS installer)
 *   - Watch File mode — hot-reload on external editor change
 *   - Command-line argument support: z-gl.exe shader.glsl
 *
 * Architecture rules:
 *   - This module is in the `io` layer; it may import from core/, shader/, native/.
 *   - Cross-layer side-effects (editor updates, shader apply) go through callbacks
 *     passed in at init time, never imported directly.
 */

import JSZip from 'jszip';
import { safeLocalGet, safeLocalSet } from '../core/utils.js';
import {
  isTauri,
  openFileDialog,
  saveFileDialog,
  watchFile,
  readFileBytes,
  getCliArgs,
} from '../native/tauri.js';
import { clearSliderCustomizations, loadCustomizations, serializeCustomizations } from '../ui/slider-customizations.js';

// Fix 1.4 — Tauri v2 : window.__TAURI__.fs et window.__TAURI__.path sont
// indisponibles. Utiliser les imports ES module des plugins officiels.
// Les imports dynamiques permettent de ne pas crasher en mode navigateur
// (le stub vite.config.js rend ces imports no-op dans ce contexte).
async function _tauriFsWriteText(path, data) {
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  return writeTextFile(path, data);
}
async function _tauriFsWriteBinary(path, data) {
  const { writeBinaryFile } = await import('@tauri-apps/plugin-fs');
  return writeBinaryFile(path, data);
}
async function _tauriFsReadText(path) {
  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  return readTextFile(path);
}

// ── Storage keys ──────────────────────────────────────────────────────────────
const MRU_KEY         = 'zgl_mru_v1';
const AUTOSAVE_KEY    = 'zgl_autosave_v1';     // path in %TEMP% written by Rust
const AUTOSAVE_DIRTY  = 'zgl_autosave_dirty';  // bool — unsaved changes exist
const MAX_MRU         = 10;

// ── Module state ──────────────────────────────────────────────────────────────
/** @type {{ path: string|null, name: string, dirty: boolean }} */
const _proj = { path: null, name: 'Untitled', dirty: false };

/** Active file-watcher unlisten callback (or null). */
let _watchUnlisten = null;

/** Auto-save interval handle. */
let _autoSaveTimer = null;

/** Callbacks wired in at init time. */
let _cb = {
  getCode:      () => '',
  setCode:      (_code) => {},
  getPresets:   () => ([]),
  getTimeline:  () => ({}),
  setTimeline:  (_tl) => {},
  applyShader:  (_code) => {},
  toast:        (_msg, _type) => {},
  confirm:      (_title, _msg, _ok) => {},
  setTitle:     (_name) => {},
};

// ── Public init ───────────────────────────────────────────────────────────────

/**
 * Wire up callbacks and start auto-save.
 * Call once during app init, after the editor is ready.
 *
 * @param {object} callbacks
 * @param {() => string}               callbacks.getCode
 * @param {(code: string) => void}     callbacks.setCode
 * @param {() => object[]}             callbacks.getPresets
 * @param {(code: string) => void}     callbacks.applyShader
 * @param {(msg: string, type: string) => void} callbacks.toast
 * @param {(title: string, msg: string, ok: () => void) => void} callbacks.confirm
 * @param {(name: string) => void}     callbacks.setTitle
 */
export function initProject(callbacks) {
  _cb = { ..._cb, ...callbacks };
  _startAutoSave();
  _handleCliArgs();
  _offerCrashRecovery();
}

// ── Project metadata ──────────────────────────────────────────────────────────

/** Current project name (filename without extension). */
export function getProjectName() { return _proj.name; }

/** True when there are unsaved changes. */
export function isProjectDirty() { return _proj.dirty; }

/** Mark project as having unsaved changes. Call whenever editor content changes. */
export function markDirty() {
  if (_proj.dirty) return;
  _proj.dirty = true;
  _cb.setTitle(_proj.name + ' •');
  safeLocalSet(AUTOSAVE_DIRTY, '1');
}

/** Clear dirty flag after a successful save. */
function _markClean() {
  _proj.dirty = false;
  _cb.setTitle(_proj.name);
  safeLocalSet(AUTOSAVE_DIRTY, '0');
}

// ── MRU ──────────────────────────────────────────────────────────────────────

/** @returns {string[]} Array of up to 10 absolute paths, most-recent first. */
export function getMruList() {
  try { return JSON.parse(safeLocalGet(MRU_KEY, '[]')); } catch { return []; }
}

function _addToMru(absPath) {
  let list = getMruList().filter(p => p !== absPath);
  list.unshift(absPath);
  if (list.length > MAX_MRU) list = list.slice(0, MAX_MRU);
  safeLocalSet(MRU_KEY, JSON.stringify(list));
}

function _removeFromMru(absPath) {
  const list = getMruList().filter(p => p !== absPath);
  safeLocalSet(MRU_KEY, JSON.stringify(list));
}

// ── File → New Project ────────────────────────────────────────────────────────

export function newProject() {
  const doNew = () => {
    _stopWatchFile();
    _proj.path = null;
    _proj.name = 'Untitled';
    _proj.dirty = false;
    clearSliderCustomizations();
    _cb.setCode('void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n    vec2 uv = fragCoord / iResolution.xy;\n    fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);\n}\n');
    _cb.applyShader(_cb.getCode());
    _cb.setTitle('Untitled');
    _cb.toast('New project created', 'ok');
  };

  if (_proj.dirty) {
    _cb.confirm('Discard unsaved changes?', 'Create a new project? Unsaved changes will be lost.', doNew);
  } else {
    doNew();
  }
}

// ── File → Open Project ───────────────────────────────────────────────────────

export async function openProject(pathOverride) {
  if (!isTauri()) {
    _cb.toast('Open Project requires the desktop app', 'warn');
    return;
  }

  let filePath = pathOverride;
  if (!filePath) {
    const paths = await openFileDialog({
      filters: [
        { name: 'Sliders GL Projects', extensions: ['zgl'] },
        { name: 'GLSL Shaders',  extensions: ['glsl', 'frag', 'fs'] },
        { name: 'All Files',     extensions: ['*'] },
      ],
    });
    if (!paths.length) return;
    filePath = paths[0];
  }

  const doOpen = async () => {
    try {
      await _loadFromPath(filePath);
    } catch (err) {
      console.error('[project] open failed:', err);
      _cb.toast('Failed to open project: ' + err.message, 'err');
      _removeFromMru(filePath);
    }
  };

  if (_proj.dirty) {
    _cb.confirm('Discard unsaved changes?', 'Open a different project? Unsaved changes will be lost.', doOpen);
  } else {
    doOpen();
  }
}

/** Open a project from the MRU list by index. */
export function openMruEntry(index) {
  const list = getMruList();
  const path = list[Number(index)];
  if (!path) return;
  openProject(path);
}

// ── File → Save / Save As ─────────────────────────────────────────────────────

export async function saveProject() {
  if (!isTauri()) {
    _cb.toast('Save Project requires the desktop app', 'warn');
    return;
  }
  if (!_proj.path) return saveProjectAs();
  await _writeToDisk(_proj.path);
}

export async function saveProjectAs() {
  if (!isTauri()) {
    _cb.toast('Save Project As requires the desktop app', 'warn');
    return;
  }

  const suggested = (_proj.name.replace(/[^a-z0-9_\-. ]/gi, '_') || 'shader') + '.zgl';
  const path = await saveFileDialog({
    defaultPath: suggested,
    filters: [
      { name: 'Sliders GL Projects', extensions: ['zgl'] },
      { name: 'All Files',     extensions: ['*'] },
    ],
  });
  if (!path) return;

  await _writeToDisk(path);
}

// ── Watch File ────────────────────────────────────────────────────────────────

/**
 * Begin watching the currently-open file for external changes.
 * Only applicable when _proj.path points to a raw .glsl/.frag/.fs file,
 * not a .zgl bundle (those are written by Sliders GL itself).
 */
export async function enableWatchFile() {
  if (!isTauri() || !_proj.path) {
    _cb.toast('No file open to watch', 'warn');
    return;
  }
  const ext = _proj.path.split('.').pop().toLowerCase();
  if (!['glsl', 'frag', 'fs'].includes(ext)) {
    _cb.toast('Watch File is only supported for .glsl / .frag / .fs files', 'warn');
    return;
  }

  await _startWatchFile(_proj.path);
  _cb.toast('Watching file for external changes…', 'ok');
}

export async function disableWatchFile() {
  await _stopWatchFile();
  _cb.toast('File watch stopped', 'warn');
}

export function isWatchingFile() { return _watchUnlisten !== null; }

// ── Auto-save ─────────────────────────────────────────────────────────────────

function _startAutoSave() {
  if (_autoSaveTimer) clearInterval(_autoSaveTimer);
  _autoSaveTimer = setInterval(_doAutoSave, 30_000);
}

async function _doAutoSave() {
  if (!_proj.dirty) return;
  if (!isTauri()) return;

  try {
    const code = _cb.getCode();
    const payload = JSON.stringify({ path: _proj.path, name: _proj.name, code,
      savedAt: new Date().toISOString() });
    // Fix 1.4 — Tauri v2 : utiliser @tauri-apps/plugin-fs au lieu de window.__TAURI__.fs
    const tmpDir = await _tauri_appLocalDataDir();
    if (!tmpDir) return;
    await _tauriFsWriteText(tmpDir + 'autosave.json', payload);
    safeLocalSet(AUTOSAVE_KEY, tmpDir + 'autosave.json');
    console.debug('[project] auto-saved to', tmpDir + 'autosave.json');
  } catch (err) {
    console.warn('[project] auto-save failed:', err);
  }
}

async function _tauri_appLocalDataDir() {
  try {
    // Fix 1.4 — Tauri v2 : @tauri-apps/api/path au lieu de window.__TAURI__.path
    const { appLocalDataDir } = await import('@tauri-apps/api/path');
    return await appLocalDataDir() + '/';
  } catch {
    return null;
  }
}

async function _offerCrashRecovery() {
  if (!isTauri()) return;
  const dirty = safeLocalGet(AUTOSAVE_DIRTY, '0');
  if (dirty !== '1') return;
  const savePath = safeLocalGet(AUTOSAVE_KEY, '');
  if (!savePath) return;

  // Give the app a moment to finish loading before prompting
  setTimeout(() => {
    _cb.confirm(
      'Recover unsaved session?',
      'Sliders GL found an unsaved session from a previous run. Would you like to restore it?',
      async () => {
        try {
          // Fix 1.4 — Tauri v2 : @tauri-apps/plugin-fs
          const raw = await _tauriFsReadText(savePath);
          const data = JSON.parse(raw);
          if (data.code) {
            _cb.setCode(data.code);
            _cb.applyShader(data.code);
          }
          _proj.path = data.path || null;
          _proj.name = data.name || 'Recovered';
          _proj.dirty = true;
          _cb.setTitle(_proj.name + ' • (recovered)');
          _cb.toast('Session recovered — remember to save!', 'warn');
        } catch (err) {
          _cb.toast('Recovery failed: ' + err.message, 'err');
        }
      }
    );
  }, 800);
}

// ── CLI argument handling ─────────────────────────────────────────────────────

async function _handleCliArgs() {
  if (!isTauri()) return;
  try {
    const args = await getCliArgs();
    // args[0] is the binary; look for a file path argument
    const fileArg = args.find(a => /\.(glsl|frag|fs|zgl)$/i.test(a));
    if (fileArg) {
      // Delay until the app is fully mounted
      setTimeout(() => openProject(fileArg), 600);
    }
  } catch (err) {
    console.warn('[project] getCliArgs failed:', err);
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Load a .zgl (ZIP) or raw GLSL file from disk and populate the editor.
 * @param {string} filePath — absolute path
 */
async function _loadFromPath(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  const name = filePath.split(/[\\/]/).pop().replace(/\.\w+$/, '');

  _stopWatchFile();
  // Opening a different shader — drop any slider customizations from the
  // previous one so they don't mis-apply (roadmap Phase C).
  clearSliderCustomizations();

  if (ext === 'zgl') {
    await _loadZglBundle(filePath, name);
  } else {
    await _loadRawGlsl(filePath, name);
  }
}

async function _loadZglBundle(filePath, name) {
  const bytes = await readFileBytes(filePath);
  const zip = await JSZip.loadAsync(bytes);

  const shaderFile = zip.file('shader.glsl');
  if (!shaderFile) throw new Error('.zgl bundle missing shader.glsl');
  const code = await shaderFile.async('string');

  const metaFile = zip.file('meta.json');
  if (metaFile) {
    try {
      const meta = JSON.parse(await metaFile.async('string'));
      // Restore slider customizations bundled with the project (roadmap Phase C).
      // Must run before _cb.applyShader / the editor-change rebuild so freshly
      // parsed sliders pick the tweaks back up. _loadFromPath already cleared
      // the store, so a project without sliderMeta correctly stays clean.
      if (meta.sliderMeta) loadCustomizations(meta.sliderMeta);
    } catch { /* non-fatal */ }
  }

  const tlFile = zip.file('timeline.json');
  if (tlFile) {
    try {
      const tlData = JSON.parse(await tlFile.async('string'));
      _cb.setTimeline(tlData);
    } catch { /* non-fatal */ }
  }

  _proj.path = filePath;
  _proj.name = name;
  _proj.dirty = false;
  _cb.setCode(code);
  _cb.applyShader(code);
  _cb.setTitle(name);
  _cb.toast(`Opened: ${name}`, 'ok');
  _addToMru(filePath);
}

async function _loadRawGlsl(filePath, name) {
  // Fix 1.4 — Tauri v2 : @tauri-apps/plugin-fs
  const code = await _tauriFsReadText(filePath);

  _proj.path = filePath;
  _proj.name = name;
  _proj.dirty = false;
  _cb.setCode(code);
  _cb.applyShader(code);
  _cb.setTitle(name);
  _cb.toast(`Opened: ${name}`, 'ok');
  _addToMru(filePath);

  // Automatically start watch mode for raw GLSL files
  _startWatchFile(filePath);
}

/**
 * Serialize the current project to a .zgl ZIP and write it to `filePath`.
 * @param {string} filePath
 */
async function _writeToDisk(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  const name = filePath.split(/[\\/]/).pop().replace(/\.\w+$/, '');
  const code = _cb.getCode();
  const presets = await _cb.getPresets();

  let data;

  if (ext === 'glsl' || ext === 'frag' || ext === 'fs') {
    // Saving as raw GLSL — just write the shader code
    data = code;
    // Fix 1.4 — Tauri v2 : @tauri-apps/plugin-fs
    await _tauriFsWriteText(filePath, data);
  } else {
    // Default: .zgl ZIP bundle
    const zip = new JSZip();
    zip.file('shader.glsl', code);

    const sliderMeta = serializeCustomizations();
    zip.file('meta.json', JSON.stringify({
      version:  '1',
      name,
      created:  new Date().toISOString(),
      ...(Object.keys(sliderMeta).length > 0 ? { sliderMeta } : {}),
    }, null, 2));

    const tlData = _cb.getTimeline();
    if (tlData && (Object.keys(tlData.keys || {}).length > 0 || tlData.duration !== 10)) {
      zip.file('timeline.json', JSON.stringify(tlData, null, 2));
    }

    if (presets && presets.length) {
      zip.folder('presets').file('presets.json', JSON.stringify(presets, null, 2));
    }

    const blob = await zip.generateAsync({
      type:               'uint8array',
      compression:        'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // Fix 1.4 — Tauri v2 : @tauri-apps/plugin-fs
    await _tauriFsWriteBinary(filePath, blob);
  }

  _proj.path = filePath;
  _proj.name = name;
  _markClean();
  _cb.setTitle(name);
  _cb.toast(`Saved: ${name}`, 'ok');
  _addToMru(filePath);
}

// ── File watcher ──────────────────────────────────────────────────────────────

async function _startWatchFile(filePath) {
  await _stopWatchFile();
  try {
    _watchUnlisten = await watchFile(filePath, async () => {
      // Debounce — editors often write multiple events in rapid succession
      clearTimeout(_watchUnlisten._debounce);
      _watchUnlisten._debounce = setTimeout(async () => {
        try {
          // Fix 1.4 — Tauri v2 : @tauri-apps/plugin-fs
          const code = await _tauriFsReadText(filePath);
          _cb.setCode(code);
          _cb.applyShader(code);
          _cb.toast('Hot-reloaded from disk', 'info');
        } catch (err) {
          _cb.toast('Watch reload failed: ' + err.message, 'err');
        }
      }, 120);
    });
  } catch (err) {
    console.warn('[project] watchFile failed:', err);
    _watchUnlisten = null;
  }
}

async function _stopWatchFile() {
  if (!_watchUnlisten) return;
  try {
    clearTimeout(_watchUnlisten._debounce);
    await _watchUnlisten();
  } catch { /* best-effort */ }
  _watchUnlisten = null;
}
