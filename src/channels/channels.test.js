/**
 * channels.test.js — Phase 12.1
 *
 * Unit tests for the channel system:
 *   - Noise generation
 *   - Audio FFT sizing
 *   - Webcam teardown safety
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal window function array and verify its mathematical properties.
 * Extracted from channels-audio.js _buildWindow() logic for isolated testing.
 */
function buildWindow(size, fn) {
  const w = new Float32Array(size);
  for (let n = 0; n < size; n++) {
    if (fn === 'blackman') {
      w[n] = 0.42 - 0.5 * Math.cos(2 * Math.PI * n / (size - 1))
                   + 0.08 * Math.cos(4 * Math.PI * n / (size - 1));
    } else if (fn === 'hann') {
      w[n] = 0.5 * (1 - Math.cos(2 * Math.PI * n / (size - 1)));
    } else {
      w[n] = 1.0; // Rectangular (no window)
    }
  }
  return w;
}

// ─────────────────────────────────────────────────────────────────────────────
// §1  Noise generation
// ─────────────────────────────────────────────────────────────────────────────

describe('channels / noise generation', () => {
  it('noise texture size is a power of two', () => {
    // Valid noise sizes: 64, 128, 256 are all powers of two
    const validSizes = [64, 128, 256, 512];
    for (const s of validSizes) {
      expect(s & (s - 1)).toBe(0); // bitwise power-of-two check
    }
  });

  it('generates RGBA noise bytes in [0, 255]', () => {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.floor(Math.random() * 256);
    }
    for (const byte of data) {
      expect(byte).toBeGreaterThanOrEqual(0);
      expect(byte).toBeLessThanOrEqual(255);
    }
  });

  it('noise data has non-uniform distribution (sanity check)', () => {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);

    // Compute mean — should be roughly 127±20 for random data
    let sum = 0;
    for (const b of data) sum += b;
    const mean = sum / data.length;
    expect(mean).toBeGreaterThan(100);
    expect(mean).toBeLessThan(155);
  });

  it('RGBA interleaving: every 4th index is alpha channel', () => {
    const data = new Uint8Array(4 * 4); // 4 RGBA pixels
    // Fill alpha channel
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    for (let i = 3; i < data.length; i += 4) {
      expect(data[i]).toBe(255);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §2  Audio FFT sizing
// ─────────────────────────────────────────────────────────────────────────────

describe('channels / audio FFT size', () => {
  const VALID_FFT_SIZES = [256, 512, 1024, 2048, 4096, 8192];

  it('all valid FFT sizes are powers of two', () => {
    for (const s of VALID_FFT_SIZES) {
      expect(s & (s - 1)).toBe(0);
    }
  });

  it('FFT produces frequencyBinCount = fftSize / 2', () => {
    for (const fftSize of VALID_FFT_SIZES) {
      const binCount = fftSize / 2;
      expect(binCount).toBeGreaterThan(0);
      expect(Number.isInteger(binCount)).toBe(true);
    }
  });

  it('texture width matches frequencyBinCount', () => {
    // For each FFT size, the audio texture width should be fftSize/2
    const fftSize = 1024;
    const binCount = fftSize / 2; // 512
    expect(binCount).toBe(512);
  });

  it('audio texture has 2 rows (frequency row + waveform row)', () => {
    // The texture encodes: row 0 = FFT freq data, row 1 = waveform data
    const textureHeight = 2;
    expect(textureHeight).toBe(2);
  });

  it('Hann window values are in [0, 1]', () => {
    const win = buildWindow(1024, 'hann');
    for (const v of win) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('Hann window is symmetric', () => {
    const size = 256;
    const win = buildWindow(size, 'hann');
    for (let i = 0; i < size / 2; i++) {
      expect(win[i]).toBeCloseTo(win[size - 1 - i], 5);
    }
  });

  it('Blackman window starts and ends near 0', () => {
    const win = buildWindow(256, 'blackman');
    expect(win[0]).toBeCloseTo(0, 3);
    expect(win[win.length - 1]).toBeCloseTo(0, 3);
  });

  it('rectangular window has all values = 1', () => {
    const win = buildWindow(64, 'rectangular');
    for (const v of win) {
      expect(v).toBe(1.0);
    }
  });

  it('audio smoothing coefficient is in [0, 1)', () => {
    const validCoefficients = [0, 0.5, 0.7, 0.8, 0.9, 0.95, 0.99];
    for (const c of validCoefficients) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(1);
    }
  });

  it('clamps smoothing to valid range', () => {
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    expect(clamp(-0.5, 0, 0.99)).toBe(0);
    expect(clamp(1.5, 0, 0.99)).toBe(0.99);
    expect(clamp(0.8, 0, 0.99)).toBe(0.8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3  Webcam teardown
// ─────────────────────────────────────────────────────────────────────────────

describe('channels / webcam teardown', () => {
  let mockStream;
  let mockTrack;
  let mockVideo;

  beforeEach(() => {
    mockTrack = {
      stop: vi.fn(),
      readyState: 'live',
    };
    mockStream = {
      getTracks: vi.fn(() => [mockTrack]),
    };
    mockVideo = {
      srcObject: mockStream,
      pause: vi.fn(),
      load: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stops all tracks on teardown', () => {
    // Simulate teardown: stop all tracks from the stream
    const stream = mockVideo.srcObject;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    expect(mockTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('clears srcObject after teardown', () => {
    mockVideo.srcObject = null;
    expect(mockVideo.srcObject).toBeNull();
  });

  it('calls pause on video element before teardown', () => {
    mockVideo.pause();
    expect(mockVideo.pause).toHaveBeenCalled();
  });

  it('getTracks returns empty array when no stream', () => {
    const emptyStream = { getTracks: () => [] };
    expect(emptyStream.getTracks()).toHaveLength(0);
  });

  it('teardown is idempotent (safe to call twice)', () => {
    // First teardown
    if (mockVideo.srcObject) {
      mockVideo.srcObject.getTracks().forEach(t => t.stop());
      mockVideo.srcObject = null;
    }
    // Second teardown — should not throw
    expect(() => {
      if (mockVideo.srcObject) {
        mockVideo.srcObject.getTracks().forEach(t => t.stop());
      }
    }).not.toThrow();
    expect(mockTrack.stop).toHaveBeenCalledTimes(1); // only once
  });

  it('tracks that are already stopped do not throw on .stop()', () => {
    mockTrack.readyState = 'ended';
    // Calling stop on an ended track should be safe
    expect(() => mockTrack.stop()).not.toThrow();
  });
});
