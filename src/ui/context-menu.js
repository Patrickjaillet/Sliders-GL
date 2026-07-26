import { state, notify } from '../core/state.js';
import { toast } from '../io/actions.js';
import { togglePin, buildUI, escAttr } from './slider.js';
import { applySliderValue, slPushHistory } from './undo.js';
import { setSliderMeta } from './slider-customizations.js';

export let ctxTargetId = null;

function _flashSliderRow(id) {
  const el = document.getElementById('sr-' + id);
  if (!el) return;
  el.classList.remove('sl-flash');
  void el.offsetWidth; // force reflow
  el.classList.add('sl-flash');
  setTimeout(() => el.classList.remove('sl-flash'), 400);
}

export function openCtxMenu(e, id) {
  e.preventDefault();
  e.stopPropagation();
  ctxTargetId = id;
  const menu = document.getElementById('ctxMenu');
  const pinItem = menu.querySelectorAll('.ctx-item')[4];
  const pinnedNow = state.pinnedIds.has(state.varMap[id]?.stableKey ?? id);
  if (pinItem) pinItem.textContent = pinnedNow ? '\u{1F4CC} Unpin' : '\u{1F4CC} Pin';
  menu.classList.add('open');
  menu.style.left = Math.min(e.clientX, innerWidth - 170) + 'px';
  menu.style.top  = Math.min(e.clientY, innerHeight - 200) + 'px';
}

document.addEventListener('click', () => {
  document.getElementById('ctxMenu')?.classList.remove('open');
});

document.addEventListener('keydown', ev => {
  const menu = document.getElementById('ctxMenu');
  if (menu?.classList.contains('open')) {
    if (ev.key === 'Escape') { menu.classList.remove('open'); ev.preventDefault(); return; }
    const items = [...menu.querySelectorAll('.ctx-item')];
    const idx = items.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown') { ev.preventDefault(); (/** @type {HTMLElement} */ (items[(idx + 1) % items.length]))?.focus(); return; }
    if (ev.key === 'ArrowUp')   { ev.preventDefault(); (/** @type {HTMLElement} */ (items[(idx - 1 + items.length) % items.length]))?.focus(); return; }
    // §7.3 — Enter/Space activate the focused menuitem (div has no native click-on-key)
    if ((ev.key === 'Enter' || ev.key === ' ') && idx !== -1) {
      ev.preventDefault();
      (/** @type {HTMLElement} */ (items[idx])).click();
      return;
    }
  }
  const tabs = document.getElementById('passTabs');
  if (tabs?.contains(document.activeElement)) {
    const btns = [...tabs.querySelectorAll('.pass-tab')];
    const idx = btns.indexOf(document.activeElement);
    if (idx >= 0) {
      if (ev.key === 'ArrowRight') { ev.preventDefault(); (/** @type {HTMLElement} */ (btns[(idx + 1) % btns.length])).focus(); return; }
      if (ev.key === 'ArrowLeft')  { ev.preventDefault(); (/** @type {HTMLElement} */ (btns[(idx - 1 + btns.length) % btns.length])).focus(); return; }
    }
  }
});

export function ctxCmd(cmd) {
  const id = ctxTargetId;
  document.getElementById('ctxMenu').classList.remove('open');
  if (!id) return;
  const e = state.varMap[id];
  if (!e) return;
  if (cmd === 'reset') {
    const def = state.defaultValues[id];
    if (def !== undefined) {
      slPushHistory(id, e.value, def);
      applySliderValue(id, def);
      toast('Reset to default', 'ok');
    }
  } else if (cmd === 'copy') {
    navigator.clipboard?.writeText(String(e.value)).catch(() => {});
    toast('Value copied', 'ok');
  } else if (cmd === 'rename') {
    startRename(id);
    _flashSliderRow(id);
  } else if (cmd === 'setrange') {
    startRangeEdit(id);
  } else if (cmd === 'pin') {
    togglePin(id);
    _flashSliderRow(id);
  }
}

// ── Set range / precision… (roadmap Phase E, extended for §3 unit/decimals) ──
// Small popover to edit a slider's min/max/step/decimals/unit manually. The
// override persists via the Phase C customization store (survives reparse +
// saved with presets) — this is what makes each slider's precision
// *explicitly* configurable rather than only ever guessed from the literal.
let _rangePop = null;
function _ensureRangePop() {
  if (_rangePop) return _rangePop;
  _rangePop = document.createElement('div');
  _rangePop.id = 'zgl-range-pop';
  _rangePop.addEventListener('click', e => e.stopPropagation());
  document.body.appendChild(_rangePop);
  return _rangePop;
}
function _closeRangePop() { if (_rangePop) _rangePop.classList.remove('open'); }

export function startRangeEdit(id) {
  const e = state.varMap[id];
  if (!e) return;
  const pop = _ensureRangePop();
  const decVal = Number.isFinite(e.decimals) ? e.decimals : '';
  const unitVal = e.unit ?? '';
  pop.innerHTML = `
    <div class="rng-title">Range / precision — ${escAttr(e.label)}</div>
    <label class="rng-row"><span>Min</span><input class="rng-min" type="number" step="any" value="${e.min}"></label>
    <label class="rng-row"><span>Max</span><input class="rng-max" type="number" step="any" value="${e.max}"></label>
    <label class="rng-row"><span>Step</span><input class="rng-step" type="number" step="any" min="0" value="${e.step}"></label>
    <label class="rng-row"><span>Decimals</span><input class="rng-decimals" type="number" step="1" min="0" max="8" placeholder="auto" value="${decVal}"></label>
    <label class="rng-row"><span>Unit</span><input class="rng-unit" type="text" maxlength="8" placeholder="e.g. m, °, px" value="${escAttr(unitVal)}"></label>
    <div class="rng-actions">
      <button class="rng-cancel" type="button">Cancel</button>
      <button class="rng-apply" type="button">Apply</button>
    </div>`;
  pop.classList.add('open');

  const row = document.getElementById('sr-' + id);
  const rect = (row || document.body).getBoundingClientRect();
  const pw = pop.offsetWidth || 180;
  pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - pw - 8)) + 'px';
  let top = rect.bottom + 4;
  if (top + pop.offsetHeight > window.innerHeight - 8) top = Math.max(8, rect.top - pop.offsetHeight - 4);
  pop.style.top = top + 'px';

  const apply = () => {
    const mn = parseFloat(pop.querySelector('.rng-min').value);
    const mx = parseFloat(pop.querySelector('.rng-max').value);
    const st = parseFloat(pop.querySelector('.rng-step').value);
    if (!Number.isFinite(mn) || !Number.isFinite(mx) || mn === mx) { toast('Invalid range', 'err'); return; }
    const lo = Math.min(mn, mx), hi = Math.max(mn, mx);
    const step = (Number.isFinite(st) && st > 0) ? st : e.step;

    // Decimals — blank input means "back to guessed" (removes the override,
    // rather than forcing 0), same convention as leaving min/max untouched
    // would be a no-op if this field supported that.
    const decRaw = pop.querySelector('.rng-decimals').value;
    const decimals = decRaw === '' ? undefined : Math.max(0, Math.min(8, Math.round(parseFloat(decRaw))));
    if (decRaw !== '' && !Number.isFinite(decimals)) { toast('Invalid decimals', 'err'); return; }

    // Unit — blank means "fall back to the label-derived guess".
    const unitRaw = pop.querySelector('.rng-unit').value.trim();
    const unit = unitRaw === '' ? undefined : unitRaw;

    e.min = lo; e.max = hi; e.step = step;
    e.value = Math.max(lo, Math.min(hi, e.value));
    if (decimals !== undefined) e.decimals = decimals; else delete e.decimals;
    if (unit !== undefined) e.unit = unit; else delete e.unit;
    setSliderMeta(e.stableKey, { min: lo, max: hi, step, decimals, unit });
    buildUI(state.vars);
    _closeRangePop();
    toast('Range / precision updated', 'ok');
  };

  pop.querySelector('.rng-apply').addEventListener('click', apply);
  pop.querySelector('.rng-cancel').addEventListener('click', _closeRangePop);
  pop.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); apply(); }
    if (ev.key === 'Escape') { ev.preventDefault(); _closeRangePop(); }
  });
  // Close on outside click (deferred so this menu click doesn't immediately close it)
  setTimeout(() => {
    const onDoc = () => { _closeRangePop(); document.removeEventListener('click', onDoc); };
    document.addEventListener('click', onDoc);
  }, 0);
  setTimeout(() => pop.querySelector('.rng-min')?.focus(), 0);
}

export function startRename(id) {
  const e = state.varMap[id];
  if (!e) return;
  const span = document.getElementById('sn-' + id);
  if (!span) return;
  const old = span.textContent;
  span.textContent = '';
  const inp = document.createElement('input');
  inp.className = 'rename-inp';
  inp.value = old;
  span.appendChild(inp);
  (/** @type {HTMLElement} */ (inp)).focus();
  inp.select();
  const commit = () => {
    const nv = inp.value.trim() || old;
    e.label = nv;
    span.textContent = nv;
    const row = document.getElementById('sr-' + id);
    if (row) row.title = nv;
    // Persist the rename so it survives the next reparse (roadmap Phase C).
    setSliderMeta(e.stableKey, { label: nv });
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') inp.blur();
    if (ev.key === 'Escape') { inp.value = old; inp.blur(); }
    ev.stopPropagation();
  });
}

// ── Group context menu (Phase Y) — right-click on a .sh group header ─────────
export let ctxGroupTarget = null;

export function openGroupCtxMenu(e, cat) {
  e.preventDefault();
  e.stopPropagation();
  ctxGroupTarget = cat;
  const menu = document.getElementById('groupCtxMenu');
  if (!menu) return;
  menu.classList.add('open');
  menu.style.left = Math.min(e.clientX, innerWidth - 200) + 'px';
  menu.style.top  = Math.min(e.clientY, innerHeight - 140) + 'px';
}

document.addEventListener('click', () => {
  document.getElementById('groupCtxMenu')?.classList.remove('open');
});

export function groupCtxCmd(cmd) {
  const cat = ctxGroupTarget;
  document.getElementById('groupCtxMenu')?.classList.remove('open');
  if (!cat) return;
  const entries = (state.vars || []).filter(v => v.category === cat);
  if (entries.length === 0) return;

  if (cmd === 'reset') {
    entries.forEach(e => {
      const def = state.defaultValues[e.id];
      if (def !== undefined) {
        slPushHistory(e.id, e.value, def);
        applySliderValue(e.id, def);
      }
    });
    toast(`${cat}: reset to defaults`, 'ok');
  } else if (cmd === 'copyjson') {
    const obj = {};
    entries.forEach(e => { obj[e.label] = e.value; });
    navigator.clipboard?.writeText(JSON.stringify(obj, null, 2)).catch(() => {});
    toast('Group copied as JSON', 'ok');
  } else if (cmd === 'pinall') {
    entries.forEach(e => state.pinnedIds.add(e.stableKey));
    notify('pinnedIds', state.pinnedIds);
    buildUI(state.vars);
    toast(`${cat}: all pinned`, 'ok');
  }
}
