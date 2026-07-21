// §7.1 + F-7.3 — Profilage GPU par passe avec bargraph, flamegraph, sparklines et Pin Budget
//
// Quand activé, mesure le temps GPU de chaque passe via gl.finish() (opt-in).
// Affiche un widget flottant avec :
//   - Flamegraph proportionnel (largeur ∝ ms, couleur par passe)
//   - Bargraph horizontal par passe avec coloration seuil (vert < 8ms · orange 8–14ms · rouge > 14ms)
//   - Sparkline 60 frames par passe (canvas 80×16)
//   - Pin budget : fige une référence pour comparer avant/après

import { state } from '../core/state.js';
import { makeDraggablePersistent } from '../ui/panel-manager.js';

const HIST_LEN = 60;

let _on      = false;
let _widget  = null;
let _raf     = 0;
const _times   = new Map();  // id → EMA ms
const _history = new Map();  // id → Float32Array ring buffer + idx
const _pinned  = new Map();  // id → ms (pin budget snapshot)
let _pinActive = false;

const _SMOOTH = 0.2;

const LABELS = { bufA: 'Buf A', bufB: 'Buf B', bufC: 'Buf C', bufD: 'Buf D', cubeA: 'Cube A', cubeB: 'Cube B', sound: 'Sound', image: 'Image', compA: 'Comp A', compB: 'Comp B' };
const COLORS  = { bufA: '#7b6fff', bufB: '#ff6b8a', bufC: '#5fffa0', bufD: '#ffa85c', cubeA: '#38d4f5', cubeB: '#f5c238', sound: '#ff9f43', image: '#8aa0ff', compA: '#c084fc', compB: '#a78bfa' };

export function isProfilingPasses() { return _on; }

function _record(id, ms) {
  const prev = _times.get(id) ?? ms;
  _times.set(id, prev + (ms - prev) * _SMOOTH);
}

function _histRing(id) {
  let r = _history.get(id);
  if (!r) { r = { buf: new Float32Array(HIST_LEN), idx: 0 }; _history.set(id, r); }
  return r;
}

/**
 * Exécute le rendu d'une passe en la chronométrant si le profilage est actif.
 */
export function timePass(id, renderFn) {
  if (!_on) { renderFn(); return; }
  const gl = state.renderer3?.getContext?.();
  const t0 = performance.now();
  renderFn();
  try { gl?.finish(); } catch { /* noop */ }
  _record(id, performance.now() - t0);
}

/**
 * Appelé une fois par frame depuis raf-loop.js pour pousser les valeurs EMA
 * courantes dans l'historique des sparklines.
 */
export function flushPassBudgets() {
  if (!_on) return;
  for (const [id, ms] of _times) {
    const r = _histRing(id);
    r.buf[r.idx % HIST_LEN] = ms;
    r.idx++;
  }
}

/**
 * Retourne les budgets courants et leurs historiques.
 * @returns {Map<string, { ms: number, history: Float32Array, idx: number }>}
 */
export function getPassBudgets() {
  const out = new Map();
  for (const [id, ms] of _times) {
    const r = _histRing(id);
    out.set(id, { ms, history: r.buf, idx: r.idx });
  }
  return out;
}

// ── Thresholds (ms) ──────────────────────────────────────────────────────────
function _thresholdColor(ms) {
  if (ms > 14) return '#ff5a5a';
  if (ms > 8)  return '#ffa44a';
  return '#4dcc88';
}

// ── Sparkline canvas drawing ─────────────────────────────────────────────────
function _drawSparkline(canvas, id, color) {
  const r = _history.get(id);
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!r || r.idx < 2) return;
  const count = Math.min(r.idx, HIST_LEN);
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < count; i++) {
    const idx = (r.idx - count + i + HIST_LEN * 2) % HIST_LEN;
    const v = r.buf[idx];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  if (mx - mn < 0.1) mx = mn + 0.1;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const idx = (r.idx - count + i + HIST_LEN * 2) % HIST_LEN;
    const v = r.buf[idx];
    const x = (i / (count - 1)) * (w - 2) + 1;
    const y = h - 1 - ((v - mn) / (mx - mn)) * (h - 2);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color || '#4da3ff';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

// ── Widget construction ───────────────────────────────────────────────────────
function _buildWidget() {
  if (_widget) return;
  _widget = document.createElement('div');
  _widget.id = 'pass-profiler';
  _widget.className = 'pass-profiler';
  _widget.innerHTML = `
    <div class="pp-title">
      GPU / pass
      <span class="pp-total" id="pp-total"></span>
      <button class="pp-pin-btn" id="pp-pin-btn" title="Pin budget — freeze reference for comparison">📌 Pin</button>
    </div>
    <div class="pp-flame" id="pp-flame"></div>
    <div class="pp-bars" id="pp-bars"></div>`;
  document.body.appendChild(_widget);

  // P1.7 — persist position in localStorage
  makeDraggablePersistent(_widget, 'pass-profiler', _widget.querySelector('.pp-title'));

  document.getElementById('pp-pin-btn')?.addEventListener('click', () => {
    if (_pinActive) {
      _pinned.clear();
      _pinActive = false;
      const btn = document.getElementById('pp-pin-btn');
      if (btn) { btn.textContent = '📌 Pin'; btn.classList.remove('pp-pin-active'); }
    } else {
      _pinned.clear();
      for (const [id, ms] of _times) _pinned.set(id, ms);
      _pinActive = true;
      const btn = document.getElementById('pp-pin-btn');
      if (btn) { btn.textContent = '📌 Unpin'; btn.classList.add('pp-pin-active'); }
    }
  });
}

// ── Redraw ────────────────────────────────────────────────────────────────────
function _redraw() {
  if (!_on || !_widget) return;

  const barsEl = _widget.querySelector('#pp-bars');
  const entries = Object.keys(state.mp?.passes ?? {})
    .filter(id => _times.has(id) && (id === 'image' || state.mp.passes[id]?.enabled))
    .map(id => ({ id, ms: _times.get(id) }));

  if (!entries.length) {
    barsEl.innerHTML = '<span class="pp-empty">enable buffer passes…</span>';
    _raf = requestAnimationFrame(_redraw);
    return;
  }

  const total    = entries.reduce((s, e) => s + e.ms, 0);
  const slowest  = entries.reduce((a, b) => b.ms > a.ms ? b : a, entries[0]);

  // Flamegraph strip
  const flame = _widget.querySelector('#pp-flame');
  if (flame) {
    flame.innerHTML = entries.map(e => {
      const pct = (e.ms / total * 100).toFixed(2);
      const col = COLORS[e.id] || 'var(--accent)';
      return `<span class="pp-seg" style="width:${pct}%;background:${col}" title="${LABELS[e.id] || e.id}: ${e.ms.toFixed(2)} ms"></span>`;
    }).join('');
  }

  // Total + frame budget %
  const totalEl = _widget.querySelector('#pp-total');
  if (totalEl) {
    const budget = Math.round(total / 16.667 * 100);
    totalEl.textContent = `${total.toFixed(1)} ms · ${budget}%`;
    totalEl.style.color = budget > 100 ? '#ff5a5a' : budget > 70 ? '#ffa44a' : '#4dcc88';
  }

  // Bargraph rows with sparklines
  const maxMs = Math.max(...entries.map(e => e.ms), 0.1);
  barsEl.innerHTML = entries.map(e => {
    const barW   = Math.max(2, Math.round((e.ms / maxMs) * 90));
    const col    = COLORS[e.id] || 'var(--accent)';
    const thresh = _thresholdColor(e.ms);
    const hot    = e.id === slowest.id ? ' pp-hot' : '';

    // Pin delta badge
    let deltaBadge = '';
    if (_pinActive && _pinned.has(e.id)) {
      const delta = e.ms - _pinned.get(e.id);
      const sign  = delta >= 0 ? '+' : '';
      const dCol  = delta > 0.5 ? '#ff5a5a' : delta < -0.5 ? '#4dcc88' : '#888';
      deltaBadge = `<span class="pp-delta" style="color:${dCol}">${sign}${delta.toFixed(1)}</span>`;
    }

    return `<div class="pp-row${hot}" data-ppid="${e.id}">
      <span class="pp-lbl">${LABELS[e.id] || e.id}</span>
      <span class="pp-bar" style="width:${barW}px;background:${col}"></span>
      <span class="pp-ms" style="color:${thresh}">${e.ms.toFixed(1)} ms</span>
      ${deltaBadge}
      <canvas class="pp-spark" width="80" height="16" data-ppid="${e.id}" style="border-color:${col}22"></canvas>
    </div>`;
  }).join('');

  // Draw sparklines on the newly created canvases
  barsEl.querySelectorAll('canvas.pp-spark').forEach(canvas => {
    const id  = canvas.dataset.ppid;
    const col = COLORS[id] || 'var(--accent)';
    _drawSparkline(canvas, id, col);
  });

  _raf = requestAnimationFrame(_redraw);
}

// ── Public API ────────────────────────────────────────────────────────────────
export function togglePassProfiler(force) {
  _on = force !== undefined ? force : !_on;
  if (_on) {
    _buildWidget();
    _widget.classList.add('open');
    cancelAnimationFrame(_raf);
    _redraw();
  } else {
    if (_widget) _widget.classList.remove('open');
    cancelAnimationFrame(_raf);
    _times.clear();
  }
  return _on;
}
