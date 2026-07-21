// Slider UI — compositor-style scrubbable numeric fields
// Pointer capture · Shift×0.1 · Ctrl×10 · dblclick reset · RAF batching

import { state, notify } from '../core/state.js';
import { clampPct, fmtN, esc, escAttr, encArg, safeLocalGet, safeLocalSet } from '../core/utils.js';
import { parseShader } from '../shader/parser.js';
import { toast } from '../io/actions.js';
import {
  patchLine, fmtNum, isFromSlider, setFromMonaco,
  setSliderHooks, sliderHooks, _liveDebounce,
} from './slider-logic.js';
import { applyCustomizations } from './slider-customizations.js';
import { groupEntriesForRender, detectColorScale, componentsToHex } from './slider-color.js';
import { openHSLPicker } from './color-picker.js';

const CAT_ORDER = ['globals','iterations','rotation','camera','fractal','glow','color','vectors','misc'];
// Phase E — a small monochrome glyph per category for faster visual scanning.
const CAT_ICONS = {
  globals: '◆', iterations: '↻', rotation: '⟳', camera: '◫', fractal: '❉',
  glow: '✦', color: '◉', vectors: '⊹', misc: '•', _: '▸',
};
const collapsedGroups = new Set(
  (() => { try { return JSON.parse(safeLocalGet('sl_collapsed_groups', '[]')) || []; } catch { return []; } })()
);

// ── RAF batching for fill updates ────────────────────────────────────────────
// Phase 8.2 — Toutes les mises à jour DOM visuelles sont groupées dans un seul
// requestAnimationFrame par frame. Jamais en direct depuis oninput/pointermove.
let _rafPending = false;
const _fillQueue  = new Set();   // ids dont le fill (--fill-pct) doit être mis à jour
const _domQueue   = new Map();   // id → { val, decimals } pour sv + aria + modified
const _xyByComp   = new Map();   // component id → XY-pad group id (Phase B)

function scheduleFillUpdate(id) {
  _fillQueue.add(id);
  _scheduleRaf();
}

function _scheduleDomUpdate(id, val, decimals) {
  _domQueue.set(id, { val, decimals });
  _scheduleRaf();
}

function _scheduleRaf() {
  if (!_rafPending) {
    _rafPending = true;
    requestAnimationFrame(_flushFrame);
  }
}

function _flushFrame() {
  _rafPending = false;

  // ── Flush fill + thumb (+ angle dial if this entry is one) ───────
  for (const id of _fillQueue) {
    const e = state.varMap[id];
    if (!e) continue;
    const field = document.getElementById('sl-' + id);
    const pct   = e.isLog ? _logPct(e.value, e.min, e.max) : clampPct(e.value, e.min, e.max);
    if (field) field.style.setProperty('--fill-pct', pct + '%');
    _updateDial(id);   // no-op unless an angle dial exists for this id
    const xyg = _xyByComp.get(id);
    if (xyg) _updateXY(xyg);
  }
  _fillQueue.clear();

  // ── Flush sv + aria + modified ────────────────────────────────
  for (const [id, { val, decimals }] of _domQueue) {
    const e   = state.varMap[id];
    const sv  = document.getElementById('sv-'  + id);
    const row = document.getElementById('sr-'  + id);

    if (sv && document.activeElement !== sv) {
      // Ne pas écraser la valeur si l'input est en cours d'édition
      sv.value = fmtN(val, decimals);
      // micro-bump animation (dans le rAF, pas de forced reflow)
      sv.classList.remove('bumping');
      // requestAnimationFrame imbriqué pour le cycle add-class après remove-class
      requestAnimationFrame(() => {
        sv.classList.add('bumping');
        sv.addEventListener('animationend', () => sv.classList.remove('bumping'), { once: true });
      });
    }
    if (row && e) {
      const isModified = Math.abs(val - (state.defaultValues[id] ?? e.defaultValue)) > 1e-9;
      row.classList.toggle('modified', isModified);
    }
  }
  _domQueue.clear();

  // Phase E — keep the "modified only" view fresh as values cross their default.
  if (_filterModified) _applyFilter();
}

// Alias rétrocompat — conservé pour actions.js / ux.js
function _flushFills() { _flushFrame(); }

// ── Build UI ─────────────────────────────────────────────────────────────────
function buildUI(entries) {
  state.vars = entries;
  state.varMap = {};
  state.defaultValues = {};
  _xyByComp.clear();   // rebuilt below as XY pads are rendered
  // Notify registered post-buildUI hooks (e.g. MIDI target selector refresh).
  // Use state.callbacks.onBuildUI instead of window.buildUI monkey-patching.
  if (typeof state.callbacks.onBuildUI === 'function') state.callbacks.onBuildUI(entries);
  entries.forEach(e => { state.varMap[e.id] = e; state.defaultValues[e.id] = e.defaultValue; });
  const parseWarnings = Array.isArray(state.parseWarnings) ? state.parseWarnings : [];

  const root = document.getElementById('sw');
  if (entries.length === 0) {
    const warnBlock = parseWarnings.length > 0
      ? `<div class="es" style="margin-bottom:8px">
      <div class="es-title">Ignored #define expressions (${parseWarnings.length})</div>
      <div class="es-sub">Only literal numeric #define values are currently slider-enabled.</div>
    </div>`
      : '';
    root.innerHTML = `${warnBlock}<div class="es">
      <div class="es-icon">◈</div>
      <div class="es-title">Paste a ShaderToy shader</div>
      <div class="es-sub">Paste any ShaderToy code in the editor below.<br>
      Press <span class="es-key">Ctrl+S</span> or click<br>
      <span style="color:var(--ac3)">⟳ parse</span> to extract all constants.</div></div>`;
    return;
  }

  const groups = {};
  const pinnedEntries = [];
  entries.forEach(e => {
    if (state.pinnedIds.has(e.stableKey)) { pinnedEntries.push(e); return; }
    if (!groups[e.category]) groups[e.category] = [];
    groups[e.category].push(e);
  });

  const allCats = [...new Set([...CAT_ORDER, ...Object.keys(groups)])].filter(c => groups[c]);

  // Sécurité UX : si TOUS les groupes sont marqués repliés, c'est presque toujours
  // un état stale/accidentel (personne ne replie volontairement chaque groupe).
  // On déplie tout pour que les sliders soient visibles d'emblée, et on purge la
  // préférence persistée correspondante. Évite le panneau « vide » au démarrage.
  if (allCats.length > 0 && allCats.every(c => collapsedGroups.has(c))) {
    allCats.forEach(c => collapsedGroups.delete(c));
    try { safeLocalSet('sl_collapsed_groups', JSON.stringify([...collapsedGroups])); } catch {}
  }

  let html = '';

  if (parseWarnings.length > 0) {
    const preview = parseWarnings.slice(0, 3)
      .map(w => `L${w.line} ${esc(w.name)} = ${esc(w.raw)}`)
      .join('<br>');
    const more = parseWarnings.length > 3 ? '<br>...' : '';
    html += `<div class="es" style="margin-bottom:8px">
      <div class="es-title">Ignored #define expressions (${parseWarnings.length})</div>
      <div class="es-sub">${preview}${more}</div>
    </div>`;
  }

  // Phase S — dedicated pinned zone, rendered above the category groups
  if (pinnedEntries.length > 0) {
    html += `<div id="pinned-zone">
      <div class="pinned-zone-header">Pinned</div>
      ${groupEntriesForRender(pinnedEntries).map(_renderUnitHTML).join('')}
    </div>`;
  }

  allCats.forEach(cat => {
    if (!groups[cat]) return;
    const isCollapsed = collapsedGroups.has(cat);
    const isGlobal = cat === 'globals';
    const catArg = encArg(cat);
    html += `<div class="sh${isGlobal?' globals-header':''}${isCollapsed?' collapsed':''}"
      onclick="toggleGroup(decodeURIComponent('${catArg}'),event)"
      oncontextmenu="openGroupCtxMenu(event,decodeURIComponent('${catArg}'))" data-cat="${escAttr(cat)}">
      <span class="sh-arrow">▾</span>
      <span><span class="sh-ico" aria-hidden="true">${CAT_ICONS[cat] || CAT_ICONS._}</span>${esc(cat)}${isGlobal?' <span style="color:var(--ac4);font-size:7px">DEFINES + CONSTS</span>':''}</span>
    </div>`;

    if (!isCollapsed) {
      // Phase B — group consecutive colour-component runs into one swatch widget,
      // then pick the most specific widget per entry (angle dial / stepper / slider).
      for (const unit of groupEntriesForRender(groups[cat])) {
        html += _renderUnitHTML(unit);
      }
    }
  });

  root.innerHTML = html;
  _attachSliderEvents(root);
  _attachDragKeyboard(root);

  // Phase 5 — sidebar "assets panel" style: alternating row background, applied
  // as a post-pass over visual row order (group headers are interspersed in
  // the DOM, so a plain nth-child/nth-of-type CSS selector can't track it).
  root.querySelectorAll('.sr').forEach((row, i) => {
    row.classList.toggle('row-alt', i % 2 === 1);
  });

  // Phase E — show the filter bar only when there are sliders, then apply the
  // active filter to the freshly built rows.
  const fbar = document.getElementById('slFilter');
  if (fbar) fbar.style.display = entries.length > 0 ? '' : 'none';
  _applyFilter();
}

// Dispatches a render unit (from groupEntriesForRender) to its row-HTML builder.
// Shared by the category groups and the pinned zone (Phase S) to avoid duplicate DOM ids.
function _renderUnitHTML(unit) {
  if (unit.kind === 'color') return _colorRowHTML(unit);
  if (unit.kind === 'xy') return _xyRowHTML(unit);
  if (_isEnum(unit.entry)) return _enumRowHTML(unit.entry);
  if (_isBool(unit.entry)) return _boolRowHTML(unit.entry);
  if (_isAngle(unit.entry)) return _dialRowHTML(unit.entry);
  if (_isStepper(unit.entry)) return _stepperRowHTML(unit.entry);
  return _sliderRowHTML(unit.entry);
}

// ── Panel filter (Phase E): live search + "modified only" ────────────────────
let _filterQuery = '';
let _filterModified = false;

function initSliderFilter() {
  const input = document.getElementById('slFilterInput');
  const modBtn = document.getElementById('slFilterModified');
  if (input && !input._slBound) {
    input._slBound = true;
    input.addEventListener('input', () => { _filterQuery = input.value || ''; _applyFilter(); });
  }
  if (modBtn && !modBtn._slBound) {
    modBtn._slBound = true;
    modBtn.addEventListener('click', () => {
      _filterModified = !_filterModified;
      modBtn.classList.toggle('active', _filterModified);
      modBtn.setAttribute('aria-pressed', String(_filterModified));
      _applyFilter();
    });
  }
}

// Show/hide rows (and empty group headers) per the active filter. Pure DOM —
// never touches state.varMap, so hidden sliders keep patching correctly.
//
// Fix sliders invisibles : un groupe REPLIÉ (collapsed) n'émet aucune row (.sr),
// seulement son en-tête (.sh). L'ancienne logique mettait alors headerVisible=false
// → header.style.display='none' → TOUS les en-têtes repliés disparaissaient, rendant
// le panneau vide et impossible à déplier. On ne masque un en-tête QUE si un filtre
// actif (recherche ou "modified") est en cours ET qu'aucune row ne correspond.
// Sans filtre actif, les en-têtes restent toujours visibles (repliés ou non).
function _applyFilter() {
  const root = document.getElementById('sw');
  if (!root) return;
  const q = _filterQuery.trim().toLowerCase();
  const filterActive = q.length > 0 || _filterModified;
  let header = null;
  let headerVisible = false;
  let headerCollapsed = false;
  const finalize = () => {
    if (!header) return;
    // En-tête toujours visible si aucun filtre actif, ou si le groupe est replié
    // (un groupe replié n'a pas de rows à matcher mais doit rester cliquable),
    // ou si au moins une de ses rows correspond au filtre.
    const show = !filterActive || headerCollapsed || headerVisible;
    header.style.display = show ? '' : 'none';
  };
  // Phase S — query .sh/.sr by descendant selector (not just root.children) so
  // pinned rows nested inside #pinned-zone are included in the filter pass.
  for (const el of Array.from(root.querySelectorAll('.sh, .sr'))) {
    if (el.classList.contains('sh')) {
      finalize();
      header = el;
      headerVisible = false;
      headerCollapsed = el.classList.contains('collapsed');
      continue;
    }
    if (!el.classList.contains('sr')) continue;
    const label = (el.querySelector('.sn')?.textContent || '').toLowerCase();
    const hint = (el.querySelector('.s-hint')?.textContent || '').toLowerCase();
    const cat = (header?.dataset.cat || '').toLowerCase();
    const okQ = !q || label.includes(q) || hint.includes(q) || cat.includes(q);
    const okMod = !_filterModified || el.classList.contains('modified');
    const visible = okQ && okMod;
    el.style.display = visible ? '' : 'none';
    if (visible) headerVisible = true;
  }
  finalize();
}

// ── Angle dial (Phase B) ─────────────────────────────────────────────────────
// ── F-3.5 Enum widget ────────────────────────────────────────────────────────
function _isEnum(e) {
  return Array.isArray(e.enumOptions) && e.enumOptions.length > 0;
}

function _enumRowHTML(e) {
  const isPinned = state.pinnedIds.has(e.stableKey);
  const isModified = Math.abs(e.value - e.defaultValue) > 1e-9;
  const idArg = encArg(e.id);
  const current = Math.round(e.value);
  const buttons = e.enumOptions.map((opt, i) =>
    `<button class="sl-enum-btn${i === current ? ' active' : ''}"
      onclick="enumSetVal(decodeURIComponent('${idArg}'),${i})"
      role="radio" aria-checked="${i === current}">${esc(opt)}</button>`
  ).join('');
  return `
<div class="sr sr-enum${isPinned?' pinned':''}${isModified?' modified':''}" id="sr-${e.id}" title="${esc(e.hint)}">
  <div class="sr-top">
    <span class="sr-drag" draggable="true" ondragstart="slDragStart(event,decodeURIComponent('${idArg}'))" title="Drag to reorder" tabindex="0" aria-label="Drag to reorder">⠿</span>
    <button class="pin-btn${isPinned?' pinned':''}" onclick="togglePin(decodeURIComponent('${idArg}'))" aria-label="${isPinned?'Unpin':'Pin'}">${isPinned?'&#128204;':'&#8857;'}</button>
    <span class="sn" id="sn-${e.id}">${esc(e.label)}</span>
    <span class="sn-tag">ENUM</span>
  </div>
  <div class="st st-enum" role="radiogroup" aria-label="${esc(e.label)}">${buttons}</div>
</div>`;
}

function enumSetVal(id, idx) {
  const e = state.varMap[id];
  if (!e) return;
  onValChange(id, idx);
  // Update button states
  const sr = document.getElementById('sr-' + id);
  sr?.querySelectorAll('.sl-enum-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
    btn.setAttribute('aria-checked', String(i === idx));
  });
}

// ── F-3.6 Bool toggle ────────────────────────────────────────────────────────
function _isBool(e) {
  return !!e.isBool;
}

function _boolRowHTML(e) {
  const isPinned = state.pinnedIds.has(e.stableKey);
  const isModified = Math.abs(e.value - e.defaultValue) > 1e-9;
  const idArg = encArg(e.id);
  const isOn = e.value > 0.5;
  return `
<div class="sr sr-bool${isPinned?' pinned':''}${isModified?' modified':''}" id="sr-${e.id}" title="${esc(e.hint)}">
  <div class="sr-top">
    <span class="sr-drag" draggable="true" ondragstart="slDragStart(event,decodeURIComponent('${idArg}'))" title="Drag to reorder" tabindex="0" aria-label="Drag to reorder">⠿</span>
    <button class="pin-btn${isPinned?' pinned':''}" onclick="togglePin(decodeURIComponent('${idArg}'))" aria-label="${isPinned?'Unpin':'Pin'}">${isPinned?'&#128204;':'&#8857;'}</button>
    <span class="sn" id="sn-${e.id}">${esc(e.label)}</span>
    <button class="sl-bool-btn${isOn?' on':''}" id="bool-${e.id}"
      role="switch" aria-checked="${isOn}"
      onclick="boolToggle(decodeURIComponent('${idArg}'))"
      aria-label="${esc(e.label)} toggle">${isOn ? 'ON' : 'OFF'}</button>
  </div>
</div>`;
}

function boolToggle(id) {
  const e = state.varMap[id];
  if (!e) return;
  const newVal = e.value > 0.5 ? 0 : 1;
  onValChange(id, newVal);
  const btn = document.getElementById('bool-' + id);
  if (btn) {
    btn.classList.toggle('on', newVal > 0.5);
    btn.setAttribute('aria-checked', String(newVal > 0.5));
    btn.textContent = newVal > 0.5 ? 'ON' : 'OFF';
  }
  const row = document.getElementById('sr-' + id);
  if (row) row.classList.toggle('modified', Math.abs(newVal - e.defaultValue) > 1e-9);
}

// ── F-3.7 Angle dial — détecte aussi @angle annotation ───────────────────────
// Rotation params get the range [-2π, 2π] from the parser's angle heuristic
// (sin/cos/angle/rotate context). Detect that range at render time — no parser
// change — and present a rotary knob instead of a linear track.
const TWO_PI = Math.PI * 2;
function _isAngle(e) {
  if (!e || e.isColor || e.decimals === 0) return false;
  if (e.angleUnit) return true;  // explicit @angle annotation
  return Math.abs(e.min + TWO_PI) < 1e-3 && Math.abs(e.max - TWO_PI) < 1e-3;
}

const _DIAL_CX = 22, _DIAL_CY = 22, _DIAL_R = 15;
function _needleXY(value) {
  return { x: _DIAL_CX + _DIAL_R * Math.cos(value), y: _DIAL_CY + _DIAL_R * Math.sin(value) };
}
function _deg(value, e) {
  if (e?.angleUnit === 'rad') return value.toFixed(3) + ' rad';
  return Math.round((value * 180) / Math.PI) + '°';
}

function _dialRowHTML(e) {
  const isPinned = state.pinnedIds.has(e.stableKey);
  const isModified = Math.abs(e.value - e.defaultValue) > 1e-9;
  const idArg = encArg(e.id);
  const { x, y } = _needleXY(e.value);
  const unitLabel = e.angleUnit === 'rad' ? 'rad' : '°';
  return `
<div class="sr sr-dial${isPinned?' pinned':''}${isModified?' modified':''}" id="sr-${e.id}" title="${esc(e.hint)}"
  ondragover="slDragOver(event,decodeURIComponent('${idArg}'))"
  ondrop="slDrop(event,decodeURIComponent('${idArg}'))"
  ondragleave="slDragLeave(event)"
  oncontextmenu="openCtxMenu(event,decodeURIComponent('${idArg}'))">
  <div class="sr-top">
    <span class="sr-drag" draggable="true" ondragstart="slDragStart(event,decodeURIComponent('${idArg}'))" title="Drag to reorder" tabindex="0" aria-label="Drag to reorder">⠿</span>
    <button class="pin-btn${isPinned?' pinned':''}" onclick="togglePin(decodeURIComponent('${idArg}'))" title="${isPinned?'Unpin':'Pin — exclude from re-parse'}" aria-label="${isPinned?'Unpin slider':'Pin slider'}">
      ${isPinned?'&#128204;':'&#8857;'}
    </button>
    <span class="sn" id="sn-${e.id}" ondblclick="startRename(decodeURIComponent('${idArg}'))" title="Double-click to rename">${esc(e.label)}</span>
    <input class="sv" type="number" id="sv-${e.id}" aria-label="${esc(e.label)} value (radians)"
      value="${fmtN(e.value,e.decimals)}" step="${e.step}" data-id="${escAttr(e.id)}">
  </div>
  <div class="st st-dial">
    <svg class="sl-dial" id="dial-${e.id}" data-id="${escAttr(e.id)}" viewBox="0 0 44 44" width="44" height="44"
      role="slider" tabindex="0" aria-label="${esc(e.label)} angle"
      aria-valuemin="${e.min}" aria-valuemax="${e.max}" aria-valuenow="${e.value}">
      <circle class="dial-ring" cx="22" cy="22" r="${_DIAL_R}"/>
      <line class="dial-needle" id="dialN-${e.id}" x1="22" y1="22" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}"/>
      <circle class="dial-handle" id="dialH-${e.id}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3"/>
    </svg>
    <span class="dial-deg" id="dialD-${e.id}" data-unit="${e.angleUnit||'rad'}">${_deg(e.value, e)}</span>
  </div>
  <div class="s-hint" title="${esc(e.hint)}">${esc(e.hint)}</div>
</div>`;
}

function _updateDial(id) {
  const e = state.varMap[id];
  const needle = document.getElementById('dialN-' + id);
  if (!e || !needle) return;
  const { x, y } = _needleXY(e.value);
  needle.setAttribute('x2', x.toFixed(2));
  needle.setAttribute('y2', y.toFixed(2));
  const handle = document.getElementById('dialH-' + id);
  if (handle) { handle.setAttribute('cx', x.toFixed(2)); handle.setAttribute('cy', y.toFixed(2)); }
  const deg = document.getElementById('dialD-' + id);
  if (deg) deg.textContent = _deg(e.value, e);
  const svg = document.getElementById('dial-' + id);
  if (svg) svg.setAttribute('aria-valuenow', e.value.toFixed(3));
}

function _initDial(svg) {
  const id = svg.dataset.id;
  _bindSvInput(id);
  if (svg._slBound) return;
  svg._slBound = true;
  let prevAngle = null;
  const ptrAngle = (ev) => {
    const r = svg.getBoundingClientRect();
    return Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2));
  };
  svg.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    svg.setPointerCapture(ev.pointerId);
    svg._drag = true;
    svg.classList.add('active');
    prevAngle = ptrAngle(ev);
  });
  svg.addEventListener('pointermove', ev => {
    if (!svg._drag) return;
    const e = state.varMap[id];
    if (!e) return;
    const a = ptrAngle(ev);
    let da = a - prevAngle;
    if (da > Math.PI) da -= TWO_PI;
    if (da < -Math.PI) da += TWO_PI;
    prevAngle = a;
    let newVal = e.value + da;
    // F-3.7: Shift → snap to 15° (π/12), fine precision without Shift
    if (ev.shiftKey) {
      const snap = Math.PI / 12; // 15°
      newVal = Math.round(newVal / snap) * snap;
    }
    onValChange(id, newVal);
  });
  const end = (ev) => {
    if (!svg._drag) return;
    svg._drag = false;
    svg.classList.remove('active');
    try { svg.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('keydown', ev => {
    const e = state.varMap[id];
    if (!e) return;
    let d = 0;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') d = e.step;
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') d = -e.step;
    if (!d) return;
    if (ev.shiftKey) d *= 10;
    ev.preventDefault();
    onValChange(id, e.value + d);
  });
}

// ── XY pad (Phase B) ─────────────────────────────────────────────────────────
// Renders a vec2 pair (position/direction) as a 2D drag pad: X axis = first
// component (its own [min,max]), Y axis = second component (Y-up).
function _frac(e) {
  const span = e.max - e.min;
  if (!(span > 0)) return 0;
  return Math.max(0, Math.min(1, (e.value - e.min) / span));
}

function _xyRowHTML(unit) {
  const [ex, ey] = unit.entries;
  const gid = ex.id;
  const label = _groupLabel(unit.entries, 'xy');
  _xyByComp.set(ex.id, gid);
  _xyByComp.set(ey.id, gid);
  const leftPct = (_frac(ex) * 100).toFixed(1);
  const topPct = ((1 - _frac(ey)) * 100).toFixed(1);
  const readout = `${fmtN(ex.value, ex.decimals)}, ${fmtN(ey.value, ey.decimals)}`;
  return `
<div class="sr sr-xy" id="sr-${gid}" title="${esc(ex.hint)}">
  <div class="sr-top">
    <span class="sn" title="${esc(label)}">${esc(label)} <span class="sn-tag">XY</span></span>
    <span class="xy-readout" id="xyR-${gid}">${readout}</span>
  </div>
  <div class="st st-xy">
    <div class="sl-xypad" id="xy-${gid}" data-x-id="${escAttr(ex.id)}" data-y-id="${escAttr(ey.id)}"
      tabindex="0" role="group" aria-label="${esc(label)} XY pad"
      title="Drag • Shift: lock axis • Ctrl: snap 0.1 • Alt: circular">
      <span class="xy-axis xy-axis-h"></span>
      <span class="xy-axis xy-axis-v"></span>
      <span class="xy-point" id="xyP-${gid}" style="left:${leftPct}%;top:${topPct}%"></span>
    </div>
  </div>
</div>`;
}

function _updateXY(gid) {
  const pad = document.getElementById('xy-' + gid);
  if (!pad) return;
  const ex = state.varMap[pad.dataset.xId];
  const ey = state.varMap[pad.dataset.yId];
  if (!ex || !ey) return;
  const pt = document.getElementById('xyP-' + gid);
  if (pt) {
    pt.style.left = (_frac(ex) * 100).toFixed(1) + '%';
    pt.style.top = ((1 - _frac(ey)) * 100).toFixed(1) + '%';
  }
  const ro = document.getElementById('xyR-' + gid);
  if (ro) ro.textContent = `${fmtN(ex.value, ex.decimals)}, ${fmtN(ey.value, ey.decimals)}`;
}

function _initXYPad(pad) {
  if (pad._slBound) return;
  pad._slBound = true;
  const xid = pad.dataset.xId;
  const yid = pad.dataset.yId;

  // Drag-start snapshot for Shift (axis-lock) and Alt (circular) modes
  let _startPx = null, _startPy = null;
  let _axisLock = null;   // 'x' | 'y' | null
  let _circleR  = null;   // normalised radius for Alt-constrain

  const _gridSnap = (v) => Math.round(v * 10) / 10;   // snap to 0.1 increments

  const writeFromPointer = (ev) => {
    const ex = state.varMap[xid];
    const ey = state.varMap[yid];
    if (!ex || !ey) return;
    const r = pad.getBoundingClientRect();
    let px = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    let py = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));

    if (ev.altKey && _circleR !== null) {
      // Alt — circular constraint: keep normalised distance from drag-start
      const cx = _startPx ?? 0.5;
      const cy = _startPy ?? 0.5;
      const dx = px - cx, dy = py - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1e-9;
      px = cx + (_circleR * dx) / dist;
      py = cy + (_circleR * dy) / dist;
      px = Math.max(0, Math.min(1, px));
      py = Math.max(0, Math.min(1, py));
    } else if (ev.shiftKey && _startPx !== null) {
      // Shift — axis lock: determine dominant axis on first movement
      if (_axisLock === null) {
        const adx = Math.abs(px - _startPx), ady = Math.abs(py - _startPy);
        _axisLock = adx >= ady ? 'x' : 'y';
      }
      if (_axisLock === 'x') py = _startPy;
      else px = _startPx;
    }

    if (ev.ctrlKey) { px = _gridSnap(px); py = _gridSnap(py); }

    onValChange(xid, ex.min + px * (ex.max - ex.min));
    onValChange(yid, ey.min + (1 - py) * (ey.max - ey.min));
  };

  pad.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    pad.setPointerCapture(ev.pointerId);
    pad._drag = true;
    pad.classList.add('active');

    // Snapshot position for modifier keys
    const r = pad.getBoundingClientRect();
    _startPx = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    _startPy = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
    _axisLock = null;

    // Alt: store initial radius (from pad centre) at click time
    if (ev.altKey) {
      const dx = _startPx - 0.5, dy = _startPy - 0.5;
      _circleR = Math.sqrt(dx * dx + dy * dy);
    } else {
      _circleR = null;
    }

    writeFromPointer(ev);
  });

  pad.addEventListener('pointermove', ev => {
    if (!pad._drag) return;
    if (ev.altKey && _circleR === null) {
      // Alt pressed mid-drag: set radius from current position
      const r = pad.getBoundingClientRect();
      const px = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      const py = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
      const dx = px - (_startPx ?? 0.5), dy = py - (_startPy ?? 0.5);
      _circleR = Math.sqrt(dx * dx + dy * dy);
    } else if (!ev.altKey) {
      _circleR = null;
    }
    writeFromPointer(ev);
  });

  const end = (ev) => {
    if (!pad._drag) return;
    pad._drag = false;
    _axisLock = null;
    _circleR = null;
    _startPx = null;
    _startPy = null;
    pad.classList.remove('active');
    try { pad.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);

  pad.addEventListener('keydown', ev => {
    const ex = state.varMap[xid];
    const ey = state.varMap[yid];
    if (!ex || !ey) return;
    let dx = 0, dy = 0;
    if (ev.key === 'ArrowRight') dx = ex.step;
    else if (ev.key === 'ArrowLeft') dx = -ex.step;
    else if (ev.key === 'ArrowUp') dy = ey.step;
    else if (ev.key === 'ArrowDown') dy = -ey.step;
    else return;
    if (ev.shiftKey) { dx *= 10; dy *= 10; }
    ev.preventDefault();
    if (dx) onValChange(xid, ex.value + dx);
    if (dy) onValChange(yid, ey.value + dy);
  });
}

// ── Integer stepper (Phase B / F-8.3) ───────────────────────────────────────
// Small integer params (loop counts, octaves…) are nicer as −/+ steppers than a
// fiddly drag track. Also triggered by @int annotation regardless of span.
const STEPPER_MAX_SPAN = 24;
function _isStepper(e) {
  if (!e || e.isColor) return false;
  if (e.isInt) return true;  // @int annotation forces stepper
  if (e.decimals !== 0) return false;
  const span = e.max - e.min;
  return Number.isFinite(span) && span >= 1 && span <= STEPPER_MAX_SPAN;
}

// ── Logarithmic scale helpers (F-8.3) ───────────────────────────────────────
// pct ∈ [0,100] ↔ val ∈ [min,max], log-distributed.
// Requires min > 0 and max > min; falls back to linear if not satisfied.
function _logPct(val, min, max) {
  if (min <= 0 || max <= min) return clampPct(val, min, max);
  const lv = Math.log(Math.max(min, Math.min(max, val)));
  return (lv - Math.log(min)) / (Math.log(max) - Math.log(min)) * 100;
}
function _logValFromPct(pct, min, max) {
  if (min <= 0 || max <= min) return min + pct * (max - min);
  return min * Math.pow(max / min, pct);
}

function _stepperRowHTML(e) {
  const isPinned = state.pinnedIds.has(e.stableKey);
  const isModified = Math.abs(e.value - e.defaultValue) > 1e-9;
  const idArg = encArg(e.id);
  return `
<div class="sr sr-stepper${isPinned?' pinned':''}${isModified?' modified':''}" id="sr-${e.id}" title="${esc(e.hint)}"
  ondragover="slDragOver(event,decodeURIComponent('${idArg}'))"
  ondrop="slDrop(event,decodeURIComponent('${idArg}'))"
  ondragleave="slDragLeave(event)"
  oncontextmenu="openCtxMenu(event,decodeURIComponent('${idArg}'))">
  <div class="sr-top">
    <span class="sr-drag" draggable="true" ondragstart="slDragStart(event,decodeURIComponent('${idArg}'))" title="Drag to reorder" tabindex="0" aria-label="Drag to reorder">⠿</span>
    <button class="pin-btn${isPinned?' pinned':''}" onclick="togglePin(decodeURIComponent('${idArg}'))" title="${isPinned?'Unpin':'Pin — exclude from re-parse'}" aria-label="${isPinned?'Unpin slider':'Pin slider'}">
      ${isPinned?'&#128204;':'&#8857;'}
    </button>
    <span class="sn" id="sn-${e.id}" ondblclick="startRename(decodeURIComponent('${idArg}'))" title="Double-click to rename">${esc(e.label)}</span>
    <span class="sl-stepper" data-id="${escAttr(e.id)}" data-min="${e.min}" data-max="${e.max}" data-step="${e.step}">
      <button class="step-btn step-dec" data-dir="-1" tabindex="-1" aria-label="Decrease ${esc(e.label)}">−</button>
      <input class="sv sv-step" type="number" id="sv-${e.id}" aria-label="${esc(e.label)} value"
        value="${fmtN(e.value,e.decimals)}" step="${e.step}" min="${e.min}" max="${e.max}"
        data-id="${escAttr(e.id)}">
      <button class="step-btn step-inc" data-dir="1" tabindex="-1" aria-label="Increase ${esc(e.label)}">+</button>
    </span>
  </div>
  <div class="s-hint" title="${esc(e.hint)}">${esc(e.hint)}</div>
</div>`;
}

// ── Unit extraction helper (P2.9) ────────────────────────────────────────────
function _extractUnit(label) {
  const m = /\(([^)]{1,8})\)\s*$/.exec(label || '');
  return m ? m[1] : '';
}

// ── Single slider row HTML ───────────────────────────────────────────────────
function _sliderRowHTML(e) {
  const pct = clampPct(e.value, e.min, e.max);
  const isPinned = state.pinnedIds.has(e.stableKey);
  const isModified = Math.abs(e.value - e.defaultValue) > 1e-9;
  const idArg = encArg(e.id);
  const unit = _extractUnit(e.label);
  const unitHtml = unit ? `<span class="sv-unit">${esc(unit)}</span>` : '';
  return `
<div class="sr${isPinned?' pinned':''}${isModified?' modified':''}" id="sr-${e.id}" title="${esc(e.hint)}"
  ondragover="slDragOver(event,decodeURIComponent('${idArg}'))"
  ondrop="slDrop(event,decodeURIComponent('${idArg}'))"
  ondragleave="slDragLeave(event)"
  oncontextmenu="openCtxMenu(event,decodeURIComponent('${idArg}'))">
  <div class="sr-top">
    <span class="sr-drag" draggable="true" ondragstart="slDragStart(event,decodeURIComponent('${idArg}'))" title="Drag to reorder" tabindex="0" aria-label="Drag to reorder">⠿</span>
    <button class="pin-btn${isPinned?' pinned':''}" onclick="togglePin(decodeURIComponent('${idArg}'))" title="${isPinned?'Unpin':'Pin — exclude from re-parse'}" aria-label="${isPinned?'Unpin slider':'Pin slider — exclude from re-parse'}">
      ${isPinned?'&#128204;':'&#8857;'}
    </button>
    <span class="sn" id="sn-${e.id}" ondblclick="startRename(decodeURIComponent('${idArg}'))" title="Double-click to rename">${esc(e.label)}</span>
    <div class="sl-field" id="sl-${e.id}"
      data-id="${escAttr(e.id)}"
      data-min="${e.min}" data-max="${e.max}" data-step="${e.step}" data-decimals="${e.decimals}"${e.isLog ? ' data-log="1"' : ''}
      style="--fill-pct:${pct}%">
      <input class="sv" type="number" id="sv-${e.id}" aria-label="${esc(e.label)} value"
        value="${fmtN(e.value,e.decimals)}" step="${e.step}" min="${e.min}" max="${e.max}"
        title="${escAttr(e.id)}"
        data-id="${escAttr(e.id)}">${unitHtml}
    </div>
  </div>
  <div class="s-hint" title="${esc(e.hint)}">${esc(e.hint)}</div>
</div>`;
}

// Derive a friendly label for a grouped widget (colour / XY): prefer an
// explicit/renamed label, else the assignment target variable name from the
// source line, else a stripped fallback.
function _groupLabel(run, fallback = 'value') {
  const raw = run[0].label || '';
  if (raw && !/\.[xyzw]$/.test(raw)) return raw;      // explicit or @label / renamed
  const m = /vec[234]\s+([A-Za-z_]\w*)\s*=/.exec(run[0].hint || '');
  return m ? m[1] : (raw.replace(/\.[xyzw]$/, '') || fallback);
}

// ── Colour swatch row HTML (Phase B) ─────────────────────────────────────────
function _colorRowHTML(unit) {
  const run = unit.entries;
  const gid = run[0].id;                              // unique element id base
  const vals = run.map(e => e.value);
  const scale = detectColorScale(vals);
  const hex = componentsToHex(vals, scale);
  const label = _groupLabel(run, 'color');
  const compIds = run.map(e => e.id).join(',');
  return `
<div class="sr sr-color" id="sr-${gid}" title="${esc(run[0].hint)}">
  <div class="sr-top">
    <span class="sn" title="${esc(label)}">${esc(label)}${unit.alpha ? ' <span class="sn-tag">RGBA</span>' : ' <span class="sn-tag">RGB</span>'}</span>
    <button class="sl-swatch" id="swatch-${gid}"
      data-comp-ids="${escAttr(compIds)}" data-scale="${scale}"
      style="--sw:${hex}" title="Click to edit colour" aria-label="Edit colour ${esc(label)}"></button>
    <span class="sl-swatch-hex" id="swhex-${gid}">${hex}</span>
  </div>
</div>`;
}

// ── Colour picker popover (Phase B) ──────────────────────────────────────────
let _cpSwatch = null;          // currently-open swatch element

function closeColorPicker() {
  _cpSwatch = null;
}

/** Open the colour picker anchored to a `.sl-swatch` element. */
function openColorPicker(swatch) {
  const compIds = (swatch.dataset.compIds || '').split(',').filter(Boolean);
  if (compIds.length < 3) return;
  openHSLPicker(swatch, compIds);
  _cpSwatch = swatch;
}

// Roadmap Phase D — instant one-shot randomize for every unpinned, modulatable
// slider (distinct from continuous modulation: this is a single re-roll, not
// an ongoing automation). Goes through the normal onValChange path (so it's
// undo-able, same as any manual edit — unlike the high-frequency modulation
// tick, a one-shot randomize is exactly the kind of change Ctrl+Z should cover).
function randomizeUnpinnedSliders() {
  let n = 0;
  for (const e of state.vars || []) {
    if (state.pinnedIds.has(e.stableKey) || e.isColor || e.isXY) continue;
    const v = e.min + Math.random() * (e.max - e.min);
    onValChange(e.id, v);
    n++;
  }
  toast(n > 0 ? `Randomized ${n} slider${n === 1 ? '' : 's'}` : 'No unpinned sliders to randomize', n > 0 ? 'ok' : 'warn');
}

// ── Pointer Events — attach to all .sl-field in container ───────────────────
function _attachSliderEvents(root) {
  root.querySelectorAll('.sl-field').forEach(field => {
    _initScrubField(field);
  });
  root.querySelectorAll('.sl-swatch').forEach(sw => {
    if (sw._slBound) return;
    sw._slBound = true;
    sw.addEventListener('click', (e) => {
      e.stopPropagation();
      // Toggle: clicking the open swatch again closes it.
      if (_cpSwatch === sw) { closeColorPicker(); return; }
      openColorPicker(sw);
    });
  });
  root.querySelectorAll('.sl-stepper').forEach(st => _initStepper(st));
  root.querySelectorAll('.sl-dial').forEach(d => _initDial(d));
  root.querySelectorAll('.sl-xypad').forEach(p => _initXYPad(p));
}

// ── Keyboard drag reorder ─────────────────────────────────────────────────────
let _kbGrabbedRow = null;

function _attachDragKeyboard(root) {
  if (root._dragKeyBound) return;
  root._dragKeyBound = true;
  root.addEventListener('keydown', (ev) => {
    if (!ev.target.classList.contains('sr-drag')) return;
    const row = ev.target.closest('.sr');
    if (!row) return;

    if (ev.key === ' ') {
      ev.preventDefault();
      if (_kbGrabbedRow === row) {
        // Release
        row.classList.remove('sr-drag-active');
        _kbGrabbedRow = null;
      } else {
        // Grab
        if (_kbGrabbedRow) _kbGrabbedRow.classList.remove('sr-drag-active');
        _kbGrabbedRow = row;
        row.classList.add('sr-drag-active');
      }
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      if (_kbGrabbedRow) {
        _kbGrabbedRow.classList.remove('sr-drag-active');
        _kbGrabbedRow = null;
      }
    } else if (ev.key === 'ArrowUp' && _kbGrabbedRow === row) {
      ev.preventDefault();
      const prev = row.previousElementSibling;
      if (prev && prev.classList.contains('sr')) {
        row.parentNode.insertBefore(row, prev);
        ev.target.focus();
      }
    } else if (ev.key === 'ArrowDown' && _kbGrabbedRow === row) {
      ev.preventDefault();
      const next = row.nextElementSibling;
      if (next && next.classList.contains('sr')) {
        row.parentNode.insertBefore(next, row);
        ev.target.focus();
      }
    }
  });
}

function _initStepper(stepper) {
  const id = stepper.dataset.id;
  _bindSvInput(id);
  if (stepper._slBound) return;
  stepper._slBound = true;
  stepper.querySelectorAll('.step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const e = state.varMap[id];
      if (!e) return;
      const dir = Number(btn.dataset.dir);
      onValChange(id, e.value + dir * (e.step || 1));
    });
  });
}

// Bind the numeric `.sv` input for a given slider id (shared by track sliders
// and steppers, which have an input but no track).
function _bindSvInput(id) {
  const input = document.getElementById('sv-' + id);
  if (!input || input._slBound) return;
  input._slBound = true;
  input.addEventListener('input', ev => onValChange(id, ev.target.value));
  input.addEventListener('change', ev => onValChange(id, ev.target.value));
  input.addEventListener('keydown', ev => {
    const e = state.varMap[id];
    if (!e) return;
    if (ev.key === 'Enter') { ev.target.blur(); return; }
    if (ev.key === 'Escape') { ev.target.value = fmtN(e.value, e.decimals); ev.target.blur(); return; }
    if (ev.key === 'Home') { ev.preventDefault(); onValChange(id, e.min); return; }
    if (ev.key === 'End')  { ev.preventDefault(); onValChange(id, e.max); return; }
    let delta = 0;
    if (ev.key === 'ArrowUp') delta = +e.step;
    if (ev.key === 'ArrowDown') delta = -e.step;
    if (ev.key === 'PageUp') delta = e.step * 10;
    if (ev.key === 'PageDown') delta = -e.step * 10;
    if (delta === 0) return;
    if (ev.shiftKey) delta *= 10;
    ev.preventDefault();
    onValChange(id, e.value + delta);
  });
  input.addEventListener('blur', ev => {
    const e = state.varMap[id];
    if (!e) return;
    onValChange(id, ev.target.value);
    _flashConfirm(id);
  });
  input.addEventListener('wheel', ev => {
    const e = state.varMap[id];
    if (!e) return;
    ev.preventDefault();
    const dir = ev.deltaY < 0 ? 1 : -1;
    const mult = ev.shiftKey ? 10 : 1;
    onValChange(id, e.value + dir * e.step * mult);
  }, { passive: false });
}

// ── Compositor-style scrub field ──────────────────────────────────────────────
// No separate track/handle: the value field itself is the drag target. A
// short pointerdown/up with little movement focuses the input for typing
// (this also covers double-click — the second click of a dblclick is just
// another short, no-movement press); crossing DRAG_THRESHOLD turns the press
// into a scrub (Shift = ×0.1 fine, Ctrl = ×10 coarse), same convention as the
// angle dial / XY pad in this file and src/ui/value-scrub.js.
const DRAG_THRESHOLD = 3;

function _initScrubField(field) {
  const id = field.dataset.id;
  _bindSvInput(id);
  if (field._slBound) return;
  field._slBound = true;
  const input = document.getElementById('sv-' + id);

  const focusForEdit = () => { input?.focus(); input?.select(); };

  input?.addEventListener('focus', () => field.classList.add('editing'));
  input?.addEventListener('blur', () => field.classList.remove('editing'));

  field.addEventListener('dblclick', (ev) => {
    ev.preventDefault();
    focusForEdit();
  });

  let startX, startVal, multiplier, dragging = false, moved = false;
  const isLog = field.dataset.log === '1';

  field.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const e = state.varMap[id];
    if (!e) return;
    // Block native focus/caret placement here — a plain click still ends up
    // focusing the input (see endDrag below), but a drag must not also
    // select the input's text at the same time.
    ev.preventDefault();

    field.setPointerCapture(ev.pointerId);
    dragging = true;
    moved = false;
    field.classList.add('active');

    startX = ev.clientX;
    startVal = e.value;
    // Shift = ×0.1 fine, Ctrl = ×10 coarse
    multiplier = ev.shiftKey ? 0.1 : ev.ctrlKey ? 10 : 1;
  });

  field.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const e = state.varMap[id];
    if (!e) return;

    const dx = ev.clientX - startX;
    if (!moved && Math.abs(dx) > DRAG_THRESHOLD) {
      moved = true;
      field.classList.add('scrubbing');
    }
    if (!moved) return;

    const rectW = Math.max(field.getBoundingClientRect().width, 1);
    let newVal;
    if (isLog) {
      const startFrac = _logPct(startVal, e.min, e.max) / 100;
      const newFrac = Math.max(0, Math.min(1, startFrac + (dx / rectW) * multiplier));
      newVal = _logValFromPct(newFrac, e.min, e.max);
    } else {
      newVal = startVal + (dx / rectW) * (e.max - e.min) * multiplier;
    }

    _setVal(id, _snapToStep(newVal, e));
  });

  const endDrag = (ev) => {
    if (!dragging) return;
    dragging = false;
    field.classList.remove('active', 'scrubbing');
    try { field.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
    // A press with no meaningful movement is a click: focus the input so the
    // user can type an exact value (this also covers double-click).
    if (!moved) focusForEdit();
  };
  field.addEventListener('pointerup', endDrag);
  field.addEventListener('pointercancel', () => {
    dragging = false;
    field.classList.remove('active', 'scrubbing');
  });
}

function _snapToStep(val, e) {
  const stepped = Math.round((val - e.min) / e.step) * e.step + e.min;
  return Math.max(e.min, Math.min(e.max, stepped));
}

// ── Core value setter — single source of truth ───────────────────────────────
function _setVal(id, rawVal) {
  const e = state.varMap[id];
  if (!e) return;
  let val = parseFloat(rawVal);
  if (isNaN(val)) return;
  val = Math.max(e.min, Math.min(e.max, val));
  e.value = val;

  // Phase 8.2 — Toutes les mises à jour DOM visuelles (sv, aria, modified, fill, thumb)
  // sont batched dans un seul rAF — jamais en direct depuis oninput/pointermove.
  // Seul patchLine (écriture dans l'éditeur) reste synchrone car il doit
  // suivre la valeur immédiatement pour le rendu shader.
  _scheduleDomUpdate(id, val, e.decimals);
  scheduleFillUpdate(id);

  // Patch shader (synchrone intentionnel — chemin critique pour le rendu)
  patchLine(e);
}

// ── Public API for slider value updates ────────────────────────────────────
function onSlide(id, rawVal) {
  // Called from old-style inline handlers (undo.js wraps it for history)
  const e = state.varMap[id];
  const old = e ? e.value : undefined;
  _setVal(id, rawVal);
  sliderHooks.afterSlide?.(id, old, e ? e.value : undefined);
}

function onValChange(id, rawVal) {
  const n = parseFloat(rawVal);
  if (isNaN(n)) return;
  const e = state.varMap[id];
  if (!e) return;
  const old = e.value;
  // Auto-extend range if out of bounds
  if (n < e.min) {
    e.min = n - Math.abs(n) * 0.5 - 1;
    const track = document.getElementById('sl-' + id);
    if (track) track.dataset.min = e.min;
  }
  if (n > e.max) {
    e.max = n + Math.abs(n) * 0.5 + 1;
    const track = document.getElementById('sl-' + id);
    if (track) track.dataset.max = e.max;
  }
  _setVal(id, n);
  sliderHooks.afterValChange?.(id, old, e.value);
}

function _flashConfirm(id) {
  const sv = document.getElementById('sv-' + id);
  if (!sv) return;
  sv.classList.remove('confirmed');
  void sv.offsetWidth;
  sv.classList.add('confirmed');
  sv.addEventListener('animationend', () => sv.classList.remove('confirmed'), { once: true });
}

// ── updateFill — kept for compat (actions.js, ux.js call this) ──────────────
function updateFill(id, _e) {
  scheduleFillUpdate(id);
}

// ── Sync from Monaco ─────────────────────────────────────────────────────────
function syncSlidersFromCode(code) {
  if (isFromSlider()) return;
  setFromMonaco(true);
  const newEntries = parseShader(code);
  const minLen = Math.min(state.vars.length, newEntries.length);
  for (let i = 0; i < minLen; i++) {
    const ov = state.vars[i];
    const nv = newEntries[i];
    if (!ov || !nv) continue;
    ov.line = nv.line;
    ov.col = nv.col;
    ov.matchLen = nv.matchLen;
    ov.tokenRaw = nv.tokenRaw;
    if (!state.pinnedIds.has(ov.stableKey) && Math.abs(nv.value - ov.value) > 1e-9) {
      ov.value = nv.value;
      const sv = document.getElementById('sv-' + ov.id);
      if (sv) sv.value = fmtN(ov.value, ov.decimals);
      scheduleFillUpdate(ov.id);
    }
  }
  if (Math.abs(newEntries.length - state.vars.length) > 3) {
    const customized = applyCustomizations(newEntries);
    state.vars = customized;
    state.varMap = {};
    state.defaultValues = {};
    customized.forEach(e => { state.varMap[e.id] = e; state.defaultValues[e.id] = e.defaultValue; });
    buildUI(customized);
  }
  setFromMonaco(false);
}

// ── Group collapse ───────────────────────────────────────────────────────────
function toggleGroup(cat, e) {
  if (e?.altKey) {
    // Phase Y — Alt+click: solo-focus this group, collapse all the others.
    const cats = [...new Set((state.vars || []).map(v => v.category))];
    cats.forEach(c => { if (c !== cat) collapsedGroups.add(c); });
    collapsedGroups.delete(cat);
  } else if (collapsedGroups.has(cat)) {
    collapsedGroups.delete(cat);
  } else {
    collapsedGroups.add(cat);
  }
  safeLocalSet('sl_collapsed_groups', JSON.stringify([...collapsedGroups]));
  buildUI(state.vars);
  _flashGroupReveal(cat);
}

// Phase Y — lightweight reveal animation on expand (buildUI fully re-renders
// the group's rows, so there's no before/after DOM state to `transition` a
// max-height on; a keyframe animation on the freshly-inserted rows achieves
// the same "smooth expand" feel without restructuring the render pipeline).
function _flashGroupReveal(cat) {
  const header = document.querySelector(`.sh[data-cat="${CSS.escape(cat)}"]`);
  if (!header || header.classList.contains('collapsed')) return;
  let el = header.nextElementSibling;
  while (el && !el.classList.contains('sh')) {
    el.classList.add('group-reveal');
    el = el.nextElementSibling;
  }
}

// ── Pin ──────────────────────────────────────────────────────────────────────
// Pinned state is keyed by stableKey (def:NAME / const:NAME / lit:N), not the
// volatile runtime `id` ('v0','v1'…, reassigned fresh on every parse) — see
// roadmap audit. `id` is still used below for DOM lookups (current render).
function togglePin(id) {
  const e = state.varMap[id];
  const key = e?.stableKey ?? id; // fallback keeps old behavior if entry is gone
  if (state.pinnedIds.has(key)) state.pinnedIds.delete(key);
  else state.pinnedIds.add(key);
  notify('pinnedIds', state.pinnedIds);
  if (e) e.pinned = state.pinnedIds.has(key);
  const isPinned = state.pinnedIds.has(key);
  // Phase S — pinned entries live in a dedicated zone, so a full rebuild is
  // needed to move the row in/out of #pinned-zone (cheap: re-renders from state.vars).
  buildUI(state.vars);
  toast(isPinned ? 'Slider pinned' : 'Slider unpinned', 'warn');
}

function jumpTo(li) {
  if (!state.editor || !Number.isFinite(li) || li < 0) return;
  state.editor.revealLineInCenter(li + 1);
  state.editor.setPosition({ lineNumber: li + 1, column: 1 });
  state.editor.focus();
}

export {
  CAT_ORDER, collapsedGroups,
  buildUI, toggleGroup, togglePin,
  clampPct, fmtN, esc, escAttr, encArg,
  jumpTo, onSlide, onValChange, updateFill,
  _liveDebounce, patchLine, fmtNum,
  syncSlidersFromCode, isFromSlider,
  setSliderHooks, initSliderFilter,
  randomizeUnpinnedSliders,
  enumSetVal, boolToggle,
};
