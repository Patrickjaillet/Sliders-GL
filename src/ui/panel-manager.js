import { safeLocalGet, safeLocalSet } from '../core/utils.js';

const _PREFIX = 'sl_panel_pos_v1_';

function _savePos(key, x, y) {
  safeLocalSet(_PREFIX + key, JSON.stringify({ x, y }));
}

function _loadPos(key) {
  try { return JSON.parse(safeLocalGet(_PREFIX + key, 'null')); } catch { return null; }
}

/**
 * Makes a floating panel draggable and persists its position in localStorage.
 * Restores the saved position immediately.
 *
 * @param {HTMLElement} el         - The panel element (must have position:fixed or absolute)
 * @param {string}      storageKey - Unique key for localStorage persistence
 * @param {HTMLElement} [handleEl] - Drag handle (defaults to el itself)
 */
export function makeDraggablePersistent(el, storageKey, handleEl) {
  const handle = handleEl || el;

  // Restore saved position
  const saved = _loadPos(storageKey);
  if (saved) {
    el.style.left   = `${Math.max(0, Math.min(saved.x, window.innerWidth  - 40))}px`;
    el.style.top    = `${Math.max(0, Math.min(saved.y, window.innerHeight - 40))}px`;
    el.style.right  = 'auto';
    el.style.bottom = 'auto';
  }

  let ox = 0, oy = 0, sx = 0, sy = 0;

  handle.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    sx = e.clientX; sy = e.clientY;
    const r = el.getBoundingClientRect();
    ox = r.left; oy = r.top;

    function onMove(e) {
      const nx = ox + e.clientX - sx;
      const ny = oy + e.clientY - sy;
      el.style.left   = `${nx}px`;
      el.style.top    = `${ny}px`;
      el.style.right  = 'auto';
      el.style.bottom = 'auto';
    }

    function onUp(e) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      const nx = ox + e.clientX - sx;
      const ny = oy + e.clientY - sy;
      _savePos(storageKey, nx, ny);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  });
}

/**
 * Clears the persisted position for a panel key.
 * @param {string} storageKey
 */
export function clearPanelPos(storageKey) {
  safeLocalSet(_PREFIX + storageKey, 'null');
}
