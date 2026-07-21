// F-8.2 — Includes Manager Panel
// Floating panel for browsing builtin + user #include files.
// User includes are editable/deletable; builtins are read-only.

import { listIncludes, setInclude, deleteInclude, exportIncludesToJSON, importIncludesFromJSON } from '../shader/shader-includes.js';
import { toast } from '../io/actions.js';
import { makeDraggablePersistent } from './panel-manager.js';
import { checkFragCompile } from '../gl/renderer.js';

let _panel = null;
let _open  = false;
let _selectedName = null;

const _CSS = `
#zgl-includes-panel {
  display: none;
  position: fixed;
  top: 80px;
  left: 340px;
  width: 580px;
  z-index: 9300;
  background: var(--bg-panel, #141823);
  border: 1px solid var(--border, #2a2d40);
  border-radius: var(--radius, 8px);
  box-shadow: 0 8px 32px rgba(0,0,0,.6);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text-primary, #e0e0e0);
  overflow: hidden;
  flex-direction: column;
}
#zgl-includes-panel.open { display: flex; }
#zgl-includes-panel .inc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border, #2a2d40);
  cursor: move;
  user-select: none;
  background: var(--bg-panel-alt, #1c2230);
}
#zgl-includes-panel .inc-header-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent, #7b6fff);
}
#zgl-includes-panel .inc-close {
  background: none;
  border: none;
  color: var(--text-secondary, #888);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
}
#zgl-includes-panel .inc-close:hover { color: var(--text-primary, #e0e0e0); }
#zgl-includes-panel .inc-body {
  display: flex;
  height: 380px;
  overflow: hidden;
}
#zgl-includes-panel .inc-list {
  width: 180px;
  border-right: 1px solid var(--border, #2a2d40);
  overflow-y: auto;
  flex-shrink: 0;
}
#zgl-includes-panel .inc-list-item {
  padding: 5px 10px;
  cursor: pointer;
  font-size: 10px;
  color: var(--text-secondary, #888);
  border-left: 3px solid transparent;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background var(--t-fast, .1s);
}
#zgl-includes-panel .inc-list-item:hover { background: var(--bg-hover, #1c2230); }
#zgl-includes-panel .inc-list-item.active { border-left-color: var(--accent, #7b6fff); color: var(--text-primary, #e0e0e0); background: var(--bg-hover, #1c2230); }
#zgl-includes-panel .inc-list-item.builtin { color: var(--text-disabled, #555); }
#zgl-includes-panel .inc-section-label {
  padding: 4px 10px 2px;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: .07em;
  color: var(--text-disabled, #555);
  border-bottom: 1px solid var(--border, #2a2d40);
}
#zgl-includes-panel .inc-editor-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 6px;
  overflow: hidden;
}
#zgl-includes-panel .inc-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
#zgl-includes-panel .inc-name-input {
  flex: 1;
  background: var(--bg-app, #09091a);
  border: 1px solid var(--border, #2a2d40);
  border-radius: var(--radius-sm, 4px);
  color: var(--text-primary, #e0e0e0);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  padding: 3px 6px;
  height: 22px;
}
#zgl-includes-panel .inc-code-area {
  flex: 1;
  width: 100%;
  background: var(--bg-app, #09091a);
  border: 1px solid var(--border, #2a2d40);
  border-radius: var(--radius-sm, 4px);
  color: var(--text-primary, #e0e0e0);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  resize: none;
  padding: 6px 8px;
  line-height: 1.5;
  tab-size: 2;
  overflow-y: auto;
  min-height: 0;
}
#zgl-includes-panel .inc-code-area[readonly] { opacity: .7; cursor: default; }
#zgl-includes-panel .inc-btn-row {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
#zgl-includes-panel .inc-btn {
  padding: 2px 8px;
  border: 1px solid var(--border, #2a2d40);
  border-radius: var(--radius-sm, 4px);
  background: none;
  color: var(--text-secondary, #888);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  cursor: pointer;
  height: 20px;
  transition: border-color var(--t-fast, .1s), color var(--t-fast, .1s);
}
#zgl-includes-panel .inc-btn:hover { border-color: var(--accent, #7b6fff); color: var(--accent, #7b6fff); }
#zgl-includes-panel .inc-btn.danger:hover { border-color: var(--status-err, #f55); color: var(--status-err, #f55); }
#zgl-includes-panel .inc-btn.primary { border-color: var(--accent, #7b6fff); color: var(--accent, #7b6fff); }
#zgl-includes-panel .inc-footer {
  border-top: 1px solid var(--border, #2a2d40);
  padding: 5px 10px;
  display: flex;
  gap: 5px;
  align-items: center;
  background: var(--bg-panel-alt, #1c2230);
}
`;

function _injectCSS() {
  if (document.getElementById('zgl-includes-css')) return;
  const s = document.createElement('style');
  s.id = 'zgl-includes-css';
  s.textContent = _CSS;
  document.head.appendChild(s);
}

function _buildPanel() {
  _injectCSS();
  const el = document.createElement('div');
  el.id = 'zgl-includes-panel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Includes Manager');
  el.innerHTML = `
    <div class="inc-header">
      <span class="inc-header-title">Includes Manager</span>
      <button class="inc-close" id="incClose" aria-label="Close includes panel">✕</button>
    </div>
    <div class="inc-body">
      <div class="inc-list" id="incList"></div>
      <div class="inc-editor-pane">
        <div class="inc-name-row">
          <input class="inc-name-input" id="incNameInput" placeholder="filename.glsl" aria-label="Include filename"/>
          <button class="inc-btn primary" id="incNewBtn" title="Create new user include">+ New</button>
        </div>
        <textarea class="inc-code-area" id="incCodeArea" spellcheck="false" aria-label="Include source code"></textarea>
        <div class="inc-btn-row">
          <button class="inc-btn primary" id="incSaveBtn">💾 Save</button>
          <button class="inc-btn danger"  id="incDelBtn">✕ Delete</button>
          <button class="inc-btn" id="incTestBtn" title="Check if include compiles without errors">⚙ Test</button>
          <span style="flex:1"></span>
        </div>
      </div>
    </div>
    <div class="inc-footer">
      <button class="inc-btn" id="incExportBtn" title="Export all user includes as JSON">⬇ Export JSON</button>
      <button class="inc-btn" id="incImportBtn" title="Import includes from JSON file">⬆ Import JSON</button>
      <button class="inc-btn" id="incShareBtn" title="Copy shareable URL for the current include (base64 hash)">🔗 Share</button>
      <input type="file" id="incImportFile" accept=".json" style="display:none"/>
    </div>`;
  document.body.appendChild(el);
  _panel = el;

  makeDraggablePersistent(el, 'includes-panel', el.querySelector('.inc-header'));

  el.querySelector('#incClose').addEventListener('click', close);

  el.querySelector('#incNewBtn').addEventListener('click', () => {
    _selectedName = null;
    el.querySelector('#incNameInput').value = '';
    el.querySelector('#incCodeArea').value = '// New include\n';
    el.querySelector('#incCodeArea').removeAttribute('readonly');
    el.querySelector('#incNameInput').focus();
  });

  el.querySelector('#incSaveBtn').addEventListener('click', () => {
    const name = el.querySelector('#incNameInput').value.trim();
    const code = el.querySelector('#incCodeArea').value;
    if (!name) { toast('Filename required', 'err'); return; }
    const finalName = name.endsWith('.glsl') ? name : name + '.glsl';
    setInclude(finalName, code);
    _selectedName = finalName;
    _refreshList();
    toast(`Include "${finalName}" saved`, 'ok');
  });

  el.querySelector('#incDelBtn').addEventListener('click', () => {
    const name = el.querySelector('#incNameInput').value.trim();
    if (!name) return;
    const all = listIncludes();
    const entry = all.find(e => e.name === name || e.name === name + '.glsl');
    if (!entry) { toast('Include not found', 'err'); return; }
    if (entry.builtin) { toast('Built-in includes cannot be deleted', 'warn'); return; }
    deleteInclude(entry.name);
    _selectedName = null;
    el.querySelector('#incNameInput').value = '';
    el.querySelector('#incCodeArea').value = '';
    _refreshList();
    toast(`Include "${entry.name}" deleted`, 'ok');
  });

  el.querySelector('#incTestBtn').addEventListener('click', () => {
    const code = el.querySelector('#incCodeArea').value;
    if (!code.trim()) { toast('No code to test', 'warn'); return; }
    // Wrap in a minimal fragment shader and run through the WebGL compiler
    const testSrc = `precision highp float;\n${code}\nvoid main(){gl_FragColor=vec4(0.0);}`;
    const err = checkFragCompile(testSrc);
    if (err) {
      toast(`Include compile error: ${err.split('\n')[0]}`, 'err');
    } else {
      toast('Include compiles OK ✓', 'ok');
    }
  });

  el.querySelector('#incExportBtn').addEventListener('click', () => {
    const json = exportIncludesToJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'zgl-includes.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('User includes exported', 'ok');
  });

  el.querySelector('#incImportBtn').addEventListener('click', () => {
    el.querySelector('#incImportFile').click();
  });

  el.querySelector('#incShareBtn').addEventListener('click', () => {
    const name = el.querySelector('#incNameInput').value.trim();
    const code = el.querySelector('#incCodeArea').value;
    if (!name || !code.trim()) { toast('Select an include to share', 'warn'); return; }
    try {
      const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ name, code }))));
      const url = `${location.origin}${location.pathname}#include=${payload}`;
      navigator.clipboard.writeText(url).then(
        () => toast('Share URL copied to clipboard ✓', 'ok'),
        () => { prompt('Copy this URL:', url); },
      );
    } catch {
      toast('Could not encode include for sharing', 'err');
    }
  });

  el.querySelector('#incImportFile').addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const obj = JSON.parse(ev.target.result);
        const { imported, skipped } = importIncludesFromJSON(obj);
        _refreshList();
        toast(`Imported ${imported} includes (${skipped} skipped)`, 'ok');
      } catch {
        toast('Invalid JSON file', 'err');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  _refreshList();
}

function _refreshList() {
  if (!_panel) return;
  const listEl = _panel.querySelector('#incList');
  const includes = listIncludes();

  const builtins = includes.filter(e => e.builtin);
  const user     = includes.filter(e => !e.builtin);

  let html = '';
  if (builtins.length) {
    html += `<div class="inc-section-label">Built-in</div>`;
    html += builtins.map(e =>
      `<div class="inc-list-item builtin${_selectedName === e.name ? ' active' : ''}" data-name="${e.name}" title="${e.name}">${e.name}</div>`
    ).join('');
  }
  if (user.length) {
    html += `<div class="inc-section-label">User</div>`;
    html += user.map(e =>
      `<div class="inc-list-item${_selectedName === e.name ? ' active' : ''}" data-name="${e.name}" title="${e.name}">${e.name}</div>`
    ).join('');
  }
  if (!includes.length) html = '<div class="inc-list-item" style="cursor:default;opacity:.5">No includes</div>';

  listEl.innerHTML = html;
  listEl.querySelectorAll('.inc-list-item[data-name]').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.dataset.name;
      const entry = includes.find(e => e.name === name);
      if (!entry) return;
      _selectedName = name;
      _panel.querySelector('#incNameInput').value = name;
      _panel.querySelector('#incCodeArea').value = entry.code;
      if (entry.builtin) {
        _panel.querySelector('#incCodeArea').setAttribute('readonly', 'readonly');
      } else {
        _panel.querySelector('#incCodeArea').removeAttribute('readonly');
      }
      _refreshList();
    });
  });
}

export function open() {
  if (!_panel) _buildPanel();
  _panel.classList.add('open');
  _open = true;
  _refreshList();
}

export function close() {
  _panel?.classList.remove('open');
  _open = false;
}

export function toggle() {
  _open ? close() : open();
}

export function isOpen() { return _open; }

/**
 * F-8.2 — On app startup, check if the URL hash contains a shared include
 * (#include=<base64-json>) and auto-import it, then open the panel.
 */
export function checkInitHashInclude() {
  const hash = window.location.hash;
  if (!hash.startsWith('#include=')) return;
  try {
    const payload = hash.slice('#include='.length);
    const { name, code } = JSON.parse(decodeURIComponent(escape(atob(payload))));
    if (!name || !code) return;
    setInclude(name, code);
    // Clear the hash so it doesn't re-import on reload
    history.replaceState(null, '', window.location.pathname + window.location.search);
    // Open the panel and select the imported include
    open();
    _selectedName = name;
    if (_panel) {
      _panel.querySelector('#incNameInput').value = name;
      _panel.querySelector('#incCodeArea').value = code;
      _panel.querySelector('#incCodeArea').removeAttribute('readonly');
    }
    _refreshList();
    toast(`Include "${name}" imported from shared URL ✓`, 'ok');
  } catch {
    // Malformed hash — ignore silently
  }
}
