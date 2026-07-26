// Phase O roadmap UI/UX — Sidebar : navigation par onglets
//
// La sidebar (#sidebar) utilisait un système d'onglets ancré en haut
// (Uniforms / Style / History). Style et History ont depuis été retirés ;
// il ne reste que l'onglet Uniforms (voir roadmap section 10 pour la
// consolidation de ce système d'onglets, désormais réduit à un seul onglet).
//
// Le mécanisme de dock (_dockInto/_ensureRoot) réutilisait le DOM de
// panneaux flottants existants en les réancrant dans le <div class="sidebar-pane">
// correspondant. Il est conservé tel quel pour un éventuel futur onglet.

const TABS = [
  { id: 'render',   key: '1' },
  { id: 'uniforms', key: '2' },
  { id: 'export',   key: '3' },
  { id: 'settings', key: '4' },
  { id: 'about',    key: '5' },
];

let _activeTab = 'uniforms';
const _docked = {}; // id → root element already docked

/** Construit (si besoin) le panneau réel et renvoie son nœud racine. */
async function _ensureRoot(id) {
  return null;
}

async function _dockInto(id) {
  const pane = document.getElementById(`sidebar-pane-${id}`);
  if (!pane) return;
  let root = _docked[id];
  if (!root) {
    root = await _ensureRoot(id);
    if (!root) return;
    root.classList.add('docked');
    _docked[id] = root;
  }
  if (root.parentElement !== pane) pane.appendChild(root);
}

export async function switchSidebarTab(id) {
  if (!TABS.some(t => t.id === id)) return;
  _activeTab = id;

  document.querySelectorAll('.sidebar-tab').forEach(btn => {
    btn.setAttribute('aria-selected', String(btn.dataset.tab === id));
  });
  document.querySelectorAll('.sidebar-pane').forEach(pane => {
    pane.hidden = pane.id !== `sidebar-pane-${id}`;
  });

  if (id !== 'uniforms') await _dockInto(id);
}

export function getActiveSidebarTab() {
  return _activeTab;
}

export function initSidebarTabs() {
  const bar = document.querySelector('.sidebar-tabs');
  if (!bar) return;

  bar.querySelectorAll('.sidebar-tab').forEach(btn => {
    btn.addEventListener('click', () => switchSidebarTab(btn.dataset.tab));
  });

  document.addEventListener('keydown', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const tab = TABS.find(t => t.key === e.key);
    if (!tab) return;
    e.preventDefault();
    switchSidebarTab(tab.id);
  });
}
