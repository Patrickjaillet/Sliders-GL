import * as THREE from 'three';
import { state } from '../core/state.js';

let _sharedDummyTexture = null;

function getSharedDummyTexture() {
  if (_sharedDummyTexture) return _sharedDummyTexture;
  const data = new Uint8Array([0, 0, 0, 255]);
  _sharedDummyTexture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  _sharedDummyTexture.needsUpdate = true;
  return _sharedDummyTexture;
}

export function applyWrap(ch) {
  if (!ch.texture) return;
  const tex = ch.texture;
  const wrapMap = {
    repeat: THREE.RepeatWrapping,
    clamp: THREE.ClampToEdgeWrapping,
    mirror: THREE.MirroredRepeatWrapping,
  };
  const w = wrapMap[ch.wrap] || THREE.RepeatWrapping;
  tex.wrapS = w; tex.wrapT = w;
  tex.needsUpdate = true;
}

export function chSetWrap(i, wrap) {
  state.channels[i].wrap = wrap;
  applyWrap(state.channels[i]);
  updateChannelUniform(i);
}

export function chSetFlipY(i, val) {
  state.channels[i].flipY = val;
  if (state.channels[i].videoTexture) {
    state.channels[i].videoTexture.flipY = val;
    state.channels[i].videoTexture.needsUpdate = true;
  }
}

export function chSetSmoothing(i, v) {
  state.channels[i].audioSmoothing = v;
  if (state.channels[i].analyser) state.channels[i].analyser.smoothingTimeConstant = v;
}

export function chSetGain(i, v) {
  state.channels[i].audioGain = v;
  if (state.channels[i].gainNode) state.channels[i].gainNode.gain.value = v;
}

export function chSetBand(i, low, high) {
  if (low  !== null) state.channels[i].audioBandLow  = Math.min(low,  state.channels[i].audioBandHigh - 0.01);
  if (high !== null) state.channels[i].audioBandHigh = Math.max(high, state.channels[i].audioBandLow  + 0.01);
}

export function updateChannelUniform(i) {
  if (!state.mat3) return;
  const ch = state.channels[i];
  const key = 'iChannel' + i;
  if (state.mat3.uniforms[key]) {
    state.mat3.uniforms[key].value = ch.texture || getSharedDummyTexture();
  }
}

export function chClear(i, rerender = true) {
  const ch = state.channels[i];
  if (ch.gainNode) { try { ch.gainNode.disconnect(); } catch(e){} ch.gainNode = null; }
  if (ch.audioSrcNode) { try { ch.audioSrcNode.disconnect(); } catch(e){} ch.audioSrcNode = null; }
  if (ch.audioCtx) { try { ch.audioCtx.close(); } catch(e){} ch.audioCtx = null; }
  if (ch.micStream) {
    try { ch.micStream.getTracks().forEach(t => t.stop()); } catch(e){}
    ch.micStream = null;
  }
  if (ch.audioBlobUrl) {
    try { URL.revokeObjectURL(ch.audioBlobUrl); } catch(e){}
    ch.audioBlobUrl = null;
  }
  ch.audioRawFreq = null;
  ch.audioRawWave = null;
  ch.audioFreq = null;
  ch.audioWave = null;
  ch.fftCanvas = null;
  ch.fftCtx = null;
  ch.audioVizLastDraw = 0;
  ch.analyser = null;
  if (ch.videoEl) {
    ch.videoEl.pause();
    if (ch.videoEl.srcObject) ch.videoEl.srcObject.getTracks().forEach(t => t.stop());
    ch.videoEl.src = '';
    ch.videoEl = null;
  }
  if (ch.videoTexture) { ch.videoTexture.dispose(); ch.videoTexture = null; }
  if (ch.cubeTexture) { ch.cubeTexture.dispose(); ch.cubeTexture = null; }
  if (ch.prevFrameRT) { ch.prevFrameRT.dispose(); ch.prevFrameRT = null; }
  if (ch.keyboardTex) {
    state.callbacks.clearKeyboardChannel?.(i);
    ch.keyboardTex = null;
    ch.texture = null;
  }
  if (ch.texture) { ch.texture.dispose(); ch.texture = null; }
  if (ch.audioDataTex) { ch.audioDataTex.dispose(); ch.audioDataTex = null; }
  if (Array.isArray(ch.cubeFaces)) {
    ch.cubeFaces.forEach(u => {
      if (typeof u === 'string' && u.startsWith('blob:')) {
        try { URL.revokeObjectURL(u); } catch (e) { }
      }
    });
  }
  ch.cubeFaces = null;
  ch.type = 'none';
  ch.status = '';
  ch.statusMsg = '';
  ch.flipY = false;
  ch.procTexType   = null;
  ch.procTexParams = null;
  updateChannelUniform(i);
  if (rerender) state.callbacks.renderChannelUI?.(i);
}

export function chChangeType(i, type) {
  chClear(i, false);
  state.channels[i].type = type;
  state.channels[i].statusMsg = '';
  state.channels[i].status = '';
  state.callbacks.renderChannelUI?.(i);
}
