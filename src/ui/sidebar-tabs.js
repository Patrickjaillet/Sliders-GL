// Phase O roadmap UI/UX — Sidebar : navigation par onglets
//
// La sidebar (#sidebar) passe d'une vue plate (uniforms) à un système
// d'onglets ancré en haut : Uniforms / Style / History.
//
// Style/History sont des panneaux flottants existants
// (style-panel.js, version-history-panel.js), chacun
// avec sa propre logique d'ouverture/fermeture et son propre CSS
// (position: fixed, draggable header…). Plutôt que dupliquer leur rendu
// (risque de doublons d'id DOM), on les RÉUTILISE tels quels : au premier
// clic sur l'onglet, on appelle la fonction open() réelle du panneau (donc
// son DOM se construit/affiche normalement dans <body>), puis on RÉPARENTE
// ce même nœud DOM dans le <div class="sidebar-pane"> correspondant et on
// lui ajoute la classe .docked, qui neutralise le positionnement flottant
// (position/top/left/width…) via panels.css. Le panneau reste pleinement
// fonctionnel (ses propres handlers de fermeture, refresh, etc. s'appliquent
// toujours) — il est juste ancré ailleurs dans le DOM.
//
// Les panneaux restent aussi accessibles en flottant via leurs déclencheurs
// habituels (menu Tools) : les rouvrir alors qu'ils sont docked les laisse
// simplement masqués dans leur pane (comportement conservé, non régressif).

const TABS = [
  { id: 'uniforms', key: '1' },
  { id: 'history',   key: '4' },
];

let _activeTab = 'uniforms';
const _docked = {}; // id → root element already docked

/** Construit (si besoin) le panneau réel et renvoie son nœud racine. */
async function _ensureRoot(id) {
  if (id === 'history') {
    const mod = await import('./version-history-panel.js');
    await mod.initVersionHistoryPanel();
    mod.openPanel();
    return document.getElementById('z-gl-vh-panel');
  }
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
