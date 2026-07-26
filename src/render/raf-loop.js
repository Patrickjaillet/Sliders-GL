
import { state } from '../core/state.js';
import { fpsColorClass } from '../core/utils.js';

let _uniformBuf    = null;
let _uniformF32    = null;
let _uniformI32    = null;

const SAB_SLOTS    = 4;
const SLOT_TIME    = 0;
const SLOT_DELTA   = 1;
const SLOT_FRAME   = 2;

function _initUniformBuffer() {
  const byteLen = SAB_SLOTS * 4;
  try {
    if (typeof SharedArrayBuffer === 'undefined') throw new Error('unavailable');
    _uniformBuf = new SharedArrayBuffer(byteLen);
  } catch {

    _uniformBuf = new ArrayBuffer(byteLen);
  }
  _uniformF32 = new Float32Array(_uniformBuf);
  _uniformI32 = new Int32Array(_uniformBuf);
}

const _HAS_RVFC = typeof HTMLCanvasElement !== 'undefined'
  && typeof HTMLCanvasElement.prototype.requestVideoFrameCallback === 'function';

let _rafRunning    = false;
let _rafId         = null;
let _prevPresentTs = 0;
let _canvasEl      = null;
// Phase 22.3 — Safety flag: if requestVideoFrameCallback never fires (e.g. Tauri
// transparent window not yet composited), fall back to plain RAF after 200 ms.
let _rvfcFired     = false;

export function startLoop(canvas) {
  if (_rafRunning) return;
  _rafRunning  = true;
  _canvasEl    = canvas;

  _initUniformBuffer();

  if (_HAS_RVFC && canvas) {
    canvas.requestVideoFrameCallback(_rvfcTick);
    // Phase 22.3 — Safety fallback: if RVFC never fires within 200 ms (Tauri
    // transparent window, hidden tab, or WebView2 compositing not yet active),
    // switch silently to plain RAF so the render loop always starts.
    //
    // Item 3.16 (accepted compromise) — The 200 ms value is intentional:
    //   • Too low (< 50 ms): risks a false-positive fallback on slow machines
    //     where the compositor takes a little time to schedule the first RVFC,
    //     causing double-render (RVFC + RAF running simultaneously) until the
    //     RVFC path detects the duplicate and cancels the RAF id (line ~87).
    //   • Too high (> 500 ms): produces a visible "black frame" startup delay
    //     on Tauri when the WebView2 window is not yet composited.
    //   200 ms is the sweet spot: long enough for slow hardware, short enough
    //   for imperceptible startup latency.  Do not lower without profiling on
    //   an actual Tauri build on a low-end Windows machine.
    setTimeout(() => {
      if (!_rvfcFired && _rafRunning) {
        _rafId = requestAnimationFrame(_rafTick);
      }
    }, 200);
  } else {
    _rafId = requestAnimationFrame(_rafTick);
  }
}

export function stopLoop() {
  _rafRunning = false;
  if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
}

function _rvfcTick(now, meta) {
  if (!_rafRunning) return;
  _rvfcFired = true; // Phase 22.3 — confirms RVFC is working; disarms RAF fallback
  // If the RAF fallback had already started, stop it to avoid double rendering.
  if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }

  const presentTs = meta?.presentationTime ?? now;

  _runTick(presentTs, _prevPresentTs || presentTs - 16.667);
  _prevPresentTs = presentTs;

  _canvasEl.requestVideoFrameCallback(_rvfcTick);
}

function _rafTick(now) {
  if (!_rafRunning) return;
  _rafId = requestAnimationFrame(_rafTick);

  _runTick(now, _prevPresentTs || now - 16.667);
  _prevPresentTs = now;
}

function _runTick(now, prevTs) {
  const dt = Math.min((now - prevTs) / 1000, 0.1);

  if (!state.paused) state.simTime += dt;

  if (_uniformF32) {

    _uniformF32[SLOT_TIME]  = state.simTime;
    _uniformF32[SLOT_DELTA] = dt;

    if (_uniformI32) {

      if (typeof SharedArrayBuffer !== 'undefined' && _uniformBuf instanceof SharedArrayBuffer) {
        Atomics.store(_uniformI32, SLOT_FRAME, state.fidx);
      } else {
        _uniformI32[SLOT_FRAME] = state.fidx;
      }
    }
  }

  const mat = state.mat3;
  if (mat?.uniforms) {
    mat.uniforms.iTime.value      = state.simTime;
    mat.uniforms.iTimeDelta.value = dt;
    mat.uniforms.iFrame.value     = state.fidx;
  }
  state.fidx++;

  if (state.renderer3 && state.scene3 && state.cam3) {
    state.renderer3.render(state.scene3, state.cam3);
  }

  state.fcount++;
  state.ftimer += dt;
  if (state.ftimer >= 0.5) {
    const fps = Math.round(state.fcount / state.ftimer);
    const fpspill = document.getElementById('fpspill');
    const fpsEl   = document.getElementById('fps');
    if (fpspill) {
      fpspill.textContent = fps + ' FPS';
      fpspill.classList.remove('fps-good', 'fps-warn', 'fps-bad');
      fpspill.classList.add(fpsColorClass(fps));
    }
    if (fpsEl)   fpsEl.textContent   = fps + ' fps';
    // §4.1 — compteur de frames du HUD
    const fpill = document.getElementById('fpill');
    if (fpill) {
      const fr = state.mat3?.uniforms?.iFrame?.value;
      fpill.textContent = 'f ' + (Number.isFinite(fr) ? fr : state.fidx || 0);
    }
    state.fcount = 0;
    state.ftimer = 0;
  }

  const tpill = document.getElementById('tpill');
  if (tpill) tpill.textContent = 't = ' + state.simTime.toFixed(2);
}
