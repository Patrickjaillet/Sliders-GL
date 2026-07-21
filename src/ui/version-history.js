/**
 * src/ui/version-history.js — Phase 20.2
 *
 * Versioning local intégré (Git-like, sans Git requis).
 *
 * Architecture :
 *   IndexedDB "z-gl-history" v1
 *   ├── store "commits"   { id, projectId, branchId, parentId, message, code,
 *   │                        multipass, vars, timestamp, thumbDataURL }
 *   └── store "branches"  { id, projectId, name, headCommitId, createdAt, color }
 *
 * API publique :
 *   initHistoryDB()
 *   commit(projectId, message?, opts?)  → commit object
 *   getCommits(projectId, branchId?)    → commit[]  (newest first)
 *   getCommit(commitId)                 → commit
 *   checkoutCommit(commitId)            → loads code into editor
 *   createBranch(projectId, name, fromCommitId?)
 *   listBranches(projectId)
 *   deleteBranch(branchId)
 *   getActiveBranch(projectId)
 *   setActiveBranch(projectId, branchId)
 *   exportCommitAsFile(commitId)
 *   diffCommits(commitIdA, commitIdB)   → { added, removed, unchanged }
 *   pruneHistory(projectId, keepLast?)  → number deleted
 */

import { state } from '../core/state.js';
import { captureViewportThumbnail } from './workspace-manager.js';

const DB_NAME    = 'z-gl-history';
const DB_VERSION = 1;
const ST_COMMITS  = 'commits';
const ST_BRANCHES = 'branches';

const BRANCH_COLORS = ['#7b6fff','#89dceb','#a6e3a1','#fab387','#f38ba8','#cba6f7','#f9e2af','#74c7ec'];
const DEFAULT_BRANCH_NAME = 'main';
const MAX_COMMITS_DEFAULT = 200;

let _db = null;

// ─── IndexedDB bootstrap ──────────────────────────────────────────────────────

async function _getDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(ST_COMMITS)) {
        const cs = db.createObjectStore(ST_COMMITS, { keyPath: 'id' });
        cs.createIndex('projectId',  'projectId',  { unique: false });
        cs.createIndex('branchId',   'branchId',   { unique: false });
        cs.createIndex('timestamp',  'timestamp',  { unique: false });
        cs.createIndex('proj_branch', ['projectId','branchId'], { unique: false });
      }
      if (!db.objectStoreNames.contains(ST_BRANCHES)) {
        const bs = db.createObjectStore(ST_BRANCHES, { keyPath: 'id' });
        bs.createIndex('projectId', 'projectId', { unique: false });
      }
    };
    req.onsuccess  = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror    = () => reject(req.error);
  });
}

function _p(req) {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}
function _uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function _tx(store, mode = 'readonly') {
  return _db.transaction(store, mode).objectStore(store);
}

// ─── Public init ─────────────────────────────────────────────────────────────

export async function initHistoryDB() {
  await _getDB();
}

// ─── Branch helpers ──────────────────────────────────────────────────────────

export async function listBranches(projectId) {
  await _getDB();
  return new Promise((res, rej) => {
    const req = _tx(ST_BRANCHES).index('projectId').getAll(projectId);
    req.onsuccess = () => res(req.result || []);
    req.onerror   = () => rej(req.error);
  });
}

export async function getActiveBranch(projectId) {
  const prefs = _getProjectPrefs(projectId);
  if (prefs.activeBranchId) {
    await _getDB();
    const b = await _p(_tx(ST_BRANCHES).get(prefs.activeBranchId));
    if (b) return b;
  }
  const branches = await listBranches(projectId);
  const main = branches.find(b => b.name === DEFAULT_BRANCH_NAME) || branches[0];
  return main || null;
}

export async function setActiveBranch(projectId, branchId) {
  _setProjectPrefs(projectId, { activeBranchId: branchId });
}

export async function createBranch(projectId, name, fromCommitId = null) {
  await _getDB();
  const existingBranches = await listBranches(projectId);
  const duplicate = existingBranches.find(b => b.name === name);
  if (duplicate) throw new Error(`Branch "${name}" already exists`);

  let headCommitId = fromCommitId;
  if (!headCommitId) {
    const active = await getActiveBranch(projectId);
    headCommitId = active?.headCommitId ?? null;
  }

  const branch = {
    id: _uid(),
    projectId,
    name,
    headCommitId,
    createdAt: Date.now(),
    color: BRANCH_COLORS[existingBranches.length % BRANCH_COLORS.length],
  };
  await _p(_tx(ST_BRANCHES, 'readwrite').put(branch));
  return branch;
}

export async function deleteBranch(branchId) {
  await _getDB();
  await _p(_tx(ST_BRANCHES, 'readwrite').delete(branchId));
}

async function _ensureMainBranch(projectId) {
  const branches = await listBranches(projectId);
  if (branches.length === 0) {
    return createBranch(projectId, DEFAULT_BRANCH_NAME);
  }
  return branches.find(b => b.name === DEFAULT_BRANCH_NAME) || branches[0];
}

// ─── Commit helpers ───────────────────────────────────────────────────────────

export async function getCommit(commitId) {
  await _getDB();
  return _p(_tx(ST_COMMITS).get(commitId));
}

export async function getCommits(projectId, branchId = null) {
  await _getDB();
  return new Promise((res, rej) => {
    const index = branchId
      ? _tx(ST_COMMITS).index('proj_branch').getAll([projectId, branchId])
      : _tx(ST_COMMITS).index('projectId').getAll(projectId);
    index.onsuccess = () => {
      const rows = (index.result || []).sort((a, b) => b.timestamp - a.timestamp);
      res(rows);
    };
    index.onerror = () => rej(index.error);
  });
}

export async function commit(projectId, message = '', opts = {}) {
  await _getDB();

  let branch = await getActiveBranch(projectId);
  if (!branch) branch = await _ensureMainBranch(projectId);

  const code       = opts.code       ?? state.editor?.getValue() ?? state.currentCode ?? '';
  const multipass  = opts.multipass  ?? _serializeMultipass();
  const vars       = opts.vars       ?? (state.vars ? [...state.vars] : []);
  const thumbnail  = opts.thumbnail  ?? captureViewportThumbnail();
  const autoMsg    = message || _autoMessage(code, branch.headCommitId);

  const c = {
    id:           _uid(),
    projectId,
    branchId:     branch.id,
    parentId:     branch.headCommitId,
    message:      autoMsg,
    code,
    multipass,
    vars,
    timestamp:    Date.now(),
    thumbDataURL: thumbnail,
    format:       opts.format ?? _detectFormat(),
    linesChanged: 0,
  };

  if (branch.headCommitId) {
    const parent = await getCommit(branch.headCommitId);
    if (parent) {
      const d = _lineDiff(parent.code, code);
      c.linesChanged = d.added + d.removed;
      if (c.linesChanged === 0 && !opts.force) return null; // nothing changed
    }
  }

  const tx = _db.transaction([ST_COMMITS, ST_BRANCHES], 'readwrite');
  await _p(tx.objectStore(ST_COMMITS).put(c));

  branch.headCommitId = c.id;
  await _p(tx.objectStore(ST_BRANCHES).put(branch));

  return c;
}

export async function checkoutCommit(commitId) {
  const c = await getCommit(commitId);
  if (!c) return false;

  if (state.editor && c.code != null) {
    state.editor.setValue(c.code);
  }

  if (c.multipass) {
    try {
      const { stImportMultipass } = await import('../render/multipass.js');
      const passes = {};
      for (const [k, p] of Object.entries(c.multipass.passes || {})) {
        passes[k] = { ...p };
      }
      stImportMultipass({ passes, active: c.multipass.active });
    } catch { /* multipass not available */ }
  } else {
    const { applyAndParse } = await import('../io/actions.js');
    await applyAndParse(c.code);
  }

  return true;
}

export async function exportCommitAsFile(commitId) {
  const c = await getCommit(commitId);
  if (!c) return;
  const ext = c.format === 'wgsl' ? 'wgsl' : c.format === 'hlsl' ? 'hlsl' : 'glsl';
  const ts = new Date(c.timestamp).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `z-gl-commit-${ts}.${ext}`;
  const blob = new Blob([c.code], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ─── Diff helpers ─────────────────────────────────────────────────────────────

export function diffCommitsText(codeA, codeB) {
  const linesA = codeA.split('\n');
  const linesB = codeB.split('\n');
  return _lineDiff(codeA, codeB);
}

function _lineDiff(codeA, codeB) {
  const linesA = codeA.split('\n');
  const linesB = codeB.split('\n');
  const setA = new Set(linesA);
  const setB = new Set(linesB);
  let added = 0, removed = 0, unchanged = 0;
  for (const l of linesB) { if (setA.has(l)) unchanged++; else added++; }
  for (const l of linesA) { if (!setB.has(l)) removed++; }
  return { added, removed, unchanged, totalA: linesA.length, totalB: linesB.length };
}

export async function diffCommits(commitIdA, commitIdB) {
  const [a, b] = await Promise.all([getCommit(commitIdA), getCommit(commitIdB)]);
  if (!a || !b) return null;
  return { ..._lineDiff(a.code, b.code), codeA: a.code, codeB: b.code, commitA: a, commitB: b };
}

// ─── Prune ───────────────────────────────────────────────────────────────────

export async function pruneHistory(projectId, keepLast = MAX_COMMITS_DEFAULT) {
  const all = await getCommits(projectId);
  if (all.length <= keepLast) return 0;
  const toDelete = all.slice(keepLast);
  const tx = _db.transaction(ST_COMMITS, 'readwrite');
  const store = tx.objectStore(ST_COMMITS);
  for (const c of toDelete) store.delete(c.id);
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  return toDelete.length;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

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

async function _autoMessage(code, parentCommitId) {
  const lines = code.split('\n').filter(l => l.trim()).length;
  if (!parentCommitId) return `Initial commit (${lines} lignes)`;
  return `Mise à jour — ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

const PREFS_KEY = 'z-gl-history-prefs';

function _getProjectPrefs(projectId) {
  try {
    const all = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return all[projectId] || {};
  } catch { return {}; }
}

function _setProjectPrefs(projectId, patch) {
  try {
    const all = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    all[projectId] = { ...(all[projectId] || {}), ...patch };
    localStorage.setItem(PREFS_KEY, JSON.stringify(all));
  } catch {}
}
