// Phase Q roadmap UI/UX — Inspector Contextuel (panneau droit)
//
// L'inspector droit (200px) change de contenu selon le contexte courant
// (pass actif / slider survolé / uniform runtime survolé dans Monaco).
//
// Chaque mode est piloté par un événement déjà existant dans la codebase plutôt
// que par un couplage direct entre modules :
//   - 'pass'    ← window 'zgl:passchange' (émis par multipass.js)
//   - 'slider'  ← mouseover délégué sur #sw (.sr rows)
//   - 'uniform' ← Monaco editor.onMouseMove (réutilise hover-inspector.js)

import { state } from '../core/state.js';
import { esc, fmtN, safeLocalGet, safeLocalSet } from '../core/utils.js';
import { startRangeEdit } from './context-menu.js';
import { RUNTIME, findSliderEntry } from './hover-inspector.js';
import { scoreGLSL } from '../shader/glsl-complexity.js';

const MODE_TITLES = { pass: 'Pass', slider: 'Slider', uniform: 'Uniform' };
let _mode = 'pass';

function _setActivePane(mode) {
  document.querySelectorAll('.insp-pane').forEach((p) => {
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

// §7 roadmap — this pane used to render state.mp's per-pass channel wiring
// (iChannel0-3) and resolution/feedback settings, all leftovers of the
// removed multi-pass/channel-wiring system: state.mp.passes.image.ch is
// permanently [null,null,null,null] and .resolutionScale/.feedbackDelay
// don't even exist on that object (see core/state.js), so this always
// rendered 4x "— empty —" plus a fake "100% / off" rather than anything
// real. It's also only ever called from the 'zgl:passchange' event, which
// nothing dispatches any more (the module that used to emit it,
// multipass.js, was removed) — so in practice this pane was permanently
// stuck on its "No active pass." fallback despite a pass always being
// active. Replaced with an always-accurate global shader summary (uniform
// count, how many differ from their default, complexity score), which is
// genuinely useful default content instead of either the false "empty"
// message or fake per-channel data.
function _renderPassInfo() {
  const vars = state.vars || [];
  const modified = vars.filter(
    (e) => Math.abs(e.value - (state.defaultValues[e.id] ?? e.defaultValue)) > 1e-9
  ).length;

  let complexityRow = '';
  try {
    const code = state.editor ? state.editor.getValue() : state.currentCode || '';
    const res = scoreGLSL(code);
    if (res) {
      complexityRow = `<div class="insp-row"><span class="insp-k">Complexity</span><span class="insp-v">${esc(res.label)} (${res.score})</span></div>`;
    }
  } catch {
    /* non-fatal — leave complexity row out */
  }

  if (vars.length === 0 && !complexityRow) {
    setInspectorMode('pass', _emptyState('Paste a shader to see its summary.'));
    return;
  }

  setInspectorMode(
    'pass',
    `
    <div class="insp-section-title">Shader summary</div>
    <div class="insp-row"><span class="insp-k">Uniforms</span><span class="insp-v">${vars.length}</span></div>
    <div class="insp-row"><span class="insp-k">Modified</span><span class="insp-v">${modified}</span></div>
    ${complexityRow}
  `
  );
}

// ── Mode "slider" ────────────────────────────────────────────────────────────

function _renderSliderInfo(id) {
  const e = state.varMap?.[id];
  if (!e) {
    setInspectorMode('slider', _emptyState('Hover a slider…'));
    return;
  }
  const source = (e.stableKey || '').split(':')[0] || '—'; // def / const / lit

  setInspectorMode(
    'slider',
    `
    <div class="insp-section-title">${esc(e.label)}</div>
    <div class="insp-row"><span class="insp-k">Value</span><span class="insp-v">${fmtN(e.value, e.decimals ?? 3)}</span></div>
    <div class="insp-row"><span class="insp-k">Range</span><span class="insp-v">${fmtN(e.min, e.decimals ?? 3)} … ${fmtN(e.max, e.decimals ?? 3)}</span></div>
    <div class="insp-row"><span class="insp-k">Source</span><span class="insp-v">${esc(source)}</span></div>
    <button class="pb insp-edit-range-btn" type="button">Edit range</button>
  `
  );

  document
    .querySelector('#insp-slider .insp-edit-range-btn')
    ?.addEventListener('click', () => startRangeEdit(id));
}

function _initSliderHover() {
  const sw = document.getElementById('sw');
  if (!sw) return;
  sw.addEventListener('mouseover', (e) => {
    const row = e.target.closest('.sr');
    if (!row) return;
    const id = row.id?.replace(/^sr-/, '');
    if (id) _renderSliderInfo(id);
    if (_mode !== 'slider') setInspectorMode('slider');
  });
  sw.addEventListener('mouseleave', () => {
    if (_mode === 'slider') setInspectorMode('pass');
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
  state.editor.onMouseMove((e) => {
    const pos = e.target?.position;
    const model = pos && state.editor.getModel();
    const word = model?.getWordAtPosition(pos);
    const fn = word && RUNTIME[word.word];
    if (!fn) {
      if (_mode === 'uniform') setInspectorMode('pass');
      return;
    }
    setInspectorMode('uniform', `<div class="insp-uniform-md">${_mdLite(fn())}</div>`);
  });
  state.editor.onMouseLeave(() => {
    if (_mode === 'uniform') setInspectorMode('pass');
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────

const INSPECTOR_OPEN_KEY = 'sl_inspectorOpen';
const INSPECTOR_DEFAULT_OPEN_MIN_WIDTH = 1280;

/** Toggle the visibility of the whole right-hand inspector column. */
export function toggleInspectorPanel(e) {
  if (e) e.stopPropagation();
  const layout = document.getElementById('layout');
  if (!layout) return;
  const open = layout.classList.toggle('inspector-open');
  // Remember the user's explicit choice so it survives reload — otherwise
  // the ≥1280px default-open below would silently re-open it every time.
  safeLocalSet(INSPECTOR_OPEN_KEY, open ? '1' : '0');
}

// §2 roadmap — the Outliner + contextual Inspector column used to start
// closed (--iw: 0px) on every screen size, hiding functional content (the
// Outliner tree and Pass/Slider/Uniform inspector) by default. On desktop
// screens wide enough to afford it (≥1280px) it now opens by default,
// unless the user has explicitly toggled it in a previous session.
function _initDefaultOpenState() {
  const layout = document.getElementById('layout');
  if (!layout) return;
  const saved = safeLocalGet(INSPECTOR_OPEN_KEY, null);
  const shouldOpen =
    saved !== null ? saved === '1' : window.innerWidth >= INSPECTOR_DEFAULT_OPEN_MIN_WIDTH;
  layout.classList.toggle('inspector-open', shouldOpen);
}

export function initInspectorContext() {
  // Switching the active pass is a deliberate user action — always surface its info.
  window.addEventListener('zgl:passchange', () => _renderPassInfo());
  // §7 roadmap — nothing dispatches 'zgl:passchange' any more (see the long
  // comment on _renderPassInfo above), so this pane also refreshes on every
  // buildUI() call (state.callbacks.onBuildUI, chained the same way
  // outliner.js/slider-gutter.js do) to stay current as the shader changes.
  const prevOnBuildUI = state.callbacks.onBuildUI;
  state.callbacks.onBuildUI = (entries) => {
    if (typeof prevOnBuildUI === 'function') prevOnBuildUI(entries);
    if (_mode === 'pass') _renderPassInfo();
  };
  _initSliderHover();
  _initUniformHover();
  _initDefaultOpenState();
  _renderPassInfo();
}

export { setInspectorMode };
