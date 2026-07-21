/**
 * src/ui/version-history-panel.js — Phase 20.2
 *
 * Panneau d'historique de versions Git-like.
 * Raccourci : Ctrl+Shift+Z  (ou bouton toolbar)
 *
 * Sections :
 *   ① Branches — switcher + créer + supprimer
 *   ② Slider temporel — scrubber sur toute la timeline de la branche
 *   ③ Liste de commits — thumbnail, message, date, ±lignes
 *   ④ Diff Monaco — comparaison textuelle entre deux commits sélectionnés
 */

import {
  initHistoryDB,
  listBranches, getActiveBranch, setActiveBranch, createBranch, deleteBranch,
  getCommits, getCommit, commit, checkoutCommit, exportCommitAsFile,
  diffCommits, pruneHistory,
} from './version-history.js';
import { state } from '../core/state.js';
import { makeDraggablePersistent } from './panel-manager.js';

const PANEL_ID = 'z-gl-vh-panel';

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
#${PANEL_ID} {
  position: fixed;
  top: 40px; right: 8px;
  width: 340px;
  max-height: calc(100vh - 56px);
  background: var(--bg2, #1e1e2e);
  border: 1px solid var(--border, #333);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 32px rgba(0,0,0,.55);
  z-index: 263;
  font-family: var(--font, 'JetBrains Mono', monospace);
  font-size: 12px;
  color: var(--fg, #cdd6f4);
  display: none;
  flex-direction: column;
  user-select: none;
  overflow: hidden;
}
#${PANEL_ID}.open { display: flex; }

/* Header */
#${PANEL_ID} .vh-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px 6px;
  background: var(--bg3, #181825);
  border-bottom: 1px solid var(--border, #333);
  flex-shrink: 0;
}
#${PANEL_ID} .vh-title {
  font-size: 11px; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; color: var(--mauve, #cba6f7);
  display: flex; align-items: center; gap: 6px;
}
#${PANEL_ID} .vh-close {
  background: none; border: none;
  color: var(--fg2, #6c7086); cursor: pointer;
  font-size: 15px; padding: 0 2px; line-height: 1;
}
#${PANEL_ID} .vh-close:hover { color: var(--fg, #cdd6f4); }

/* Toolbar */
#${PANEL_ID} .vh-toolbar {
  display: flex; gap: 4px; padding: 7px 10px;
  border-bottom: 1px solid var(--border-faint, #2a2a3a);
  flex-shrink: 0;
}
#${PANEL_ID} .vh-btn {
  flex: 1;
  background: var(--bg3, #181825);
  border: 1px solid var(--border, #333);
  color: var(--fg, #cdd6f4);
  border-radius: 4px; padding: 4px 6px;
  font-size: 10px; cursor: pointer; font-family: inherit;
  transition: background .1s;
  white-space: nowrap;
}
#${PANEL_ID} .vh-btn:hover {
  background: var(--accent-dim, rgba(123,111,255,.15));
  border-color: var(--accent, #7b6fff);
  color: var(--accent, #7b6fff);
}
#${PANEL_ID} .vh-btn.accent {
  background: var(--accent, #7b6fff);
  border-color: var(--accent, #7b6fff); color: #fff;
}
#${PANEL_ID} .vh-btn.accent:hover { background: var(--accent-bright, #9b8fff); }
#${PANEL_ID} .vh-btn:disabled { opacity: .4; cursor: default; }

/* Branches */
#${PANEL_ID} .vh-branches {
  padding: 7px 10px 4px;
  border-bottom: 1px solid var(--border-faint, #2a2a3a);
  flex-shrink: 0;
}
#${PANEL_ID} .vh-branch-row {
  display: flex; align-items: center; gap: 5px; margin-bottom: 5px;
}
#${PANEL_ID} .vh-branch-row label {
  font-size: 9px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--fg2, #6c7086); width: 44px; flex-shrink: 0;
}
#${PANEL_ID} .vh-branch-select {
  flex: 1;
  background: var(--bg3, #181825);
  border: 1px solid var(--border, #333);
  color: var(--fg, #cdd6f4);
  border-radius: 4px; padding: 3px 6px;
  font-family: inherit; font-size: 11px;
}
#${PANEL_ID} .vh-branch-select:focus { outline: none; border-color: var(--accent, #7b6fff); }
#${PANEL_ID} .vh-branch-actions {
  display: flex; gap: 3px;
}
#${PANEL_ID} .vh-branch-btn {
  background: var(--bg3, #181825);
  border: 1px solid var(--border, #333);
  color: var(--fg2, #6c7086);
  border-radius: 3px; padding: 2px 5px;
  font-size: 10px; cursor: pointer; font-family: inherit;
}
#${PANEL_ID} .vh-branch-btn:hover { color: var(--fg, #cdd6f4); border-color: var(--fg2, #6c7086); }
#${PANEL_ID} .vh-branch-btn.del:hover { color: var(--red, #f38ba8); border-color: var(--red, #f38ba8); }
#${PANEL_ID} .vh-branch-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}

/* Slider */
#${PANEL_ID} .vh-slider-section {
  padding: 6px 10px 4px;
  border-bottom: 1px solid var(--border-faint, #2a2a3a);
  flex-shrink: 0;
}
#${PANEL_ID} .vh-slider-label {
  display: flex; justify-content: space-between;
  font-size: 9px; color: var(--fg2, #6c7086); margin-bottom: 4px;
  text-transform: uppercase; letter-spacing: .07em;
}
#${PANEL_ID} .vh-slider {
  width: 100%; accent-color: var(--mauve, #cba6f7);
  cursor: pointer;
}
#${PANEL_ID} .vh-slider-preview {
  display: flex; align-items: center; gap: 7px; margin-top: 4px;
  font-size: 9px; color: var(--fg2, #6c7086);
}
#${PANEL_ID} .vh-slider-thumb {
  width: 32px; height: 18px; border-radius: 2px;
  background: var(--bg3, #181825);
  border: 1px solid var(--border, #333);
  overflow: hidden; flex-shrink: 0;
}
#${PANEL_ID} .vh-slider-thumb img { width: 100%; height: 100%; display: block; object-fit: cover; }

/* Commit list */
#${PANEL_ID} .vh-list-header {
  padding: 5px 10px 2px;
  font-size: 9px; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; color: var(--fg2, #6c7086);
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
#${PANEL_ID} .vh-list {
  flex: 1; overflow-y: auto; min-height: 0;
  padding: 0 6px 4px;
}
#${PANEL_ID} .vh-list::-webkit-scrollbar { width: 4px; }
#${PANEL_ID} .vh-list::-webkit-scrollbar-thumb { background: var(--border, #333); border-radius: 2px; }

#${PANEL_ID} .vh-commit {
  display: flex; align-items: flex-start; gap: 7px;
  padding: 6px 7px;
  border-radius: 5px;
  cursor: pointer;
  border: 1px solid transparent;
  margin-bottom: 2px;
  transition: background .1s;
  position: relative;
}
#${PANEL_ID} .vh-commit:hover { background: var(--bg3, #181825); }
#${PANEL_ID} .vh-commit.active {
  background: rgba(203,166,247,.1);
  border-color: var(--mauve, #cba6f7);
}
#${PANEL_ID} .vh-commit.diff-b {
  background: rgba(137,220,235,.08);
  border-color: var(--sky, #89dceb);
}
#${PANEL_ID} .vh-commit.head-commit::before {
  content: 'HEAD';
  position: absolute; right: 7px; top: 5px;
  font-size: 8px; font-weight: 700; letter-spacing: .06em;
  color: var(--accent, #7b6fff);
  background: rgba(123,111,255,.15);
  border: 1px solid var(--accent, #7b6fff);
  border-radius: 3px; padding: 1px 4px;
}

#${PANEL_ID} .vh-c-thumb {
  width: 36px; height: 20px; border-radius: 2px;
  background: var(--bg3, #181825);
  border: 1px solid var(--border, #333);
  flex-shrink: 0; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  font-size: 7px; color: var(--fg2, #6c7086);
}
#${PANEL_ID} .vh-c-thumb img { width: 100%; height: 100%; display: block; object-fit: cover; }
#${PANEL_ID} .vh-c-info { flex: 1; min-width: 0; }
#${PANEL_ID} .vh-c-msg {
  font-size: 11px; font-weight: 600; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
  color: var(--fg, #cdd6f4);
  padding-right: 38px;
}
#${PANEL_ID} .vh-c-meta {
  font-size: 9px; color: var(--fg2, #6c7086);
  display: flex; gap: 8px; margin-top: 2px;
}
#${PANEL_ID} .vh-c-delta-plus  { color: var(--green, #a6e3a1); }
#${PANEL_ID} .vh-c-delta-minus { color: var(--red,   #f38ba8); }
#${PANEL_ID} .vh-c-id {
  font-size: 8px; color: var(--fg2, #6c7086);
  font-variant-numeric: tabular-nums; opacity: .6;
}

#${PANEL_ID} .vh-commit-actions {
  display: none; gap: 2px; flex-shrink: 0;
  position: absolute; bottom: 5px; right: 6px;
}
#${PANEL_ID} .vh-commit:hover .vh-commit-actions { display: flex; }
#${PANEL_ID} .vh-ca-btn {
  background: var(--bg2, #1e1e2e);
  border: 1px solid var(--border, #333);
  color: var(--fg2, #6c7086);
  border-radius: 3px; padding: 1px 5px;
  font-size: 9px; cursor: pointer; font-family: inherit;
}
#${PANEL_ID} .vh-ca-btn:hover { color: var(--fg, #cdd6f4); border-color: var(--fg2, #6c7086); }
#${PANEL_ID} .vh-ca-btn.load { color: var(--mauve, #cba6f7); border-color: var(--mauve, #cba6f7); }
#${PANEL_ID} .vh-ca-btn.diff { color: var(--sky, #89dceb); border-color: var(--sky, #89dceb); }

/* Diff section */
#${PANEL_ID} .vh-diff-section {
  border-top: 1px solid var(--border, #333);
  flex-shrink: 0; display: none; flex-direction: column;
  max-height: 280px;
}
#${PANEL_ID} .vh-diff-section.open { display: flex; }
#${PANEL_ID} .vh-diff-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 5px 10px;
  background: var(--bg3, #181825);
  border-bottom: 1px solid var(--border, #333);
}
#${PANEL_ID} .vh-diff-title {
  font-size: 9px; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; color: var(--sky, #89dceb);
}
#${PANEL_ID} .vh-diff-stats {
  font-size: 9px; color: var(--fg2, #6c7086);
  display: flex; gap: 8px;
}
#${PANEL_ID} .vh-diff-close {
  background: none; border: none; color: var(--fg2, #6c7086);
  cursor: pointer; font-size: 13px; padding: 0 2px; line-height: 1;
}
#${PANEL_ID} .vh-diff-close:hover { color: var(--fg, #cdd6f4); }
#${PANEL_ID} .vh-diff-container {
  flex: 1; min-height: 160px; overflow: hidden;
}
#${PANEL_ID} .vh-diff-fallback {
  flex: 1; overflow-y: auto; padding: 8px 10px;
  font-size: 10px; line-height: 1.5; font-family: inherit;
  white-space: pre-wrap; word-break: break-all;
}
#${PANEL_ID} .vh-diff-fallback .diff-add { color: var(--green, #a6e3a1); background: rgba(166,227,161,.08); }
#${PANEL_ID} .vh-diff-fallback .diff-del { color: var(--red, #f38ba8); background: rgba(243,139,168,.08); }
#${PANEL_ID} .vh-diff-fallback .diff-ctx { color: var(--fg2, #6c7086); }

/* Footer */
#${PANEL_ID} .vh-footer {
  padding: 5px 10px;
  border-top: 1px solid var(--border, #333);
  font-size: 9px; color: var(--fg2, #6c7086);
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
#${PANEL_ID} .vh-footer-count { }
#${PANEL_ID} .vh-prune-btn {
  background: none; border: none; color: var(--fg2, #6c7086);
  cursor: pointer; font-size: 9px; font-family: inherit;
  text-decoration: underline; padding: 0;
}
#${PANEL_ID} .vh-prune-btn:hover { color: var(--red, #f38ba8); }

/* Empty state */
#${PANEL_ID} .vh-empty {
  text-align: center; color: var(--fg2, #6c7086);
  font-size: 11px; padding: 20px 16px; line-height: 1.7;
}
`;

// ─── State ────────────────────────────────────────────────────────────────────

let _panel    = null;
let _open     = false;
let _inited   = false;
let _commits  = [];
let _branches = [];
let _activeBranch = null;
let _activeProjectId = null;
let _selectedCommitId = null;  // for checkout / diff-A
let _diffBCommitId    = null;  // diff-B
let _diffEditor       = null;
let _diffOrigModel    = null;
let _diffModModel     = null;
let _sliderIndex      = 0;

// ─── Init ─────────────────────────────────────────────────────────────────────

function _injectCSS() {
  if (document.getElementById('z-gl-vh-css')) return;
  const s = document.createElement('style');
  s.id = 'z-gl-vh-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

function _buildHTML() {
  const el = document.createElement('div');
  el.id = PANEL_ID;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Historique de versions');
  el.innerHTML = `
    <div class="vh-header">
      <span class="vh-title">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <circle cx="6" cy="2" r="1.5" stroke="currentColor" stroke-width="1.1"/>
          <circle cx="6" cy="6" r="1.5" stroke="currentColor" stroke-width="1.1"/>
          <circle cx="6" cy="10" r="1.5" stroke="currentColor" stroke-width="1.1"/>
          <line x1="6" y1="3.5" x2="6" y2="4.5" stroke="currentColor" stroke-width="1"/>
          <line x1="6" y1="7.5" x2="6" y2="8.5" stroke="currentColor" stroke-width="1"/>
        </svg>
        History
      </span>
      <button class="vh-close" title="Close (Esc)">✕</button>
    </div>

    <div class="vh-toolbar">
      <button class="vh-btn accent" id="vh-btn-commit">+ Commit</button>
      <button class="vh-btn" id="vh-btn-new-branch">⎇ Branch</button>
      <button class="vh-btn" id="vh-btn-diff-toggle" style="display:none">Diff ✕</button>
    </div>

    <div class="vh-branches">
      <div class="vh-branch-row">
        <label for="vh-branch-sel">Branch</label>
        <span class="vh-branch-dot" id="vh-branch-dot"></span>
        <select class="vh-branch-select" id="vh-branch-sel"></select>
        <div class="vh-branch-actions">
          <button class="vh-branch-btn del" id="vh-branch-del" title="Delete branch">✕</button>
        </div>
      </div>
    </div>

    <div class="vh-slider-section">
      <div class="vh-slider-label">
        <span>↩ Time slider</span>
        <span id="vh-slider-pos">— / —</span>
      </div>
      <input type="range" class="vh-slider" id="vh-slider" min="0" max="0" value="0"/>
      <div class="vh-slider-preview">
        <div class="vh-slider-thumb" id="vh-slider-thumb"></div>
        <span id="vh-slider-info">Select a commit</span>
      </div>
    </div>

    <div class="vh-list-header">
      <span>Commits</span>
      <span id="vh-commit-count" style="color:var(--fg2,#6c7086)"></span>
    </div>
    <div class="vh-list" id="vh-list"></div>

    <div class="vh-diff-section" id="vh-diff-section">
      <div class="vh-diff-header">
        <span class="vh-diff-title">Diff</span>
        <div class="vh-diff-stats" id="vh-diff-stats"></div>
        <button class="vh-diff-close" id="vh-diff-close">✕</button>
      </div>
      <div class="vh-diff-container" id="vh-diff-container"></div>
    </div>

    <div class="vh-footer">
      <span class="vh-footer-count" id="vh-footer-count"></span>
      <button class="vh-prune-btn" id="vh-prune-btn">Prune…</button>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

function _bindEvents() {
  _panel.querySelector('.vh-close').addEventListener('click', closePanel);

  document.getElementById('vh-btn-commit')?.addEventListener('click', async () => {
    const pid = _activeProjectId || state.activeProjectId;
    if (!pid) { _toast('⚠ Open a project first'); return; }
    const msg = prompt('Commit message:', '') ?? null;
    if (msg === null) return;
    const c = await commit(pid, msg, { force: true });
    if (!c) { _toast('No changes to commit'); return; }
    _toast('✔ Commit created');
    await _reload();
  });

  document.getElementById('vh-btn-new-branch')?.addEventListener('click', async () => {
    const pid = _activeProjectId || state.activeProjectId;
    if (!pid) { _toast('⚠ Open a project first'); return; }
    const name = prompt('New branch name:')?.trim();
    if (!name) return;
    try {
      const b = await createBranch(pid, name, _activeBranch?.headCommitId);
      await setActiveBranch(pid, b.id);
      _toast(`⎇ Branch "${name}" created`);
      await _reload();
    } catch (err) { _toast('⚠ ' + err.message); }
  });

  document.getElementById('vh-branch-sel')?.addEventListener('change', async (e) => {
    const pid = _activeProjectId || state.activeProjectId;
    if (!pid) return;
    await setActiveBranch(pid, e.target.value);
    await _reload();
  });

  document.getElementById('vh-branch-del')?.addEventListener('click', async () => {
    if (!_activeBranch) return;
    if (_branches.length <= 1) { _toast('⚠ Cannot delete the last branch'); return; }
    if (!confirm(`Delete branch "${_activeBranch.name}"? Commits will not be deleted.`)) return;
    await deleteBranch(_activeBranch.id);
    _toast(`Branch "${_activeBranch.name}" deleted`);
    await _reload();
  });

  document.getElementById('vh-slider')?.addEventListener('input', (e) => {
    _sliderIndex = parseInt(e.target.value);
    _updateSliderPreview();
  });

  document.getElementById('vh-slider')?.addEventListener('change', async (e) => {
    const c = _commits[parseInt(e.target.value)];
    if (!c) return;
    _selectedCommitId = c.id;
    await checkoutCommit(c.id);
    _renderList();
    _toast(`↩ Restored: ${c.message}`);
  });

  document.getElementById('vh-diff-close')?.addEventListener('click', () => {
    _diffBCommitId = null;
    _closeDiff();
    _renderList();
  });

  document.getElementById('vh-btn-diff-toggle')?.addEventListener('click', () => {
    _diffBCommitId = null;
    _closeDiff();
    document.getElementById('vh-btn-diff-toggle').style.display = 'none';
    _renderList();
  });

  document.getElementById('vh-prune-btn')?.addEventListener('click', async () => {
    const pid = _activeProjectId || state.activeProjectId;
    if (!pid) return;
    const keepStr = prompt('Keep the last N commits:', '100');
    const keep = parseInt(keepStr);
    if (!keep || keep < 1) return;
    const deleted = await pruneHistory(pid, keep);
    _toast(`🗑 ${deleted} commit(s) deleted`);
    await _reload();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _open) closePanel();
  });
}

// ─── Data load ────────────────────────────────────────────────────────────────

async function _reload() {
  const pid = _activeProjectId || state.activeProjectId;
  if (!pid) { _renderEmpty(); return; }

  _branches     = await listBranches(pid);
  _activeBranch = await getActiveBranch(pid);

  if (!_activeBranch && _branches.length === 0) {
    const cb = createBranch;
    _activeBranch = await cb(pid, 'main');
    _branches     = [_activeBranch];
  }

  _commits = _activeBranch
    ? await getCommits(pid, _activeBranch.id)
    : [];

  _renderBranches();
  _renderSlider();
  _renderList();
  _renderFooter();
}

// ─── Render branches ─────────────────────────────────────────────────────────

function _renderBranches() {
  const sel = document.getElementById('vh-branch-sel');
  const dot = document.getElementById('vh-branch-dot');
  if (!sel) return;
  sel.innerHTML = _branches.map(b =>
    `<option value="${b.id}" ${b.id === _activeBranch?.id ? 'selected' : ''}>${_esc(b.name)}</option>`
  ).join('');
  if (dot && _activeBranch) dot.style.background = _activeBranch.color || '#7b6fff';
}

// ─── Render slider ────────────────────────────────────────────────────────────

function _renderSlider() {
  const slider = document.getElementById('vh-slider');
  const posEl  = document.getElementById('vh-slider-pos');
  if (!slider) return;
  const max = Math.max(0, _commits.length - 1);
  slider.max = String(max);
  _sliderIndex = 0;
  slider.value = '0';
  posEl.textContent = _commits.length > 0 ? `${max + 1} commits` : '—';
  _updateSliderPreview();
}

function _updateSliderPreview() {
  const c        = _commits[_sliderIndex];
  const thumbEl  = document.getElementById('vh-slider-thumb');
  const infoEl   = document.getElementById('vh-slider-info');
  const posEl    = document.getElementById('vh-slider-pos');
  if (!thumbEl || !c) return;
  const idx  = _sliderIndex + 1;
  const tot  = _commits.length;
  posEl.textContent = `${idx} / ${tot}`;
  if (c.thumbDataURL) {
    thumbEl.innerHTML = `<img src="${c.thumbDataURL}" alt="preview"/>`;
  } else {
    thumbEl.innerHTML = '<span style="font-size:7px;color:var(--fg2)">∅</span>';
  }
  const d = new Date(c.timestamp);
  infoEl.textContent = `${c.message.slice(0, 28)} — ${d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}`;
}

// ─── Render list ─────────────────────────────────────────────────────────────

function _renderList() {
  const container = document.getElementById('vh-list');
  const countEl   = document.getElementById('vh-commit-count');
  if (!container) return;

  countEl.textContent = _commits.length ? `(${_commits.length})` : '';

  if (_commits.length === 0) {
    container.innerHTML = `<div class="vh-empty">No commits on this branch.<br>Click <strong>+ Commit</strong> to save the current state.</div>`;
    return;
  }

  container.innerHTML = '';
  const headId = _activeBranch?.headCommitId;

  for (const c of _commits) {
    const item = document.createElement('div');
    item.className = 'vh-commit'
      + (c.id === _selectedCommitId ? ' active' : '')
      + (c.id === _diffBCommitId ? ' diff-b' : '')
      + (c.id === headId ? ' head-commit' : '');

    const d = new Date(c.timestamp);
    const timeStr = d.toLocaleString('fr-FR', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const shortId = c.id.slice(-5);
    const delta   = c.linesChanged > 0 ? `+${c.linesChanged}` : c.linesChanged < 0 ? `${c.linesChanged}` : '·';
    const deltaClass = c.linesChanged > 0 ? 'vh-c-delta-plus' : c.linesChanged < 0 ? 'vh-c-delta-minus' : '';

    item.innerHTML = `
      <div class="vh-c-thumb" id="vhthumb-${c.id}">∅</div>
      <div class="vh-c-info">
        <div class="vh-c-msg">${_esc(c.message)}</div>
        <div class="vh-c-meta">
          <span>${timeStr}</span>
          <span class="${deltaClass}">${delta}</span>
          <span class="vh-c-id">${shortId}</span>
        </div>
      </div>
      <div class="vh-commit-actions">
        <button class="vh-ca-btn load" data-action="checkout" title="Charger ce commit">↩</button>
        <button class="vh-ca-btn diff" data-action="diff"     title="Comparer avec un autre commit">⇄</button>
        <button class="vh-ca-btn"     data-action="export"    title="Exporter en fichier">⬇</button>
      </div>
    `;

    if (c.thumbDataURL) {
      const thumbEl = item.querySelector(`#vhthumb-${c.id}`);
      if (thumbEl) thumbEl.innerHTML = `<img src="${c.thumbDataURL}" alt=""/>`;
    }

    item.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) {
        _selectedCommitId = c.id;
        _renderList();
        return;
      }
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'checkout') {
        _selectedCommitId = c.id;
        await checkoutCommit(c.id);
        _toast(`↩ Restored: ${c.message}`);
        _renderList();
      } else if (action === 'export') {
        await exportCommitAsFile(c.id);
      } else if (action === 'diff') {
        await _startDiff(c.id);
      }
    });

    container.appendChild(item);
  }
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

// §3.3 — extrait fonctions / uniforms / defines d'un source GLSL/WGSL.
function _extractSymbols(code) {
  const fns = new Set();
  const uniforms = new Set();
  let m;
  const fnRe = /\b(?:float|vec[234]|mat[234]|int|bool|void)\s+([A-Za-z_]\w*)\s*\(/g;
  while ((m = fnRe.exec(code)) !== null) fns.add(m[1]);
  const uniRe = /\buniform\s+\w+\s+([A-Za-z_]\w*)/g;
  while ((m = uniRe.exec(code)) !== null) uniforms.add(m[1]);
  const defRe = /#define\s+([A-Za-z_]\w*)/g;
  while ((m = defRe.exec(code)) !== null) uniforms.add(m[1]);
  return { fns, uniforms };
}

// Construit un petit résumé HTML « +ajoutés / −retirés » par catégorie.
function _symbolDiffSummary(codeA, codeB) {
  const a = _extractSymbols(codeA);
  const b = _extractSymbols(codeB);
  const diff = (setA, setB) => ({
    added: [...setB].filter(x => !setA.has(x)),
    removed: [...setA].filter(x => !setB.has(x)),
  });
  const parts = [];
  const render = (label, d) => {
    if (!d.added.length && !d.removed.length) return;
    const adds = d.added.map(n => `<span style="color:var(--green,#a6e3a1)">+${n}</span>`).join(' ');
    const rems = d.removed.map(n => `<span style="color:var(--red,#f38ba8)">−${n}</span>`).join(' ');
    parts.push(`<span style="margin-left:10px;color:var(--text-secondary)">${label}:</span> ${adds} ${rems}`);
  };
  render('fn', diff(a.fns, b.fns));
  render('uniform', diff(a.uniforms, b.uniforms));
  return parts.length ? `<span style="font-size:10px">${parts.join('')}</span>` : '';
}

async function _startDiff(commitIdB) {
  const ref = _selectedCommitId || (_commits[0]?.id);
  if (!ref) { _toast('⚠ Select a reference commit first (click on it)'); return; }
  if (ref === commitIdB) { _toast('Select two different commits'); return; }

  _diffBCommitId = commitIdB;
  _renderList();

  const result = await diffCommits(ref, commitIdB);
  if (!result) return;

  document.getElementById('vh-btn-diff-toggle').style.display = '';
  const section = document.getElementById('vh-diff-section');
  section.classList.add('open');

  const statsEl = document.getElementById('vh-diff-stats');
  // §3.3 — résumé des symboles (fonctions / uniforms / defines) changés
  const symSummary = _symbolDiffSummary(result.codeA, result.codeB);
  statsEl.innerHTML = `
    <span style="color:var(--green,#a6e3a1)">+${result.added}</span>
    <span style="color:var(--red,#f38ba8)">-${result.removed}</span>
    ${symSummary}
  `;

  const container = document.getElementById('vh-diff-container');
  container.innerHTML = '';

  if (typeof monaco !== 'undefined') {
    try {
      if (_diffEditor) { _diffEditor.dispose(); _diffEditor = null; }
      if (_diffOrigModel) { _diffOrigModel.dispose(); _diffOrigModel = null; }
      if (_diffModModel)  { _diffModModel.dispose();  _diffModModel  = null; }

      const lang = result.commitA.format === 'wgsl' ? 'wgsl' : 'glsl';
      _diffOrigModel = monaco.editor.createModel(result.codeA, lang);
      _diffModModel  = monaco.editor.createModel(result.codeB, lang);

      _diffEditor = monaco.editor.createDiffEditor(container, {
        automaticLayout:     true,
        readOnly:            true,
        renderSideBySide:    false,
        ignoreTrimWhitespace: false,
        theme:               'vs-dark',
        minimap:             { enabled: false },
        scrollBeyondLastLine: false,
        fontSize:            11,
        lineNumbers:         'on',
        folding:             false,
        glyphMargin:         false,
      });
      _diffEditor.setModel({ original: _diffOrigModel, modified: _diffModModel });
      container.style.height = '200px';
    } catch {
      _renderFallbackDiff(container, result.codeA, result.codeB);
    }
  } else {
    _renderFallbackDiff(container, result.codeA, result.codeB);
  }
}

function _renderFallbackDiff(container, codeA, codeB) {
  const linesA = codeA.split('\n');
  const linesB = codeB.split('\n');
  const setA   = new Set(linesA);
  const setB   = new Set(linesB);
  const pre    = document.createElement('div');
  pre.className = 'vh-diff-fallback';
  const frags = [];
  for (const l of linesA) {
    if (!setB.has(l)) frags.push(`<div class="diff-del">- ${_esc(l)}</div>`);
  }
  for (const l of linesB) {
    if (!setA.has(l)) frags.push(`<div class="diff-add">+ ${_esc(l)}</div>`);
    else frags.push(`<div class="diff-ctx">  ${_esc(l)}</div>`);
  }
  pre.innerHTML = frags.join('');
  container.appendChild(pre);
  container.style.height = '200px';
  container.style.overflowY = 'auto';
}

function _closeDiff() {
  const section = document.getElementById('vh-diff-section');
  if (section) section.classList.remove('open');
  if (_diffEditor) { _diffEditor.dispose(); _diffEditor = null; }
  if (_diffOrigModel) { _diffOrigModel.dispose(); _diffOrigModel = null; }
  if (_diffModModel)  { _diffModModel.dispose();  _diffModModel  = null; }
  const container = document.getElementById('vh-diff-container');
  if (container) container.innerHTML = '';
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function _renderFooter() {
  const el = document.getElementById('vh-footer-count');
  if (el) el.textContent = `${_commits.length} commit(s) · branche "${_activeBranch?.name || '—'}"`;
}

function _renderEmpty() {
  const list = document.getElementById('vh-list');
  if (list) list.innerHTML = `<div class="vh-empty">No active project.<br>Open a project from the <strong>Workspace</strong> panel (Ctrl+Shift+B) to use history.</div>`;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function _toast(msg) {
  let el = document.getElementById('z-gl-vh-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'z-gl-vh-toast';
    Object.assign(el.style, {
      position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
      background: 'var(--bg3, #181825)', border: '1px solid var(--accent, #7b6fff)',
      color: 'var(--fg, #cdd6f4)', borderRadius: '5px', padding: '5px 14px',
      fontSize: '11px', zIndex: '280', fontFamily: 'var(--font, monospace)',
      opacity: '0', transition: 'opacity .2s', pointerEvents: 'none',
    });
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._to);
  el._to = setTimeout(() => { el.style.opacity = '0'; }, 2400);
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


// ─── Public API ──────────────────────────────────────────────────────────────

export async function initVersionHistoryPanel() {
  if (_inited) return;
  _inited = true;
  await initHistoryDB();
  _injectCSS();
  _panel = _buildHTML();
  _bindEvents();
  makeDraggablePersistent(_panel, 'version-history-panel', _panel.querySelector('.vh-header'));
}

export function openPanel(projectId = null) {
  if (!_inited) { initVersionHistoryPanel().then(() => openPanel(projectId)); return; }
  if (projectId) _activeProjectId = projectId;
  _panel.classList.add('open');
  _open = true;
  _reload();
}

export function closePanel() {
  if (!_panel) return;
  _closeDiff();
  _panel.classList.remove('open');
  _open = false;
}

export function togglePanel(projectId = null) {
  if (_open) closePanel(); else openPanel(projectId);
}

export function isOpen() { return _open; }

export { commit as commitFromPanel };
