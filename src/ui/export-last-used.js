// §5 roadmap — Export sidebar pane summary.
//
// Tracks which export format button was last clicked, purely by observing
// clicks on the export modal's own data-action buttons (no changes needed
// to export.js itself — that module already has a large exported surface,
// and duplicating "record last format" into every one of its export
// functions would be much higher risk than listening once, here, for the
// same buttons the user already clicks).

import { safeLocalGet, safeLocalSet } from '../core/utils.js';
import { renderExportPreview } from '../export/export-phase6.js';

const KEY = 'sl_lastExportFormat';

/** data-action name → friendly label shown in the sidebar summary. */
const LABELS = {
  exportScreenshot: 'Screenshot (PNG)',
  exportCurrentFrame: 'Current Frame (PNG)',
  toggleVideoRecord: 'Video Recording',
  exportStandaloneHTML: 'Standalone HTML',
  exportPureGLSL: 'Pure GLSL',
  exportMinifiedGLSL: 'Minified GLSL',
  exportThreeSnippet: 'Three.js Snippet',
  exportProjectZip: 'Project ZIP',
  exportP5Sketch: 'p5.js Sketch',
  exportGLSLSandbox: 'GLSL Sandbox',
  exportShaderToyFormat: 'ShaderToy Format',
};

/** @returns {string|null} Friendly label of the last export action taken, or null. */
export function getLastExportFormatLabel() {
  const action = safeLocalGet(KEY, '');
  return action && LABELS[action] ? LABELS[action] : null;
}

/**
 * §9 roadmap — the "Preview Frame" button used to call renderExportPreview
 * with a static data-args="exp-img-preview,1920x1080", ignoring whatever
 * resolution #exp-res was actually set to. This reads the live value
 * (matching exportScreenshot()'s own 'viewport' → #cwrap size handling)
 * before rendering.
 */
export function renderExportPreviewAtSelectedRes() {
  const resVal = /** @type {HTMLSelectElement} */ (document.getElementById('exp-res'))?.value;
  let resArg = resVal;
  if (resVal === 'viewport') {
    const cw = document.getElementById('cwrap');
    resArg = cw ? `${cw.clientWidth}x${cw.clientHeight}` : '1920x1080';
  }
  renderExportPreview('exp-img-preview', resArg);
}

export function initExportLastUsedTracker() {
  document.getElementById('exportModal')?.addEventListener('click', (e) => {
    const el = /** @type {Element} */ (e.target).closest('[data-action]');
    const action = el?.getAttribute('data-action');
    if (action && LABELS[action]) safeLocalSet(KEY, action);

    // §9 roadmap — "last export" thumbnail: exportScreenshot() (export.js)
    // already has a large exported surface (see the file-level comment
    // above), so rather than have it separately cache a thumbnail, this
    // reuses the existing "Preview Frame" renderer (export-phase6.js
    // renderExportPreview(), which was built for the before-export preview)
    // right after a screenshot download, with the exact same
    // resolution/alpha inputs the export itself just used — refreshing the
    // same #exp-img-preview container so it now shows what was actually
    // exported instead of only what would be.
    if (action === 'exportScreenshot') {
      const resVal = /** @type {HTMLSelectElement} */ (document.getElementById('exp-res'))?.value;
      setTimeout(() => {
        renderExportPreview(
          'exp-img-preview',
          resVal === 'viewport' ? '320x180' : resVal,
          'Last export'
        );
      }, 200);
    }
  });
}
