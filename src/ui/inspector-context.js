// Phase Q roadmap UI/UX — Inspector Contextuel (panneau droit)
//
// L'inspector droit (200px) était jusqu'ici toujours "Performance". Il devient
// contextuel : son contenu change selon le contexte courant (perf / pass actif /
// slider survolé / uniform runtime survolé dans Monaco), tout en gardant le mode
// Performance comme contenu par défaut (inchangé, juste déplacé dans #insp-perf).
//
// Chaque mode est piloté par un événement déjà existant dans la codebase plutôt
// que par un couplage direct entre modules :
//   - 'pass'    ← window 'zgl:passchange' (émis par multipass.js)
//   - 'perf'    ← window 'zgl:inspectormode' (émis par perf.js au clic sur le bouton perf)
//   - 'slider'  ← mouseover délégué sur #sw (.sr rows)
//   - 'uniform' ← Monaco editor.onMouseMove (réutilise hover-inspector.js)

import { state } from '../core/state.js';
import { esc, fmtN } from '../core/utils.js';
import { startRangeEdit } from './context-menu.js';
import { switchSidebarTab } from './sidebar-tabs.js';
import { RUNTIME, findSliderEntry } from './hover-inspector.js';

const MODE_TITLES = { perf: 'Performance', pass: 'Pass', slider: 'Slider', uniform: 'Uniform' };
let _mode = 'perf';

function _setActivePane(mode) {
  document.querySelectorAll('.insp-pane').forEach(p => {
    p.classList.toggle('hidden', p.id !== `insp-${mode}`);
  });
  const title = document.getElementById('inspectorTitle');
  if (title) title.textContent = MODE_TITLES[mode] || '';
}

function setInspectorMode(mode, html) {
  if (html !== undefined) {
    const pane = document.getElementById(`insp-${mode}`);
    if (pane) pane.innerHTML = html;
  }
  if (_mode === mode) return;
  _mode = mode;
  const inspector = document.getElementById('inspector');
  // §B.2-style transition : flash opacity+translateX 80ms entre les modes
  inspector?.classList.add('insp-switching');
  _setActivePane(mode);
  requestAnimationFrame(() => inspector?.classList.remove('insp-switching'));
}

function _emptyState(msg) {
  return `<div class="insp-empty">${esc(msg)}</div>`;
}

// ── Mode "pass" ──────────────────────────────────────────────────────────────

async function _renderPassInfo() {
  const id = state.mp?.active;
  const p = id && state.mp.passes[id];
  if (!p) { setInspectorMode('pass', _emptyState('No active pass.')); return; }

  const { MP_PASS_LABELS } = await import('../render/multipass.js');
  const label = MP_PASS_LABELS[id] || id;

  const rows = [];
  for (let i = 0; i < 4; i++) {
    const srcId = p.ch[i];
    let chLabel;
    if (srcId) {
      chLabel = MP_PASS_LABELS[srcId] || srcId;
    } else if (id === 'image' && state.channels?.[i] && state.channels[i].type !== 'none') {
      chLabel = state.channels[i].type;
    } else {
      chLabel = '— empty —';
    }
    rows.push(`<div class="insp-row"><span class="insp-k">iChannel${i}</span><span class="insp-v">${esc(chLabel)}</span></div>`);
  }

  setInspectorMode('pass', `
    <div class="insp-section-title">${esc(label)}</div>
    <div class="insp-row"><span class="insp-k">Resolution</span><span class="insp-v">${Math.round((p.resolutionScale ?? 1) * 100)}%</span></div>
    <div class="insp-row"><span class="insp-k">Feedback</span><span class="insp-v">${p.feedbackDelay ? 'on' : 'off'}</span></div>
    ${rows.join('')}
    <button class="pb insp-edit-channels-btn" type="button">Edit channels</button>
  `);

  document.querySelector('#insp-pass .insp-edit-channels-btn')?.addEventListener('click', async () => {
    await switchSidebarTab('uniforms');
    const chHead = document.getElementById('chHead');
    if (chHead && !document.getElementById('chBody')?.classList.contains('open')) chHead.click();
    document.getElementById('chSection')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

// ── Mode "slider" ────────────────────────────────────────────────────────────

function _renderSliderInfo(id) {
  const e = state.varMap?.[id];
  if (!e) { setInspectorMode('slider', _emptyState('Hover a slider…')); return; }
  const source = (e.stableKey || '').split(':')[0] || '—'; // def / const / lit

  setInspectorMode('slider', `
    <div class="insp-section-title">${esc(e.label)}</div>
    <div class="insp-row"><span class="insp-k">Value</span><span class="insp-v">${fmtN(e.value, e.decimals ?? 3)}</span></div>
    <div class="insp-row"><span class="insp-k">Range</span><span class="insp-v">${fmtN(e.min, e.decimals ?? 3)} … ${fmtN(e.max, e.decimals ?? 3)}</span></div>
    <div class="insp-row"><span class="insp-k">Source</span><span class="insp-v">${esc(source)}</span></div>
    <button class="pb insp-edit-range-btn" type="button">Edit range</button>
  `);

  document.querySelector('#insp-slider .insp-edit-range-btn')?.addEventListener('click', () => startRangeEdit(id));
}

function _initSliderHover() {
  const sw = document.getElementById('sw');
  if (!sw) return;
  sw.addEventListener('mouseover', e => {
    const row = e.target.closest('.sr');
    if (!row) return;
    const id = row.id?.replace(/^sr-/, '');
    if (id) _renderSliderInfo(id);
    if (_mode !== 'slider') setInspectorMode('slider');
  });
  sw.addEventListener('mouseleave', () => {
    if (_mode === 'slider') setInspectorMode('perf');
  });
}

// ── Mode "uniform" ───────────────────────────────────────────────────────────

function _mdLite(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/_(.+?)_/g, '<i>$1</i>');
}

function _initUniformHover() {
  if (!state.editor) return;
  state.editor.onMouseMove(e => {
    const pos = e.target?.position;
    const model = pos && state.editor.getModel();
    const word = model?.getWordAtPosition(pos);
    const fn = word && RUNTIME[word.word];
    if (!fn) {
      if (_mode === 'uniform') setInspectorMode('perf');
      return;
    }
    setInspectorMode('uniform', `<div class="insp-uniform-md">${_mdLite(fn())}</div>`);
  });
  state.editor.onMouseLeave(() => {
    if (_mode === 'uniform') setInspectorMode('perf');
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────

// Phase 5 — inspector properties style: click a perf-section title to
// collapse/expand that property group (disclosure triangle via CSS).
function _initPerfSectionCollapse() {
  const body = document.getElementById('insp-perf');
  if (!body) return;
  body.addEventListener('click', e => {
    const title = e.target.closest('.perf-section-title');
    if (!title) return;
    title.closest('.perf-section')?.classList.toggle('collapsed');
  });
}

export function initInspectorContext() {
  // Switching the active pass is a deliberate user action — always surface its info.
  window.addEventListener('zgl:passchange', () => _renderPassInfo());
  window.addEventListener('zgl:inspectormode', ev => {
    const mode = ev.detail?.mode;
    if (mode === 'perf') setInspectorMode('perf');
  });
  _initSliderHover();
  _initUniformHover();
  _initPerfSectionCollapse();
}

export { setInspectorMode };
