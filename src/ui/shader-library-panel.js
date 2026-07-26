/**
 * src/ui/shader-library-panel.js — Phase 20.3
 *
 * Panneau Bibliothèque : recherche plein-texte, filtres, tags, collections.
 * Raccourci : Ctrl+Shift+F  (ou bouton toolbar)
 *
 * Sections :
 *   ① Barre de recherche plein-texte
 *   ② Filtres rapides (format, multipass, WebGPU, MIDI, timeline, date)
 *   ③ Tags — nuage cliquables (filtre par tag)
 *   ④ Collections — sidebar gauche (créer, renommer, supprimer)
 *   ⑤ Grille de résultats — thumbnail + nom + tags + meta + actions inline
 */

import {
  initLibraryDB,
  searchProjects,
  setProjectTags,
  getAllTags,
  indexProject,
  reindexAll,
  createCollection,
  listCollections,
  getCollection,
  addToCollection,
  removeFromCollection,
  deleteCollection,
  renameCollection,
} from './shader-library.js';

import {
  loadProject,
  deleteProject,
  exportProjectJSON,
  getThumbnail,
  saveProject,
} from './workspace-manager.js';

import { state } from '../core/state.js';

const PANEL_ID = 'z-gl-lib-panel';

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
#${PANEL_ID} {
  position: fixed;
  inset: 0;
  background: var(--bg, #1e1e2e);
  z-index: 264;
  display: none;
  flex-direction: row;
  font-family: var(--font, 'JetBrains Mono', monospace);
  font-size: 12px;
  color: var(--fg, #cdd6f4);
  overflow: hidden;
}
#${PANEL_ID}.open { display: flex; }

/* ── Sidebar collections ── */
#${PANEL_ID} .lib-sidebar {
  width: 180px;
  flex-shrink: 0;
  background: var(--bg3, #181825);
  border-right: 1px solid var(--border, #333);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
#${PANEL_ID} .lib-sidebar-header {
  padding: 10px 10px 6px;
  font-size: 9px; font-weight: 700; letter-spacing: .1em;
  text-transform: uppercase; color: var(--fg2, #6c7086);
  border-bottom: 1px solid var(--border-faint, #2a2a3a);
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
#${PANEL_ID} .lib-sidebar-list {
  flex: 1; overflow-y: auto; padding: 4px 0;
}
#${PANEL_ID} .lib-sidebar-list::-webkit-scrollbar { width: 3px; }
#${PANEL_ID} .lib-sidebar-list::-webkit-scrollbar-thumb { background: var(--border); border-radius:2px; }
#${PANEL_ID} .lib-coll-item {
  display: flex; align-items: center; gap: 7px;
  padding: 6px 10px;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: background .1s;
}
#${PANEL_ID} .lib-coll-item:hover { background: var(--bg2, #1e1e2e); }
#${PANEL_ID} .lib-coll-item.active {
  background: rgba(123,111,255,.1);
  border-left-color: var(--accent, #7b6fff);
}
#${PANEL_ID} .lib-coll-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
#${PANEL_ID} .lib-coll-name {
  flex: 1; font-size: 11px; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
#${PANEL_ID} .lib-coll-count {
  font-size: 9px; color: var(--fg2, #6c7086);
}
#${PANEL_ID} .lib-coll-actions {
  display: none; gap: 2px;
}
#${PANEL_ID} .lib-coll-item:hover .lib-coll-actions { display: flex; }
#${PANEL_ID} .lib-coll-act {
  background: none; border: none; color: var(--fg2, #6c7086);
  font-size: 9px; cursor: pointer; padding: 0 2px; line-height: 1;
}
#${PANEL_ID} .lib-coll-act:hover { color: var(--red, #f38ba8); }
#${PANEL_ID} .lib-new-coll-btn {
  margin: 6px 10px;
  background: var(--bg2, #1e1e2e);
  border: 1px dashed var(--border, #333);
  color: var(--fg2, #6c7086);
  border-radius: 4px; padding: 4px 6px;
  font-size: 10px; cursor: pointer; font-family: inherit;
  width: calc(100% - 20px); text-align: left;
}
#${PANEL_ID} .lib-new-coll-btn:hover { color: var(--accent, #7b6fff); border-color: var(--accent, #7b6fff); }

/* ── Main area ── */
#${PANEL_ID} .lib-main {
  flex: 1; display: flex; flex-direction: column; overflow: hidden;
  min-width: 0;
}

/* ── Topbar ── */
#${PANEL_ID} .lib-topbar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  background: var(--bg3, #181825);
  border-bottom: 1px solid var(--border, #333);
  flex-shrink: 0;
}
#${PANEL_ID} .lib-title {
  font-size: 11px; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; color: var(--mauve, #cba6f7);
  white-space: nowrap;
}
#${PANEL_ID} .lib-search-wrap {
  flex: 1; position: relative;
}
#${PANEL_ID} .lib-search {
  width: 100%; box-sizing: border-box;
  background: var(--bg2, #1e1e2e);
  border: 1px solid var(--border, #333);
  color: var(--fg, #cdd6f4);
  border-radius: 5px; padding: 5px 10px 5px 28px;
  font-family: inherit; font-size: 12px;
}
#${PANEL_ID} .lib-search:focus { outline: none; border-color: var(--accent, #7b6fff); }
#${PANEL_ID} .lib-search-icon {
  position: absolute; left: 9px; top: 50%; transform: translateY(-50%);
  font-size: 11px; color: var(--fg2, #6c7086); pointer-events: none;
}
#${PANEL_ID} .lib-close {
  background: none; border: none; color: var(--fg2, #6c7086);
  cursor: pointer; font-size: 17px; padding: 0 2px; line-height: 1;
}
#${PANEL_ID} .lib-close:hover { color: var(--fg, #cdd6f4); }

/* ── Filters row ── */
#${PANEL_ID} .lib-filters {
  display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-faint, #2a2a3a);
  flex-shrink: 0;
}
#${PANEL_ID} .lib-filter-btn {
  background: var(--bg3, #181825);
  border: 1px solid var(--border, #333);
  color: var(--fg2, #6c7086);
  border-radius: 12px; padding: 2px 8px;
  font-size: 9px; cursor: pointer; font-family: inherit;
  white-space: nowrap;
  transition: all .1s;
}
#${PANEL_ID} .lib-filter-btn:hover {
  color: var(--fg, #cdd6f4); border-color: var(--fg, #cdd6f4);
}
#${PANEL_ID} .lib-filter-btn.active {
  background: var(--accent, #7b6fff);
  border-color: var(--accent, #7b6fff);
  color: #fff;
}
#${PANEL_ID} .lib-filter-sep {
  width: 1px; height: 14px; background: var(--border, #333); flex-shrink: 0;
}
#${PANEL_ID} .lib-filter-select {
  background: var(--bg3, #181825);
  border: 1px solid var(--border, #333);
  color: var(--fg2, #6c7086);
  border-radius: 4px; padding: 2px 5px;
  font-family: inherit; font-size: 9px;
}
#${PANEL_ID} .lib-filter-select:focus { outline: none; border-color: var(--accent); }
#${PANEL_ID} .lib-result-count {
  margin-left: auto; font-size: 9px; color: var(--fg2, #6c7086); white-space: nowrap;
}

/* ── Tags cloud ── */
#${PANEL_ID} .lib-tags-bar {
  display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
  padding: 5px 12px 4px;
  border-bottom: 1px solid var(--border-faint, #2a2a3a);
  flex-shrink: 0; min-height: 28px;
}
#${PANEL_ID} .lib-tag-chip {
  background: rgba(203,166,247,.12);
  border: 1px solid rgba(203,166,247,.3);
  color: var(--mauve, #cba6f7);
  border-radius: 10px; padding: 1px 8px;
  font-size: 9px; cursor: pointer;
  transition: all .1s;
}
#${PANEL_ID} .lib-tag-chip:hover {
  background: rgba(203,166,247,.25);
}
#${PANEL_ID} .lib-tag-chip.active {
  background: var(--mauve, #cba6f7);
  color: var(--bg, #1e1e2e);
}

/* ── Grid ── */
#${PANEL_ID} .lib-grid-wrap {
  flex: 1; overflow-y: auto; padding: 10px 12px 16px;
}
#${PANEL_ID} .lib-grid-wrap::-webkit-scrollbar { width: 6px; }
#${PANEL_ID} .lib-grid-wrap::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
#${PANEL_ID} .lib-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}
#${PANEL_ID} .lib-card {
  background: var(--bg2, #1e1e2e);
  border: 1px solid var(--border, #333);
  border-radius: 7px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color .15s, box-shadow .15s;
  display: flex; flex-direction: column;
  position: relative;
}
#${PANEL_ID} .lib-card:hover {
  border-color: var(--accent, #7b6fff);
  box-shadow: 0 4px 16px rgba(0,0,0,.4);
}
#${PANEL_ID} .lib-card.active {
  border-color: var(--mauve, #cba6f7);
  box-shadow: 0 0 0 2px rgba(203,166,247,.2);
}
#${PANEL_ID} .lib-card-thumb {
  width: 100%; aspect-ratio: 16/9;
  background: var(--bg3, #181825);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; color: var(--fg2, #6c7086);
  overflow: hidden; flex-shrink: 0;
}
#${PANEL_ID} .lib-card-thumb img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
#${PANEL_ID} .lib-card-body { padding: 8px 9px 6px; flex: 1; }
#${PANEL_ID} .lib-card-name {
  font-size: 11px; font-weight: 700;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--fg, #cdd6f4); margin-bottom: 3px;
}
#${PANEL_ID} .lib-card-meta {
  font-size: 9px; color: var(--fg2, #6c7086); margin-bottom: 5px;
  display: flex; gap: 6px; flex-wrap: wrap;
}
#${PANEL_ID} .lib-card-badge {
  background: var(--bg3, #181825); border: 1px solid var(--border, #333);
  border-radius: 3px; padding: 0 4px; font-size: 8px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .05em;
}
#${PANEL_ID} .lib-card-badge.wgsl  { color: var(--sky, #89dceb); border-color: var(--sky, #89dceb); }
#${PANEL_ID} .lib-card-badge.hlsl  { color: var(--peach, #fab387); border-color: var(--peach, #fab387); }
#${PANEL_ID} .lib-card-badge.mp    { color: var(--green, #a6e3a1); border-color: var(--green, #a6e3a1); }
#${PANEL_ID} .lib-card-badge.midi  { color: var(--yellow, #f9e2af); border-color: var(--yellow, #f9e2af); }
#${PANEL_ID} .lib-card-badge.tl    { color: var(--mauve, #cba6f7); border-color: var(--mauve, #cba6f7); }
#${PANEL_ID} .lib-card-tags {
  display: flex; gap: 3px; flex-wrap: wrap;
}
#${PANEL_ID} .lib-card-tag {
  background: rgba(203,166,247,.1);
  border: 1px solid rgba(203,166,247,.25);
  color: var(--mauve, #cba6f7);
  border-radius: var(--radius-md); padding: 0 6px;
  font-size: 8px;
}
#${PANEL_ID} .lib-card-footer {
  display: flex; gap: 2px;
  padding: 4px 6px;
  border-top: 1px solid var(--border-faint, #2a2a3a);
  opacity: 0; transition: opacity .15s;
}
#${PANEL_ID} .lib-card:hover .lib-card-footer { opacity: 1; }
#${PANEL_ID} .lib-card-btn {
  flex: 1;
  background: var(--bg3, #181825);
  border: 1px solid var(--border, #333);
  color: var(--fg2, #6c7086);
  border-radius: 3px; padding: 3px 4px;
  font-size: 9px; cursor: pointer; font-family: inherit;
  text-align: center;
}
#${PANEL_ID} .lib-card-btn:hover { color: var(--fg, #cdd6f4); border-color: var(--fg2); }
#${PANEL_ID} .lib-card-btn.load { color: var(--accent, #7b6fff); border-color: var(--accent, #7b6fff); }
#${PANEL_ID} .lib-card-btn.del  { color: var(--red, #f38ba8); }
#${PANEL_ID} .lib-card-btn.del:hover { border-color: var(--red, #f38ba8); }
#${PANEL_ID} .lib-empty {
  grid-column: 1 / -1;
  text-align: center; color: var(--fg2, #6c7086);
  padding: 48px 20px; font-size: 13px; line-height: 1.8;
}

/* ── Tag editor overlay (popup inline sur la carte) ── */
#${PANEL_ID} .lib-tag-editor {
  position: absolute; inset: 0;
  background: rgba(24,24,37,.96);
  border-radius: 7px;
  display: flex; flex-direction: column;
  padding: 10px;
  z-index: 2;
}
#${PANEL_ID} .lib-tag-editor h4 {
  font-size: 10px; color: var(--mauve, #cba6f7);
  margin: 0 0 6px; text-transform: uppercase; letter-spacing: .07em;
}
#${PANEL_ID} .lib-tag-editor input {
  background: var(--bg2, #1e1e2e);
  border: 1px solid var(--border); color: var(--fg);
  border-radius: 4px; padding: 4px 7px;
  font-family: inherit; font-size: 11px; margin-bottom: 6px;
}
#${PANEL_ID} .lib-tag-editor input:focus { outline: none; border-color: var(--accent); }
#${PANEL_ID} .lib-tag-editor-actions {
  display: flex; gap: 4px; margin-top: auto;
}
#${PANEL_ID} .lib-tag-editor-actions button {
  flex: 1;
  background: var(--bg3); border: 1px solid var(--border);
  color: var(--fg); border-radius: 4px; padding: 4px;
  font-size: 10px; cursor: pointer; font-family: inherit;
}
#${PANEL_ID} .lib-tag-editor-actions button.save {
  background: var(--accent); border-color: var(--accent); color: #fff;
}
`;

// ─── State ────────────────────────────────────────────────────────────────────

let _panel       = null;
let _open        = false;
let _inited      = false;
let _query       = '';
let _activeTags  = new Set();
let _activeCollId = null;
let _filters     = {};       // format, hasMultipass, hasWebGPU, hasMidi, hasTimeline
let _results     = [];
let _allTags     = [];
let _collections = [];
let _editingTagsForId = null;

// ─── CSS inject ───────────────────────────────────────────────────────────────

function _injectCSS() {
  if (document.getElementById('z-gl-lib-css')) return;
  const s = document.createElement('style');
  s.id = 'z-gl-lib-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function _buildHTML() {
  const el = document.createElement('div');
  el.id = PANEL_ID;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Bibliothèque de shaders');
  el.innerHTML = `
    <div class="lib-sidebar">
      <div class="lib-sidebar-header">
        <span>Collections</span>
      </div>
      <div class="lib-sidebar-list" id="lib-coll-list">
        <div class="lib-coll-item active" data-coll-id="">
          <span class="lib-coll-dot" style="background:var(--fg2,#6c7086)"></span>
          <span class="lib-coll-name">Tous les projets</span>
          <span class="lib-coll-count" id="lib-all-count"></span>
        </div>
      </div>
      <button class="lib-new-coll-btn" id="lib-new-coll-btn">+ Nouvelle collection</button>
    </div>

    <div class="lib-main">
      <div class="lib-topbar">
        <span class="lib-title">📚 Bibliothèque</span>
        <div class="lib-search-wrap">
          <span class="lib-search-icon">⌕</span>
          <input type="text" class="lib-search" id="lib-search"
                 placeholder="Search by code, name, tags…"
                 autocomplete="off" spellcheck="false"/>
        </div>
        <button class="lib-close" id="lib-close" title="Close (Esc)">✕</button>
      </div>

      <div class="lib-filters" id="lib-filters">
        <button class="lib-filter-btn" data-filter="glsl">GLSL</button>
        <button class="lib-filter-btn" data-filter="wgsl">WGSL</button>
        <button class="lib-filter-btn" data-filter="hlsl">HLSL</button>
        <div class="lib-filter-sep"></div>
        <button class="lib-filter-btn" data-filter="multipass">Multipass</button>
        <button class="lib-filter-btn" data-filter="webgpu">WebGPU</button>
        <button class="lib-filter-btn" data-filter="midi">MIDI</button>
        <button class="lib-filter-btn" data-filter="timeline">Timeline</button>
        <div class="lib-filter-sep"></div>
        <select class="lib-filter-select" id="lib-date-filter">
          <option value="">Toutes dates</option>
          <option value="today">Aujourd'hui</option>
          <option value="week">Cette semaine</option>
          <option value="month">Ce mois</option>
        </select>
        <span class="lib-result-count" id="lib-result-count"></span>
      </div>

      <div class="lib-tags-bar" id="lib-tags-bar"></div>

      <div class="lib-grid-wrap">
        <div class="lib-grid" id="lib-grid"></div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

// ─── Data load ────────────────────────────────────────────────────────────────

async function _reload() {
  _allTags     = await getAllTags();
  _collections = await listCollections();
  await _runSearch();
  _renderCollections();
  _renderTagsBar();
  _renderGrid();
  _renderResultCount();
}

async function _runSearch() {
  const f = /** @type {any} */ ({ ..._filters });
  if (_activeTags.size) f.tags = [..._activeTags];
  if (_activeCollId)    f.collectionId = _activeCollId;

  // Date filter
  const sel = document.getElementById('lib-date-filter')?.value;
  if (sel === 'today') {
    const d = new Date(); d.setHours(0,0,0,0);
    f.dateFrom = d.getTime();
  } else if (sel === 'week') {
    f.dateFrom = Date.now() - 7 * 86400000;
  } else if (sel === 'month') {
    f.dateFrom = Date.now() - 30 * 86400000;
  }

  _results = await searchProjects(_query, f);
}

// ─── Render collections ───────────────────────────────────────────────────────

function _renderCollections() {
  const list = document.getElementById('lib-coll-list');
  if (!list) return;

  // Keep "Tous les projets" row, rebuild rest
  const allRow = list.querySelector('[data-coll-id=""]');
  list.innerHTML = '';
  if (allRow) {
    allRow.classList.toggle('active', !_activeCollId);
    const cnt = document.getElementById('lib-all-count');
    if (cnt) cnt.textContent = String(_results.length);
    list.appendChild(allRow);
  }

  for (const coll of _collections) {
    const item = document.createElement('div');
    item.className = 'lib-coll-item' + (coll.id === _activeCollId ? ' active' : '');
    item.dataset.collId = coll.id;
    item.innerHTML = `
      <span class="lib-coll-dot" style="background:${coll.color}"></span>
      <span class="lib-coll-name">${_esc(coll.name)}</span>
      <span class="lib-coll-count">${coll.projectIds.length}</span>
      <div class="lib-coll-actions">
        <button class="lib-coll-act" data-action="rename" title="Rename">✎</button>
        <button class="lib-coll-act" data-action="delete" title="Delete">✕</button>
      </div>
    `;
    item.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) {
        e.stopPropagation();
        if (btn.dataset.action === 'delete') {
          if (!confirm(`Delete collection "${coll.name}"?`)) return;
          await deleteCollection(coll.id);
          if (_activeCollId === coll.id) _activeCollId = null;
        } else if (btn.dataset.action === 'rename') {
          const n = prompt('New name:', coll.name);
          if (n?.trim()) await renameCollection(coll.id, n.trim());
        }
        await _reload();
        return;
      }
      _activeCollId = coll.id;
      await _reload();
    });
    list.appendChild(item);
  }
}

// ─── Render tags bar ──────────────────────────────────────────────────────────

function _renderTagsBar() {
  const bar = document.getElementById('lib-tags-bar');
  if (!bar) return;
  if (_allTags.length === 0) { bar.innerHTML = ''; return; }
  bar.innerHTML = _allTags.map(t => `
    <span class="lib-tag-chip${_activeTags.has(t) ? ' active' : ''}" data-tag="${_esc(t)}">${_esc(t)}</span>
  `).join('');
  bar.querySelectorAll('.lib-tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const t = chip.dataset.tag;
      if (_activeTags.has(t)) _activeTags.delete(t); else _activeTags.add(t);
      _reload();
    });
  });
}

// ─── Render grid ──────────────────────────────────────────────────────────────

function _renderGrid() {
  const grid = document.getElementById('lib-grid');
  if (!grid) return;

  if (_results.length === 0) {
    grid.innerHTML = `<div class="lib-empty">No shader found.<br><small>Adjust the filters or search.</small></div>`;
    return;
  }

  grid.innerHTML = '';
  for (const p of _results) {
    const card = _buildCard(p);
    grid.appendChild(card);
  }
}

function _buildCard(p) {
  const card = document.createElement('div');
  card.className = 'lib-card' + (p.id === state.activeProjectId ? ' active' : '');
  card.dataset.id = p.id;

  const hasMP       = !!(p.multipass && Object.keys(p.multipass.passes || {}).length > 1);
  const hasMidi     = !!(p.code && /\biMidi\b|\bmidi\b/i.test(p.code));
  const hasTimeline = !!(p.code && /\biTimeline\b|\btimeline\b/i.test(p.code));

  const badges = [
    p.format && p.format !== 'glsl' ? `<span class="lib-card-badge ${p.format}">${p.format.toUpperCase()}</span>` : '',
    hasMP       ? '<span class="lib-card-badge mp">MP</span>'       : '',
    hasMidi     ? '<span class="lib-card-badge midi">MIDI</span>'   : '',
    hasTimeline ? '<span class="lib-card-badge tl">TL</span>'       : '',
  ].filter(Boolean).join('');

  const ago = _timeAgo(new Date(p.updatedAt));
  const tagsHTML = (p.tags || []).map(t =>
    `<span class="lib-card-tag">${_esc(t)}</span>`
  ).join('');

  card.innerHTML = `
    <div class="lib-card-thumb" id="libthumb-${p.id}">▶</div>
    <div class="lib-card-body">
      <div class="lib-card-name">${_esc(p.name)}</div>
      <div class="lib-card-meta">
        <span>${ago}</span>
        ${badges}
      </div>
      <div class="lib-card-tags">${tagsHTML}</div>
    </div>
    <div class="lib-card-footer">
      <button class="lib-card-btn load" data-action="load"     title="Load">↩ Load</button>
      <button class="lib-card-btn"      data-action="tags"     title="Edit tags">🏷</button>
      <button class="lib-card-btn"      data-action="collect"  title="Add to collection">📁</button>
      <button class="lib-card-btn"      data-action="export"   title="Export JSON">⬇</button>
      <button class="lib-card-btn del"  data-action="delete"   title="Delete">✕</button>
    </div>
  `;

  // Lazy thumbnail
  getThumbnail(p.id).then(url => {
    if (!url) return;
    const th = card.querySelector(`#libthumb-${p.id}`);
    if (th) th.innerHTML = `<img src="${url}" alt="preview" loading="lazy"/>`;
  });

  // Actions
  card.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    const action = btn.dataset.action;

    if (action === 'load') {
      const ok = await loadProject(p.id);
      if (ok) { _toast('✔ Project loaded'); _renderGrid(); }
    } else if (action === 'export') {
      await exportProjectJSON(p.id);
    } else if (action === 'delete') {
      if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
      await deleteProject(p.id);
      await _reload();
    } else if (action === 'tags') {
      _openTagEditor(card, p);
    } else if (action === 'collect') {
      await _promptAddToCollection(p.id);
    }
  });

  return card;
}

// ─── Tag editor inline ────────────────────────────────────────────────────────

function _openTagEditor(card, p) {
  // Close any existing editor
  document.querySelectorAll('.lib-tag-editor').forEach(e => e.remove());

  const editor = document.createElement('div');
  editor.className = 'lib-tag-editor';
  const currentTags = (p.tags || []).join(', ');
  editor.innerHTML = `
    <h4>Tags — ${_esc(p.name)}</h4>
    <input type="text" id="lib-tag-input" placeholder="tag1, tag2, vj, abstract…"
           value="${_esc(currentTags)}" autocomplete="off"/>
    <small style="font-size:9px;color:var(--fg2)">Séparés par des virgules</small>
    <div class="lib-tag-editor-actions">
      <button class="cancel">Annuler</button>
      <button class="save">Sauver</button>
    </div>
  `;
  card.style.position = 'relative';
  card.appendChild(editor);

  editor.querySelector('input').focus();

  editor.querySelector('.cancel').addEventListener('click', () => editor.remove());
  editor.querySelector('.save').addEventListener('click', async () => {
    const raw   = editor.querySelector('input').value;
    const tags  = raw.split(',').map(t => t.trim()).filter(Boolean);
    await setProjectTags(p.id, tags);
    _toast(`🏷 Tags saved for "${p.name}"`);
    editor.remove();
    await _reload();
  });
}

// ─── Add to collection picker ─────────────────────────────────────────────────

async function _promptAddToCollection(projectId) {
  if (_collections.length === 0) {
    const name = prompt('New collection name:')?.trim();
    if (!name) return;
    const coll = await createCollection(name);
    await addToCollection(coll.id, projectId);
    _toast(`📁 Added to "${name}"`);
    await _reload();
    return;
  }
  const opts = _collections.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
  const ans  = prompt(`Add to which collection?\n${opts}\n\n(enter the number, or 0 to create):`);
  if (ans === null) return;
  const idx = parseInt(ans) - 1;
  if (ans.trim() === '0') {
    const name = prompt('New collection name:')?.trim();
    if (!name) return;
    const coll = await createCollection(name);
    await addToCollection(coll.id, projectId);
    _toast(`📁 Collection "${name}" created`);
  } else if (idx >= 0 && idx < _collections.length) {
    await addToCollection(_collections[idx].id, projectId);
    _toast(`📁 Added to "${_collections[idx].name}"`);
  }
  await _reload();
}

// ─── Result count ─────────────────────────────────────────────────────────────

function _renderResultCount() {
  const el = document.getElementById('lib-result-count');
  if (el) el.textContent = `${_results.length} shader${_results.length !== 1 ? 's' : ''}`;
}

// ─── Events ───────────────────────────────────────────────────────────────────

function _bindEvents() {
  document.getElementById('lib-close')?.addEventListener('click', closePanel);

  document.getElementById('lib-search')?.addEventListener('input', (e) => {
    _query = e.target.value;
    _debounceSearch();
  });

  // Filter buttons
  document.getElementById('lib-filters')?.querySelectorAll('.lib-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.filter;
      btn.classList.toggle('active');
      if (['glsl', 'wgsl', 'hlsl'].includes(f)) {
        // Format: toggle off others
        document.querySelectorAll('.lib-filter-btn[data-filter="glsl"],.lib-filter-btn[data-filter="wgsl"],.lib-filter-btn[data-filter="hlsl"]')
          .forEach(b => b !== btn && b.classList.remove('active'));
        _filters.format = btn.classList.contains('active') ? f : undefined;
      } else {
        const map = { multipass: 'hasMultipass', webgpu: 'hasWebGPU', midi: 'hasMidi', timeline: 'hasTimeline' };
        const key = map[f];
        if (key) _filters[key] = btn.classList.contains('active') ? true : undefined;
      }
      _reload();
    });
  });

  document.getElementById('lib-date-filter')?.addEventListener('change', () => _reload());

  // "Tous les projets" row
  document.querySelector(`[data-coll-id=""]`)?.addEventListener('click', () => {
    _activeCollId = null;
    _reload();
  });

  // New collection
  document.getElementById('lib-new-coll-btn')?.addEventListener('click', async () => {
    const name = prompt('New collection name:')?.trim();
    if (!name) return;
    try {
      await createCollection(name);
      _toast(`📁 Collection "${name}" created`);
      await _reload();
    } catch (err) { _toast('⚠ ' + err.message); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _open) closePanel();
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F' && !_open) openPanel();
  });
}

// ─── Debounce search ──────────────────────────────────────────────────────────

let _searchTimer = null;
function _debounceSearch() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => _reload(), 180);
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function _toast(msg) {
  let el = document.getElementById('z-gl-lib-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'z-gl-lib-toast';
    Object.assign(el.style, {
      position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
      background: 'var(--bg3, #181825)', border: '1px solid var(--accent, #7b6fff)',
      color: 'var(--fg, #cdd6f4)', borderRadius: '5px', padding: '5px 14px',
      fontSize: '11px', zIndex: '290', fontFamily: 'var(--font, monospace)',
      opacity: '0', transition: 'opacity .2s', pointerEvents: 'none',
    });
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._to);
  el._to = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

function _timeAgo(date) {
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'À l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function initShaderLibraryPanel() {
  if (_inited) return;
  _inited = true;
  await initLibraryDB();
  await reindexAll();
  _injectCSS();
  _panel = _buildHTML();
  _bindEvents();
}

export function openPanel() {
  if (!_inited) { initShaderLibraryPanel().then(openPanel); return; }
  _panel.classList.add('open');
  _open = true;
  // Focus search
  setTimeout(() => document.getElementById('lib-search')?.focus(), 50);
  _reload();
}

export function closePanel() {
  if (!_panel) return;
  _panel.classList.remove('open');
  _open = false;
}

export function togglePanel() {
  if (_open) closePanel(); else openPanel();
}

export function isOpen() { return _open; }
