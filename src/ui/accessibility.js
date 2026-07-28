/**
 * accessibility.js — Phase 7.3
 *
 * Implements:
 *   A. Focus ring CSS is in accessibility.css (no JS needed for :focus-visible).
 *   B. Screen reader — aria-valuenow live updates for sliders, live regions.
 *   C. Zoom UI — Ctrl+= / Ctrl+- scale the entire UI, Ctrl+0 to reset.
 */

// ═════════════════════════════════════════════════════════════════════════════
// §A  SKIP LINK (injected programmatically for SPA)
// ═════════════════════════════════════════════════════════════════════════════

function injectSkipLink() {
  if (document.getElementById('skip-to-editor')) return;

  const link = document.createElement('a');
  link.id = 'skip-to-editor';
  link.href = '#editor-container';
  link.className = 'skip-link';
  link.textContent = 'Skip to editor';
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target =
      document.getElementById('editor-container') ||
      document.querySelector('.monaco-editor') ||
      document.getElementById('editorPane');
    if (target) {
      target.setAttribute('tabindex', '-1');
      /** @type {HTMLElement} */ (target).focus();
    }
  });

  document.body.insertBefore(link, document.body.firstChild);
}

// ═════════════════════════════════════════════════════════════════════════════
// §B  SCREEN READER — Slider aria-valuenow + live region for status
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Enhance slider elements with proper ARIA attributes for screen readers.
 * Called after buildUI() creates slider DOM elements.
 */
export function enhanceSlidersForScreenReader() {
  const sliders = document.querySelectorAll('input[type="range"][id^="sl-"]');

  sliders.forEach((slider) => {
    const id = slider.id.slice(3); // strip "sl-"

    // Set up aria attributes if not present
    if (!slider.getAttribute('role')) {
      slider.setAttribute('role', 'slider');
    }

    slider.setAttribute('aria-valuenow', slider.value);
    slider.setAttribute('aria-valuemin', slider.min || '0');
    slider.setAttribute('aria-valuemax', slider.max || '1');

    // Find associated label
    const label = document.querySelector(`label[for="sl-${id}"]`);
    if (label && !slider.getAttribute('aria-labelledby')) {
      label.id = label.id || `lbl-${id}`;
      slider.setAttribute('aria-labelledby', label.id);
    } else if (!slider.getAttribute('aria-label')) {
      slider.setAttribute('aria-label', `Shader constant ${id}`);
    }

    // Live update aria-valuenow on input
    slider.addEventListener('input', () => {
      slider.setAttribute('aria-valuenow', slider.value);

      // Announce value via a live region
      announceSliderValue(id, slider.value);
    });
  });
}

// Shared live region for announcing slider values
let _srLiveEl = null;

function _getOrCreateLiveRegion() {
  if (_srLiveEl) return _srLiveEl;

  _srLiveEl = document.createElement('div');
  _srLiveEl.id = 'sr-live-region';
  _srLiveEl.className = 'sr-only';
  _srLiveEl.setAttribute('aria-live', 'polite');
  _srLiveEl.setAttribute('aria-atomic', 'true');
  document.body.appendChild(_srLiveEl);
  return _srLiveEl;
}

let _announceTimer = null;

/**
 * Announce a slider value change to screen readers via a live region.
 * Debounced to avoid flooding the SR with rapid drag updates.
 */
export function announceSliderValue(id, value) {
  const live = _getOrCreateLiveRegion();
  clearTimeout(_announceTimer);
  _announceTimer = setTimeout(() => {
    // Format to 3 decimal places max
    const formatted = parseFloat(value)
      .toFixed(3)
      .replace(/\.?0+$/, '');
    live.textContent = `${id}: ${formatted}`;
    // Clear after a moment so next update re-triggers announcement
    setTimeout(() => {
      live.textContent = '';
    }, 1000);
  }, 150);
}

/**
 * Announce an arbitrary message to screen readers.
 * Type: 'polite' | 'assertive'
 */
export function announceToScreenReader(message, type = 'polite') {
  const live = _getOrCreateLiveRegion();
  live.setAttribute('aria-live', type);
  // Toggle content to force re-announcement of identical messages
  live.textContent = '';
  requestAnimationFrame(() => {
    live.textContent = message;
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// §C  ZOOM UI — Ctrl+= / Ctrl+- / Ctrl+0
// ═════════════════════════════════════════════════════════════════════════════

// Zoom levels: 70% → 150% in steps
const ZOOM_STEPS = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.3, 1.4, 1.5];
const ZOOM_DEFAULT = 1.0;
const ZOOM_STORAGE_KEY = 'sl_ui_zoom';

let _currentZoom = ZOOM_DEFAULT;
let _zoomIndicatorTimer = null;

function _clampZoom(z) {
  return Math.min(ZOOM_STEPS[ZOOM_STEPS.length - 1], Math.max(ZOOM_STEPS[0], z));
}

function _nearestZoomStep(z) {
  return ZOOM_STEPS.reduce((prev, curr) => (Math.abs(curr - z) < Math.abs(prev - z) ? curr : prev));
}

function _applyZoom(zoom) {
  _currentZoom = _clampZoom(zoom);

  // Apply via CSS custom property on :root + transform on the app wrapper
  document.documentElement.style.setProperty('--ui-zoom', String(_currentZoom));

  // Find the main app container and scale it
  const app =
    document.getElementById('app') || document.getElementById('main-layout') || document.body;

  // Use font-size scaling as primary approach (scales em/rem-based layout)
  // Base font-size is 14px; we scale relative to that
  const basePx = 14;
  document.documentElement.style.fontSize = `${basePx * _currentZoom}px`;

  // Persist
  try {
    localStorage.setItem(ZOOM_STORAGE_KEY, String(_currentZoom));
  } catch (_) {}

  // Show indicator
  _showZoomIndicator(_currentZoom);

  // Announce to screen reader
  announceToScreenReader(`UI zoom: ${Math.round(_currentZoom * 100)}%`);
}

function _showZoomIndicator(zoom) {
  let el = document.getElementById('zoom-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'zoom-indicator';
    el.setAttribute('aria-hidden', 'true'); // decorative — SR gets announcement via live region
    document.body.appendChild(el);
  }

  el.textContent = `${Math.round(zoom * 100)}%`;
  el.classList.add('visible');

  clearTimeout(_zoomIndicatorTimer);
  _zoomIndicatorTimer = setTimeout(() => {
    el.classList.remove('visible');
  }, 1500);
}

function zoomIn() {
  const idx = ZOOM_STEPS.indexOf(_nearestZoomStep(_currentZoom));
  const next = ZOOM_STEPS[Math.min(idx + 1, ZOOM_STEPS.length - 1)];
  _applyZoom(next);
}

function zoomOut() {
  const idx = ZOOM_STEPS.indexOf(_nearestZoomStep(_currentZoom));
  const prev = ZOOM_STEPS[Math.max(idx - 1, 0)];
  _applyZoom(prev);
}

function zoomReset() {
  _applyZoom(ZOOM_DEFAULT);
}

/**
 * Set an explicit zoom level (0.7 – 1.5).
 */
export function setUIZoom(level) {
  _applyZoom(level);
}

export function getUIZoom() {
  return _currentZoom;
}

function _initZoomKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Only intercept Ctrl+= / Ctrl+- / Ctrl+0
    // Don't intercept if Monaco editor is focused (it has its own font zoom)
    const active = document.activeElement;
    const inMonaco = active?.closest?.('.monaco-editor');
    if (inMonaco) return;

    if (!e.ctrlKey && !e.metaKey) return;

    if (e.key === '=' || e.key === '+') {
      e.preventDefault();
      zoomIn();
      return;
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomOut();
      return;
    }
    if (e.key === '0') {
      e.preventDefault();
      zoomReset();
      return;
    }
  });
}

function _restoreZoom() {
  try {
    const saved = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (saved) {
      const z = parseFloat(saved);
      if (z >= 0.7 && z <= 1.5) {
        _applyZoom(z);
        return;
      }
    }
  } catch (_) {}
  _applyZoom(ZOOM_DEFAULT);
}

// ═════════════════════════════════════════════════════════════════════════════
// §D  INIT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Initialize all Phase 7.3 accessibility features.
 * Call once on DOMContentLoaded.
 */
export function initAccessibility() {
  injectSkipLink();
  _initZoomKeyboard();
  _restoreZoom();

  // Enhance sliders after a short delay to let the UI build
  setTimeout(enhanceSlidersForScreenReader, 500);

  // Re-enhance whenever sliders are rebuilt
  document.addEventListener('zgl:slidersBuilt', () => {
    setTimeout(enhanceSlidersForScreenReader, 100);
  });

  // Expose zoom functions globally for potential menu integration
  window.__zgl_zoom = {
    in: zoomIn,
    out: zoomOut,
    reset: zoomReset,
    set: setUIZoom,
    get: getUIZoom,
  };
}
