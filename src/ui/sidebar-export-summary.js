// §5 roadmap — Export sidebar pane summary: last-used format + saved
// presets, populated lazily when the Export tab is opened (same pattern as
// sidebar-render-diagnostics.js).

import { getLastExportFormatLabel } from './export-last-used.js';
import { listExportPresetNames, applyExportPresetByName } from '../export/export-presets.js';
import { openExportModal } from '../export/export.js';

function _refresh() {
  const lastEl = document.getElementById('expLastFormat');
  if (lastEl) lastEl.textContent = getLastExportFormatLabel() || 'None yet';

  const section = document.getElementById('expPresetsSection');
  const list = document.getElementById('expPresetsList');
  if (!section || !list) return;

  const names = listExportPresetNames();
  section.hidden = names.length === 0;
  list.innerHTML = '';
  for (const name of names) {
    const btn = document.createElement('button');
    btn.className = 'pb';
    btn.type = 'button';
    btn.textContent = name;
    btn.title = `Load export preset "${name}" and open the export dialog`;
    btn.addEventListener('click', () => {
      applyExportPresetByName(name);
      openExportModal();
    });
    list.appendChild(btn);
  }
}

export function initSidebarExportSummary() {
  window.addEventListener('zgl:sidebar-tab-changed', (e) => {
    if (/** @type {CustomEvent} */ (e).detail?.tab === 'export') _refresh();
  });
}
