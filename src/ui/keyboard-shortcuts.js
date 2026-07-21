// F-10.3 — Customizable Keyboard Shortcuts
// Stores user-defined key overrides in localStorage.
// Monaco commands are registered at editor init; this module tracks
// which actions have been overridden and displays them in Settings.
//
// For now, custom shortcuts apply at the document level (non-Monaco shortcuts).
// Monaco-level shortcuts require re-registration and are noted as (editor only).

import { safeLocalGet, safeLocalSet } from '../core/utils.js';

const _STORAGE_KEY = 'sl_shortcuts_v1';

// Default shortcut registry: actionId → { label, keys, handler, editorOnly }
// handler is null for editor-only shortcuts (managed by Monaco directly).
const _DEFAULTS = new Map([
  ['apply-parse',     { label: 'Apply & Parse Shader',   keys: 'Ctrl+Enter',       editorOnly: true  }],
  ['save-project',    { label: 'Save Project',            keys: 'Ctrl+S',           editorOnly: true  }],
  ['export-frame',    { label: 'Export Frame (PNG)',      keys: 'Ctrl+E',           editorOnly: false }],
  ['fullscreen',      { label: 'Fullscreen Viewport',    keys: 'F11',              editorOnly: false }],
  ['undo-slider',     { label: 'Undo Slider',            keys: 'Ctrl+Z',           editorOnly: false }],
  ['command-palette', { label: 'Command Palette',        keys: 'Ctrl+Shift+P',     editorOnly: false }],
  ['code-focus',      { label: 'Code Focus Mode',        keys: 'Ctrl+Shift+F',     editorOnly: false }],
  ['randomize',       { label: 'Randomize Sliders',      keys: 'Alt+R',            editorOnly: false }],
]);

let _overrides = {};

function _load() {
  try { _overrides = JSON.parse(safeLocalGet(_STORAGE_KEY, '{}')); } catch { _overrides = {}; }
}

function _save() {
  safeLocalSet(_STORAGE_KEY, JSON.stringify(_overrides));
}

/**
 * Return all shortcuts as { actionId, label, keys, defaultKeys, editorOnly }[]
 */
export function listShortcuts() {
  _load();
  const result = [];
  for (const [actionId, def] of _DEFAULTS) {
    result.push({
      actionId,
      label: def.label,
      keys: _overrides[actionId] ?? def.keys,
      defaultKeys: def.keys,
      editorOnly: def.editorOnly,
      overridden: !!_overrides[actionId],
    });
  }
  return result;
}

/**
 * Set a custom key binding for an action.
 * @param {string} actionId
 * @param {string} keys  e.g. "Ctrl+Shift+A"
 */
export function setShortcut(actionId, keys) {
  if (!_DEFAULTS.has(actionId)) return false;
  _load();
  if (!keys || keys === _DEFAULTS.get(actionId).keys) {
    delete _overrides[actionId];
  } else {
    _overrides[actionId] = keys;
  }
  _save();
  return true;
}

/**
 * Reset all shortcuts to defaults.
 */
export function resetShortcuts() {
  _overrides = {};
  _save();
}

/**
 * Get the current key binding for an action.
 * @param {string} actionId
 * @returns {string}
 */
export function getShortcut(actionId) {
  _load();
  return _overrides[actionId] ?? _DEFAULTS.get(actionId)?.keys ?? '';
}

/**
 * Render the keyboard shortcuts settings section into a container element.
 * @param {HTMLElement} container
 */
export function renderShortcutsSettings(container) {
  const shortcuts = listShortcuts();
  container.innerHTML = `
    <div class="ks-header">
      <span>Keyboard Shortcuts</span>
      <button class="ks-reset-btn" id="ksResetAll" title="Reset all to defaults">↩ Reset all</button>
    </div>
    <div class="ks-note">Editor-only shortcuts require an app restart to take effect.</div>
    <table class="ks-table">
      <thead><tr><th>Action</th><th>Keys</th><th></th></tr></thead>
      <tbody>
        ${shortcuts.map(s => `
          <tr class="ks-row" data-action="${s.actionId}">
            <td class="ks-label">${s.label}${s.editorOnly ? ' <span class="ks-tag">editor</span>' : ''}</td>
            <td><input class="ks-key-input" value="${s.keys}" data-default="${s.defaultKeys}" readonly/></td>
            <td>
              <button class="ks-capture-btn" data-action="${s.actionId}" title="Click then press new key combination">✎</button>
              ${s.overridden ? `<button class="ks-reset-btn ks-reset-one" data-action="${s.actionId}" title="Reset to ${s.defaultKeys}">↩</button>` : ''}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  // Wire capture buttons
  container.querySelectorAll('.ks-capture-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const actionId = btn.dataset.action;
      const row = container.querySelector(`.ks-row[data-action="${actionId}"]`);
      const input = row?.querySelector('.ks-key-input');
      if (!input) return;
      input.value = '⌨ Press key combo…';
      input.classList.add('capturing');

      function onKey(e) {
        e.preventDefault();
        const parts = [];
        if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        const k = e.key;
        if (!['Control', 'Alt', 'Shift', 'Meta'].includes(k)) {
          parts.push(k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k);
        }
        if (parts.length === 0) return;
        const combo = parts.join('+');
        setShortcut(actionId, combo);
        input.value = combo;
        input.classList.remove('capturing');
        document.removeEventListener('keydown', onKey, { capture: true });
        renderShortcutsSettings(container);
      }

      document.addEventListener('keydown', onKey, { capture: true });
    });
  });

  container.querySelectorAll('.ks-reset-one').forEach(btn => {
    btn.addEventListener('click', () => {
      setShortcut(btn.dataset.action, '');
      renderShortcutsSettings(container);
    });
  });

  container.querySelector('#ksResetAll')?.addEventListener('click', () => {
    resetShortcuts();
    renderShortcutsSettings(container);
  });
}

/** CSS for the shortcuts settings section (injected once) */
export const SHORTCUTS_CSS = `
.ks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
}
.ks-note {
  font-size: 9px;
  color: var(--text-disabled);
  margin-bottom: 6px;
}
.ks-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
}
.ks-table th {
  text-align: left;
  font-size: 9px;
  color: var(--text-disabled);
  padding: 2px 4px;
  border-bottom: 1px solid var(--border);
}
.ks-row td {
  padding: 3px 4px;
  vertical-align: middle;
  border-bottom: 1px solid var(--border);
}
.ks-label { color: var(--text-secondary); }
.ks-tag {
  font-size: 8px;
  background: var(--bg-hover);
  border-radius: 3px;
  padding: 1px 4px;
  color: var(--text-disabled);
  margin-left: 4px;
}
.ks-key-input {
  background: var(--bg-app);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 2px 5px;
  width: 140px;
  cursor: default;
}
.ks-key-input.capturing {
  border-color: var(--accent);
  color: var(--accent);
}
.ks-capture-btn, .ks-reset-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 9px;
  padding: 1px 5px;
  cursor: pointer;
  height: 18px;
  transition: border-color var(--t-fast), color var(--t-fast);
}
.ks-capture-btn:hover { border-color: var(--accent); color: var(--accent); }
.ks-reset-btn:hover   { border-color: var(--status-warn); color: var(--status-warn); }
`;
