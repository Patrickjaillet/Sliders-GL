// §5 roadmap — Render pane diagnostics section.
//
// Surfaces read-only GPU/cache/debounce information that already exists in
// the codebase (render/gl-caps.js, render/gpu-program-cache.js,
// render/adaptive-debounce.js) but was previously only visible via
// console.debug or the hidden perf panel. Populated lazily when the Render
// sidebar tab is opened, rather than polled continuously — none of this
// data changes on its own while the pane is hidden.

import { state } from '../core/state.js';
import { detectGLCaps } from '../render/gl-caps.js';
import { getGpuCacheStats, clearGpuCache } from '../render/gpu-program-cache.js';
import { getAdaptiveDelay } from '../render/adaptive-debounce.js';
import { toast } from '../io/actions.js';

function _fmtBytesFriendly(n) {
  return n === 1 ? '1 entry' : `${n} entries`;
}

async function _refresh() {
  const gpuEl = document.getElementById('diagGpu');
  const glvEl = document.getElementById('diagGlVersion');
  const texEl = document.getElementById('diagMaxTex');
  const cmpEl = document.getElementById('diagCompFormat');
  const cacheEl = document.getElementById('diagCacheEntries');
  const debEl = document.getElementById('diagDebounce');
  if (!gpuEl) return;

  const caps = detectGLCaps();
  if (caps) {
    gpuEl.textContent = caps.renderer !== 'unknown' ? caps.renderer : 'Unavailable';
    gpuEl.title = caps.vendor !== 'unknown' ? `Vendor: ${caps.vendor}` : '';
    glvEl.textContent = `WebGL ${caps.glVersion}${caps.highpFloat ? ', highp' : ''}`;
    texEl.textContent = `${caps.maxTextureSize}px`;
    cmpEl.textContent =
      caps.bestCompressedFormat === 'none'
        ? 'None (uncompressed)'
        : caps.bestCompressedFormat.toUpperCase();
  } else {
    gpuEl.textContent = 'Not initialized';
    glvEl.textContent = '—';
    texEl.textContent = '—';
    cmpEl.textContent = '—';
  }

  try {
    const stats = await getGpuCacheStats();
    cacheEl.textContent = _fmtBytesFriendly(stats.entries);
    cacheEl.title = `GPU fingerprint: ${stats.gpuFingerprint}`;
  } catch {
    cacheEl.textContent = 'Unavailable';
  }

  const code = state.editor ? state.editor.getValue() : state.currentCode || '';
  debEl.textContent = code ? `${getAdaptiveDelay(code)} ms` : '—';
}

export function initSidebarRenderDiagnostics() {
  document.getElementById('diagClearCacheBtn')?.addEventListener('click', async () => {
    await clearGpuCache();
    toast('GPU program cache cleared', 'ok');
    _refresh();
  });

  window.addEventListener('zgl:sidebar-tab-changed', (e) => {
    if (/** @type {CustomEvent} */ (e).detail?.tab === 'render') _refresh();
  });
}
