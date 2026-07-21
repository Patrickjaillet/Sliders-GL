/**
 * src/native/titlebar.js
 *
 * Custom title bar for the Tauri desktop build.
 * - Renders only when `isTauri()` is true; in the browser the bar is hidden
 *   via CSS and the native browser chrome takes over.
 * - Drag region covers the full bar except the three window-control buttons.
 * - Double-click on the drag region → maximize / restore.
 * - Syncs the maximize icon with the actual window state.
 *
 * Mount: call `initTitlebar()` once from `src/app/init.js`.
 * HTML:  a `<div id="titlebar">` must exist in `src/ui.html`.
 */

import { isTauri } from './tauri.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const BAR_ID    = 'titlebar';
const TITLE_ID  = 'titlebar-title';
const MIN_ID    = 'titlebar-min';
const MAX_ID    = 'titlebar-max';
const CLOSE_ID  = 'titlebar-close';

// SVG icons — Windows 11 Segoe Fluent–style strokes
const ICON_MINIMIZE = `<svg width="10" height="10" viewBox="0 0 10 10">
  <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" stroke-width="1.2"/>
</svg>`;

const ICON_MAXIMIZE = `<svg width="10" height="10" viewBox="0 0 10 10">
  <rect x="0.6" y="0.6" width="8.8" height="8.8" rx="0"
        fill="none" stroke="currentColor" stroke-width="1.2"/>
</svg>`;

const ICON_RESTORE = `<svg width="10" height="10" viewBox="0 0 10 10">
  <rect x="2" y="0" width="8" height="8" rx="0"
        fill="none" stroke="currentColor" stroke-width="1.2"/>
  <rect x="0" y="2" width="8" height="8" rx="0"
        fill="var(--bg-panel)" stroke="currentColor" stroke-width="1.2"/>
</svg>`;

const ICON_CLOSE = `<svg width="10" height="10" viewBox="0 0 10 10">
  <line x1="0"  y1="0"  x2="10" y2="10" stroke="currentColor" stroke-width="1.2"/>
  <line x1="10" y1="0"  x2="0"  y2="10" stroke="currentColor" stroke-width="1.2"/>
</svg>`;

// ── State ─────────────────────────────────────────────────────────────────────

let _maximized = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _window() {
  // Tauri v2 avec withGlobalTauri: true — noms réels confirmés par inspection runtime :
  // webviewWindow.getCurrentWebviewWindow() ou window.getCurrentWindow()
  return window.__TAURI__?.webviewWindow?.getCurrentWebviewWindow?.()
      ?? window.__TAURI__?.window?.getCurrentWindow?.();
}

async function _isMaximized() {
  try { return await _window()?.isMaximized() ?? false; }
  catch { return false; }
}

function _updateMaxIcon() {
  const btn = document.getElementById(MAX_ID);
  if (!btn) return;
  btn.innerHTML    = _maximized ? ICON_RESTORE : ICON_MAXIMIZE;
  btn.title        = _maximized ? 'Restore'   : 'Maximize';
  btn.setAttribute('aria-label', btn.title);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Inject the title bar markup into `#titlebar` and wire all events.
 * Safe to call multiple times — re-initialises if already mounted.
 */
export function initTitlebar() {
  const bar = document.getElementById(BAR_ID);
  if (!bar) return;

  // Hide entirely in browser / PWA context
  if (!isTauri()) {
    bar.hidden = true;
    return;
  }

  // Force layout via inline styles — CSS resets in the app override titlebar.css
  Object.assign(bar.style, {
    display: 'flex', flexDirection: 'row', alignItems: 'center',
    width: '100%', height: '32px', flexShrink: '0', userSelect: 'none',
  });

  bar.innerHTML = `
    <div id="titlebar-drag" data-tauri-drag-region style="display:flex;align-items:center;gap:6px;flex:1 1 auto;min-width:0;height:100%;padding:0 10px;cursor:default;">
      <img id="titlebar-icon" src="/icon-light-32x32.png" alt="" aria-hidden="true" width="14" height="14"/>
      <span id="${TITLE_ID}">Z-GL Shadertoy</span>
    </div>
    <div id="titlebar-controls" role="group" aria-label="Window controls" style="display:flex;align-items:stretch;height:100%;flex-shrink:0;margin-left:auto;">
      <button id="${MIN_ID}"   class="tb-btn tb-min"   title="Minimize"  aria-label="Minimize">
        ${ICON_MINIMIZE}
      </button>
      <button id="${MAX_ID}"   class="tb-btn tb-max"   title="Maximize"  aria-label="Maximize">
        ${ICON_MAXIMIZE}
      </button>
      <button id="${CLOSE_ID}" class="tb-btn tb-close" title="Close"     aria-label="Close">
        ${ICON_CLOSE}
      </button>
    </div>
  `;

  // ── Window control actions ───────────────────────────────────────────────

  document.getElementById(MIN_ID).addEventListener('click', () => {
    _window()?.minimize();
  });

  document.getElementById(MAX_ID).addEventListener('click', async () => {
    const win = _window();
    if (!win) return;
    if (_maximized) { await win.unmaximize(); }
    else            { await win.maximize();   }
    _maximized = await _isMaximized();
    _updateMaxIcon();
  });

  document.getElementById(CLOSE_ID).addEventListener('click', () => {
    // Closing triggers the RunEvent::ExitRequested handler in lib.rs,
    // which hides the window instead of quitting. The user must use the
    // tray → Quit to fully exit.
    _window()?.close();
  });

  // ── Double-click drag region → toggle maximize ───────────────────────────

  document.getElementById('titlebar-drag').addEventListener('dblclick', async () => {
    const win = _window();
    if (!win) return;
    if (_maximized) { await win.unmaximize(); }
    else            { await win.maximize();   }
    _maximized = await _isMaximized();
    _updateMaxIcon();
  });

  // ── Sync icon on external maximize/restore (Windows snap, taskbar, etc.) ─
  // Tauri v2 : onResized() retourne une Promise<UnlistenFn> — il faut l'awaiter.
  const win = _window();
  if (win?.onResized) {
    win.onResized(async () => {
      const prev = _maximized;
      _maximized = await _isMaximized();
      if (prev !== _maximized) _updateMaxIcon();
    }).catch(() => {});
  }

  // Initial state
  _isMaximized().then(v => { _maximized = v; _updateMaxIcon(); });
}

/**
 * Update the title text shown in the bar.
 * Called from `src/native/tauri.js → setWindowTitle`.
 * @param {string} name
 */
export function setTitlebarText(name) {
  const el = document.getElementById(TITLE_ID);
  if (el) el.textContent = name ? `${name} — Z-GL Shadertoy` : 'Z-GL Shadertoy';
}
