import { isTauri, invokeTauri } from './tauri.js';
import { VERT, wrapFrag } from '../gl/renderer.js';

const HEADLESS_VERSION = '1.0.0';

// ── Arg parser ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { _: [] };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i += 2;
      } else {
        args[key] = true;
        i++;
      }
    } else {
      args._.push(a);
      i++;
    }
  }
  return args;
}

// ── Headless offscreen renderer ───────────────────────────────────────────────

async function _makeOffscreenRenderer(w, h) {
  const { default: THREE } = await import('three');
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  return { renderer, canvas, THREE };
}

function _readPixels(renderer, w, h) {
  const gl = renderer.getContext();
  const raw = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const flipped = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const src = (h - 1 - row) * w * 4;
    flipped.set(raw.subarray(src, src + w * 4), row * w * 4);
  }
  return flipped;
}

// ── PNG frame helpers ─────────────────────────────────────────────────────────

async function _frameToBlob(rgba, w, h) {
  const imgData = new ImageData(new Uint8ClampedArray(rgba.buffer), w, h);
  const offCanvas = new OffscreenCanvas(w, h);
  const ctx = offCanvas.getContext('2d');
  ctx.putImageData(imgData, 0, 0);
  return offCanvas.convertToBlob({ type: 'image/png' });
}

async function _blobToArrayBuffer(blob) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = () => rej(new Error('Blob read failed'));
    reader.readAsArrayBuffer(blob);
  });
}

// ── Progress logger ───────────────────────────────────────────────────────────

function _log(msg) {
  if (isTauri()) {
    invokeTauri('headless_log', { msg }).catch(() => {});
  }
  console.info('[z-gl headless]', msg);
}

function _progress(frame, total, label) {
  const pct = Math.round((frame / total) * 100);
  const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
  _log(`${bar} ${pct}% — ${label} (${frame}/${total})`);
}

// ── Shader source loader ──────────────────────────────────────────────────────

async function _loadShaderSource(path) {
  if (isTauri()) {
    const bytes = await invokeTauri('read_file_bytes', { path });
    return new TextDecoder().decode(new Uint8Array(bytes));
  }
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Cannot read shader: ${path} (HTTP ${res.status})`);
  return res.text();
}

// ── Frame writer ──────────────────────────────────────────────────────────────

async function _writeFrame(rgba, w, h, outDir, index, total) {
  const blob = await _frameToBlob(rgba, w, h);
  const ab = await _blobToArrayBuffer(blob);
  const digits = String(total).length;
  const name = `frame_${String(index).padStart(digits, '0')}.png`;
  const destPath = outDir.replace(/\\/g, '/').replace(/\/$/, '') + '/' + name;
  await invokeTauri('write_file_bytes', {
    path: destPath,
    data: Array.from(new Uint8Array(ab)),
  });
  return destPath;
}

// ── Render-frames core ─────────────────────────────────────────────────────────

async function _renderFrames({ fragmentShader, w, h, fps, duration, startTime = 0, onProgress }) {
  const { renderer, THREE } = await _makeOffscreenRenderer(w, h);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader,
    uniforms: {
      iResolution: { value: new THREE.Vector3(w, h, 1) },
      iTime:       { value: startTime },
      iTimeDelta:  { value: 1 / fps },
      iFrame:      { value: 0 },
      iMouse:      { value: new THREE.Vector4(0, 0, 0, 0) },
    },
  });
  const scene = new THREE.Scene();
  const cam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mesh  = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  scene.add(mesh);

  const nFrames = Math.round(duration * fps);
  const dt = 1 / fps;
  const frames = [];

  try {
    for (let f = 0; f < nFrames; f++) {
      mat.uniforms.iTime.value  = startTime + f * dt;
      mat.uniforms.iFrame.value = f;
      renderer.render(scene, cam);
      frames.push(_readPixels(renderer, w, h));
      if (onProgress) onProgress(f, nFrames);
      if (f % 4 === 3) await new Promise(r => setTimeout(r, 0));
    }
  } finally {
    mesh.geometry.dispose();
    mat.dispose();
    renderer.dispose();
  }

  return { frames, w, h, fps, nFrames };
}

// ── MP4 muxer (WebCodecs) ─────────────────────────────────────────────────────

async function _encodeMP4(frames, w, h, fps, bitrate, onProgress) {
  if (!('VideoEncoder' in window)) {
    throw new Error('WebCodecs VideoEncoder unavailable — cannot encode MP4 in this environment');
  }

  const codecStr = 'avc1.42E01E';
  const support = await VideoEncoder.isConfigSupported({ codec: codecStr, width: w, height: h, bitrate, framerate: fps });
  if (!support.supported) throw new Error(`H.264 at ${w}×${h}@${fps}fps not supported by this GPU`);

  const chunks = [];
  let encErr = null;
  const encoder = new VideoEncoder({
    output: chunk => {
      const buf = new Uint8Array(chunk.byteLength);
      chunk.copyTo(buf);
      chunks.push({ buf, type: chunk.type, timestamp: chunk.timestamp, duration: chunk.duration });
    },
    error: e => { encErr = e; },
  });
  encoder.configure({ codec: codecStr, width: w, height: h, bitrate, framerate: fps });

  const frameDurUs = Math.round(1_000_000 / fps);
  const nFrames = frames.length;

  for (let f = 0; f < nFrames; f++) {
    const imgData = new ImageData(new Uint8ClampedArray(frames[f].buffer), w, h);
    const vf = new VideoFrame(imgData, { timestamp: f * frameDurUs, duration: frameDurUs });
    encoder.encode(vf, { keyFrame: f % 30 === 0 });
    vf.close();
    if (onProgress) onProgress(f, nFrames);
    if (f % 8 === 7) await new Promise(r => setTimeout(r, 0));
  }

  await encoder.flush();
  encoder.close();
  if (encErr) throw encErr;

  const total = chunks.reduce((s, c) => s + c.buf.length, 0);
  const combined = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { combined.set(c.buf, off); off += c.buf.length; }
  return combined;
}

// ── headless render --shader ──────────────────────────────────────────────────

async function _cmdRenderShader(opts) {
  const {
    shader,
    duration = 10,
    fps      = 60,
    out      = 'output.mp4',
    width    = 1920,
    height   = 1080,
    bitrate  = 8,
    'start-time': startTime = 0,
  } = opts;

  if (!shader) throw new Error('--shader <path.glsl> is required');

  const w = parseInt(width, 10);
  const h = parseInt(height, 10);
  const dur = parseFloat(duration);
  const fpsN = parseInt(fps, 10);
  const br  = parseFloat(bitrate) * 1_000_000;
  const t0  = parseFloat(startTime);
  const isPNG = out.endsWith('/') || out.endsWith('\\') || !out.includes('.');

  _log(`Loading shader: ${shader}`);
  const glslSrc = await _loadShaderSource(shader);
  const fragmentShader = wrapFrag(glslSrc);

  _log(`Rendering ${dur}s @ ${fpsN}fps (${w}×${h}) from t=${t0}s`);

  const { frames, nFrames } = await _renderFrames({
    fragmentShader, w, h, fps: fpsN, duration: dur, startTime: t0,
    onProgress: (f, total) => {
      if (f % Math.max(1, Math.floor(total / 20)) === 0) _progress(f, total, 'rendering');
    },
  });

  _log('Render complete. Writing output…');

  if (isPNG) {
    const outDir = out;
    await invokeTauri('ensure_dir', { path: outDir });
    for (let i = 0; i < frames.length; i++) {
      await _writeFrame(frames[i], w, h, outDir, i, nFrames);
      if (i % Math.max(1, Math.floor(nFrames / 20)) === 0) _progress(i, nFrames, 'writing PNG');
    }
    _log(`Done — ${nFrames} frames written to ${outDir}`);
  } else {
    _log('Encoding MP4…');
    const encoded = await _encodeMP4(frames, w, h, fpsN, br, (f, total) => {
      if (f % Math.max(1, Math.floor(total / 10)) === 0) _progress(f, total, 'encoding');
    });
    const outPath = out.includes('.') ? out : out + '.mp4';
    await invokeTauri('write_file_bytes', { path: outPath, data: Array.from(encoded) });
    _log(`Done — ${Math.round(encoded.length / 1024)} KB → ${outPath}`);
  }
}

// ── Help text ─────────────────────────────────────────────────────────────────

function _printHelp() {
  const lines = [
    `z-gl headless CLI v${HEADLESS_VERSION}`,
    '',
    'USAGE',
    '  z-gl render --shader <file.glsl>   [options]  --out <output.mp4|frames/>',
    '',
    'OPTIONS (render)',
    '  --shader     <path>     GLSL fragment shader (mainImage convention)',
    '  --out        <path>     Output: .mp4 file or directory/ for PNG sequence',
    '  --duration   <seconds>  Duration (default: 10)',
    '  --fps        <number>   Frames per second (default: 60)',
    '  --width      <pixels>   Width  (default: 1920)',
    '  --height     <pixels>   Height (default: 1080)',
    '  --bitrate    <Mbps>     H.264 bitrate in Mbit/s (default: 8)',
    '  --start-time <seconds>  iTime start value (default: 0)',
    '',
    'EXAMPLES',
    '  z-gl render --shader main.glsl --duration 10 --fps 60 --out output.mp4',
    '',
    'NOTES',
    '  • PNG sequence: --out must end with / or contain no extension',
    '  • Runs without opening the Sliders GL UI window (--headless Tauri flag)',
    '  • All rendering is offline — no network required',
  ];
  lines.forEach(l => _log(l));
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runHeadlessCLI(argv) {
  const args = parseArgs(argv);
  const [command] = args._;

  if (args.version || args.v) {
    _log(`z-gl headless CLI v${HEADLESS_VERSION}`);
    return;
  }

  if (!command || args.help || args.h) {
    _printHelp();
    return;
  }

  try {
    if (command === 'render') {
      if (args.shader) {
        await _cmdRenderShader(args);
      } else {
        _log('render: specify --shader <file.glsl>');
        _printHelp();
      }
    } else {
      _log(`Unknown command: ${command}. Run z-gl --help for usage.`);
    }
  } catch (err) {
    _log(`ERROR: ${err.message}`);
    if (isTauri()) {
      await invokeTauri('headless_exit', { code: 1 }).catch(() => {});
    }
    throw err;
  }

  if (isTauri()) {
    await invokeTauri('headless_exit', { code: 0 }).catch(() => {});
  }
}

export {
  _parseArgs    as parseCliArgs,
  _printHelp    as printHeadlessHelp,
  _renderFrames as headlessRenderFrames,
  _encodeMP4    as headlessEncodeMP4,
  _writeFrame   as headlessWriteFrame,
};

function _parseArgs(a) { return parseArgs(a); }
