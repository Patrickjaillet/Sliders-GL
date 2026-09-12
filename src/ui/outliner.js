// §7 roadmap — Outliner: real structure tree instead of two static rows.
//
// Lists the slider category groups (CAT_ORDER in slider.js) with a
// per-group count, each row jumping to that group in the Uniforms panel
// (expanding it if collapsed) — the "Image"/"Uniforms" rows already in
// ui.html are kept as-is above this tree. Rebuilt on every buildUI() call
// (state.callbacks.onBuildUI, chained the same way slider-gutter.js does)
// so group membership and counts stay current as the shader is edited.

import { state } from '../core/state.js';
import { CAT_ORDER, CAT_ICONS, jumpToCategory } from './slider.js';
import { esc, escAttr } from '../core/utils.js';

function _renderCategoryTree() {
  const tree = document.getElementById('outlinerCategoryTree');

  // Total Uniforms count — kept here rather than the separate
  // 'variables-updated' event, since that event is only dispatched by
  // parseAndRebuildUI() (app/init.js) and never by the initial startup
  // path (_forceSliderBuild(), which calls buildUI() directly), which
  // would otherwise leave this stuck at its static "0" until the user
  // manually re-parsed once.
  const uniformCountEl = document.getElementById('outlinerUniformCount');
  if (uniformCountEl) uniformCountEl.textContent = String((state.vars || []).length);

  if (!tree) return;

  const counts = {};
  for (const e of state.vars || []) {
    const cat = e.category || 'misc';
    counts[cat] = (counts[cat] || 0) + 1;
  }
  const cats = [...new Set([...CAT_ORDER, ...Object.keys(counts)])].filter((c) => counts[c]);

  if (cats.length === 0) {
    tree.innerHTML = '';
    return;
  }

  tree.innerHTML = cats
    .map((cat) => {
      const icon = CAT_ICONS[cat] || CAT_ICONS._;
      return `<div class="outliner-row outliner-row-cat" data-outliner-cat="${escAttr(cat)}" role="button" tabindex="0">
        <span class="outliner-icon" aria-hidden="true">${icon}</span> ${esc(cat)}
        <span class="outliner-count">${counts[cat]}</span>
      </div>`;
    })
    .join('');
}

function _onOutlinerClick(e) {
  const row = /** @type {Element} */ (e.target).closest('[data-outliner-cat]');
  if (!row) return;
  jumpToCategory(/** @type {HTMLElement} */ (row).dataset.outlinerCat);
}

function _onOutlinerKeydown(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const row = /** @type {Element} */ (e.target).closest('[data-outliner-cat]');
  if (!row) return;
  e.preventDefault();
  jumpToCategory(/** @type {HTMLElement} */ (row).dataset.outlinerCat);
}

export function initOutlinerTree() {
  const tree = document.getElementById('outlinerCategoryTree');
  if (!tree) return;

  tree.addEventListener('click', _onOutlinerClick);
  tree.addEventListener('keydown', _onOutlinerKeydown);

  const prev = state.callbacks.onBuildUI;
  state.callbacks.onBuildUI = (entries) => {
    if (typeof prev === 'function') prev(entries);
    _renderCategoryTree();
  };
}
