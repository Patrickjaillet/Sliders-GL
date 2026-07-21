// §D.1 (UI v2) — Overlay « which-key » / carte des raccourcis
//
// Appuyer sur « ? » (hors saisie) affiche une grille transitoire des raccourcis
// groupés par catégorie ; Échap / clic / « ? » la referme. Complète le panneau
// de raccourcis recherchable (qui, lui, est configurable et persistant).

const GROUPS = [
  { title: 'Editor', keys: [
    ['Ctrl+Enter / Ctrl+S', 'Apply & parse'],
    ['Ctrl+Shift+P', 'Command palette'],
    ['//', 'Insert snippet'],
    ['Alt+drag number', 'Scrub value live'],
    ['Ctrl+= / Ctrl+- / Ctrl+0', 'Font size'],
    ['Ctrl+D / Ctrl+Shift+L', 'Multi-cursor'],
    ['Shift+Alt+F', 'Format'],
  ] },
  { title: 'View', keys: [
    ['Ctrl+Shift+F', 'Code focus'],
    ['F11', 'Fullscreen viewport'],
    ['F', 'Presentation mode'],
    ['Space', 'Pause / resume'],
  ] },
  { title: 'Canvas', keys: [
    ['H', 'Toggle HUD'],
    ['G', 'Toggle guides'],
    ['R (hold)', 'Pixel ruler'],
    ['B (hold)', 'Before / after compare'],
    ['Ctrl+scroll', 'Zoom · Ctrl+0 reset'],
    ['Ctrl+Shift+C', 'Copy frame'],
    ['Right-click', 'Canvas menu'],
  ] },
  { title: 'Tools', keys: [
    ['Ctrl+Shift+G', 'Performance panel'],
    ['Ctrl+Shift+B', 'Color blindness'],
    ['Ctrl+Shift+W', 'Workspace'],
    ['Ctrl+Shift+U', 'LUT library'],
    ['F1', 'Shader docs (GLSL builtins)'],
    ['?', 'This keyboard map'],
  ] },
];

let _el = null;

function _typing(t) {
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t.closest && t.closest('.monaco-editor')));
}

function _close() {
  if (!_el) return;
  _el.classList.remove('open');
  const el = _el; _el = null;
  setTimeout(() => el.remove(), 200);
}

function _open() {
  if (_el) { _close(); return; }
  _el = document.createElement('div');
  _el.id = 'which-key';
  _el.className = 'which-key';
  _el.setAttribute('role', 'dialog');
  _el.setAttribute('aria-label', 'Keyboard shortcuts map');
  _el.innerHTML = `
    <div class="wk-card">
      <div class="wk-head"><span>Keyboard map</span><span class="wk-hint">Esc to close</span></div>
      <div class="wk-grid">
        ${GROUPS.map(g => `
          <div class="wk-group">
            <div class="wk-group-title">${g.title}</div>
            ${g.keys.map(([k, d]) => `<div class="wk-row"><kbd>${k}</kbd><span>${d}</span></div>`).join('')}
          </div>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(_el);
  requestAnimationFrame(() => _el.classList.add('open'));
  _el.addEventListener('mousedown', (e) => { if (e.target === _el) _close(); });
}

export function initWhichKey() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _el) { e.preventDefault(); _close(); return; }
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !_typing(e.target)) {
      e.preventDefault();
      _open();
    }
  });
}
