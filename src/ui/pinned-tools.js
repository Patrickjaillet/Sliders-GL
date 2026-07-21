// §1.2 roadmap UI/UX — Outils épinglés dans la barre d'outils
//
// L'utilisateur peut épingler jusqu'à 5 outils du menu « Tools » directement
// dans le header via un clic droit sur l'entrée du menu. Les outils épinglés
// déclenchent la même action que l'entrée d'origine (délégation par .click()).
// La sélection est persistée dans localStorage (clé sl_pinnedTools).

import { safeLocalGet, safeLocalSet } from '../core/utils.js';
import { toast } from '../io/actions.js';

const STORAGE_KEY = 'sl_pinnedTools';
const MAX_PINNED = 5;

/** @returns {string[]} liste des IDs de boutons épinglés */
function _getPinned() {
  try {
    const raw = safeLocalGet(STORAGE_KEY, '[]');
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** @param {string[]} ids */
function _setPinned(ids) {
  safeLocalSet(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_PINNED)));
}

/** Lit le libellé lisible d'une entrée de menu .tmenu-item */
function _labelOf(menuItem) {
  return menuItem.querySelector('.tmenu-label')?.textContent?.trim()
    || menuItem.getAttribute('aria-label')
    || 'Tool';
}

/** Clone l'icône SVG d'une entrée de menu (sans le markup superflu) */
function _iconHtmlOf(menuItem) {
  const svg = menuItem.querySelector('svg');
  return svg ? svg.outerHTML : '◆';
}

function _isPinned(id) {
  return _getPinned().includes(id);
}

function togglePin(id) {
  const pinned = _getPinned();
  const idx = pinned.indexOf(id);
  if (idx >= 0) {
    pinned.splice(idx, 1);
    _setPinned(pinned);
    renderPinnedTools();
    return false;
  }
  if (pinned.length >= MAX_PINNED) {
    toast(`Max ${MAX_PINNED} pinned tools — unpin one first`, 'warn');
    return _isPinned(id);
  }
  pinned.push(id);
  _setPinned(pinned);
  renderPinnedTools();
  return true;
}

/** Reconstruit la bande d'outils épinglés dans le header. */
export function renderPinnedTools() {
  const strip = document.getElementById('pinnedTools');
  if (!strip) return;
  strip.innerHTML = '';

  for (const id of _getPinned()) {
    const src = document.getElementById(id);
    if (!src) continue; // l'outil n'existe plus / a été retiré

    const label = _labelOf(src);
    const btn = document.createElement('button');
    btn.className = 'hb pinned-tool-btn';
    btn.type = 'button';
    btn.dataset.pinnedFor = id;
    btn.title = `${label} — right-click to unpin`;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = _iconHtmlOf(src);

    // Clic gauche → déclenche l'action d'origine
    btn.addEventListener('click', () => {
      const target = document.getElementById(id);
      if (target) target.click();
    });

    // Clic droit → désépingle
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      togglePin(id);
      toast(`Unpinned ${label}`, 'ok');
    });

    strip.appendChild(btn);
  }
}

/** Marque visuellement les entrées du menu déjà épinglées. */
function _syncMenuPinnedState() {
  const pinned = _getPinned();
  document.querySelectorAll('#toolsMorePopup .tmenu-item').forEach(item => {
    if (!(item instanceof HTMLElement)) return;
    item.classList.toggle('is-pinned', pinned.includes(item.id));
  });
}

/**
 * Initialise le système d'outils épinglés : attache le clic droit sur
 * chaque entrée du menu Tools et effectue le rendu initial.
 */
export function initPinnedTools() {
  const popup = document.getElementById('toolsMorePopup');
  if (popup) {
    popup.querySelectorAll('.tmenu-item').forEach(item => {
      if (!(item instanceof HTMLElement) || !item.id) return;
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const nowPinned = togglePin(item.id);
        _syncMenuPinnedState();
        toast(`${nowPinned ? 'Pinned' : 'Unpinned'} ${_labelOf(item)}`, 'ok');
      });
    });
  }

  renderPinnedTools();
  _syncMenuPinnedState();
}
