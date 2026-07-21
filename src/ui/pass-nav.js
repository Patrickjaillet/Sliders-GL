// §3.4 roadmap UI/UX — Navigation entre passes multipass (breadcrumb)
//
// Sous l'éditeur, affiche les passes actives et leur graphe de dépendance
// (quelle passe échantillonne quel buffer, via les liaisons de canaux `ch`).
// Cliquer sur un nœud bascule l'éditeur sur cette passe. Masqué tant qu'une
// seule passe (Image) est active — pas d'encombrement pour les shaders simples.

import { state } from '../core/state.js';
import { mpSwitchPass, MP_PASS_LABELS, MP_BUF_COLORS } from '../render/multipass.js';

const ORDER = ['bufA', 'bufB', 'bufC', 'bufD', 'cubeA', 'cubeB', 'sound', 'image'];

let _nav = null;

function _enabledPasses() {
  return ORDER.filter(id => state.mp?.passes?.[id]?.enabled);
}

function _shortLabel(id) {
  return (MP_PASS_LABELS[id] || id).replace('Buf ', '').replace('Cube ', '◇');
}

/** Reconstruit la barre selon les passes actives + leurs dépendances. */
export function refreshPassNav() {
  if (!_nav) return;
  const passes = _enabledPasses();

  // Masquée si seule la passe Image est active.
  if (passes.length <= 1) {
    _nav.classList.add('empty');
    _nav.innerHTML = '';
    _nav.dataset.sig = '';
    return;
  }

  const sig = passes
    .map(id => id + (state.mp.active === id ? '*' : '') + (state.mp.passes[id].ch || []).join(','))
    .join('|');
  if (_nav.dataset.sig === sig) return;
  _nav.dataset.sig = sig;

  _nav.classList.remove('empty');
  _nav.innerHTML = '<span class="pass-nav-title">Passes</span>';

  for (const id of passes) {
    const p = state.mp.passes[id];
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'pass-nav-node' + (state.mp.active === id ? ' active' : '');
    node.dataset.pass = id;

    const color = MP_BUF_COLORS[id] || 'var(--accent)';
    const inputs = [...new Set((p.ch || []).filter(Boolean))];
    const inHtml = inputs.length
      ? `<span class="pass-nav-in">◂ ${inputs
          .map(s => `<i style="color:${MP_BUF_COLORS[s] || 'var(--text-secondary)'}">${_shortLabel(s)}</i>`)
          .join(' ')}</span>`
      : '';

    node.innerHTML =
      `<span class="pass-nav-dot" style="background:${color}"></span>` +
      `<span class="pass-nav-name">${MP_PASS_LABELS[id] || id}</span>${inHtml}`;
    node.title = inputs.length
      ? `${MP_PASS_LABELS[id] || id} — samples ${inputs.map(s => MP_PASS_LABELS[s] || s).join(', ')}`
      : `${MP_PASS_LABELS[id] || id} — click to edit`;

    node.addEventListener('click', () => { try { mpSwitchPass(id); } catch { /* noop */ } });
    _nav.appendChild(node);
  }
}

/** Insère la barre sous l'éditeur et l'abonne aux changements de passe. */
export function initPassNav() {
  // Bug fix: id="rightPanel" doesn't exist (renamed to "viewport-zone" — see
  // same fix in viewport.js's _initSplitter); this silently disabled the bar.
  const right = document.getElementById('viewport-zone');
  const ez = document.getElementById('editorZone');
  if (!right || document.getElementById('passNav')) return;

  _nav = document.createElement('div');
  _nav.id = 'passNav';
  _nav.className = 'pass-nav empty';
  _nav.setAttribute('role', 'navigation');
  _nav.setAttribute('aria-label', 'Shader pass navigation');

  // Juste sous l'éditeur (avant le dock de panneaux s'il est déjà présent).
  if (ez && ez.nextElementSibling) right.insertBefore(_nav, ez.nextElementSibling);
  else right.appendChild(_nav);

  window.addEventListener('zgl:passchange', refreshPassNav);
  refreshPassNav();
}
