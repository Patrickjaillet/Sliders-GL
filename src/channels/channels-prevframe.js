import * as THREE from 'three';
import { state } from '../core/state.js';
import { toast } from '../io/actions.js';
import { updateChannelUniform } from './channels-core.js';

const _prevFrameRTs = new Map();

export function chEnablePrevFrame(i) {
  const ch = state.channels[i];
  const canvas = state.renderer3?.domElement;
  if (!canvas) {
    ch.status    = 'err';
    ch.statusMsg = 'Renderer not ready';
    state.callbacks.renderChannelUI?.(i);
    toast('iChannel' + i + ': renderer not ready', 'err');
    return;
  }

  const existing = _prevFrameRTs.get(i);
  if (existing) {
    existing.dispose();
    _prevFrameRTs.delete(i);
  }

  const w  = canvas.width;
  const h  = canvas.height;
  const rt = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
  });

  _prevFrameRTs.set(i, rt);
  ch.prevFrameRT   = rt;
  ch.texture       = rt.texture;
  ch.status        = 'ok';
  ch.statusMsg     = 'Previous frame active';
  updateChannelUniform(i);
  state.callbacks.renderChannelUI?.(i);
  toast('iChannel' + i + ': previous frame active', 'ok');

  // F-9.3 — warn if shader doesn't sample iChannel[i]
  const code = state.editor?.getValue() ?? '';
  const channelRE = new RegExp(`iChannel${i}[^0-9]|texture\\s*\\(\\s*iChannel${i}`);
  if (!channelRE.test(code)) {
    toast(`⚠ Shader n'utilise pas encore iChannel${i} — ajoutez texture(iChannel${i}, uv)`, 'warn');
  }
}

export function capturePrevFrameChannels() {
  if (!state.renderer3) return;
  const canvas = state.renderer3.domElement;
  const w = canvas.width;
  const h = canvas.height;

  for (const [i, rt] of _prevFrameRTs) {
    const ch = state.channels[i];
    if (!ch || ch.type !== 'prev-frame') {
      _prevFrameRTs.delete(i);
      continue;
    }

    if (rt.width !== w || rt.height !== h) {
      rt.setSize(w, h);
    }

    state.renderer3.copyFramebufferToTexture(rt.texture, new THREE.Vector2(0, 0));
  }
}
