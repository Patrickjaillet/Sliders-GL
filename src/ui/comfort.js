// §H.4 (UI v2) — Options de confort & accessibilité
//
// Préférences inclusives appliquées par classes sur :root (CSS dans
// accessibility.css), persistées dans localStorage :
//   • Contraste AAA   — texte/bordures à contraste maximal
//   • Police dyslexie — empilement lisible + interlettrage augmenté
//   • Mouvement réduit — force les transitions à ~0 (au-delà de l'OS)

import { safeLocalGet, safeLocalSet } from '../core/utils.js';

const KEY = 'sl_comfort';
const OPTS = {
  aaa:         'comfort-aaa',
  dyslexia:    'comfort-dyslexia',
  reduceMotion:'comfort-reduce-motion',
};

function _load() {
  try { return JSON.parse(safeLocalGet(KEY, '{}')) || {}; } catch { return {}; }
}

/** Réapplique les préférences persistées (appelé au démarrage). */
export function applyComfort() {
  const s = _load();
  const root = document.documentElement;
  for (const [opt, cls] of Object.entries(OPTS)) root.classList.toggle(cls, !!s[opt]);
}

export function setComfort(opt, on) {
  if (!(opt in OPTS)) return;
  const s = _load();
  s[opt] = !!on;
  safeLocalSet(KEY, JSON.stringify(s));
  document.documentElement.classList.toggle(OPTS[opt], !!on);
}

export function getComfort() { return _load(); }
