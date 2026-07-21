/**
 * src/native/file-drop.js
 *
 * Native file-drop support for the Tauri desktop build.
 *
 * Listens for the Tauri `tauri://drag-drop` window event and handles:
 *   — shader text files : .glsl .wgsl .hlsl .frag .vert .comp .isf .json
 *   — archives ZIP      : .zip  (projet Shadertoy exporté — Phase 18.2)
 *
 * Does nothing in the browser / PWA context (isTauri() guard).
 *
 * Mount: call `initFileDrop()` once from `src/app/init.js`.
 */

import { isTauri } from './tauri.js';
import { applyShaderFile, importZipFile } from '../import/local-file-import.js';
import { toast } from '../io/actions.js';

const SHADER_EXTS = new Set(['glsl', 'wgsl', 'hlsl', 'frag', 'vert', 'comp', 'isf', 'json']);

function _ext(p) {
  return p.split('.').pop()?.toLowerCase() ?? '';
}

let _mounted = false;

export async function initFileDrop() {
  if (_mounted || !isTauri()) return;
  _mounted = true;

  const win = window.__TAURI__?.webviewWindow?.getCurrent?.();
  if (!win) return;

  await win.listen('tauri://drag-drop', async (event) => {
    const paths = event?.payload?.paths ?? [];
    if (!paths.length) return;

    const zipPath = paths.find(p => _ext(p) === 'zip');
    if (zipPath) {
      try {
        const bytes = await window.__TAURI__.core.invoke('read_file_bytes', { path: zipPath });
        const fileName = zipPath.split(/[\\/]/).pop() ?? 'archive.zip';
        const file = new File([new Uint8Array(bytes)], fileName, { type: 'application/zip' });
        await importZipFile(file);
      } catch (err) {
        toast(`Erreur ZIP : ${err.message}`, 'err');
      }
      return;
    }

    const filePath = paths.find(p => SHADER_EXTS.has(_ext(p)));
    if (!filePath) return;

    try {
      const text = await window.__TAURI__.fs.readTextFile(filePath);
      const fileName = filePath.split(/[\\/]/).pop() ?? 'shader';
      applyShaderFile(text, fileName);
    } catch (err) {
      toast(`Drop failed: ${err.message}`, 'err');
    }
  });
}
