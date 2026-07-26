/**
 * src/native/tauri.js
 *
 * Thin wrapper around Tauri's `invoke` API.
 * All calls are no-ops when running in the browser (dev server / PWA),
 * so the same JS code works in both contexts.
 *
 * Usage:
 *   import { setWindowTitle, getAppVersion, isTauri } from '../native/tauri.js';
 *
 *   if (isTauri()) {
 *     setWindowTitle('My Shader');
 *   }
 */

// `window.__TAURI__` is injected by Tauri's `withGlobalTauri: true` option.
const _tauri = () => window.__TAURI__?.core;

/**
 * Returns true when running inside the Tauri desktop shell.
 * @returns {boolean}
 */
export function isTauri() {
  return typeof window !== 'undefined' && !!window.__TAURI__;
}

/**
 * Generic Tauri invoke wrapper - no-op in browser.
 * @param {string} cmd - Tauri command name
 * @param {object} [args] - command arguments
 * @returns {Promise<any>}
 */
export async function invokeTauri(cmd, args) {
  const core = _tauri();
  if (!core) return undefined;
  return core.invoke(cmd, args);
}

/**
 * Set the native window title bar.
 * In the browser this is a no-op.
 * @param {string} shaderName - shown as "<shaderName> - Sliders GL"
 */
export async function setWindowTitle(shaderName) {
  // Update the custom HTML titlebar text immediately (no round-trip needed)
  const { setTitlebarText } = await import('./titlebar.js');
  setTitlebarText(shaderName);

  // Also update the native OS window title via Rust command
  if (!isTauri()) return;
  try {
    await _tauri().invoke('set_window_title', { title: shaderName });
  } catch (err) {
    console.warn('[tauri] set_window_title failed:', err);
  }
}

/**
 * Return the app version from Cargo.toml (e.g. "1.0.0").
 * Falls back to the `version` field in package.json via import.meta.env
 * when running in the browser.
 * @returns {Promise<string>}
 */
export async function getAppVersion() {
  if (isTauri()) {
    try {
      return await _tauri().invoke('app_version');
    } catch {
      /* fall through */
    }
  }
  return import.meta.env.VITE_APP_VERSION ?? '0.0.0';
}

/**
 * Open a native file-open dialog.
 * Returns an array of selected file paths, or [] if cancelled.
 *
 * @param {object} opts
 * @param {boolean}  [opts.multiple=false]
 * @param {string}   [opts.defaultPath]
 * @param {{ name: string, extensions: string[] }[]} [opts.filters]
 * @returns {Promise<string[]>}
 */
export async function openFileDialog(opts = {}) {
  if (!isTauri()) return [];
  // Fix 1.5 — Tauri v2 : window.__TAURI__.dialog n'existe plus → @tauri-apps/plugin-dialog
  const { open } = await import('@tauri-apps/plugin-dialog');
  const result = await open({
    multiple:    opts.multiple    ?? false,
    defaultPath: opts.defaultPath ?? undefined,
    filters:     opts.filters     ?? [
      { name: 'GLSL Shaders',  extensions: ['glsl', 'frag', 'fs', 'vert'] },
      { name: 'Sliders GL Projects', extensions: ['zgl'] },
      { name: 'All Files',     extensions: ['*'] },
    ],
  });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

/**
 * Open a native file-save dialog.
 * Returns the chosen path string, or null if cancelled.
 *
 * @param {object} opts
 * @param {string} [opts.defaultPath]
 * @param {{ name: string, extensions: string[] }[]} [opts.filters]
 * @returns {Promise<string|null>}
 */
export async function saveFileDialog(opts = {}) {
  if (!isTauri()) return null;
  // Fix 1.5 — Tauri v2 : window.__TAURI__.dialog n'existe plus → @tauri-apps/plugin-dialog
  const { save } = await import('@tauri-apps/plugin-dialog');
  return await save({
    defaultPath: opts.defaultPath ?? undefined,
    filters:     opts.filters     ?? [
      { name: 'Sliders GL Projects', extensions: ['zgl'] },
      { name: 'GLSL Shaders',  extensions: ['glsl'] },
      { name: 'All Files',     extensions: ['*'] },
    ],
  });
}

/**
 * Open a shader file by absolute path.
 * Invokes the Rust `open_shader_file` command, which reads the file and emits
 * a `zgl://open-file` event back to the main webview.
 *
 * The caller must separately subscribe to that event (see `initOpenFileListener`
 * below) to receive the file content.
 *
 * @param {string} path - absolute file system path
 * @returns {Promise<void>}
 */
export async function openShaderFile(path) {
  if (!isTauri()) return;
  try {
    await _tauri().invoke('open_shader_file', { path });
  } catch (err) {
    console.error('[tauri] open_shader_file failed:', err);
    throw err;
  }
}

/**
 * Subscribe to the `zgl://open-file` event emitted by the Rust
 * `open_shader_file` command. The callback receives `{ path, text }`.
 *
 * Returns an unlisten function - call it to remove the listener.
 *
 * @param {(payload: { path: string, text: string }) => void} callback
 * @returns {Promise<() => void>}
 */
export async function onOpenFile(callback) {
  if (!isTauri()) return () => {};
  const win = window.__TAURI__?.webviewWindow?.getCurrent?.();
  if (!win) return () => {};
  return win.listen('zgl://open-file', (event) => callback(event.payload));
}

// ── Phase 1.2 additions ───────────────────────────────────────────────────────

/**
 * Watch a file on disk for changes.
 * Calls `callback` whenever the file is modified externally.
 * Returns an unlisten function (async) - call it to stop watching.
 *
 * The actual Rust `watch_file` command registers a Tauri `fs` watcher and emits
 * `zgl://file-changed` events back to the webview.
 *
 * @param {string} path        - absolute file path to watch
 * @param {() => void} callback - called on each change event
 * @returns {Promise<() => Promise<void>>}  unlisten function
 */
export async function watchFile(path, callback) {
  if (!isTauri()) return async () => {};

  // Register the watcher via Rust
  try {
    await _tauri().invoke('watch_file', { path });
  } catch (err) {
    console.error('[tauri] watch_file failed:', err);
    return async () => {};
  }

  // Listen for change events (Tauri emits one per watched path change)
  const win = window.__TAURI__?.webviewWindow?.getCurrent?.();
  if (!win) return async () => {};

  const unlisten = await win.listen('zgl://file-changed', (event) => {
    if (event.payload?.path === path) callback();
  });

  // Return a combined unlisten that also tells Rust to stop the watcher
  return async () => {
    unlisten();
    try {
      await _tauri().invoke('unwatch_file', { path });
    } catch { /* best-effort */ }
  };
}

/**
 * Read a file from disk as a raw Uint8Array.
 * Used to load binary assets (images, videos) for embedding in .zgl bundles.
 *
 * @param {string} path - absolute file path
 * @returns {Promise<Uint8Array>}
 */
export async function readFileBytes(path) {
  if (!isTauri()) throw new Error('readFileBytes requires Tauri');
  const { fs } = window.__TAURI__;
  const bytes = await fs.readFile(path);
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

/**
 * Return the command-line arguments passed to z-gl.exe.
 * Used to open a file passed on the command line: `z-gl.exe shader.glsl`
 *
 * Returns an empty array in browser mode.
 *
 * @returns {Promise<string[]>}
 */
export async function getCliArgs() {
  if (!isTauri()) return [];
  try {
    return await _tauri().invoke('get_cli_args');
  } catch (err) {
    console.warn('[tauri] get_cli_args failed:', err);
    return [];
  }
}

export async function getAccentColor() {
  if (!isTauri()) return null;
  try {
    return await _tauri().invoke('get_accent_color');
  } catch {
    return null;
  }
}

/**
 * SÉCURITÉ C6 - Écouter l'événement `zgl://global-key` émis par Rust
 * (anciennement géré via win.eval() - supprimé pour éliminer le risque
 * d'injection JS côté Rust).
 *
 * Dispatch un KeyboardEvent synthétique sur document en réponse aux
 * raccourcis globaux F11 et Escape interceptés par le processus natif.
 *
 * Doit être appelé une seule fois depuis src/app/init.js.
 *
 * @returns {Promise<() => void>} unlisten
 */
export async function listenGlobalKeys() {
  if (!isTauri()) return () => {};
  const win = window.__TAURI__?.webviewWindow?.getCurrent?.();
  if (!win) return () => {};

  // Whitelist explicite des touches autorisées
  const ALLOWED_KEYS = new Set(['F11', 'Escape']);

  const unlisten = await win.listen('zgl://global-key', (event) => {
    const key = event.payload?.key;
    if (typeof key !== 'string' || !ALLOWED_KEYS.has(key)) {
      console.warn('[tauri] zgl://global-key: clé non autorisée ignorée:', key);
      return;
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });

  return unlisten;
}

/**
 * Clears all Sliders GL application data from disk (presets, localStorage snapshot,
 * auto-save files, WebView2 cache, logs, updater state).
 *
 * Shows a native confirmation dialog before proceeding so the user has a last
 * chance to abort.  Returns the list of directories that were deleted, or null
 * if the user cancelled or if the call failed.
 *
 * This is the JS-side counterpart of the NSIS uninstaller's confirmation flow
 * (src-tauri/installer/uninstaller-hooks.nsh) and can be triggered from the
 * Settings → Advanced → "Reset all app data" button without uninstalling.
 *
 * @returns {Promise<string[] | null>}
 */
export async function clearAppData() {
  if (!isTauri()) {
    console.warn('[tauri] clearAppData is only available in the desktop app.');
    return null;
  }

  // Fix 1.5 — Tauri v2 : @tauri-apps/plugin-dialog
  const { ask } = await import('@tauri-apps/plugin-dialog');
  if (ask) {
    const confirmed = await ask(
      'This will permanently delete all Sliders GL app data:\n' +
      '  • Saved presets and shader library\n' +
      '  • Editor settings and MIDI mappings\n' +
      '  • Auto-save files and crash recovery data\n' +
      '  • Cached assets and logs\n\n' +
      'Your installed shaders and project files on disk are NOT affected.\n\n' +
      'Continue?',
      { title: 'Reset all Sliders GL data', kind: 'warning' }
    );
    if (!confirmed) return null;
  }

  try {
    const removed = await _tauri().invoke('clear_app_data');
    console.info('[tauri] clearAppData removed:', removed);
    return removed;
  } catch (err) {
    console.error('[tauri] clearAppData failed:', err);
    throw err;
  }
}
