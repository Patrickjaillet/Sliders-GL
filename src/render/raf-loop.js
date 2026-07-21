
import { state } from '../core/state.js';
import { timePass, flushPassBudgets } from './pass-profiler.js';
import { _tickVideoChannels } from '../channels/channels-media.js';
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
  // Fix 1.3 — state.perf is null until perf.js initialises; guard before write.
  if (state.perf) {
    state.perf.uniformSAB = _uniformBuf;
    state.perf.uniformF32 = _uniformF32;
  }
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

let _lastCapTs     = 0;

const _CAN_MARK    = typeof performance !== 'undefined' && typeof performance.mark === 'function';
const _MARK_START  = 'zgl-tick-start';
const _MARK_END    = 'zgl-tick-end';
const _MEASURE_ID  = 'zgl-js-overhead';

let _jsOverheadEma = 0;
const _JS_EMA_A    = 0.1;

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

export function getJsOverheadMs() { return _jsOverheadEma; }

function _rvfcTick(now, meta) {
  if (!_rafRunning) return;
  _rvfcFired = true; // Phase 22.3 — confirms RVFC is working; disarms RAF fallback
  // If the RAF fallback had already started, stop it to avoid double rendering.
  if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }

  const presentTs = meta?.presentationTime ?? now;

  if (_shouldSkipFrame(presentTs)) {
    _canvasEl.requestVideoFrameCallback(_rvfcTick);
    return;
  }

  _runTick(presentTs, _prevPresentTs || presentTs - 16.667);
  _prevPresentTs = presentTs;

  _canvasEl.requestVideoFrameCallback(_rvfcTick);
}

function _rafTick(now) {
  if (!_rafRunning) return;
  _rafId = requestAnimationFrame(_rafTick);

  if (_shouldSkipFrame(now)) return;

  _runTick(now, _prevPresentTs || now - 16.667);
  _prevPresentTs = now;
}

function _shouldSkipFrame(now) {
  // Fix 1.3 — guard: state.perf may be null before perf.js initialises.
  const cap = state.perf?.fpsCap;
  if (!cap) return false;

  const interval = 1000 / cap;
  if (!_lastCapTs) { _lastCapTs = now; return false; }
  const elapsed = now - _lastCapTs;
  if (elapsed < interval - 0.5) return true;

  const steps = Math.max(1, Math.floor((elapsed + 0.5) / interval));
  _lastCapTs += steps * interval;
  return false;
}

function _runTick(now, prevTs) {
  if (_CAN_MARK) performance.mark(_MARK_START);
  const markT0 = now;

  const dt = Math.min((now - prevTs) / 1000, 0.1);

  if (!state.paused) state.simTime += dt;

  _tickVideoChannels(); // F-9.4 — ping-pong, in/out points, iTime sync

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

  if (state.channels.some(ch => ch.analyser && ch.audioDataTex) &&
      state.callbacks.updateAudioTextures) {
    state.callbacks.updateAudioTextures();
  }

  const renderT0 = performance.now();

  if (state.callbacks.renderMultiPass) state.callbacks.renderMultiPass(dt);
  flushPassBudgets(); // F-7.3 — push EMA timings into sparkline history
  if (state.perf?.postEnabled && state.perf.postRT) {
    state.renderer3.setRenderTarget(state.perf.postRT);
    timePass('image', () => state.renderer3.render(state.scene3, state.cam3)); // §7.1
    state.renderer3.setRenderTarget(null);
    state.renderer3.render(state.perf.postScene, state.perf.postCam);
  } else if (state.renderer3 && state.scene3 && state.cam3) {
    timePass('image', () => state.renderer3.render(state.scene3, state.cam3)); // §7.1
  }

  const frameMs = performance.now() - renderT0;

  if (_CAN_MARK) {
    performance.mark(_MARK_END);
    try {
      performance.measure(_MEASURE_ID, _MARK_START, _MARK_END);
      const entries = performance.getEntriesByName(_MEASURE_ID, 'measure');
      if (entries.length) {
        const jsDuration = entries[entries.length - 1].duration;
        _jsOverheadEma   = _jsOverheadEma * (1 - _JS_EMA_A) + jsDuration * _JS_EMA_A;
        performance.clearMeasures(_MEASURE_ID);
        performance.clearMarks(_MARK_START);
        performance.clearMarks(_MARK_END);
        // Fix 1.3 — guard against null state.perf
        if (state.perf) state.perf.jsOverheadMs = _jsOverheadEma;
      }
    } catch {  }
  }

  // Fix 1.3 — guard all remaining state.perf accesses
  if (state.perf) {
    state.perf.cpuMs = state.perf.cpuMs * 0.85 + frameMs * 0.15;
  }

  if (state.callbacks.updateSparkline) state.callbacks.updateSparkline(frameMs);

  state.fcount++;
  state.ftimer += dt;
  if (state.ftimer >= 0.5) {
    const fps = Math.round(state.fcount / state.ftimer);
    if (state.perf) state.perf.fps = fps;
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

  const gpuEl = document.getElementById('gputpill');
  if (gpuEl && gpuEl.style.display !== 'none' && state.perf) {
    const gpuMs = state.perf.gpuTimestampMs ?? state.perf.cpuMs;
    gpuEl.textContent = '~' + gpuMs.toFixed(1) + ' ms';
  }

  if (state.perf?.alertEnabled) {
    const badge = document.getElementById('perfAlertBadge');
    if (badge) badge.classList.toggle('visible', state.perf.cpuMs > 16);
  }

  const tpill = document.getElementById('tpill');
  if (tpill) tpill.textContent = 't = ' + state.simTime.toFixed(2);
}
