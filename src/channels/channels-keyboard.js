import * as THREE from 'three';
import { state } from '../core/state.js';
import { toast } from '../io/actions.js';
import { updateChannelUniform } from './channels-core.js';

const KB_W = 256;
const KB_H = 2;

const _activeChannels = new Set();

let _data      = null;
let _tex       = null;
let _onKeyDown = null;
let _onKeyUp   = null;

function _ensureGlobalListeners() {
  if (_onKeyDown) return;

  _onKeyDown = e => {
    if (!_data) return;
    const k = e.keyCode;
    if (k < 0 || k >= 256) return;

    const wasDown = _data[k * 4] === 255;

    _data[k * 4]     = 255;
    _data[k * 4 + 1] = 255;
    _data[k * 4 + 2] = 255;
    _data[k * 4 + 3] = 255;

    if (!wasDown) {
      const toggleBase = KB_W * 4 + k * 4;
      const toggled    = _data[toggleBase] === 255 ? 0 : 255;
      _data[toggleBase]     = toggled;
      _data[toggleBase + 1] = toggled;
      _data[toggleBase + 2] = toggled;
      _data[toggleBase + 3] = 255;
    }

    if (_tex) _tex.needsUpdate = true;
  };

  _onKeyUp = e => {
    if (!_data) return;
    const k = e.keyCode;
    if (k < 0 || k >= 256) return;

    _data[k * 4]     = 0;
    _data[k * 4 + 1] = 0;
    _data[k * 4 + 2] = 0;
    _data[k * 4 + 3] = 255;

    if (_tex) _tex.needsUpdate = true;
  };

  document.addEventListener('keydown', _onKeyDown);
  document.addEventListener('keyup',   _onKeyUp);
}

function _removeGlobalListeners() {
  if (_onKeyDown) document.removeEventListener('keydown', _onKeyDown);
  if (_onKeyUp)   document.removeEventListener('keyup',   _onKeyUp);
  _onKeyDown = null;
  _onKeyUp   = null;
}

function _buildTexture() {
  _data = new Uint8Array(KB_W * KB_H * 4);
  for (let i = 3; i < _data.length; i += 4) _data[i] = 255;

  _tex = new THREE.DataTexture(_data, KB_W, KB_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  _tex.magFilter  = THREE.NearestFilter;
  _tex.minFilter  = THREE.NearestFilter;
  _tex.needsUpdate = true;
  return _tex;
}

function _destroyTexture() {
  if (_tex) { _tex.dispose(); _tex = null; }
  _data = null;
}

export function chEnableKeyboard(i) {
  const ch = state.channels[i];

  if (_activeChannels.size === 0) {
    _buildTexture();
    _ensureGlobalListeners();
  }

  _activeChannels.add(i);

  ch.keyboardTex = _tex;
  ch.texture     = _tex;
  ch.status      = 'ok';
  ch.statusMsg   = 'Keyboard active';
  updateChannelUniform(i);
  state.callbacks.renderChannelUI?.(i);
  toast('iChannel' + i + ': keyboard active', 'ok');
}

export function chClearKeyboard(i) {
  _activeChannels.delete(i);

  if (_activeChannels.size === 0) {
    _removeGlobalListeners();
    _destroyTexture();
  }

  const ch = state.channels[i];
  if (ch) ch.keyboardTex = null;
}

state.callbacks.clearKeyboardChannel = chClearKeyboard;
