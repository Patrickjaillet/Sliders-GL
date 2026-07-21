import {
  initWorkspaceDB,
  listProjects,
  saveCurrentProject,
  loadProject,
  deleteProject,
  getThumbnail,
  exportProjectJSON,
  importProjectJSON,
  setAutoSave,
  getWorkspacePrefs,
  setWorkspacePrefs,
  captureViewportThumbnail,
  saveThumbnail,
} from './workspace-manager.js';
import { state } from '../core/state.js';
import { setWindowTitle } from '../native/tauri.js';
import { applyAndParse } from '../io/actions.js';

const PANEL_ID    = 'z-gl-workspace-panel';
const SIDEBAR_ID  = 'z-gl-workspace-sidebar';

const CSS = `
#${PANEL_ID}-overlay {
  position: fixed;
  inset: 0;
  z-index: 270;
  display: none;
  pointer-events: none;
}
#${PANEL_ID}-overlay.open {
  display: block;
  pointer-events: none;
}
#${SIDEBAR_ID} {
  position: fixed;
  top: 0;
  left: 0;
  width: 260px;
  height: 100vh;
  background: var(--bg2, #1e1e2e);
  border-right: 1px solid var(--border, #333);
  box-shadow: 4px 0 24px rgba(0,0,0,.5);
  z-index: 271;
  display: flex;
  flex-direction: column;
  font-family: var(--font, 'JetBrains Mono', monospace);
  font-size: 12px;
  color: var(--fg, #cdd6f4);
  transform: translateX(-270px);
  transition: transform 0.22s cubic-bezier(.4,0,.2,1);
  user-select: none;
}
#${SIDEBAR_ID}.open {
  transform: translateX(0);
}
#${SIDEBAR_ID} .ws-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px 8px;
  background: var(--bg3, #181825);
  border-bottom: 1px solid var(--border, #333);
  flex-shrink: 0;
}
#${SIDEBAR_ID} .ws-title {
  font-size: 11px; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--lavender, #b4befe);
}
#${SIDEBAR_ID} .ws-close {
  background: none; border: none;
  color: var(--fg2, #6c7086); cursor: pointer;
  font-size: 16px; padding: 0 2px; line-height: 1;
}
#${SIDEBAR_ID} .ws-close:hover { color: var(--fg, #cdd6f4); }
#${SIDEBAR_ID} .ws-toolbar {
  display: flex; gap: 4px; padding: 8px 10px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-faint, #2a2a3a);
}
#${SIDEBAR_ID} .ws-btn {
  flex: 1;
  background: var(--bg3, #181825);
  border: 1px solid var(--border, #333);
  color: var(--fg, #cdd6f4);
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 10px;
  cursor: pointer;
  font-family: inherit;
  transition: background .12s;
  white-space: nowrap;
}
#${SIDEBAR_ID} .ws-btn:hover {
  background: var(--accent-dim, rgba(123,111,255,.15));
  border-color: var(--accent, #7b6fff);
  color: var(--accent, #7b6fff);
}
#${SIDEBAR_ID} .ws-btn.primary {
  background: var(--accent, #7b6fff);
  border-color: var(--accent, #7b6fff);
  color: #fff;
}
#${SIDEBAR_ID} .ws-btn.primary:hover {
  background: var(--accent-bright, #9b8fff);
}
#${SIDEBAR_ID} .ws-search {
  padding: 0 10px 8px;
  flex-shrink: 0;
}
#${SIDEBAR_ID} .ws-search input {
  width: 100%; box-sizing: border-box;
  background: var(--bg3, #181825);
  border: 1px solid var(--border, #333);
  color: var(--fg, #cdd6f4);
  border-radius: 4px;
  padding: 4px 8px;
  font-family: inherit; font-size: 11px;
}
#${SIDEBAR_ID} .ws-search input:focus {
  outline: none; border-color: var(--accent, #7b6fff);
}
#${SIDEBAR_ID} .ws-folder-header {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 10px 2px;
  font-size: 9px; font-weight: 700; letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--fg2, #6c7086);
  cursor: pointer;
}
#${SIDEBAR_ID} .ws-folder-header:hover { color: var(--fg, #cdd6f4); }
#${SIDEBAR_ID} .ws-folder-arrow { font-size: 8px; transition: transform .15s; }
#${SIDEBAR_ID} .ws-folder-arrow.collapsed { transform: rotate(-90deg); }
#${SIDEBAR_ID} .ws-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 6px 8px;
}
#${SIDEBAR_ID} .ws-list::-webkit-scrollbar { width: 4px; }
#${SIDEBAR_ID} .ws-list::-webkit-scrollbar-thumb { background: var(--border, #333); border-radius: 2px; }
#${SIDEBAR_ID} .ws-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px;
  border-radius: 5px;
  cursor: pointer;
  border: 1px solid transparent;
  margin-bottom: 2px;
  transition: background .1s;
  position: relative;
}
#${SIDEBAR_ID} .ws-item:hover {
  background: var(--bg3, #181825);
}
#${SIDEBAR_ID} .ws-item.active {
  background: var(--accent-dim, rgba(123,111,255,.12));
  border-color: var(--accent, #7b6fff);
}
#${SIDEBAR_ID} .ws-thumb {
  width: 40px; height: 22px;
  border-radius: 3px;
  background: var(--bg3, #181825);
  border: 1px solid var(--border, #333);
  flex-shrink: 0;
  object-fit: cover;
  overflow: hidden;
}
#${SIDEBAR_ID} .ws-thumb img {
  width: 100%; height: 100%; display: block; object-fit: cover;
}
#${SIDEBAR_ID} .ws-thumb-empty {
  width: 40px; height: 22px;
  border-radius: 3px;
  background: var(--bg3, #181825);
  border: 1px solid var(--border, #333);
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 8px; color: var(--fg2, #6c7086);
}
#${SIDEBAR_ID} .ws-info { flex: 1; min-width: 0; }
#${SIDEBAR_ID} .ws-name {
  font-size: 11px; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--fg, #cdd6f4);
}
#${SIDEBAR_ID} .ws-meta {
  font-size: 9px; color: var(--fg2, #6c7086);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#${SIDEBAR_ID} .ws-item-actions {
  display: none; gap: 2px;
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
}
#${SIDEBAR_ID} .ws-item:hover .ws-item-actions { display: flex; }
#${SIDEBAR_ID} .ws-act-btn {
  background: var(--bg2, #1e1e2e);
  border: 1px solid var(--border, #333);
  color: var(--fg2, #6c7086);
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 9px; cursor: pointer;
  font-family: inherit;
}
#${SIDEBAR_ID} .ws-act-btn:hover { color: var(--fg, #cdd6f4); border-color: var(--fg2, #6c7086); }
#${SIDEBAR_ID} .ws-act-btn.del:hover { color: var(--red, #f38ba8); border-color: var(--red, #f38ba8); }
#${SIDEBAR_ID} .ws-empty {
  text-align: center; color: var(--fg2, #6c7086);
  font-size: 11px; padding: 24px 16px;
  line-height: 1.6;
}
#${SIDEBAR_ID} .ws-footer {
  padding: 8px 10px;
  border-top: 1px solid var(--border, #333);
  flex-shrink: 0;
  display: flex; flex-direction: column; gap: 6px;
}
#${SIDEBAR_ID} .ws-autosave-row {
  display: flex; align-items: center; gap: 8px; font-size: 10px;
}
#${SIDEBAR_ID} .ws-autosave-row label { flex: 1; color: var(--fg2, #6c7086); cursor: pointer; }
#${SIDEBAR_ID} .ws-interval-row {
  display: flex; align-items: center; gap: 6px; font-size: 10px;
}
#${SIDEBAR_ID} .ws-interval-row label { flex: 1; color: var(--fg2, #6c7086); }
#${SIDEBAR_ID} .ws-interval-row select {
  background: var(--bg3, #181825);
  border: 1px solid var(--border, #333);
  color: var(--fg, #cdd6f4);
  border-radius: 3px; padding: 2px 4px;
  font-family: inherit; font-size: 10px;
}
#${SIDEBAR_ID} .ws-import-row {
  display: flex; gap: 4px;
}
#z-gl-autosave-indicator {
  position: fixed; bottom: 12px; left: 270px;
  background: var(--bg3, #181825);
  border: 1px solid var(--accent, #7b6fff);
  color: var(--accent, #7b6fff);
  border-radius: 4px; padding: 3px 8px;
  font-size: 10px; font-family: var(--font, monospace);
  z-index: 272; opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
}
#z-gl-workspace-toggle {
  position: fixed; top: 50%; left: 0;
  transform: translateY(-50%);
  width: 18px; height: 48px;
  background: var(--bg3, #181825);
  border: 1px solid var(--border, #333);
  border-left: none;
  border-radius: 0 5px 5px 0;
  cursor: pointer; z-index: 269;
  display: flex; align-items: center; justify-content: center;
  color: var(--fg2, #6c7086);
  font-size: 10px;
  transition: background .12s;
}
#z-gl-workspace-toggle:hover { background: var(--accent-dim, rgba(123,111,255,.15)); color: var(--accent, #7b6fff); }
`;

let _panelEl   = null;
let _sidebarEl = null;
let _open      = false;
let _projects  = [];
let _filter    = '';
let _inited    = false;

function _syncAutoSaveBadge(enabled) {
  const el = document.getElementById('sbAutoSave');
  if (el) el.hidden = !enabled;
}

function _injectCSS() {
  if (document.getElementById('z-gl-workspace-css')) return;
  const s = document.createElement('style');
  s.id = 'z-gl-workspace-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

function _buildHTML() {
  const wrap = document.createElement('div');
  wrap.id = `${PANEL_ID}-overlay`;

  const sidebar = document.createElement('div');
  sidebar.id = SIDEBAR_ID;
  sidebar.innerHTML = `
    <div class="ws-header">
      <span class="ws-title">📁 Projects</span>
      <button class="ws-close" title="Close">✕</button>
    </div>
    <div class="ws-toolbar">
      <button class="ws-btn primary" id="ws-btn-new">+ New</button>
      <button class="ws-btn"         id="ws-btn-save">💾 Save</button>
      <button class="ws-btn"         id="ws-btn-import">Import</button>
    </div>
    <div class="ws-search">
      <input type="text" placeholder="Search…" id="ws-search-input" autocomplete="off" spellcheck="false"/>
    </div>
    <div class="ws-folder-header" id="ws-folder-recent">
      <span class="ws-folder-arrow" id="ws-arr-recent">▾</span>
      Recent projects
    </div>
    <div class="ws-list" id="ws-list-recent"></div>
    <div class="ws-footer">
      <div class="ws-autosave-row">
        <label for="ws-autosave-chk">Auto-save</label>
        <input type="checkbox" id="ws-autosave-chk"/>
      </div>
      <div class="ws-interval-row" id="ws-interval-row" style="display:none">
        <label for="ws-autosave-interval">Interval</label>
        <select id="ws-autosave-interval">
          <option value="15">15 s</option>
          <option value="30" selected>30 s</option>
          <option value="60">1 min</option>
          <option value="120">2 min</option>
          <option value="300">5 min</option>
        </select>
      </div>
    </div>
  `;

  wrap.appendChild(sidebar);
  document.body.appendChild(wrap);

  const toggle = document.createElement('button');
  toggle.id = 'z-gl-workspace-toggle';
  toggle.title = 'Workspace (Ctrl+Shift+B)';
  toggle.innerHTML = '›';
  document.body.appendChild(toggle);

  const indicator = document.createElement('div');
  indicator.id = 'z-gl-autosave-indicator';
  document.body.appendChild(indicator);

  return { wrap, sidebar };
}

async function _renderList() {
  const container = document.getElementById('ws-list-recent');
  if (!container) return;

  _projects = await listProjects();
  const filtered = _filter
    ? _projects.filter(p => p.name.toLowerCase().includes(_filter.toLowerCase()))
    : _projects;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="ws-empty">No projects.<br>Click <strong>+ New</strong> to create your first project.</div>`;
    return;
  }

  container.innerHTML = '';
  for (const project of filtered) {
    const item = document.createElement('div');
    item.className = 'ws-item' + (project.id === state.activeProjectId ? ' active' : '');
    item.dataset.id = project.id;

    const thumbEl = document.createElement('div');
    thumbEl.className = 'ws-thumb-empty';
    thumbEl.textContent = '▶';

    getThumbnail(project.id).then(dataURL => {
      if (dataURL) {
        thumbEl.className = 'ws-thumb';
        thumbEl.innerHTML = `<img src="${dataURL}" alt="preview" loading="lazy"/>`;
      }
    });

    const date = new Date(project.updatedAt);
    const ago  = _timeAgo(date);
    const fmt  = project.format || 'glsl';

    item.innerHTML = `
      <div class="ws-info">
        <div class="ws-name">${_esc(project.name)}</div>
        <div class="ws-meta">${ago} · ${fmt.toUpperCase()}</div>
      </div>
      <div class="ws-item-actions">
        <button class="ws-act-btn" data-action="export" title="Export JSON">⬇</button>
        <button class="ws-act-btn del" data-action="delete" title="Delete">✕</button>
      </div>
    `;

    item.prepend(thumbEl);

    item.addEventListener('click', async (e) => {
      if (e.target.closest('.ws-item-actions')) return;
      await _loadProject(project.id);
    });

    item.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.stopPropagation();
      if (btn.dataset.action === 'delete') {
        await _confirmDelete(project.id, project.name);
      } else if (btn.dataset.action === 'export') {
        await exportProjectJSON(project.id);
      }
    });

    container.appendChild(item);
  }
}

async function _loadProject(id) {
  const ok = await loadProject(id);
  if (ok) {
    _renderList();
    _showToast(`✔ Projet chargé`);
  }
}

async function _confirmDelete(id, name) {
  if (!confirm(`Delete "${name}"? This action cannot be undone.`)) return;
  await deleteProject(id);
  if (state.activeProjectId === id) {
    state.activeProjectId   = null;
    state.activeProjectName = null;
  }
  _renderList();
}

async function _saveCurrentAs() {
  const currentName = state.activeProjectName || 'Untitled Shader';
  const name = prompt('Nom du projet :', currentName);
  if (name === null) return;
  const project = await saveCurrentProject(name.trim() || currentName, { id: state.activeProjectId });
  state.activeProjectId   = project.id;
  state.activeProjectName = project.name;
  _renderList();
  _showToast('💾 Projet sauvegardé');
}

async function _newProject() {
  const name = prompt('New project name:', 'New Shader');
  if (name === null) return;

  const defaultCode = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);
}`;

  if (state.editor) {
    state.editor.setValue(defaultCode);
  }

  applyAndParse(defaultCode);

  const project = await saveCurrentProject(name.trim() || 'New Shader', {
    code: defaultCode,
    multipass: null,
  });
  state.activeProjectId   = project.id;
  state.activeProjectName = project.name;
  setWindowTitle(project.name).catch(() => {});
  _renderList();
  _showToast('✨ New project created');
}

async function _importFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.zgl';
  input.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const project = await importProjectJSON(file);
      _showToast(`✔ Importé : ${project.name}`);
      _renderList();
    } catch (err) {
      _showToast('⚠ Échec import : ' + err.message, 'error');
    }
  };
  input.click();
}

function _bindEvents() {
  const sidebar = document.getElementById(SIDEBAR_ID);
  if (!sidebar) return;

  sidebar.querySelector('.ws-close').addEventListener('click', closePanel);
  document.getElementById('ws-btn-new')?.addEventListener('click', _newProject);
  document.getElementById('ws-btn-save')?.addEventListener('click', _saveCurrentAs);
  document.getElementById('ws-btn-import')?.addEventListener('click', _importFile);

  document.getElementById('ws-search-input')?.addEventListener('input', (e) => {
    _filter = e.target.value;
    _renderList();
  });

  const chk = document.getElementById('ws-autosave-chk');
  const sel = document.getElementById('ws-autosave-interval');
  const row = document.getElementById('ws-interval-row');

  const prefs = getWorkspacePrefs();
  chk.checked = prefs.autoSave ?? false;
  sel.value   = String(prefs.autoSaveInterval ?? 30);
  row.style.display = chk.checked ? '' : 'none';
  setAutoSave(chk.checked, parseInt(sel.value));
  _syncAutoSaveBadge(chk.checked);

  chk.addEventListener('change', () => {
    row.style.display = chk.checked ? '' : 'none';
    setWorkspacePrefs({ autoSave: chk.checked });
    setAutoSave(chk.checked, parseInt(sel.value));
    _syncAutoSaveBadge(chk.checked);
  });

  sel.addEventListener('change', () => {
    const s = parseInt(sel.value);
    setWorkspacePrefs({ autoSaveInterval: s });
    setAutoSave(chk.checked, s);
  });

  document.getElementById('ws-folder-recent')?.addEventListener('click', () => {
    const arr  = document.getElementById('ws-arr-recent');
    const list = document.getElementById('ws-list-recent');
    const collapsed = arr.classList.toggle('collapsed');
    list.style.display = collapsed ? 'none' : '';
  });

  document.getElementById('z-gl-workspace-toggle')?.addEventListener('click', togglePanel);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
      e.preventDefault();
      togglePanel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _open) {
      closePanel();
    }
  });
}

function _showToast(msg, type = 'ok') {
  const el = document.getElementById('z-gl-autosave-indicator');
  if (!el) return;
  el.textContent = msg;
  el.style.borderColor = type === 'error' ? 'var(--red, #f38ba8)' : 'var(--accent, #7b6fff)';
  el.style.color       = type === 'error' ? 'var(--red, #f38ba8)' : 'var(--accent, #7b6fff)';
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

function _timeAgo(date) {
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'À l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function initWorkspacePanel() {
  if (_inited) return;
  _inited = true;
  _injectCSS();
  const { wrap, sidebar } = _buildHTML();
  _panelEl   = wrap;
  _sidebarEl = sidebar;
  await initWorkspaceDB();
  _bindEvents();
  await _renderList();
}

export function openPanel() {
  if (!_inited) { initWorkspacePanel().then(openPanel); return; }
  _panelEl.classList.add('open');
  _sidebarEl.classList.add('open');
  _open = true;
  const toggle = document.getElementById('z-gl-workspace-toggle');
  if (toggle) { toggle.textContent = '‹'; toggle.style.left = '260px'; }
  _renderList();
}

export function closePanel() {
  if (!_sidebarEl) return;
  _panelEl.classList.remove('open');
  _sidebarEl.classList.remove('open');
  _open = false;
  const toggle = document.getElementById('z-gl-workspace-toggle');
  if (toggle) { toggle.textContent = '›'; toggle.style.left = '0'; }
}

export function togglePanel() {
  if (_open) closePanel(); else openPanel();
}

export function isOpen() { return _open; }
