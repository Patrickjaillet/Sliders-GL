import * as THREE from 'three';
import { state } from '../core/state.js';
import { toast } from '../io/actions.js';
import { chClear, updateChannelUniform } from './channels-core.js';

const FFT_VIZ_INTERVAL_MS = 80;

let _fftVizBg = '#1b1b24';
let _fftVizThemeKey = '';

function _getFFTCanvasBg() {
  const root = document.documentElement;
  const themeKey = root.className || '';
  if (_fftVizThemeKey !== themeKey) {
    _fftVizThemeKey = themeKey;
    _fftVizBg = getComputedStyle(root).getPropertyValue('--bg4').trim() || '#1b1b24';
  }
  return _fftVizBg;
}

function _getFFTCanvasRefs(ch) {
  if (!ch.fftCanvas || !ch.fftCtx || !document.contains(ch.fftCanvas)) {
    ch.fftCanvas = document.getElementById('fft-viz-' + ch.i);
    ch.fftCtx = ch.fftCanvas ? ch.fftCanvas.getContext('2d') : null;
  }
  if (!ch.fftCanvas || !ch.fftCtx) return null;
  return { canvas: ch.fftCanvas, ctx2d: ch.fftCtx };
}

function _buildWindow(size, fn) {
  const w = new Float32Array(size);
  for (let n = 0; n < size; n++) {
    if (fn === 'blackman') {
      w[n] = 0.42 - 0.5 * Math.cos(2 * Math.PI * n / (size - 1))
                   + 0.08 * Math.cos(4 * Math.PI * n / (size - 1));
    } else if (fn === 'hann') {
      w[n] = 0.5 * (1 - Math.cos(2 * Math.PI * n / (size - 1)));
    } else {
      w[n] = 1.0;
    }
  }
  return w;
}

function _rebuildAudioTex(ch) {
  if (ch.audioDataTex) { ch.audioDataTex.dispose(); ch.audioDataTex = null; }
  const bufLen = ch.analyser.frequencyBinCount;
  ch.audioRawFreq   = new Uint8Array(bufLen);
  ch.audioRawWave   = new Uint8Array(bufLen);
  ch.audioFreq      = new Uint8Array(bufLen);
  ch.audioWave      = new Uint8Array(bufLen);
  ch.audioWindowBuf = _buildWindow(bufLen, ch.audioWindowFn || 'hann');
  const data = new Uint8Array(bufLen * 2 * 4);
  const tex = new THREE.DataTexture(data, bufLen, 2, THREE.RGBAFormat);
  tex.magFilter  = THREE.LinearFilter;
  tex.minFilter  = THREE.LinearFilter;
  tex.needsUpdate = true;
  ch.audioDataTex = tex;
  ch.texture = tex;
  updateChannelUniform(ch.i);
}

export function chSetupAudio(i, audioCtx, sourceNode) {
  const ch = state.channels[i];
  ch.audioCtx = audioCtx;

  const gainNode = audioCtx.createGain();
  gainNode.gain.value = ch.audioGain ?? 1.0;
  ch.gainNode = gainNode;

  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = ch.audioFftSize || 1024;
  analyser.smoothingTimeConstant = ch.audioSmoothing ?? 0.8;
  sourceNode.connect(gainNode);
  gainNode.connect(analyser);
  ch.analyser     = analyser;
  ch.audioSrcNode = sourceNode;

  _rebuildAudioTex(ch);

  ch.status    = 'ok';
  ch.statusMsg = 'Active';
  state.callbacks.renderChannelUI?.(i);
}

export function chSetFftSize(i, size) {
  const ch = state.channels[i];
  ch.audioFftSize = size;
  if (!ch.analyser) return;
  ch.analyser.fftSize = size;
  _rebuildAudioTex(ch);
  state.callbacks.renderChannelUI?.(i);
}

export function chSetWindowFn(i, fn) {
  const ch = state.channels[i];
  ch.audioWindowFn = fn;
  if (!ch.analyser) return;
  const bufLen = ch.analyser.frequencyBinCount;
  ch.audioWindowBuf = _buildWindow(bufLen, fn);
}

export function chSetAudioMode(i, mode) {
  const ch = state.channels[i];
  ch.audioMode = mode;
  state.callbacks.renderChannelUI?.(i);
}

export function chStartMic(i) {
  chClear(i, false);
  state.channels[i].type = 'audio-mic';
  navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    .then(stream => {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(stream);
      state.channels[i].micStream = stream;
      chSetupAudio(i, audioCtx, src);
      toast(`iChannel${i}: mic active`, 'ok');
    })
    .catch(err => {
      state.channels[i].status    = 'err';
      state.channels[i].statusMsg = 'Mic denied: ' + err.message;
      state.callbacks.renderChannelUI?.(i);
      toast('Mic access denied', 'err');
    });
}

export function chLoadAudioFile(i, input) {
  const file = input.files[0];
  if (!file) return;
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (state.channels[i].audioBlobUrl) {
    try { URL.revokeObjectURL(state.channels[i].audioBlobUrl); } catch(e){}
    state.channels[i].audioBlobUrl = null;
  }
  const url = URL.createObjectURL(file);
  state.channels[i].audioBlobUrl = url;
  const audioEl = new Audio(url);
  audioEl.loop = true;
  audioEl.crossOrigin = 'anonymous';
  const src = audioCtx.createMediaElementSource(audioEl);
  src.connect(audioCtx.destination);
  chSetupAudio(i, audioCtx, src);
  audioEl.play();
  state.channels[i].statusMsg = file.name.length > 28 ? file.name.slice(-25) + '\u2026' : file.name;
  input.value = '';
  state.callbacks.renderChannelUI?.(i);
  toast(`iChannel${i}: audio playing`, 'ok');
}

export function updateAudioTextures() {
  const now = performance.now();
  state.channels.forEach(ch => {
    if (!ch.analyser || !ch.audioDataTex) return;
    const bufLen = ch.analyser.frequencyBinCount;
    if (!ch.audioRawFreq || ch.audioRawFreq.length !== bufLen) {
      _rebuildAudioTex(ch);
    }

    const bLow    = Math.max(0, Math.min(ch.audioBandLow  ?? 0,   0.99));
    const bHigh   = Math.max(0, Math.min(ch.audioBandHigh ?? 1.0, 1.0));
    const srcStart = Math.floor(bLow  * bufLen);
    const srcEnd   = Math.floor(bHigh * bufLen);
    const srcLen   = Math.max(1, srcEnd - srcStart);

    const rawFreq = ch.audioRawFreq;
    const rawWave = ch.audioRawWave;
    ch.analyser.getByteFrequencyData(rawFreq);
    ch.analyser.getByteTimeDomainData(rawWave);

    const win  = ch.audioWindowBuf;
    const freq = ch.audioFreq;
    const wave = ch.audioWave;
    for (let j = 0; j < bufLen; j++) {
      const src = Math.floor(srcStart + (j / bufLen) * srcLen);
      const wv  = win ? win[j] : 1.0;
      freq[j] = Math.min(255, Math.round(rawFreq[src] * wv));
      const raw128 = rawWave[src] - 128;
      wave[j] = Math.min(255, Math.max(0, Math.round(raw128 * wv) + 128));
    }

    const data      = ch.audioDataTex.image.data;
    const mode      = ch.audioMode || 'fft';
    const primary   = mode === 'wave' ? wave : freq;
    const secondary = mode === 'wave' ? freq : wave;

    for (let j = 0; j < bufLen; j++) {
      const v = primary[j];
      data[j * 4]     = v;
      data[j * 4 + 1] = v;
      data[j * 4 + 2] = v;
      data[j * 4 + 3] = 255;
    }
    for (let j = 0; j < bufLen; j++) {
      const off = (bufLen + j) * 4;
      const v = secondary[j];
      data[off]     = v;
      data[off + 1] = v;
      data[off + 2] = v;
      data[off + 3] = 255;
    }
    ch.audioDataTex.needsUpdate = true;

    if (now - ch.audioVizLastDraw < FFT_VIZ_INTERVAL_MS) return;
    const refs = _getFFTCanvasRefs(ch);
    if (!refs) return;

    ch.audioVizLastDraw = now;
    const { canvas, ctx2d } = refs;
    const W = canvas.width;
    const H = canvas.height;
    ctx2d.clearRect(0, 0, W, H);
    ctx2d.fillStyle = _getFFTCanvasBg();
    ctx2d.fillRect(0, 0, W, H);

    if (mode === 'wave') {
      ctx2d.strokeStyle = 'hsl(200,80%,55%)';
      ctx2d.lineWidth = 1.5;
      ctx2d.beginPath();
      for (let j = 0; j < bufLen; j++) {
        const x = (j / bufLen) * W;
        const y = H - (wave[j] / 255) * H;
        if (j === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      }
      ctx2d.stroke();
    } else {
      const barW = W / bufLen;
      for (let j = 0; j < bufLen; j++) {
        const h = (freq[j] / 255) * H;
        const hue = Math.round(j / bufLen * 280);
        ctx2d.fillStyle = `hsl(${hue},80%,55%)`;
        ctx2d.fillRect(j * barW, H - h, Math.max(1, barW - 0.5), h);
      }
    }
  });
}

state.callbacks.updateAudioTextures = updateAudioTextures;
