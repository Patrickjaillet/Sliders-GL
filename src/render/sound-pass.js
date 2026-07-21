import { state } from '../core/state.js';
import { toast } from '../io/actions.js';

const SOUND_SAMPLE_RATE  = 44100;
const SOUND_BLOCK_FRAMES = 4096;
const SOUND_WORKLET_NAME = 'zgl-sound-processor';

let _audioCtx     = null;
let _workletNode  = null;
let _offscreenCtx = null;
let _offscreenCanvas = null;
let _program      = null;
let _gl           = null;
let _vao          = null;
let _texOut       = null;
let _fb           = null;
let _pixels       = null;
let _soundTime    = 0;
let _running      = false;
let _pendingCode  = null;
let _building     = false;

const WORKLET_SOURCE = `
class ZGLSoundProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(0);
    this._pos = 0;
    this.port.onmessage = (e) => {
      if (e.data.type === 'buffer') {
        this._buf = e.data.data;
        this._pos = 0;
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      out[i] = this._pos < this._buf.length ? this._buf[this._pos++] : 0;
    }
    return true;
  }
}
registerProcessor('${SOUND_WORKLET_NAME}', ZGLSoundProcessor);
`;

function _buildWorkletUrl() {
  const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

function _wrapSoundFrag(userCode) {
  return `precision highp float;
uniform float iSampleRate;
uniform float iTime;
uniform int   iFrame;
#line 1
${userCode}
void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 s = mainSound(iTime + fragCoord.x / iSampleRate + (fragCoord.y * float(${SOUND_BLOCK_FRAMES})) / iSampleRate);
  gl_FragColor = vec4(s.x, s.y, 0.0, 1.0);
}`;
}

function _initGL() {
  _offscreenCanvas = new OffscreenCanvas(SOUND_BLOCK_FRAMES, 1);
  _gl = _offscreenCanvas.getContext('webgl');
  if (!_gl) return false;

  const gl = _gl;

  const vert = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vert, `attribute vec2 p; void main(){ gl_Position=vec4(p,0,1); }`);
  gl.compileShader(vert);

  _texOut = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, _texOut);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SOUND_BLOCK_FRAMES, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  _fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, _fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, _texOut, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);

  _pixels = new Uint8Array(SOUND_BLOCK_FRAMES * 4);

  return true;
}

function _buildProgram(userCode) {
  const gl = _gl;
  if (!gl) return false;

  if (_program) {
    gl.deleteProgram(_program);
    _program = null;
  }

  const fragSrc = _wrapSoundFrag(userCode);
  const vert = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vert, `attribute vec2 p; void main(){ gl_Position=vec4(p,0,1); }`);
  gl.compileShader(vert);

  const frag = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(frag, fragSrc);
  gl.compileShader(frag);

  if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(frag);
    toast('Sound shader error: ' + log.split('\n')[0], 'err');
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return false;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  gl.deleteShader(vert);
  gl.deleteShader(frag);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    toast('Sound shader link error', 'err');
    gl.deleteProgram(prog);
    return false;
  }

  _program = prog;
  return true;
}

function _renderBlock() {
  const gl = _gl;
  if (!gl || !_program) return null;

  gl.useProgram(_program);
  gl.viewport(0, 0, SOUND_BLOCK_FRAMES, 1);
  gl.bindFramebuffer(gl.FRAMEBUFFER, _fb);

  const loc = gl.getAttribLocation(_program, 'p');
  const buf = gl.getParameter(gl.ARRAY_BUFFER_BINDING) || (() => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    return b;
  })();
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(_program, 'iTime');
  const uSR   = gl.getUniformLocation(_program, 'iSampleRate');
  const uFr   = gl.getUniformLocation(_program, 'iFrame');
  if (uTime) gl.uniform1f(uTime, _soundTime);
  if (uSR)   gl.uniform1f(uSR, SOUND_SAMPLE_RATE);
  if (uFr)   gl.uniform1i(uFr, state.fidx);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.readPixels(0, 0, SOUND_BLOCK_FRAMES, 1, gl.RGBA, gl.UNSIGNED_BYTE, _pixels);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const floats = new Float32Array(SOUND_BLOCK_FRAMES * 2);
  for (let i = 0; i < SOUND_BLOCK_FRAMES; i++) {
    floats[i * 2]     = (_pixels[i * 4]     / 127.5) - 1.0;
    floats[i * 2 + 1] = (_pixels[i * 4 + 1] / 127.5) - 1.0;
  }

  _soundTime += SOUND_BLOCK_FRAMES / SOUND_SAMPLE_RATE;
  return floats;
}

async function soundEnable(userCode) {
  if (_running) {
    soundDisable();
  }

  const glOk = _initGL();
  if (!glOk) {
    toast('Sound pass: WebGL offscreen not available', 'err');
    return false;
  }

  const codeOk = _buildProgram(userCode || state.mp.passes.sound.code);
  if (!codeOk) return false;

  try {
    _audioCtx = new AudioContext({ sampleRate: SOUND_SAMPLE_RATE });
    const workletUrl = _buildWorkletUrl();
    await _audioCtx.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);

    _workletNode = new AudioWorkletNode(_audioCtx, SOUND_WORKLET_NAME, {
      outputChannelCount: [2],
    });
    _workletNode.connect(_audioCtx.destination);

    _running = true;
    state.mp.passes.sound.running = true;

    _schedulePump();
    toast('Sound pass active', 'ok');
    return true;
  } catch (err) {
    toast('Sound pass init failed: ' + err.message, 'err');
    soundDisable();
    return false;
  }
}

let _pumpTimer = null;

function _schedulePump() {
  if (!_running) return;
  const block = _renderBlock();
  if (block && _workletNode) {
    _workletNode.port.postMessage({ type: 'buffer', data: block });
  }
  const blockMs = (SOUND_BLOCK_FRAMES / SOUND_SAMPLE_RATE) * 1000 * 0.8;
  _pumpTimer = setTimeout(_schedulePump, blockMs);
}

function soundDisable() {
  _running = false;
  state.mp.passes.sound.running = false;
  if (_pumpTimer !== null) { clearTimeout(_pumpTimer); _pumpTimer = null; }
  if (_workletNode) { try { _workletNode.disconnect(); } catch(_) {} _workletNode = null; }
  if (_audioCtx)    { try { _audioCtx.close(); } catch(_) {} _audioCtx = null; }
  if (_program && _gl) { _gl.deleteProgram(_program); _program = null; }
}

function soundRebuild(code) {
  if (!_running) return;
  if (_building) { _pendingCode = code; return; }
  _building = true;
  const ok = _buildProgram(code);
  _building = false;
  if (_pendingCode !== null) {
    const next = _pendingCode;
    _pendingCode = null;
    soundRebuild(next);
  }
  if (ok) {
    _soundTime = 0;
    toast('Sound shader rebuilt', 'ok');
  }
}

function soundIsRunning() {
  return _running;
}

export { soundEnable, soundDisable, soundRebuild, soundIsRunning };
