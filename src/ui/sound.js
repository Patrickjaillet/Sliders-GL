// Sliders GL — subtle UI sound feedback via AudioContext
// Opt-in: stored in localStorage under 'sl_sound'. Off by default.

import { safeLocalGet, safeLocalSet } from '../core/utils.js';

let _ctx = null;
let _enabled = safeLocalGet('sl_sound', '0') === '1';

function _getCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Safari / Chrome require user-gesture resume
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

/**
 * Play a soft, short click.
 * @param {'click'|'confirm'|'error'|'tick'} type
 */
export function playSound(type = 'click') {
  if (!_enabled) return;
  try {
    const ctx = _getCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (type) {
      case 'confirm':
        // Two-note rising chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.setValueAtTime(880, now + 0.06);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
        break;

      case 'error':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.14);
        break;

      case 'tick':
        // Very short high tick (slider drag)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
        osc.start(now);
        osc.stop(now + 0.03);
        break;

      case 'click':
      default:
        // Soft button click: short sine pop
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.06);
        gain.gain.setValueAtTime(0.055, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
        osc.start(now);
        osc.stop(now + 0.07);
        break;
    }
  } catch {
    // AudioContext not supported or blocked — silently ignore
  }
}

export function isSoundEnabled() {
  return _enabled;
}

export function setSoundEnabled(val) {
  _enabled = Boolean(val);
  safeLocalSet('sl_sound', _enabled ? '1' : '0');
}

export function toggleSound() {
  setSoundEnabled(!_enabled);
  return _enabled;
}
