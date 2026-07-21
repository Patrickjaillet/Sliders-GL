let _tip = null;
let _showTimer = null;
let _currentTarget = null;

function _getOrCreateEl() {
  if (!_tip) {
    _tip = document.createElement('div');
    _tip.id = 'zgl-tooltip';
    _tip.setAttribute('role', 'tooltip');
    _tip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(_tip);
  }
  return _tip;
}

function _position(el) {
  const tip = _getOrCreateEl();
  const r = el.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  const gap = 8;

  let left = r.left + r.width / 2 - tw / 2;
  let top  = r.bottom + gap;

  if (top + th > window.innerHeight - 4) {
    top = r.top - th - gap;
  }
  left = Math.max(4, Math.min(left, window.innerWidth - tw - 4));

  tip.style.left = left + 'px';
  tip.style.top  = top  + 'px';
}

function _show(el, text) {
  const tip = _getOrCreateEl();
  tip.textContent = text;
  tip.classList.add('visible');
  tip.setAttribute('aria-hidden', 'false');
  _position(el);
}

function _hide() {
  clearTimeout(_showTimer);
  _showTimer = null;
  _currentTarget = null;
  if (!_tip) return;
  _tip.classList.remove('visible');
  _tip.setAttribute('aria-hidden', 'true');
}

function _onPointerEnter(e) {
  if (!(e.target instanceof Element)) return;
  const el = e.target.closest('[title]');
  if (!el) return;
  const text = el.getAttribute('title');
  if (!text) return;

  el.dataset.zglTitle = text;
  el.removeAttribute('title');

  if (_currentTarget === el) return;
  _hide();
  _currentTarget = el;

  _showTimer = setTimeout(() => {
    if (_currentTarget === el) _show(el, text);
  }, 500);
}

function _onPointerLeave(e) {
  if (!(e.target instanceof Element)) return;
  const el = e.target.closest('[data-zgl-title]');
  if (!el) return;
  el.setAttribute('title', el.dataset.zglTitle);
  delete el.dataset.zglTitle;
  _hide();
}

function _onPointerDown() {
  _hide();
}

function _onScroll() {
  _hide();
}

function _onKeyDown(e) {
  if (e.key === 'Escape') _hide();
}

export function initTooltips() {
  const style = document.createElement('style');
  style.textContent = `
#zgl-tooltip {
  position: fixed;
  z-index: 99999;
  max-width: 260px;
  padding: 5px 9px;
  border-radius: 5px;
  font-size: 11.5px;
  line-height: 1.4;
  font-family: inherit;
  pointer-events: none;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--bg-tooltip, #2C2C2C);
  color: var(--text-tooltip, #FFFFFF);
  border: 1px solid var(--border-strong);
  box-shadow: 0 4px 16px rgba(0,0,0,0.45);
  opacity: 0;
  transform: translateY(3px);
  transition: opacity 0.12s ease, transform 0.12s ease;
}
#zgl-tooltip.visible {
  opacity: 1;
  transform: translateY(0);
}
  `.trim();
  document.head.appendChild(style);

  document.addEventListener('pointerenter', _onPointerEnter, { capture: true, passive: true });
  document.addEventListener('pointerleave', _onPointerLeave, { capture: true, passive: true });
  document.addEventListener('pointerdown',  _onPointerDown,  { passive: true });
  document.addEventListener('scroll',       _onScroll,       { capture: true, passive: true });
  document.addEventListener('keydown',      _onKeyDown,      { passive: true });
}
