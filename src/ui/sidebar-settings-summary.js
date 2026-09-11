// §5 roadmap — Settings sidebar pane: summary of active preferences,
// populated lazily when the Settings tab is opened (same pattern as
// sidebar-render-diagnostics.js / sidebar-export-summary.js).

import { getEditorPrefs } from './settings-panel.js';
import { getComfort } from './comfort.js';
import { isSoundEnabled } from './sound.js';

function _onOff(flag) {
  return flag ? 'On' : 'Off';
}

function _refresh() {
  const fontEl = document.getElementById('setSummaryFont');
  if (!fontEl) return;

  const prefs = getEditorPrefs();
  fontEl.textContent = `${prefs.fontSize}px`;
  fontEl.title = prefs.fontFamily;

  const comfort = getComfort();
  document.getElementById('setSummaryAaa').textContent = _onOff(comfort.aaa);
  document.getElementById('setSummaryDyslexia').textContent = _onOff(comfort.dyslexia);
  document.getElementById('setSummaryReduceMotion').textContent = _onOff(comfort.reduceMotion);
  document.getElementById('setSummarySound').textContent = _onOff(isSoundEnabled());
}

export function initSidebarSettingsSummary() {
  window.addEventListener('zgl:sidebar-tab-changed', (e) => {
    if (/** @type {CustomEvent} */ (e).detail?.tab === 'settings') _refresh();
  });
}
