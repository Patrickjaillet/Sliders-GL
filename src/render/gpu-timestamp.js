/**
 * src/render/gpu-timestamp.js
 *
 * Phase 1.3 — GPU Timestamp Queries
 *
 * Uses the WebGPU `timestamp-query` feature to measure actual GPU execution
 * time per frame, separate from JS/driver overhead.
 *
 * Falls back gracefully when:
 *   - WebGPU is not available
 *   - `timestamp-query` feature is not supported by the adapter/device
 *   - The device is lost
 *
 * Writes the result to `state.perf.gpuTimestampMs` which the RAF loop
 * reads and forwards to the HUD / perf panel.
 *
 * Architecture: `render` layer — imports `core/` only.
 */

import { state } from '../core/state.js';

// ─── Module state ─────────────────────────────────────────────────────────────

/** True when the feature is confirmed available and initialized. */
let _enabled = false;

/** GPUQuerySet of type 'timestamp', capacity 2 (begin + end). */
let _querySet = null;

/** GPUBuffer used to resolve the timestamp pair (QUERY_RESOLVE usage). */
let _resolveBuffer = null;

/** GPUBuffer mapped for CPU readback (MAP_READ + COPY_DST). */
let _readbackBuffer = null;

/** Whether a readback is in-flight (prevents overlapping maps). */
let _readbackPending = false;

// 2 × uint64 = 16 bytes
const TIMESTAMP_BYTES = 16;

// EMA α for GPU time smoothing
const GPU_EMA_A = 0.1;

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Initialize GPU timestamp query infrastructure on the given WebGPU device.
 * Safe to call multiple times — re-init if device changes.
 *
 * @param {GPUDevice} device
 * @returns {boolean}  true if timestamp queries are supported and ready
 */
export function initGpuTimestamps(device) {
  _cleanup();

  if (!device) return false;
  if (!device.features.has('timestamp-query')) {
    console.info('[gpu-timestamp] timestamp-query feature not available — skipping GPU timing');
    return false;
  }

  try {
    _querySet = device.createQuerySet({ type: 'timestamp', count: 2 });
    _resolveBuffer = device.createBuffer({
      size:  TIMESTAMP_BYTES,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    _readbackBuffer = device.createBuffer({
      size:  TIMESTAMP_BYTES,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    _enabled = true;
    state.perf.gpuTimestampEnabled = true;
    console.info('[gpu-timestamp] timestamp-query initialized ✓');
    return true;
  } catch (err) {
    console.warn('[gpu-timestamp] init failed:', err);
    _cleanup();
    return false;
  }
}

/** Clean up GPU resources and reset state. */
function _cleanup() {
  _enabled = false;
  state.perf.gpuTimestampEnabled = false;
  try { _querySet?.destroy();       } catch {} _querySet       = null;
  try { _resolveBuffer?.destroy();  } catch {} _resolveBuffer  = null;
  try { _readbackBuffer?.destroy(); } catch {} _readbackBuffer = null;
  _readbackPending = false;
}

// ─── Per-frame API ────────────────────────────────────────────────────────────

/**
 * Write a "begin frame" timestamp into slot 0.
 * Call this on the GPURenderPassDescriptor before submitting the pass:
 *
 *   passDescriptor.timestampWrites = beginTimestamp();
 *
 * @returns {GPURenderPassTimestampWrites|null}
 */
export function beginTimestamp() {
  if (!_enabled || !_querySet) return null;
  return {
    querySet:                  _querySet,
    beginningOfPassWriteIndex: 0,
    endOfPassWriteIndex:       1,
  };
}

/**
 * Resolve the timestamp queries and schedule an async readback.
 * Call this once per frame *after* submitting all render passes.
 *
 * @param {GPUDevice}       device
 * @param {GPUCommandEncoder} encoder  — command encoder for this frame
 */
export function resolveTimestamps(device, encoder) {
  if (!_enabled || !_querySet || !_resolveBuffer || !_readbackBuffer) return;
  if (_readbackPending) return; // previous readback still in-flight

  // Resolve the 2 timestamps into the resolve buffer
  encoder.resolveQuerySet(_querySet, 0, 2, _resolveBuffer, 0);

  // Copy resolve → readback buffer (separate from render commands)
  encoder.copyBufferToBuffer(_resolveBuffer, 0, _readbackBuffer, 0, TIMESTAMP_BYTES);

  // Async readback — does not block the frame
  _readbackPending = true;
  _readbackBuffer.mapAsync(GPUMapMode.READ).then(() => {
    try {
      const data    = new BigUint64Array(_readbackBuffer.getMappedRange());
      const beginNs = data[0];
      const endNs   = data[1];
      _readbackBuffer.unmap();
      _readbackPending = false;

      if (endNs > beginNs) {
        const gpuMs = Number(endNs - beginNs) / 1_000_000;  // ns → ms
        // Smooth with EMA
        const prev  = state.perf.gpuTimestampMs ?? gpuMs;
        state.perf.gpuTimestampMs = prev * (1 - GPU_EMA_A) + gpuMs * GPU_EMA_A;
      }
    } catch (err) {
      _readbackPending = false;
      // Device may have been lost
      if (err?.name === 'GPUValidationError') _cleanup();
    }
  }).catch(() => { _readbackPending = false; });
}

/** Whether timestamp queries are currently active. */
export function isGpuTimestampEnabled() { return _enabled; }

/**
 * Update the perf panel GPU time display.
 * Call this from the sparkline update path (same cadence as sparkline).
 */
export function updateGpuTimestampDisplay() {
  if (!_enabled) return;

  const gpuMs  = state.perf.gpuTimestampMs ?? 0;
  const gpuPct = Math.min(100, (gpuMs / 16.667) * 100).toFixed(1);

  const gpuBar = document.getElementById('perfGpuBar');
  const gpuVal = document.getElementById('perfGpuVal');
  if (gpuBar) gpuBar.style.width = gpuPct + '%';
  if (gpuVal) {
    gpuVal.textContent = gpuMs.toFixed(2) + ' ms';
    gpuVal.title = 'Actual GPU execution time (timestamp-query)';
    // Override the "(estimated)" label that the fallback path sets
    gpuVal.classList.add('gpu-real');
  }

  // Also update the HUD pill if visible
  const gpuEl = document.getElementById('gputpill');
  if (gpuEl && gpuEl.style.display !== 'none') {
    gpuEl.textContent = gpuMs.toFixed(1) + ' ms GPU';
  }
}
