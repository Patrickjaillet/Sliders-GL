// §5 roadmap — Export sidebar pane summary.
//
// Tracks which export format button was last clicked, purely by observing
// clicks on the export modal's own data-action buttons (no changes needed
// to export.js itself — that module already has a large exported surface,
// and duplicating "record last format" into every one of its export
// functions would be much higher risk than listening once, here, for the
// same buttons the user already clicks).

import { safeLocalGet, safeLocalSet } from '../core/utils.js';

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

export function initExportLastUsedTracker() {
  document.getElementById('exportModal')?.addEventListener('click', (e) => {
    const el = /** @type {Element} */ (e.target).closest('[data-action]');
    const action = el?.getAttribute('data-action');
    if (action && LABELS[action]) safeLocalSet(KEY, action);
  });
}
