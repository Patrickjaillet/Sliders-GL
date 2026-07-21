// §7.2 roadmap UI/UX — Sparklines d'historique des uniforms  (F-3.8 amélioré)
//
// Sparklines 90 échantillons + tooltip enrichi au survol :
//   moy · σ · min · max · sparkline 80×20 canvas
// L'échantillonnage tourne à ~10 Hz pour rester négligeable.

import { state } from '../core/state.js';
import { safeLocalGet, safeLocalSet } from '../core/utils.js';

const N = 90;
const _hist = new Map();   // id → { buf:Float32Array, idx:number }
let _enabled = safeLocalGet('sl_uniformSparks', '0') === '1';
let _timer = null;
let _observer = null;

function _ring(id) {
  let r = _hist.get(id);
  if (!r) { r = { buf: new Float32Array(N), idx: 0 }; _hist.set(id, r); }
  return r;
}

function _sample() {
  if (!_enabled) return;
  for (const e of state.vars || []) {
    const r = _ring(e.id);
    r.buf[r.idx % N] = e.value;
    r.idx++;
  }
}

function _draw(canvas, id) {
  const r = _hist.get(id);
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!r || r.idx < 2) return;
  // min/max sur la fenêtre pour normaliser
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < N; i++) { const v = r.buf[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  if (!isFinite(mn) || mx - mn < 1e-9) { mx = mn + 1; }
  const count = Math.min(r.idx, N);
  const pts = [];
  for (let i = 0; i < count; i++) {
    const idx = (r.idx - count + i + N * 2) % N;
    const v = r.buf[idx];
    const x = (i / (N - 1)) * (w - 2) + 1;
    const y = h - 1 - ((v - mn) / (mx - mn)) * (h - 2);
    pts.push([x, y]);
  }
  // Phase S — fond en gradient sous la courbe (haut → bas, 0.08 → 0)
  ctx.beginPath();
  ctx.moveTo(pts[0][0], h);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(pts[pts.length - 1][0], h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(57,255,106,0.08)');
  grad.addColorStop(1, 'rgba(57,255,106,0)');
  ctx.fillStyle = grad;
  ctx.fill();
  // Courbe
  ctx.beginPath();
  pts.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  const cs = getComputedStyle(document.documentElement);
  ctx.strokeStyle = cs.getPropertyValue('--accent').trim() || '#4da3ff';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function _ensureCanvases() {
  const sw = document.getElementById('sw');
  if (!sw) return;
  sw.querySelectorAll('.sr').forEach(row => {
    const id = row.getAttribute('data-id') || row.querySelector('[data-id]')?.getAttribute('data-id')
              || row.id?.replace('sr-', '');
    if (!id) return;
    let cv = row.querySelector('.sl-spark');
    if (_enabled && !cv) {
      cv = document.createElement('canvas');
      cv.className = 'sl-spark';
      cv.width = 80; cv.height = 14;
      cv.title = 'Hover for stats';
      const top = row.querySelector('.sr-top') || row;
      top.appendChild(cv);
    }
    if (!_enabled && cv) cv.remove();
    // Tooltip enrichi (F-3.8) — toujours actif pour les sliders visibles
    if (_enabled) _bindTooltipEvents(row, id);
  });
}

function _redraw() {
  if (!_enabled) return;
  const sw = document.getElementById('sw');
  if (!sw) return;
  sw.querySelectorAll('.sr').forEach(row => {
    const id = row.getAttribute('data-id') || row.querySelector('[data-id]')?.getAttribute('data-id');
    const cv = row.querySelector('.sl-spark');
    // Phase Y — freeze the sparkline of the slider currently being dragged
    // (.sl-track.active is toggled by the pointerdown/up handlers in slider.js)
    // so it doesn't scintillate while the user is reading the value precisely.
    if (id && cv && !row.querySelector('.sl-track.active')) _draw(cv, id);
  });
}

export function toggleUniformSparklines(force) {
  _enabled = force !== undefined ? force : !_enabled;
  safeLocalSet('sl_uniformSparks', _enabled ? '1' : '0');
  const btn = document.getElementById('uniformSparkBtn');
  if (btn) {
    btn.classList.toggle('active', _enabled);
    btn.setAttribute('aria-pressed', String(_enabled));
  }
  _ensureCanvases();
  _redraw();
  return _enabled;
}

// ── Calcul des statistiques ───────────────────────────────────────────────────

export function getSparklineStats(id) {
  const r = _hist.get(id);
  if (!r || r.idx < 2) return null;
  const count = Math.min(r.idx, N);
  const vals = [];
  for (let i = 0; i < count; i++) {
    vals.push(r.buf[(r.idx - count + i + N * 2) % N]);
  }
  let sum = 0, mn = Infinity, mx = -Infinity;
  for (const v of vals) { sum += v; if (v < mn) mn = v; if (v > mx) mx = v; }
  const avg = sum / count;
  let variance = 0;
  for (const v of vals) variance += (v - avg) ** 2;
  const sigma = Math.sqrt(variance / count);
  return { avg, sigma, min: mn, max: mx, count, vals };
}

// ── Tooltip enrichi ───────────────────────────────────────────────────────────

let _tipEl = null;
let _tipTimer = null;

function _ensureTip() {
  if (_tipEl) return _tipEl;
  _tipEl = document.createElement('div');
  _tipEl.id = 'slSparkTip';
  _tipEl.hidden = true;
  _tipEl.innerHTML = `
    <div id="slSparkTipHeader"></div>
    <canvas id="slSparkTipCanvas" width="160" height="30"></canvas>
    <div id="slSparkTipStats"></div>
  `;
  document.body.appendChild(_tipEl);
  _injectTipStyles();
  return _tipEl;
}

function _showTip(id, anchorEl) {
  if (!_enabled) return;
  const stats = getSparklineStats(id);
  if (!stats) return;
  const entry = state.varMap?.[id];
  const tip = _ensureTip();

  // Header
  const header = tip.querySelector('#slSparkTipHeader');
  header.textContent = entry?.label || id;

  // Sparkline grande taille
  const cvs = tip.querySelector('#slSparkTipCanvas');
  const ctx = cvs.getContext('2d');
  const w = cvs.width, h = cvs.height;
  ctx.clearRect(0, 0, w, h);

  const { vals, min: mn, max: mx } = stats;
  const range = mx - mn < 1e-9 ? 1 : mx - mn;

  // Fond
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, w, h);

  // Ligne de valeur actuelle
  const curY = h - 1 - ((entry?.value ?? vals.at(-1)) - mn) / range * (h - 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath(); ctx.moveTo(0, curY); ctx.lineTo(w, curY); ctx.stroke();
  ctx.setLineDash([]);

  // Courbe
  ctx.beginPath();
  for (let i = 0; i < vals.length; i++) {
    const x = (i / (vals.length - 1)) * (w - 2) + 1;
    const y = h - 1 - ((vals[i] - mn) / range) * (h - 2);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  const cs = getComputedStyle(document.documentElement);
  ctx.strokeStyle = cs.getPropertyValue('--accent').trim() || '#5b8df6';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Stats texte
  const fmt = v => Math.abs(v) < 0.001 ? v.toExponential(2) : v.toFixed(3);
  tip.querySelector('#slSparkTipStats').innerHTML =
    `<span>moy <b>${fmt(stats.avg)}</b></span>` +
    `<span>σ <b>${fmt(stats.sigma)}</b></span>` +
    `<span>min <b>${fmt(stats.min)}</b></span>` +
    `<span>max <b>${fmt(stats.max)}</b></span>`;

  // Position
  tip.hidden = false;
  const rect = anchorEl.getBoundingClientRect();
  const tw = tip.offsetWidth || 190;
  const th = tip.offsetHeight || 90;
  let left = rect.left;
  let top = rect.top - th - 6;
  if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
  if (top < 8) top = rect.bottom + 6;
  tip.style.left = Math.max(8, left) + 'px';
  tip.style.top = Math.max(8, top) + 'px';
}

function _hideTip() {
  clearTimeout(_tipTimer);
  if (_tipEl) _tipEl.hidden = true;
}

function _bindTooltipEvents(row, id) {
  if (row._sparkTipBound) return;
  row._sparkTipBound = true;
  row.addEventListener('mouseenter', () => {
    _tipTimer = setTimeout(() => _showTip(id, row), 600);
  });
  row.addEventListener('mouseleave', _hideTip);
}

function _injectTipStyles() {
  if (document.getElementById('slSparkTipStyle')) return;
  const s = document.createElement('style');
  s.id = 'slSparkTipStyle';
  s.textContent = `
    #slSparkTip {
      position: fixed; z-index: 2000; pointer-events: none;
      background: var(--bg-deep, #0e1012);
      border: 1px solid var(--border, #2a2d32);
      border-radius: 6px; padding: 8px 10px;
      font-family: 'JetBrains Mono', monospace; font-size: 10px;
      color: var(--prose, #ccc); width: 190px;
      box-shadow: 0 8px 24px rgba(0,0,0,.5);
    }
    #slSparkTip[hidden] { display: none; }
    #slSparkTipHeader { font-size: 11px; font-weight: 700; margin-bottom: 5px;
      color: var(--accent, #5b8df6); }
    #slSparkTipCanvas { display: block; width: 100%; border-radius: 3px; margin-bottom: 6px; }
    #slSparkTipStats { display: flex; gap: 8px; flex-wrap: wrap; }
    #slSparkTipStats span { color: var(--t3, #888); }
    #slSparkTipStats b { color: var(--prose, #ccc); }
  `;
  document.head.appendChild(s);
}

export function initUniformSparklines() {
  // Bouton de bascule dans l'en-tête du panneau uniforms
  const ph = document.querySelector('#layout > .panel > .ph');
  if (ph && !document.getElementById('uniformSparkBtn')) {
    const btn = document.createElement('button');
    btn.id = 'uniformSparkBtn';
    btn.className = 'ph-icon-btn' + (_enabled ? ' active' : '');
    btn.type = 'button';
    btn.title = 'Toggle value-history sparklines';
    btn.setAttribute('aria-label', 'Toggle uniform value sparklines');
    btn.setAttribute('aria-pressed', String(_enabled));
    btn.textContent = '∿';
    btn.addEventListener('click', () => toggleUniformSparklines());
    ph.appendChild(btn);
  }

  const sw = document.getElementById('sw');
  if (sw) {
    _observer = new MutationObserver(() => _ensureCanvases());
    _observer.observe(sw, { childList: true, subtree: true });
  }
  _ensureCanvases();

  _timer = setInterval(() => { _sample(); _redraw(); }, 100);
}
