/**
 * block-palette.js — F-1.2 (Axe 1)
 *
 * Palette latérale rétractable de blocs GLSL organisés par catégorie.
 * Sources : EXTENDED_SNIPPETS (snippet-pack-extended.js) + COMMUNITY_SNIPPETS (snippet-library.js).
 *
 * Fonctionnalités :
 *   • Recherche full-text (nom, description, tags, code)
 *   • Aperçu du code au survol (tooltip)
 *   • Double-clic → insertGLSLBlock() pour insérer au curseur Monaco
 *   • Drag depuis un item → drop sur l'éditeur Monaco
 *
 * API publique :
 *   openBlockPalette()   — ouvre le panneau
 *   closeBlockPalette()  — ferme le panneau
 *   toggleBlockPalette() — bascule
 */

import { state } from '../core/state.js';
import { EXTENDED_SNIPPETS } from '../shader/snippet-pack-extended.js';
import { listSnippets } from './snippet-library.js';
import { smartInsert } from './smart-insert.js';
import { EXTERNAL_LIBS, libsByCategory } from '../shader/external-libs.js';

// ── État module ───────────────────────────────────────────────────────────────

let _panelEl = null;
let _open = false;
let _searchVal = '';
let _tooltipEl = null;
let _tooltipTimeout = null;
let _activeTab = 'blocks'; // 'blocks' | 'libs'

// ── API publique ──────────────────────────────────────────────────────────────

export function openBlockPalette() {
  if (!_panelEl) _buildPanel();
  _open = true;
  _panelEl.hidden = false;
  _panelEl.querySelector('#bpSearch')?.focus();
  _updateBtn(true);
}

export function closeBlockPalette() {
  _open = false;
  if (_panelEl) _panelEl.hidden = true;
  _hideTooltip();
  _updateBtn(false);
}

export function toggleBlockPalette() {
  _open ? closeBlockPalette() : openBlockPalette();
}

// ── Insertion au curseur Monaco ───────────────────────────────────────────────

export function insertGLSLBlock(code, _position) {
  // Delegate to smartInsert for intelligent placement (function/uniform/inline)
  if (smartInsert(code, 'auto')) return;
  // Fallback: raw inline insert at cursor (e.g., duplicates that were skipped)
  const ed = state.editor;
  if (!ed) return;
  const sel = ed.getSelection();
  const range = _position
    ? { startLineNumber: _position.lineNumber, startColumn: _position.column,
        endLineNumber:   _position.lineNumber, endColumn:   _position.column }
    : (sel && !sel.isEmpty()
        ? sel
        : { startLineNumber: sel.positionLineNumber, startColumn: sel.positionColumn,
            endLineNumber:   sel.positionLineNumber, endColumn:   sel.positionColumn });
  ed.executeEdits('block-palette', [{ range, text: '\n' + code + '\n', forceMoveMarkers: true }]);
  ed.focus();
}

// ── Construction du panneau ───────────────────────────────────────────────────

function _buildPanel() {
  _injectStyles();

  const panel = document.createElement('div');
  panel.id = 'bpPanel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Palette de blocs GLSL');
  panel.innerHTML = `
    <div id="bpHeader">
      <span id="bpTitle">GLSL Blocks</span>
      <button id="bpClose" aria-label="Close palette">✕</button>
    </div>
    <div id="bpTabs">
      <button class="bp-tab active" data-tab="blocks">Blocks</button>
      <button class="bp-tab" data-tab="libs">Libraries</button>
    </div>
    <div id="bpSearchWrap">
      <input id="bpSearch" type="search" placeholder="Search…" autocomplete="off" spellcheck="false" aria-label="Search GLSL blocks">
    </div>
    <div id="bpBody"></div>
  `;

  document.body.appendChild(panel);
  _panelEl = panel;

  // Tooltip global
  _tooltipEl = document.createElement('pre');
  _tooltipEl.id = 'bpTooltip';
  _tooltipEl.hidden = true;
  document.body.appendChild(_tooltipEl);

  // Événements
  panel.querySelector('#bpClose').addEventListener('click', closeBlockPalette);
  const searchEl = panel.querySelector('#bpSearch');
  searchEl.addEventListener('input', () => {
    _searchVal = searchEl.value;
    _renderCurrent();
  });
  searchEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeBlockPalette();
  });

  // Onglets
  panel.querySelectorAll('.bp-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.bp-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _activeTab = btn.dataset.tab;
      const searchWrap = panel.querySelector('#bpSearchWrap');
      if (searchWrap) searchWrap.style.display = _activeTab === 'blocks' ? '' : 'none';
      _renderCurrent();
    });
  });

  // Drag-and-drop drop target sur Monaco
  _setupEditorDrop();

  _renderCurrent();
}

function _allBlocks() {
  const ext = EXTENDED_SNIPPETS.map(s => ({
    id: s.id,
    name: s.name,
    category: s.category || 'Divers',
    tags: s.tags || [],
    desc: s.desc || '',
    code: s.code,
  }));

  const community = listSnippets('').map(s => ({
    id: s.id,
    name: s.name,
    category: 'Community',
    tags: s.tags || [],
    desc: '',
    code: s.code,
  }));

  // Déduplique par id (extended prioritaire)
  const seen = new Set(ext.map(s => s.id));
  const merged = [...ext, ...community.filter(s => !seen.has(s.id))];
  return merged;
}

function _filter(blocks, query) {
  if (!query) return blocks;
  const q = query.toLowerCase();
  return blocks.filter(b =>
    b.name.toLowerCase().includes(q) ||
    (b.desc && b.desc.toLowerCase().includes(q)) ||
    b.tags.some(t => t.toLowerCase().includes(q)) ||
    b.category.toLowerCase().includes(q) ||
    b.code.toLowerCase().includes(q)
  );
}

function _renderCurrent() {
  if (_activeTab === 'libs') _renderLibs();
  else _renderList(_searchVal);
}

function _renderLibs() {
  const body = _panelEl.querySelector('#bpBody');
  body.innerHTML = '';
  const cats = libsByCategory();
  for (const { category, libs } of cats) {
    const catDiv = document.createElement('div');
    catDiv.className = 'bp-cat';
    catDiv.textContent = category;
    body.appendChild(catDiv);
    for (const lib of libs) {
      const item = document.createElement('div');
      item.className = 'bp-lib-item';
      item.dataset.id = lib.id;
      item.innerHTML = `
        <div class="bp-lib-name">${lib.name} <span class="bp-lib-size">${lib.size}</span></div>
        <div class="bp-lib-desc">${lib.desc}</div>
        <div class="bp-lib-provides">${lib.provides.slice(0, 6).map(p => `<span class="bp-lib-tag">${p}</span>`).join('')}${lib.provides.length > 6 ? `<span class="bp-lib-tag">+${lib.provides.length - 6}</span>` : ''}</div>
      `;
      // Clic → insérer la bibliothèque via smartInsert
      item.addEventListener('click', () => {
        smartInsert(lib.code, 'function', { skipDuplicates: true });
      });
      body.appendChild(item);
    }
  }
}

function _renderList(query) {
  const body = _panelEl.querySelector('#bpBody');
  body.innerHTML = '';
  const blocks = _filter(_allBlocks(), query);

  if (!blocks.length) {
    body.innerHTML = '<div id="bpEmpty">No blocks found.</div>';
    return;
  }

  // Grouper par catégorie
  const groups = {};
  for (const b of blocks) {
    if (!groups[b.category]) groups[b.category] = [];
    groups[b.category].push(b);
  }

  for (const [cat, items] of Object.entries(groups)) {
    const section = document.createElement('div');
    section.className = 'bp-section';

    const header = document.createElement('div');
    header.className = 'bp-cat';
    header.textContent = cat;
    header.title = `${items.length} bloc(s)`;
    header.addEventListener('click', () => {
      const list = section.querySelector('.bp-list');
      if (list) list.hidden = !list.hidden;
      header.classList.toggle('collapsed', list ? list.hidden : false);
    });
    section.appendChild(header);

    const list = document.createElement('div');
    list.className = 'bp-list';
    for (const b of items) {
      list.appendChild(_makeItem(b));
    }
    section.appendChild(list);
    body.appendChild(section);
  }
}

function _makeItem(block) {
  const div = document.createElement('div');
  div.className = 'bp-item';
  div.draggable = true;
  div.dataset.id = block.id;
  div.setAttribute('role', 'option');
  div.title = block.desc || block.name;

  div.innerHTML = `
    <span class="bp-item-name">${_esc(block.name)}</span>
    ${block.tags.length ? `<span class="bp-item-tags">${block.tags.slice(0, 3).map(_esc).join(' ')}</span>` : ''}
  `;

  // Tooltip au survol
  div.addEventListener('mouseenter', e => {
    clearTimeout(_tooltipTimeout);
    _tooltipTimeout = setTimeout(() => _showTooltip(e, block.code), 400);
  });
  div.addEventListener('mouseleave', () => {
    clearTimeout(_tooltipTimeout);
    _hideTooltip();
  });

  // Double-clic → insérer au curseur
  div.addEventListener('dblclick', () => {
    insertGLSLBlock(block.code);
  });

  // Clic simple → sélection visuelle
  div.addEventListener('click', () => {
    _panelEl.querySelectorAll('.bp-item').forEach(el => el.classList.remove('active'));
    div.classList.add('active');
  });

  // Drag start
  div.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', block.code);
    e.dataTransfer.setData('application/x-glsl-block', block.id);
    e.dataTransfer.effectAllowed = 'copy';
    div.classList.add('dragging');
  });
  div.addEventListener('dragend', () => div.classList.remove('dragging'));

  return div;
}

// ── Drag-and-drop sur l'éditeur Monaco ───────────────────────────────────────

function _setupEditorDrop() {
  const editorContainer = document.getElementById('editor') || document.querySelector('.monaco-editor');
  if (!editorContainer) {
    // Retry après le chargement de Monaco
    setTimeout(_setupEditorDrop, 1000);
    return;
  }

  editorContainer.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('application/x-glsl-block')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  editorContainer.addEventListener('drop', e => {
    if (!e.dataTransfer.types.includes('application/x-glsl-block')) return;
    e.preventDefault();
    const code = e.dataTransfer.getData('text/plain');
    if (!code || !state.editor) return;
    // Convertir les coordonnées px en position Monaco
    const target = state.editor.getTargetAtClientPoint(e.clientX, e.clientY);
    const pos = target?.position || state.editor.getPosition();
    if (pos) insertGLSLBlock(code, pos);
  });
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

function _showTooltip(e, code) {
  if (!_tooltipEl) return;
  const maxLines = 20;
  const lines = code.split('\n');
  const preview = lines.slice(0, maxLines).join('\n') + (lines.length > maxLines ? '\n…' : '');
  _tooltipEl.textContent = preview;
  _tooltipEl.hidden = false;

  const rect = e.currentTarget.getBoundingClientRect();
  const tw = 320, th = Math.min(lines.length * 16 + 16, 360);
  let x = rect.right + 8;
  let y = rect.top;
  if (x + tw > window.innerWidth) x = rect.left - tw - 8;
  if (y + th > window.innerHeight) y = window.innerHeight - th - 8;
  _tooltipEl.style.left = x + 'px';
  _tooltipEl.style.top  = Math.max(8, y) + 'px';
}

function _hideTooltip() {
  if (_tooltipEl) _tooltipEl.hidden = true;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _updateBtn(active) {
  const btn = document.getElementById('blockPaletteBtn');
  btn?.classList.toggle('active', active);
  btn?.setAttribute('aria-pressed', String(active));
}

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Styles ────────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('bpStyles')) return;
  const style = document.createElement('style');
  style.id = 'bpStyles';
  style.textContent = `
    #bpPanel {
      position: fixed;
      top: 0; right: 0; bottom: 0;
      width: 260px;
      background: var(--bg-surface, #1a1d22);
      border-left: 1px solid var(--border, #2a2d32);
      z-index: 900;
      display: flex;
      flex-direction: column;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--prose, #ccc);
      box-shadow: -4px 0 24px rgba(0,0,0,.4);
    }
    #bpPanel[hidden] { display: none; }
    #bpHeader {
      display: flex; align-items: center; gap: 6px;
      padding: 10px 10px 8px;
      border-bottom: 1px solid var(--border, #2a2d32);
      flex-shrink: 0;
    }
    #bpTitle { font-weight: 600; font-size: 13px; flex: 1; }
    #bpSearch {
      background: var(--bg-deep, #111316);
      border: 1px solid var(--border, #2a2d32);
      border-radius: 4px;
      color: var(--prose, #ccc);
      padding: 3px 7px;
      font-size: 11px;
      width: 100px;
      outline: none;
    }
    #bpSearch:focus { border-color: var(--accent, #5b8df6); }
    #bpClose {
      background: none; border: none; color: var(--t3, #666);
      cursor: pointer; font-size: 13px; padding: 2px 4px;
    }
    #bpClose:hover { color: var(--prose, #ccc); }
    #bpBody {
      flex: 1; overflow-y: auto; padding: 4px 0;
    }
    #bpEmpty { padding: 16px; color: var(--t3, #666); text-align: center; }
    .bp-section { }
    .bp-cat {
      padding: 6px 10px 4px;
      font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--t3, #666);
      cursor: pointer;
      user-select: none;
    }
    .bp-cat:hover { color: var(--prose, #ccc); }
    .bp-cat.collapsed::before { content: '▶ '; }
    .bp-cat:not(.collapsed)::before { content: '▼ '; }
    .bp-list { }
    .bp-list[hidden] { display: none; }
    .bp-item {
      display: flex; align-items: baseline; gap: 6px;
      padding: 4px 10px 4px 16px;
      cursor: pointer;
      border-radius: 3px;
      white-space: nowrap; overflow: hidden;
    }
    .bp-item:hover { background: var(--hover, rgba(255,255,255,.06)); }
    .bp-item.active { background: var(--accent-dim, rgba(91,141,246,.18)); }
    .bp-item.dragging { opacity: 0.5; }
    .bp-item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }
    .bp-item-tags { font-size: 9px; color: var(--t3, #666); white-space: nowrap; }
    #bpTooltip {
      position: fixed;
      z-index: 9999;
      background: var(--bg-deep, #0e1012);
      border: 1px solid var(--border, #2a2d32);
      border-radius: 6px;
      padding: 10px 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--prose, #ccc);
      white-space: pre;
      max-width: 340px;
      max-height: 380px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,.5);
      pointer-events: none;
      line-height: 1.5;
    }
    #bpTooltip[hidden] { display: none; }
    #bpTabs {
      display: flex; border-bottom: 1px solid var(--border, #2a2d32);
      flex-shrink: 0;
    }
    .bp-tab {
      flex: 1; padding: 6px; font-size: 11px; border: none;
      background: transparent; color: var(--t3, #888); cursor: pointer;
      font-family: inherit; border-bottom: 2px solid transparent;
    }
    .bp-tab.active { color: var(--prose, #ccc); border-bottom-color: var(--accent, #5b8df6); }
    #bpSearchWrap { padding: 6px 8px; flex-shrink: 0; }
    #bpSearch {
      background: var(--bg-deep, #111316);
      border: 1px solid var(--border, #2a2d32);
      border-radius: 4px;
      color: var(--prose, #ccc);
      padding: 4px 8px;
      font-size: 11px;
      width: 100%;
      outline: none;
      box-sizing: border-box;
      font-family: inherit;
    }
    #bpSearch:focus { border-color: var(--accent, #5b8df6); }
    .bp-lib-item {
      padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.04);
      cursor: pointer;
    }
    .bp-lib-item:hover { background: var(--hover, rgba(255,255,255,.06)); }
    .bp-lib-name { font-size: 12px; font-weight: 600; margin-bottom: 3px; }
    .bp-lib-size { font-size: 9px; color: var(--t3, #666); font-weight: normal; margin-left: 6px; }
    .bp-lib-desc { font-size: 10px; color: var(--t3, #888); margin-bottom: 4px; line-height: 1.4; }
    .bp-lib-provides { display: flex; flex-wrap: wrap; gap: 3px; }
    .bp-lib-tag {
      font-size: 9px; background: rgba(91,141,246,.15); color: var(--accent, #5b8df6);
      border-radius: 3px; padding: 1px 5px;
    }
  `;
  document.head.appendChild(style);
}
