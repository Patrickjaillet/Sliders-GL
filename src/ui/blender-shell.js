import { switchSidebarTab } from './sidebar-tabs.js';
import { detectGLCaps } from '../render/gl-caps.js';

let _openMenuWrap = null;

function _closeOpenMenu() {
  if (!_openMenuWrap) return;
  const popup = _openMenuWrap.querySelector('.tb-menu-popup');
  const btn = _openMenuWrap.querySelector('.tb-menu-btn');
  if (popup) popup.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
  _openMenuWrap = null;
  document.removeEventListener('pointerdown', _onOutsideMenuClick, { capture: true });
}

function _onOutsideMenuClick(e) {
  if (_openMenuWrap && _openMenuWrap.contains(e.target)) return;
  _closeOpenMenu();
}

function _openMenu(wrap) {
  if (_openMenuWrap === wrap) return;
  _closeOpenMenu();
  const popup = wrap.querySelector('.tb-menu-popup');
  const btn = wrap.querySelector('.tb-menu-btn');
  if (!popup || !btn) return;
  popup.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  _openMenuWrap = wrap;
  setTimeout(() => {
    document.addEventListener('pointerdown', _onOutsideMenuClick, { once: true, capture: true });
  }, 0);
}

function _initTopbarMenus() {
  document.querySelectorAll('.tb-menu-wrap').forEach(wrap => {
    const btn = wrap.querySelector('.tb-menu-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (_openMenuWrap === wrap) {
        _closeOpenMenu();
      } else {
        _openMenu(wrap);
      }
    });
  });

  document.addEventListener('click', (e) => {
    const item = e.target.closest('[data-menu-action]');
    if (!item) return;
    const action = item.dataset.menuAction;
    _closeOpenMenu();
    window.dispatchEvent(new CustomEvent('menu-action', { detail: { action } }));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _openMenuWrap) _closeOpenMenu();
  });
}

function _initWorkspaceTabs() {
  const bar = document.getElementById('workspaceTabs');
  if (!bar) return;
  bar.querySelectorAll('.ws-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.ws-tab').forEach(b => b.classList.toggle('active', b === btn));
      const target = btn.dataset.wsTarget;
      if (target) switchSidebarTab(target);
    });
  });
}

function _initOutliner() {
  document.querySelectorAll('#outliner [data-outliner-jump]').forEach(row => {
    row.addEventListener('click', () => switchSidebarTab(row.dataset.outlinerJump));
  });
}

function _initAboutVersion() {
  const el = document.getElementById('aboutVersion');
  if (el) el.textContent = __APP_VERSION__;
}

function _initStatusBarVersion() {
  const el = document.getElementById('sbVersion');
  if (el) el.textContent = `v${__APP_VERSION__}`;
}

/** @param {number} bytes */
function _formatMB(bytes) {
  return `${Math.round(bytes / 1048576)} MB`;
}

let _memGpuTimer = null;

function _updateStatusBarMemGpu() {
  const el = document.getElementById('sbMemGpu');
  if (!el) return;

  // JS heap usage — non-standard `performance.memory`, Chromium/WebView2 only
  // (this app targets Windows 10/11 + WebView2 exclusively, per §5). Falls
  // back to a blank reading on engines that don't expose it (e.g. Firefox
  // during `npm run dev` in a non-Chromium browser).
  const mem = /** @type {any} */ (performance).memory;
  el.textContent = mem ? _formatMB(mem.usedJSHeapSize) : '-- MB';

  // GPU renderer string surfaced as a tooltip rather than inline text, so the
  // status bar stays compact — `detectGLCaps()` returns null (and caches
  // nothing) until the WebGL context exists, so this self-heals once initGL()
  // has run on the window `load` event, regardless of init order.
  const caps = detectGLCaps();
  el.title = caps?.renderer && caps.renderer !== 'unknown'
    ? `GPU: ${caps.renderer}`
    : 'GPU renderer unavailable (WEBGL_debug_renderer_info not exposed)';
}

function _initStatusBarMemGpu() {
  _updateStatusBarMemGpu();
  clearInterval(_memGpuTimer);
  _memGpuTimer = setInterval(_updateStatusBarMemGpu, 2000);
}

export function initBlenderShell() {
  _initTopbarMenus();
  _initWorkspaceTabs();
  _initOutliner();
  _initAboutVersion();
  _initStatusBarVersion();
  _initStatusBarMemGpu();
}
