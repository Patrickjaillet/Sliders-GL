import { state } from '../core/state.js';
import { isTauri, invokeTauri, openFileDialog, saveFileDialog, setWindowTitle } from '../native/tauri.js';
import { indexProject as _indexProject } from './shader-library.js';

const DB_NAME = 'z-gl-workspace';
const DB_VERSION = 2;
const STORE_PROJECTS = 'projects';
const STORE_THUMBNAILS = 'thumbnails';

let _db = null;

async function _getDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const ps = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        ps.createIndex('updatedAt', 'updatedAt', { unique: false });
        ps.createIndex('name', 'name', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_THUMBNAILS)) {
        db.createObjectStore(STORE_THUMBNAILS, { keyPath: 'id' });
      }
      // v2: collections store (Phase 20.3 — shader-library.js uses the same DB)
      if (!db.objectStoreNames.contains('collections')) {
        const cs = db.createObjectStore('collections', { keyPath: 'id' });
        cs.createIndex('name', 'name', { unique: false });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function _idb(storeName, mode = 'readonly') {
  return _db.transaction(storeName, mode).objectStore(storeName);
}

function _p(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror  = () => rej(req.error);
  });
}

function _uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function initWorkspaceDB() {
  await _getDB();
}

export async function listProjects() {
  await _getDB();
  return new Promise((res, rej) => {
    const tx = _db.transaction(STORE_PROJECTS, 'readonly');
    const req = tx.objectStore(STORE_PROJECTS).index('updatedAt').getAll();
    req.onsuccess = () => res((req.result || []).reverse());
    req.onerror   = () => rej(req.error);
  });
}

export async function getProject(id) {
  await _getDB();
  return _p(_idb(STORE_PROJECTS).get(id));
}

export async function saveProject(projectData) {
  await _getDB();
  const now = Date.now();
  const project = {
    id:        projectData.id || _uid(),
    name:      projectData.name || 'Untitled Shader',
    code:      projectData.code ?? state.currentCode,
    multipass: projectData.multipass ?? _serializeMultipass(),
    vars:      projectData.vars ?? state.vars,
    tags:      projectData.tags ?? [],
    createdAt: projectData.createdAt || now,
    updatedAt: now,
    format:    projectData.format ?? _detectFormat(),
    description: projectData.description ?? '',
    folder:    projectData.folder ?? 'default',
    version:   '1.0.0',
  };
  await _p(_idb(STORE_PROJECTS, 'readwrite').put(project));
  // Phase 20.3: update full-text index (fire-and-forget)
  _indexProject(project).catch(() => {});
  return project;
}

export async function deleteProject(id) {
  await _getDB();
  await _p(_idb(STORE_PROJECTS, 'readwrite').delete(id));
  await _p(_idb(STORE_THUMBNAILS, 'readwrite').delete(id));
}

export async function saveThumbnail(id, dataURL) {
  await _getDB();
  await _p(_idb(STORE_THUMBNAILS, 'readwrite').put({ id, dataURL, ts: Date.now() }));
}

export async function getThumbnail(id) {
  await _getDB();
  const rec = await _p(_idb(STORE_THUMBNAILS).get(id));
  return rec?.dataURL ?? null;
}

function _serializeMultipass() {
  if (!state.mp) return null;
  const passes = {};
  for (const [key, pass] of Object.entries(state.mp.passes)) {
    passes[key] = { code: pass.code, enabled: pass.enabled };
  }
  return { passes, active: state.mp.active };
}

function _detectFormat() {
  if (state.hlslEditMode) return 'hlsl';
  return 'glsl';
}

export function captureViewportThumbnail() {
  try {
    // Fix 1.13 — le canvas WebGL est #glc dans ui.html, pas #glcanvas
    const canvas = document.getElementById('glc') || document.querySelector('canvas[data-role="viewport"]') || document.querySelector('canvas');
    if (!canvas) return null;
    const thumb = document.createElement('canvas');
    thumb.width  = 128;
    thumb.height = 72;
    const ctx = thumb.getContext('2d');
    ctx.drawImage(/** @type {any} */ (canvas), 0, 0, 128, 72);
    return thumb.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

export async function saveCurrentProject(name, opts = {}) {
  const thumbnail = captureViewportThumbnail();
  const project = await saveProject({
    id:   opts.id,
    name: name || state.activeProjectName || 'Untitled Shader',
    ...opts,
  });
  if (thumbnail) await saveThumbnail(project.id, thumbnail);
  return project;
}

export async function loadProject(id) {
  const project = await getProject(id);
  if (!project) return false;

  const { applyAndParse } = await import('../io/actions.js');

  if (state.editor && project.code != null) {
    state.editor.setValue(project.code);
  }

  if (project.multipass) {
    const { stImportMultipass } = await import('../render/multipass.js').catch(() => ({ stImportMultipass: null }));
    if (stImportMultipass && project.multipass.passes) {
      const passesWithCode = {};
      for (const [key, p] of Object.entries(project.multipass.passes)) {
        passesWithCode[key] = { ...p };
      }
      stImportMultipass({ passes: passesWithCode, active: project.multipass.active });
    }
  } else if (project.code != null) {
    await applyAndParse(project.code);
  }

  state.activeProjectId   = id;
  state.activeProjectName = project.name;

  setWindowTitle(project.name).catch(() => {});

  return true;
}

export async function exportProjectJSON(id) {
  const project = await getProject(id);
  if (!project) return;
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (project.name.replace(/[^a-z0-9_\-]/gi, '_') || 'project') + '_project.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function importProjectJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(/** @type {string} */ (e.target.result));
        if (!data.code && !data.multipass) throw new Error('Invalid project.json');
        data.id = _uid();
        data.createdAt = data.createdAt || Date.now();
        const project = await saveProject(data);
        resolve(project);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsText(file);
  });
}

let _autoSaveTimer = null;
let _autoSaveEnabled = false;
let _autoSaveInterval = 30;

export function setAutoSave(enabled, intervalSeconds = 30) {
  _autoSaveEnabled = enabled;
  _autoSaveInterval = intervalSeconds;
  _restartAutoSave();
}

function _restartAutoSave() {
  if (_autoSaveTimer) { clearInterval(_autoSaveTimer); _autoSaveTimer = null; }
  if (!_autoSaveEnabled) return;
  _autoSaveTimer = setInterval(() => {
    if (state.activeProjectId) {
      _doAutoSave();
    }
  }, _autoSaveInterval * 1000);
}

async function _doAutoSave() {
  try {
    const thumbnail = captureViewportThumbnail();
    const project = await saveProject({
      id:   state.activeProjectId,
      name: state.activeProjectName || 'Untitled Shader',
    });
    if (thumbnail) await saveThumbnail(project.id, thumbnail);
    _flashAutoSaveIndicator();
  } catch (err) {
    console.warn('[workspace] auto-save failed:', err);
  }
}

export function triggerAutoSaveOnCompile() {
  if (!_autoSaveEnabled || !state.activeProjectId) return;
  _doAutoSave();
}

function _flashAutoSaveIndicator() {
  const el = document.getElementById('z-gl-autosave-indicator');
  if (!el) return;
  el.textContent = '💾 Saved';
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 2000);
}

const PREF_KEY = 'z-gl-workspace-prefs';

export function getWorkspacePrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
  } catch { return {}; }
}

export function setWorkspacePrefs(prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ ...getWorkspacePrefs(), ...prefs }));
  } catch {}
}
