// User actions — applyAndParse, toast, modal helpers, load/reset

import { state, notify } from '../core/state.js';
import { EXAMPLE } from '../core/constants.js';
import { getParseWarnings, parseShader } from '../shader/parser.js';
import { buildUI, fmtN, updateFill, patchLine } from '../ui/slider.js';
import { applyGLShader } from '../gl/renderer.js';
import { resolveIncludes } from '../shader/shader-includes.js';
import { applyCustomizations, clearSliderCustomizations, hasSliderCustomizations } from '../ui/slider-customizations.js';
import { formatGLSL, flashFormattedStatus } from '../shader/glsl-formatter.js';

function applyAndParse(src) {
  if (!state.editor) return;
  if (src !== undefined) state.editor.setValue(src);

  // F-8.4 — auto-format on compile when pref is enabled
  if (state.prefs?.autoFormat) {
    const raw = state.editor.getValue();
    const fmt = formatGLSL(raw);
    if (fmt !== raw) {
      const pos = state.editor.getPosition();
      state.editor.setValue(fmt);
      if (pos) state.editor.setPosition(pos);
      flashFormattedStatus();
    }
  }

  const rawCode = state.editor.getValue();

  // Phase 9.4 — resolve #include directives before parsing / compiling
  const { code, resolvedNames, errors: includeErrors } = resolveIncludes(rawCode);
  if (includeErrors.length > 0) {
    includeErrors.forEach(msg => toast(msg, 'warn'));
  }
  if (resolvedNames.length > 0) {
    toast(`Included: ${resolvedNames.join(', ')}`, 'info');
  }

  const activeTab = document.querySelector('.pass-tab.active');
  activeTab?.classList.add('compiling');

  const t0 = performance.now();
  const entries = applyCustomizations(parseShader(code));
  const warnings = getParseWarnings();
  buildUI(entries);
  applyGLShader(code);
  const compileMs = Math.round(performance.now() - t0);

  activeTab?.classList.remove('compiling');

  // F-10.4 — update enriched status bar
  _updateStatusBar(entries, code, compileMs);

  toast(`Parsed ${entries.length} constants`, 'ok');
  if (warnings.length > 0) {
    toast(`Ignored ${warnings.length} non-literal #define values`, 'warn');
  }
  // P1.3 — clear dirty indicator on the active pass tab
  document.querySelector('.pass-tab.active')?.classList.remove('dirty');
}

function _updateStatusBar(entries, code, compileMs) {
  const sbUniforms = document.getElementById('sbUniforms');
  const sbCompile  = document.getElementById('sbCompile');
  const sbLines    = document.getElementById('sbLines');

  if (sbUniforms) { sbUniforms.textContent = entries.length + ' ⊞'; sbUniforms.title = sbUniforms.textContent; }
  if (sbCompile)  { sbCompile.textContent  = compileMs + ' ms'; sbCompile.title = sbCompile.textContent; }
  if (sbLines)    { sbLines.textContent    = (code.split('\n').length) + ' L'; sbLines.title = sbLines.textContent; }
}

function loadExample() {
  if (!state.editor) return;
  const isDirty = document.querySelector('.pass-tab.active')?.classList.contains('dirty');
  if (isDirty) {
    const ok = confirm('The current shader is modified and unparsed. Replace it?');
    if (!ok) return;
  }
  state.editor.setValue(EXAMPLE);
  state.pinnedIds.clear();
  notify('pinnedIds', state.pinnedIds);
  clearSliderCustomizations();
  setTimeout(applyAndParse, 100);
}

function resetSliders() {
  state.vars.forEach(e => {
    if (state.pinnedIds.has(e.stableKey)) return; // skip pinned (keyed by stableKey, not the volatile runtime id)
    e.value = e.defaultValue;
    const sl = document.getElementById('sl-' + e.id);
    const sv = document.getElementById('sv-' + e.id);
    if (sl) sl.value = e.value;
    if (sv) sv.value = fmtN(e.value, e.decimals);
    updateFill(e.id, e);
    patchLine(e);
  });
  toast('Reset to defaults (unpinned)', 'warn');
}

// Roadmap Phase C — drop renamed labels / custom groups / reorder / range
// overrides and re-run pure auto-detection. Values & shader code are untouched.
function resetSliderCustomizations() {
  if (!hasSliderCustomizations()) {
    toast('No slider customizations to reset', 'info');
    return;
  }
  clearSliderCustomizations();
  applyAndParse();
  toast('Slider customizations reset to auto-detected', 'warn');
}

function copyCode() {
  if (!state.editor) return;
  navigator.clipboard.writeText(state.editor.getValue()).then(() => toast('Copied!', 'ok'));
}

/* ── §5.3 Toast Phase 5 — stack, icônes SVG, barre de progression ── */
const TOAST_ICONS = {
  ok:   `<svg class="toast-icon" viewBox="0 0 16 16"><polyline points="2.5,8.5 6,12 13.5,4.5"/></svg>`,
  warn: `<svg class="toast-icon" viewBox="0 0 16 16"><path d="M8 2L14 13H2L8 2z"/><line x1="8" y1="7" x2="8" y2="10"/><circle cx="8" cy="12" r="0.6" fill="currentColor"/></svg>`,
  err:  `<svg class="toast-icon" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><line x1="6" y1="6" x2="10" y2="10"/><line x1="10" y1="6" x2="6" y2="10"/></svg>`,
  error:`<svg class="toast-icon" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><line x1="6" y1="6" x2="10" y2="10"/><line x1="10" y1="6" x2="6" y2="10"/></svg>`,
  info: `<svg class="toast-icon" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><line x1="8" y1="7.5" x2="8" y2="11"/><circle cx="8" cy="5.5" r="0.6" fill="currentColor"/></svg>`,
};
const TOAST_DURATION = 2200;

function toast(msg, type = '') {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    // #toast-stack absent (tests unitaires, embed sans HTML complet) — avertir et ignorer
    console.warn('[toast] #toast-stack introuvable, message perdu :', msg);
    return;
  }

  // §9.4 — regroupe les toasts identiques consécutifs avec un compteur
  // plutôt que d'empiler des doublons.
  const top = /** @type {any} */ (stack.firstElementChild);
  if (top && top.dataset.toastKey === `${type}::${msg}` && top.classList.contains('show')) {
    const n = (parseInt(top.dataset.toastCount || '1', 10) || 1) + 1;
    top.dataset.toastCount = String(n);
    let badge = top.querySelector('.toast-count');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'toast-count';
      top.querySelector('.toast-msg')?.after(badge);
    }
    badge.textContent = `×${n}`;
    // relance le minuteur de disparition
    clearTimeout(top._toastTimer);
    top._toastTimer = setTimeout(() => _dismissToast(top), TOAST_DURATION);
    return;
  }

  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.style.setProperty('--toast-duration', TOAST_DURATION + 'ms');
  el.dataset.toastKey = `${type}::${msg}`;
  el.dataset.toastCount = '1';

  const icon = TOAST_ICONS[type] || '';
  el.innerHTML = `${icon}<span class="toast-msg">${msg}</span><div class="toast-bar"></div>`;

  // Swipe-to-dismiss
  let startX = 0;
  el.addEventListener('pointerdown', e => { startX = e.clientX; });
  el.addEventListener('pointerup',   e => {
    if (Math.abs(e.clientX - startX) > 60) _dismissToast(el);
  });

  // Phase W — limit to 3 simultaneous toasts, dismiss oldest
  if (stack.children.length >= 3) _dismissToast(/** @type {any} */ (stack.lastElementChild));

  stack.prepend(el);
  // Force reflow pour déclencher la transition d'entrée
  void el.offsetWidth;
  el.classList.add('show');

  // Fix 4.5 — Critical errors must be announced immediately by screen readers.
  // Route 'err' toasts to #a11y-alert (aria-live="assertive") in addition to
  // the visual toast, so they're not lost among rapid polite announcements.
  if (type === 'err') {
    const a11y = document.getElementById('a11y-alert');
    if (a11y) a11y.textContent = msg;
  }

  const t = setTimeout(() => _dismissToast(el), TOAST_DURATION);
  el._toastTimer = t;
}

function _dismissToast(el) {
  clearTimeout(el._toastTimer);
  el.classList.remove('show');
  el.classList.add('hiding');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
  // Fallback remove si transitionend ne fire pas
  setTimeout(() => el.remove(), 300);
}

const MODAL_FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let _lastModalFocus = null;

function normalizeShaderCode(code) {
  return String(code || '').replace(/\r\n?/g, '\n').trim();
}

function shouldConfirmShaderReplacement(nextCode) {
  const current = normalizeShaderCode(state.editor ? state.editor.getValue() : '');
  const incoming = normalizeShaderCode(nextCode);
  if (!current || current === incoming) return false;
  return current !== normalizeShaderCode(EXAMPLE);
}

function getOpenModalOverlay() {
  return document.querySelector('.modal-overlay.open');
}

function getModalDialog(overlayId) {
  return document.querySelector(`#${overlayId} .modal`);
}

function isFocusableElement(el) {
  return !!(el && !el.disabled && el.getClientRects().length);
}

function openModalDialog(overlayId, initialFocusSelector) {
  const overlay = document.getElementById(overlayId);
  const dialog = getModalDialog(overlayId);
  if (!overlay || !dialog) return;
  _lastModalFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    const target = initialFocusSelector ? dialog.querySelector(initialFocusSelector) : null;
    const fallback = [...dialog.querySelectorAll(MODAL_FOCUSABLE_SELECTOR)].find(isFocusableElement);
    (/** @type {HTMLElement} */ (isFocusableElement(target) ? target : fallback || dialog)).focus();
  });
}

function closeModalDialog(overlayId) {
  const overlay = document.getElementById(overlayId);
  if (!overlay) return;

  // Phase 5 — animation de sortie : .closing déclenche scale(1.01) + opacity(0)
  overlay.classList.add('closing');
  overlay.setAttribute('aria-hidden', 'true');

  const onEnd = () => {
    overlay.classList.remove('open', 'closing');
    overlay.removeEventListener('transitionend', onEnd);
  };
  overlay.addEventListener('transitionend', onEnd, { once: true });
  // Fallback si transitionend ne fire pas
  setTimeout(() => overlay.classList.remove('open', 'closing'), 250);

  if (_lastModalFocus && typeof _lastModalFocus.focus === 'function') {
    (/** @type {HTMLElement} */ (_lastModalFocus)).focus();
  }
  _lastModalFocus = null;
}

function trapModalFocus(event) {
  if (event.key !== 'Tab') return false;
  const overlay = getOpenModalOverlay();
  if (!overlay) return false;
  const dialog = overlay.querySelector('.modal');
  if (!dialog) return false;

  const focusables = [...dialog.querySelectorAll(MODAL_FOCUSABLE_SELECTOR)].filter(isFocusableElement);
  if (!focusables.length) {
    event.preventDefault();
    (/** @type {HTMLElement} */ (dialog)).focus();
    return true;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    (/** @type {HTMLElement} */ (last)).focus();
    return true;
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    (/** @type {HTMLElement} */ (first)).focus();
    return true;
  }
  return false;
}

export { applyAndParse, loadExample, resetSliders, resetSliderCustomizations, copyCode, toast, _dismissToast, MODAL_FOCUSABLE_SELECTOR, _lastModalFocus, normalizeShaderCode, shouldConfirmShaderReplacement, getOpenModalOverlay, getModalDialog, isFocusableElement, openModalDialog, closeModalDialog, trapModalFocus };
