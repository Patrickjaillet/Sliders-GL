/**
 * src/io/project-ui.js
 *
 * Phase 1.2 — File menu UI controller.
 *
 * Responsibilities:
 *   - Toggle the File menu popup open/closed
 *   - Render the MRU list inside the popup
 *   - Wire Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S keyboard shortcuts
 *   - Keep the "Watch File" menu item in sync with watcher state
 *   - Expose action handlers that the main data-action dispatcher can call
 *
 * This module is in the `io` layer; it may import from core/ and native/ but
 * must not import from gl/ or ui/ directly.
 */

/**
 * §5.3 — Met à jour le fil d'Ariane du projet dans le bouton du menu File
 * (nom du projet + point de modification). Le nom reçu peut contenir un
 * suffixe " •" (modifié) ou " • (recovered)".
 * @param {string} rawName
 */
export function setProjectBreadcrumb(rawName) {
  const nameEl  = document.getElementById('projectName');
  const dirtyEl = document.getElementById('projectDirty');
  if (!nameEl) return;
  const raw = String(rawName || '');
  const dirty = raw.includes('•');
  const clean = raw.replace(/\s*•.*$/, '').trim() || 'Untitled';
  nameEl.textContent = clean;
  if (dirtyEl) dirtyEl.hidden = !dirty;
  document.title = `${dirty ? '• ' : ''}${clean} — Z-GL`;
}

import {
  newProject,
  openProject,
  openMruEntry,
  saveProject,
  saveProjectAs,
  getMruList,
  enableWatchFile,
  disableWatchFile,
  isWatchingFile,
} from './project.js';
import { isTauri } from '../native/tauri.js';
import { exportCurrentFrame } from '../export/export.js';

// ── File menu open/close ──────────────────────────────────────────────────────

let _menuOpen = false;

export function toggleFileMenu() {
  _menuOpen ? _closeFileMenu() : _openFileMenu();
}

function _openFileMenu() {
  _menuOpen = true;
  const popup = document.getElementById('fileMenuPopup');
  const btn   = document.getElementById('fileMenuBtn');
  if (!popup || !btn) return;

  _renderMruList();
  _updateWatchItem();

  popup.hidden = false;
  btn.setAttribute('aria-expanded', 'true');

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('pointerdown', _onOutsideClick, { once: true, capture: true });
  }, 0);

  // Focus first item
  const firstItem = popup.querySelector('.fmenu-item:not(.disabled)');
  if (firstItem) (/** @type {HTMLElement} */ (firstItem)).focus();
}

function _closeFileMenu() {
  _menuOpen = false;
  const popup = document.getElementById('fileMenuPopup');
  const btn   = document.getElementById('fileMenuBtn');
  if (popup) popup.hidden = true;
  if (btn)   btn.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', _onOutsideClick, { capture: true });
}

function _onOutsideClick(e) {
  const wrap = document.getElementById('fileMenuWrap');
  if (wrap && wrap.contains(e.target)) return;
  _closeFileMenu();
}

// ── MRU rendering ─────────────────────────────────────────────────────────────

function _renderMruList() {
  const section = document.getElementById('fmenuMruSection');
  const list    = document.getElementById('fmenuMruList');
  if (!section || !list) return;

  const mru = getMruList();
  if (!mru.length || !isTauri()) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  list.innerHTML = mru.map((path, i) => {
    const name = path.split(/[\\/]/).pop();
    const dir  = path.split(/[\\/]/).slice(0, -1).join('/').slice(-40);
    return `<div class="fmenu-mru-item" role="menuitem" tabindex="-1"
                 data-action="openMruEntry" data-args="${i}"
                 title="${_esc(path)}">
              ${_esc(name)} <span class="fmenu-mru-badge">${_esc(dir)}</span>
            </div>`;
  }).join('');
}

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

// ── Watch file item ───────────────────────────────────────────────────────────

function _updateWatchItem() {
  const item = document.getElementById('watchFileItem');
  const btn  = document.getElementById('fileMenuBtn');
  if (!item) return;

  const watching = isWatchingFile();

  // Label + icon
  item.innerHTML = watching
    ? `<span class="fmenu-icon">◉</span> Stop Watching File`
    : `<span class="fmenu-icon">&#128065;</span> Watch File`;

  // Visual active state on the item itself (not just the header button)
  item.classList.toggle('fmenu-item--active', watching);

  // ARIA: menuitemcheckbox checked state
  item.setAttribute('aria-checked', watching ? 'true' : 'false');

  // Header button indicator
  if (btn) {
    btn.classList.toggle('watch-active', watching);
  }

  // Disable if no Tauri
  item.classList.toggle('disabled', !isTauri());
}

/** Call after watcher state changes to keep the indicator current. */
export function refreshWatchIndicator() {
  _updateWatchItem();
}

// ── Public action handlers (called by data-action dispatcher) ─────────────────

export async function handleNewProject() {
  _closeFileMenu();
  newProject();
}

export async function handleOpenProject() {
  _closeFileMenu();
  await openProject();
}

export async function handleSaveProject() {
  _closeFileMenu();
  await saveProject();
}

export async function handleSaveProjectAs() {
  _closeFileMenu();
  await saveProjectAs();
}

export async function handleOpenMruEntry(index) {
  _closeFileMenu();
  await openMruEntry(index);
}

export async function handleToggleWatchFile() {
  _closeFileMenu();
  if (isWatchingFile()) {
    await disableWatchFile();
  } else {
    await enableWatchFile();
  }
  refreshWatchIndicator();
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

/**
 * Install global keydown handler for project shortcuts.
 * Call once during app init.
 */
export function initProjectShortcuts() {
  document.addEventListener('keydown', async (e) => {
    if (!e.ctrlKey) return;
    switch (e.key) {
      case 'n':
      case 'N':
        e.preventDefault();
        await handleNewProject();
        break;
      case 'o':
      case 'O':
        e.preventDefault();
        await handleOpenProject();
        break;
      case 's':
      case 'S':
        e.preventDefault();
        if (e.shiftKey) {
          await handleSaveProjectAs();
        } else {
          await handleSaveProject();
        }
        break;
      case 'e':
      case 'E':
        e.preventDefault();
        exportCurrentFrame();
        break;
    }
  });
}
