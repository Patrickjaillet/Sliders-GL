import { state } from '../core/state.js';
import { setComfort, getComfort } from './comfort.js';
import { renderShortcutsSettings, SHORTCUTS_CSS } from './keyboard-shortcuts.js';
import { makeDraggablePersistent } from './panel-manager.js';

// ── F-10.5: Editor preferences ────────────────────────────────────────────────

const EDITOR_PREFS_KEY = 'z-gl:editorPrefs';

const EDITOR_PREFS_DEFAULT = {
  fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace",
  tabSize: 2,
  wordWrap: 'off',
  smoothScrolling: false,
  bracketPairColorization: true,
  stickyScroll: false,
  lineNumbers: 'on',
  minimap: true,
  autoFormat: false,
};

export function getEditorPrefs() {
  try {
    const raw = localStorage.getItem(EDITOR_PREFS_KEY);
    if (raw) return { ...EDITOR_PREFS_DEFAULT, ...JSON.parse(raw) };
  } catch (_) { /* ignore */ }
  return { ...EDITOR_PREFS_DEFAULT };
}

function _saveEditorPrefs(prefs) {
  try { localStorage.setItem(EDITOR_PREFS_KEY, JSON.stringify(prefs)); } catch (_) { /* ignore */ }
  // keep state.prefs in sync for applyAndParse
  state.prefs = { ...(state.prefs || {}), ...prefs };
}

function _applyEditorPrefs(prefs) {
  if (!state.editor) return;
  state.editor.updateOptions({
    fontSize: prefs.fontSize,
    fontFamily: prefs.fontFamily,
    tabSize: prefs.tabSize,
    wordWrap: prefs.wordWrap,
    smoothScrolling: prefs.smoothScrolling,
    bracketPairColorization: { enabled: prefs.bracketPairColorization },
    stickyScroll: { enabled: prefs.stickyScroll },
    lineNumbers: prefs.lineNumbers,
    minimap: { enabled: prefs.minimap },
  });
}

/** Call once at startup to apply saved editor prefs. */
export function initEditorPrefs() {
  const prefs = getEditorPrefs();
  state.prefs = { ...(state.prefs || {}), ...prefs };
  // Editor may not be ready yet — defer if needed
  if (state.editor) {
    _applyEditorPrefs(prefs);
  } else {
    const MAX = 30;
    let n = 0;
    const iv = setInterval(() => {
      if (state.editor || ++n > MAX) {
        clearInterval(iv);
        if (state.editor) _applyEditorPrefs(prefs);
      }
    }, 200);
  }
}

let _panelOpen = false;
let _panelElement = null;

// Roadmap audit — this panel never had any CSS anywhere in the project (no
// `.floating-panel`/`#settings-panel` rule existed): the JS toggle logic was
// correct, but `display:block` on an unstyled, unpositioned <div> rendered
// invisible/unusable. Self-contained styles injected once.
const _CSS = `
#settings-panel.floating-panel {
  position: fixed;
  top: 80px;
  right: 20px;
  width: 280px;
  max-height: 70vh;
  overflow-y: auto;
  background: var(--bg-panel, #ffffff);
  border: 1px solid var(--border-strong, rgba(0,0,0,.14));
  border-radius: var(--radius, 8px);
  box-shadow: var(--shadow-popup, 0 8px 40px rgba(0,0,0,.2));
  z-index: 1200;
  font-family: var(--font-ui);
  color: var(--text-primary, inherit);
}
#settings-panel .panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-panel-alt, var(--bg-app));
  border-bottom: 1px solid var(--border, rgba(255,255,255,.08));
  cursor: move;
  user-select: none;
}
#settings-panel .panel-title {
  font-size: 12px;
  font-weight: 600;
  flex: 1;
}
#settings-panel .panel-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
#settings-panel .panel-close:hover { color: var(--text-primary); }
#settings-panel .panel-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 14px;
}
#settings-panel .settings-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
#settings-panel .settings-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
#settings-panel .settings-select {
  height: 28px;
  padding: 0 8px;
  border-radius: var(--radius-sm, 4px);
  border: 1px solid var(--border);
  background: var(--bg-app);
  color: var(--text-primary);
  font: 12px var(--font-ui);
}
#settings-panel .settings-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
}
#settings-panel .settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}
#settings-panel .settings-row label {
  flex: 1;
  color: var(--text-primary);
}
#settings-panel .settings-input-sm {
  width: 60px;
  height: 24px;
  padding: 0 6px;
  border-radius: var(--radius-sm, 4px);
  border: 1px solid var(--border);
  background: var(--bg-app);
  color: var(--text-primary);
  font: 12px var(--font-mono, monospace);
  text-align: right;
}
#settings-panel .settings-select-sm {
  height: 24px;
  padding: 0 6px;
  border-radius: var(--radius-sm, 4px);
  border: 1px solid var(--border);
  background: var(--bg-app);
  color: var(--text-primary);
  font: 12px var(--font-ui);
}
`;

let _cssInjected = false;
function _injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const s = document.createElement('style');
  s.textContent = _CSS;
  document.head.appendChild(s);
}

/**
 * Initialize the settings panel
 */
export function initSettingsPanel() {
  _injectCSS();
  // Create panel element
  _panelElement = document.createElement('div');
  _panelElement.id = 'settings-panel';
  _panelElement.className = 'floating-panel';
  const ep = getEditorPrefs();
  _panelElement.innerHTML = `
    <div class="panel-header">
      <span class="panel-title">Settings</span>
      <button class="panel-close" data-action="close-settings">×</button>
    </div>
    <div class="panel-content">
      <div class="settings-section">
        <div class="settings-label">Comfort &amp; accessibility</div>
        <label class="settings-check"><input type="checkbox" id="comfort-aaa"> Maximum contrast (AAA)</label>
        <label class="settings-check"><input type="checkbox" id="comfort-dyslexia"> Dyslexia-friendly font</label>
        <label class="settings-check"><input type="checkbox" id="comfort-reduceMotion"> Reduce motion</label>
      </div>

      <!-- F-10.5 — Éditeur Monaco prefs -->
      <div class="settings-section">
        <div class="settings-label">Éditeur</div>
        <div class="settings-row">
          <label for="ep-fontSize">Taille police</label>
          <input class="settings-input-sm" type="number" id="ep-fontSize" min="8" max="32" step="1" value="${ep.fontSize}">
        </div>
        <div class="settings-row">
          <label for="ep-fontFamily">Famille police</label>
          <select id="ep-fontFamily" class="settings-select-sm">
            <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
            <option value="'Fira Code', monospace">Fira Code</option>
            <option value="'Cascadia Code', monospace">Cascadia Code</option>
            <option value="'Source Code Pro', monospace">Source Code Pro</option>
            <option value="monospace">monospace (système)</option>
          </select>
        </div>
        <div class="settings-row">
          <label for="ep-tabSize">Taille tabulation</label>
          <select id="ep-tabSize" class="settings-select-sm">
            <option value="2">2</option>
            <option value="4">4</option>
            <option value="8">8</option>
          </select>
        </div>
        <div class="settings-row">
          <label for="ep-wordWrap">Retour à la ligne</label>
          <select id="ep-wordWrap" class="settings-select-sm">
            <option value="off">Désactivé</option>
            <option value="on">Activé</option>
            <option value="wordWrapColumn">Par colonne</option>
          </select>
        </div>
        <div class="settings-row">
          <label for="ep-lineNumbers">Numéros de ligne</label>
          <select id="ep-lineNumbers" class="settings-select-sm">
            <option value="on">Activé</option>
            <option value="off">Désactivé</option>
            <option value="relative">Relatif</option>
          </select>
        </div>
        <label class="settings-check"><input type="checkbox" id="ep-minimap" ${ep.minimap ? 'checked' : ''}> Minimap</label>
        <label class="settings-check"><input type="checkbox" id="ep-smoothScrolling" ${ep.smoothScrolling ? 'checked' : ''}> Défilement fluide</label>
        <label class="settings-check"><input type="checkbox" id="ep-bracketPair" ${ep.bracketPairColorization ? 'checked' : ''}> Bracket colorization</label>
        <label class="settings-check"><input type="checkbox" id="ep-stickyScroll" ${ep.stickyScroll ? 'checked' : ''}> Sticky scroll</label>
        <label class="settings-check"><input type="checkbox" id="ep-autoFormat" ${ep.autoFormat ? 'checked' : ''}> Auto-format on compile</label>
      </div>

      <!-- F-10.3 — Customizable keyboard shortcuts -->
      <div class="settings-section">
        <div class="settings-label">Keyboard shortcuts</div>
        <div id="ks-settings-container"></div>
      </div>
    </div>
  `;

  _panelElement.style.display = 'none';
  document.body.appendChild(_panelElement);

  // §H.4 — Comfort & accessibility toggles
  const _comfort = getComfort();
  ['aaa', 'dyslexia', 'reduceMotion'].forEach(opt => {
    const cb = document.getElementById('comfort-' + opt);
    if (!cb) return;
    cb.checked = !!_comfort[opt];
    cb.addEventListener('change', () => setComfort(opt, cb.checked));
  });

  // Close button
  const closeBtn = _panelElement.querySelector('[data-action="close-settings"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeSettingsPanel);
  }

  // F-10.5 — wire editor prefs controls
  _wireEditorPrefs();

  // F-10.3 — wire keyboard shortcuts section
  const ksContainer = _panelElement.querySelector('#ks-settings-container');
  if (ksContainer) {
    const s = document.createElement('style');
    s.textContent = SHORTCUTS_CSS;
    document.head.appendChild(s);
    renderShortcutsSettings(ksContainer);
  }

  // Make panel draggable — P1.7: persist position in localStorage
  makeDraggablePersistent(_panelElement, 'settings-panel', _panelElement.querySelector('.panel-header'));
}

function _wireEditorPrefs() {
  const ep = getEditorPrefs();

  // Initialise select values
  const sel = (id, val) => { const el = document.getElementById(id); if (el) el.value = String(val); };
  sel('ep-fontFamily', ep.fontFamily);
  sel('ep-tabSize', ep.tabSize);
  sel('ep-wordWrap', ep.wordWrap);
  sel('ep-lineNumbers', ep.lineNumbers);

  function _onChange() {
    const p = getEditorPrefs();
    const fs = parseInt(document.getElementById('ep-fontSize')?.value || p.fontSize, 10);
    const ff = document.getElementById('ep-fontFamily')?.value || p.fontFamily;
    const ts = parseInt(document.getElementById('ep-tabSize')?.value || p.tabSize, 10);
    const ww = document.getElementById('ep-wordWrap')?.value || p.wordWrap;
    const ln = document.getElementById('ep-lineNumbers')?.value || p.lineNumbers;
    const mm = document.getElementById('ep-minimap')?.checked ?? p.minimap;
    const ss = document.getElementById('ep-smoothScrolling')?.checked ?? p.smoothScrolling;
    const bp = document.getElementById('ep-bracketPair')?.checked ?? p.bracketPairColorization;
    const sk = document.getElementById('ep-stickyScroll')?.checked ?? p.stickyScroll;
    const af = document.getElementById('ep-autoFormat')?.checked ?? p.autoFormat;

    const next = { fontSize: fs, fontFamily: ff, tabSize: ts, wordWrap: ww, lineNumbers: ln,
      minimap: mm, smoothScrolling: ss, bracketPairColorization: bp, stickyScroll: sk, autoFormat: af };
    _saveEditorPrefs(next);
    _applyEditorPrefs(next);
  }

  ['ep-fontSize','ep-fontFamily','ep-tabSize','ep-wordWrap','ep-lineNumbers'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', _onChange);
  });
  ['ep-minimap','ep-smoothScrolling','ep-bracketPair','ep-stickyScroll','ep-autoFormat'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', _onChange);
  });
}

/**
 * Open the settings panel
 */
export function openSettingsPanel() {
  if (!_panelElement) {
    initSettingsPanel();
  }
  _panelElement.style.display = 'block';
  _panelOpen = true;
}

/**
 * Close the settings panel
 */
export function closeSettingsPanel() {
  if (_panelElement) {
    _panelElement.style.display = 'none';
  }
  _panelOpen = false;
}

/**
 * Toggle the settings panel
 */
export function toggleSettingsPanel() {
  if (_panelOpen) {
    closeSettingsPanel();
  } else {
    openSettingsPanel();
  }
}

/**
 * Check if settings panel is open
 */
export function isSettingsPanelOpen() {
  return _panelOpen;
}

/**
 * Make a panel draggable
 */
function makeDraggable(element) {
  const header = element.querySelector('.panel-header');
  if (!header) return;
  
  let isDragging = false;
  let startX, startY, initialX, initialY;
  
  header.style.cursor = 'move';
  
  header.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('panel-close')) return;
    
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    const rect = element.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;
    
    element.style.position = 'fixed';
    element.style.left = initialX + 'px';
    element.style.top = initialY + 'px';
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    element.style.left = (initialX + dx) + 'px';
    element.style.top = (initialY + dy) + 'px';
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

