// §7.3 roadmap UI/UX — Badge de complexité du shader
//
// Estime le coût du shader (échantillons de texture, trig, boucles, branches…)
// via shader/glsl-complexity.js et l'affiche dans la barre de l'éditeur, coloré
// vert / jaune / rouge selon le score.

import { state } from '../core/state.js';
import { scoreGLSL } from '../shader/glsl-complexity.js';

let _deb = null;

function _update() {
  const badge = document.getElementById('complexityBadge');
  if (!badge || !state.editor) return;
  let res;
  try { res = scoreGLSL(state.editor.getValue()); } catch { res = null; }
  if (!res) { badge.classList.add('cx-hidden'); return; }
  badge.classList.remove('cx-hidden');
  badge.textContent = `⚙ ${res.score}`;
  badge.title = `Shader complexity: ${res.score} (${res.label}) — `
    + `${res.detail.textures} tex · ${res.detail.loops} loops · ${res.detail.branches} branches`;
  badge.classList.remove('cx-low', 'cx-mid', 'cx-high');
  badge.classList.add(res.score < 100 ? 'cx-low' : res.score < 500 ? 'cx-mid' : 'cx-high');
}

export function initComplexityBadge() {
  if (!state.editor) return;
  _update();
  state.editor.onDidChangeModelContent(() => {
    clearTimeout(_deb);
    _deb = setTimeout(_update, 500);
  });
}
