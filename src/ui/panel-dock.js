// §2.2 roadmap UI/UX — Barre de dock des panneaux (taskbar)
//
// Les panneaux flottants (Modulation, Ray March, SDF…) encombrent
// vite l'écran. Cette barre, placée en bas de la colonne droite (à côté de
// l'éditeur), affiche une puce par panneau OUVERT et permet de le refermer
// d'un clic. Elle se masque quand aucun panneau n'est ouvert.
//
// L'état « ouvert » est détecté en observant la visibilité du nœud racine de
// chaque panneau enregistré (MutationObserver), ce qui fonctionne quel que
// soit le mécanisme d'ouverture/fermeture propre à chaque panneau.

import { state } from '../core/state.js';

// Registre : { key, label, root (sélecteur du nœud racine du panneau),
//              btn (id du bouton qui (dé)clenche le toggle) — pour les panneaux
//              exposés par un id dédié — OU dataAction (valeur de l'attribut
//              data-action) pour ceux exposés via la délégation d'événements
//              générique de events.js. cat pilote l'accent couleur du chip
//              (Phase P) : 'doc' (bleu) / 'create' (vert) / 'debug' (orange). }
const PANELS = [
  { key: 'docs',     label: 'Docs',     btn: 'shaderDocsBtn',           root: '#sdpOverlay',         cat: 'doc' },
  // Phase P — registre complété : panneaux trouvés avec un déclencheur réel
  // vérifié (id ou data-action) et un nœud racine confirmé dans le code.
  { key: 'workspace', label: 'Projects', btn: 'workspaceToggleBtn',     root: '#z-gl-workspace-sidebar', cat: 'doc' },
  { key: 'includes',  label: 'Includes', btn: 'includesMgrBtn',         root: '#zgl-includes-panel', cat: 'doc' },
  // Retirés (nettoyage) : 'rm' (RayMarch, #zgl-rm-panel), 'sdfviz' (SDF Viz,
  // #zgl-sdfviz-panel) et 'sdfcomp' (SDF Composer, #zgl-sdfcomp-panel) —
  // aucun bouton ni nœud racine correspondant nulle part dans le code
  // (recherche exhaustive), fichiers JS associés (sdf-library.js,
  // shader/composer/*) supprimés en parallèle : panneaux fantômes, jamais
  // atteignables, dans la même veine que 'camera' ci-dessous.
  // Non ajoutés : 'settings' n'a aucun déclencheur (id ou data-action) présent
  // dans ui.html actuellement — seulement accessible au clavier (Ctrl+,).
  // 'camera' (camera-panel.js) a été retiré du code : panneau orphelin (aucun
  // déclencheur UI, et ses uniforms caméra n'étaient de toute façon jamais
  // branchés au rendu) — voir roadmap Phase Z.
];

let _dock = null;
let _observer = null;
let _refreshQueued = false;

/** Un élément est-il réellement visible à l'écran ? (robuste pour position:fixed) */
function _isVisible(el) {
  if (!el || !el.isConnected) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) {
    return false;
  }
  const r = el.getBoundingClientRect();
  return r.width > 1 && r.height > 1;
}

function _panelEl(entry) {
  try {
    return document.querySelector(entry.root);
  } catch {
    return null;
  }
}

/** Résout le bouton qui pilote l'ouverture/fermeture d'un panneau du registre. */
function _toggleBtn(entry) {
  if (entry.btn) return document.getElementById(entry.btn);
  if (entry.dataAction) return document.querySelector(`[data-action="${entry.dataAction}"]`);
  return null;
}

/** (Re)construit les puces selon les panneaux actuellement ouverts. */
function refreshDock() {
  if (!_dock) return;
  const open = PANELS.filter(p => _isVisible(_panelEl(p)));

  // Diff léger : reconstruit seulement si l'ensemble ouvert a changé.
  const sig = open.map(p => p.key).join(',');
  if (_dock.dataset.sig === sig) return;
  _dock.dataset.sig = sig;

  _dock.innerHTML = '';
  if (open.length === 0) {
    _dock.classList.add('empty');
    return;
  }
  _dock.classList.remove('empty');

  const title = document.createElement('span');
  title.className = 'panel-dock-title';
  title.textContent = 'Panels';
  _dock.appendChild(title);

  for (const p of open) {
    const chip = document.createElement('button');
    chip.className = 'panel-dock-chip';
    chip.type = 'button';
    chip.dataset.panelKey = p.key;
    if (p.cat) chip.dataset.panelCat = p.cat;
    chip.title = `${p.label} — click to close`;
    chip.innerHTML = `<span class="pdc-label">${p.label}</span><span class="pdc-close" aria-hidden="true">✕</span>`;
    chip.addEventListener('click', () => {
      const btn = _toggleBtn(p); // referme via le toggle existant du panneau
      if (btn) btn.click();
      queueRefresh();
    });
    _dock.appendChild(chip);
  }
}

function queueRefresh() {
  if (_refreshQueued) return;
  _refreshQueued = true;
  requestAnimationFrame(() => {
    _refreshQueued = false;
    refreshDock();
  });
}

// Phase Z — la plupart des panneaux sont ajoutés comme enfants directs de
// <body> (vérifié : ~37 fichiers), donc un childList sur <body> suffit à
// détecter une première ouverture. Pour les changements d'attribut (.open,
// .hidden, display) sur un panneau déjà existant, on vérifie que la cible (ou
// un ancêtre) correspond bien à un .root du registre — ça filtre tout le bruit
// non lié aux panneaux (ex: toggles de classe sur les rows de sliders pendant
// un drag, qui mutent très fréquemment et n'ont rien à voir avec le dock).
function _isRelevantMutation(records) {
  for (const r of records) {
    if (r.type === 'childList' && r.target === document.body) return true;
    const t = r.target;
    if (t.nodeType !== 1) continue;
    for (const p of PANELS) {
      try { if (t.closest(p.root)) return true; } catch { /* sélecteur invalide — ignore */ }
    }
  }
  return false;
}

// Phase P — quelques panneaux du registre (palette, warp, includes, LUT…) n'ont
// pas de gestion Escape propre. On comble ce trou ici plutôt que dans chaque
// fichier de panneau, pour rester dans le scope de panel-dock.js : à l'appui
// d'Escape, ferme le premier panneau du registre actuellement visible et rend
// le focus à l'éditeur Monaco.
function _onGlobalEscape(e) {
  if (e.key !== 'Escape') return;
  const active = document.activeElement;
  // Ne vole pas Escape à une édition en cours (input/textarea/contenteditable) :
  // ces éléments gèrent déjà leur propre sortie (blur/revert) via leur handler local.
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;

  const open = PANELS.find(p => _isVisible(_panelEl(p)));
  if (!open) return;
  const btn = _toggleBtn(open);
  if (!btn) return;
  btn.click();
  queueRefresh();
  state.editor?.focus();
}

/** Initialise la barre de dock + l'observateur de visibilité des panneaux. */
export function initPanelDock() {
  // Bug fix: id="rightPanel" doesn't exist (renamed to "viewport-zone" — see
  // same fix in viewport.js's _initSplitter); this silently disabled the dock
  // entirely (Phase P's registry additions never actually rendered).
  const right = document.getElementById('viewport-zone');
  if (!right || document.getElementById('panelDock')) return;

  _dock = document.createElement('div');
  _dock.id = 'panelDock';
  _dock.className = 'panel-dock empty';
  _dock.setAttribute('role', 'toolbar');
  _dock.setAttribute('aria-label', 'Open panels');
  right.appendChild(_dock);

  // Observe le DOM global : tout ajout/suppression/changement de style ou de
  // classe peut traduire l'ouverture ou la fermeture d'un panneau. subtree:true
  // reste nécessaire (les panneaux sont ajoutés comme enfants de <body>, et les
  // attributs surveillés changent sur le panneau lui-même, pas sur <body>) —
  // mais Phase Z filtre les mutations non pertinentes avant de déclencher
  // queueRefresh(), pour éviter une RAF à chaque toggle de classe ailleurs
  // dans l'UI (ex: drag de slider, qui mute .class/.style très fréquemment).
  _observer = new MutationObserver(records => {
    if (_isRelevantMutation(records)) queueRefresh();
  });
  _observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden'],
  });

  document.addEventListener('keydown', _onGlobalEscape);

  refreshDock();
}
