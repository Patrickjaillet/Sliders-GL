// Export — screenshot, video, GLSL/HTML/Three snippet

import * as THREE from 'three';
import JSZip from 'jszip';
import { state } from '../core/state.js';
import { VERT } from '../gl/renderer.js';
import { toast, openModalDialog, closeModalDialog } from '../io/actions.js';

// ── Export modal ──
function openExportModal() {
  openModalDialog('exportModal', '.export-tab.active');
}
function closeExportModal() {
  closeModalDialog('exportModal');
}
function switchExportTab(tab, e) {
  document.querySelectorAll('.export-tab').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.export-pane').forEach(p => p.classList.remove('active'));
  e.target.classList.add('active');
  e.target.setAttribute('aria-selected', 'true');
  document.getElementById('exp-' + tab).classList.add('active');
  // Populate batch list when switching to batch tab (replaces former onclick inline)
  if (tab === 'batch') populateBatchPresetList();
}

// ─────────────────────────────────────────
// 4.1 SCREENSHOT (offscreen render)
// ─────────────────────────────────────────
function exportScreenshot() {
  const resVal = document.getElementById('exp-res').value;
  const alpha = document.getElementById('exp-alpha').checked;
  const btn = document.getElementById('exp-ss-btn');

  let w, h;
  if (resVal === 'viewport') {
    const cw = document.getElementById('cwrap');
    w = cw.clientWidth; h = cw.clientHeight;
  } else {
    [w, h] = resVal.split('x').map(Number);
  }

  btn.disabled = true;
  btn.textContent = '⌛ Rendering…';

  // Small timeout to let the UI update before the blocking render
  setTimeout(() => {
    let offRenderer = null;
    let offMat = null;
    let offMesh = null;
    let done = false;

    const finish = (msg, type) => {
      if (done) return;
      done = true;
      try { if (offMesh?.geometry) offMesh.geometry.dispose(); } catch(e){}
      try { if (offMat) offMat.dispose(); } catch(e){}
      try { if (offRenderer) offRenderer.dispose(); } catch(e){}
      btn.disabled = false;
      btn.textContent = '↓ Download PNG';
      if (msg) toast(msg, type || '');
    };

    try {
      // Create an offscreen canvas + renderer
      const offCanvas = document.createElement('canvas');
      offCanvas.width = w; offCanvas.height = h;
      offRenderer = new THREE.WebGLRenderer({
        canvas: offCanvas,
        antialias: true,
        alpha: alpha,
        preserveDrawingBuffer: true
      });
      offRenderer.setPixelRatio(1);
      offRenderer.setSize(w, h, false);

      // Clone material with current uniforms
      offMat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: state.mat3.fragmentShader,
        uniforms: Object.assign({}, state.mat3.uniforms, {
          iResolution: { value: new THREE.Vector3(w, h, 1) },
          iTime: { value: state.mat3.uniforms.iTime.value },
          iTimeDelta: { value: state.mat3.uniforms.iTimeDelta.value },
          iFrame: { value: state.mat3.uniforms.iFrame.value },
          iMouse: { value: state.mat3.uniforms.iMouse.value },
        }),
        transparent: alpha,
      });
      const offScene = new THREE.Scene();
      const offCam = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
      offMesh = new THREE.Mesh(new THREE.PlaneGeometry(2,2), offMat);
      offScene.add(offMesh);

      offRenderer.render(offScene, offCam);

      offCanvas.toBlob(blob => {
        if (!blob) {
          finish('Screenshot failed: empty image buffer', 'err');
          return;
        }
        const a = document.createElement('a');
        const blobUrl = URL.createObjectURL(blob);
        a.href = blobUrl;
        const ts = new Date().toISOString().slice(0,19).replace(/[T:]/g,'-');
        a.download = `z-gl-${w}x${h}-${ts}.png`;
        a.click();
        URL.revokeObjectURL(blobUrl);
        finish(`Screenshot ${w}×${h} saved`, 'ok');
      }, 'image/png');
    } catch(e) {
      finish('Screenshot failed: ' + e.message, 'err');
    }
  }, 50);
}

// ─────────────────────────────────────────
// 4.2 VIDEO RECORD (MediaRecorder)
// ─────────────────────────────────────────
let _mediaRecorder = null;
let _recordChunks = [];
let _recordTimer = null;
let _recordStart = 0;
let _recordDuration = 10;

function toggleVideoRecord() {
  if (_mediaRecorder && _mediaRecorder.state === 'recording') {
    stopVideoRecord();
  } else {
    startVideoRecord();
  }
}

function startVideoRecord() {
  const dur = parseInt(document.getElementById('exp-dur').value, 10);
  const fps = parseInt(document.getElementById('exp-fps').value, 10);
  const tstart = document.getElementById('exp-tstart').value;
  _recordDuration = dur;

  const canvas = document.getElementById('glc');
  let stream;
  try {
    stream = canvas.captureStream(fps);
  } catch(e) {
    toast('captureStream not supported', 'err'); return;
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '';
  if (!mimeType) { toast('MediaRecorder not supported', 'err'); return; }

  if (tstart === '0') state.simTime = 0;

  _recordChunks = [];
  _mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  _mediaRecorder.ondataavailable = e => { if (e.data.size > 0) _recordChunks.push(e.data); };
  _mediaRecorder.onstop = finalizeVideoExport;
  _mediaRecorder.start(200);
  _recordStart = performance.now();

  const btn = document.getElementById('exp-rec-btn');
  btn.textContent = '⏹ Stop Recording';
  btn.classList.add('recording');
  document.getElementById('exp-vprog-wrap').style.display = 'block';

  _recordTimer = setInterval(() => {
    const elapsed = (performance.now() - _recordStart) / 1000;
    const pct = Math.min(100, (elapsed / _recordDuration) * 100);
    document.getElementById('exp-vprog').style.width = pct + '%';
    if (elapsed >= _recordDuration) stopVideoRecord();
  }, 100);

  toast(`Recording ${dur}s @ ${fps}fps…`, 'warn');
}

function stopVideoRecord() {
  if (!_mediaRecorder) return;
  clearInterval(_recordTimer);
  _mediaRecorder.stop();
  _mediaRecorder = null;
  const btn = document.getElementById('exp-rec-btn');
  btn.textContent = '⏺ Start Recording';
  btn.classList.remove('recording');
}

function finalizeVideoExport() {
  const blob = new Blob(_recordChunks, { type: 'video/webm' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const ts = new Date().toISOString().slice(0,19).replace(/[T:]/g,'-');
  a.download = `z-gl-${_recordDuration}s-${ts}.webm`;
  a.click();
  URL.revokeObjectURL(a.href);
  document.getElementById('exp-vprog').style.width = '0%';
  document.getElementById('exp-vprog-wrap').style.display = 'none';
  _recordChunks = [];
  toast('Video exported', 'ok');
}

// ─────────────────────────────────────────
// ─────────────────────────────────────────
// 4.4 CODE EXPORT
// ─────────────────────────────────────────
function exportPureGLSL() {
  const code = state.editor ? state.editor.getValue() : '';
  const blob = new Blob([code], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'shader.glsl';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('GLSL exported', 'ok');
}

function _minifyGLSL(src) {
  let s = src;

  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.replace(/\/\/[^\n]*/g, '');

  s = s.replace(/[ \t]*\n[ \t]*/g, '\n');
  s = s.replace(/\n{2,}/g, '\n');

  const AROUND = /([{}();,=<>!&|+\-*\/^~?:%])/g;
  s = s.replace(AROUND, ' $1 ');
  s = s.replace(/#\s*(version|define|ifdef|ifndef|endif|else|if|undef|pragma|extension|line)\b/g,
    (_, kw) => '\n#' + kw);

  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/ *\n */g, '\n');
  s = s.replace(/\n([{}();,])/g, '$1');
  s = s.replace(/([{}();,])\n/g, '$1');
  s = s.replace(/\n{2,}/g, '\n');

  return s.trim();
}

function exportMinifiedGLSL() {
  const code = state.editor ? state.editor.getValue() : '';
  const minified = _minifyGLSL(code);
  const blob = new Blob([minified], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'shader.min.glsl';
  a.click();
  URL.revokeObjectURL(a.href);
  const ratio = code.length ? Math.round((1 - minified.length / code.length) * 100) : 0;
  toast(`Minified GLSL exported (${ratio}% smaller)`, 'ok');
}

function exportThreeSnippet() {
  const code = state.editor ? state.editor.getValue() : '';
  const snippet = `// Three.js ShaderMaterial snippet — generated by Sliders GL
import * as THREE from 'three';

const VERT = \`void main() { gl_Position = vec4(position, 1.0); }\`;

const FRAG = \`
precision highp float;
uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
// iChannel0–3: add sampler2D uniforms as needed

${code}

void main() {
  vec4 o = vec4(0.0);
  mainImage(o, gl_FragCoord.xy);
  gl_FragColor = clamp(o, 0.0, 1.0);
}
\`;

const material = new THREE.ShaderMaterial({
  vertexShader: VERT,
  fragmentShader: FRAG,
  uniforms: {
    iResolution: { value: new THREE.Vector3(window.innerWidth, window.innerHeight, 1) },
    iTime:       { value: 0 },
    iTimeDelta:  { value: 0.016 },
    iFrame:      { value: 0 },
    iMouse:      { value: new THREE.Vector4() },
  },
});

// In your render loop:
// material.uniforms.iTime.value += delta;
// material.uniforms.iFrame.value++;
`;
  const blob = new Blob([snippet], { type: 'text/javascript' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'shader-threejs.js';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Three.js snippet exported', 'ok');
}

function exportStandaloneHTML() {
  const code = state.editor ? state.editor.getValue() : '';
  // Build the standalone fragment shader source
  const fragSrc = `precision highp float;
uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;

${code}

void main() {
  vec4 o = vec4(0.0);
  mainImage(o, gl_FragCoord.xy);
  gl_FragColor = clamp(o, 0.0, 1.0);
}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sliders GL Export</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#000}
canvas{width:100%;height:100%;display:block}
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();

const VS = 'void main(){gl_Position=vec4(position,1.0);}';
const VERT_SRC = 'attribute vec2 position; void main(){gl_Position=vec4(position,1.0);}';
const FRAG_SRC = ${JSON.stringify(fragSrc)};

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
  return s;
}

const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT_SRC));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
gl.linkProgram(prog);
gl.useProgram(prog);

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(prog, 'position');
gl.enableVertexAttribArray(loc);
gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

const uRes   = gl.getUniformLocation(prog, 'iResolution');
const uTime  = gl.getUniformLocation(prog, 'iTime');
const uDelta = gl.getUniformLocation(prog, 'iTimeDelta');
const uFrame = gl.getUniformLocation(prog, 'iFrame');
const uMouse = gl.getUniformLocation(prog, 'iMouse');

let t = 0, frame = 0, last = performance.now();
const mouse = [0,0,0,0];
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse[0] = e.clientX - r.left; mouse[1] = r.height - (e.clientY - r.top);
  mouse[2] = e.buttons > 0 ? 1 : 0;
});

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.1); last = now; t += dt;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform3f(uRes, canvas.width, canvas.height, 1.0);
  gl.uniform1f(uTime, t);
  gl.uniform1f(uDelta, dt);
  gl.uniform1i(uFrame, frame++);
  gl.uniform4fv(uMouse, mouse);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
requestAnimationFrame(loop);
${'</'}script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'shader-standalone.html';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Standalone HTML exported', 'ok');
}

async function exportProjectZip() {
  const code = (state.editor && typeof state.editor.getValue === 'function') ? state.editor.getValue() : '';
  const zip = new JSZip();
  zip.file('shader.glsl', code || '');

  const vars = Array.isArray(state.vars) ? state.vars.map(v => ({ label: v.label, value: v.value })) : [];
  const project = {
    version: 1,
    name: state.currentPreset || 'project',
    exportedAt: new Date().toISOString(),
    timeScale: Number.isFinite(state.timeScale) ? state.timeScale : 1,
    vars,
  };
  zip.file('project.json', JSON.stringify(project, null, 2));

  // Offline-first: bundle our own local Three.js build (public/three.global.js,
  // already shipped with the app) into the zip instead of fetching a CDN copy
  // at export time or requiring internet access when the recipient opens the
  // standalone HTML. Same-origin fetch only — no external network call.
  let threeGlobalSrc = '';
  try {
    const res = await fetch(new URL('three.global.js', document.baseURI));
    if (res.ok) threeGlobalSrc = await res.text();
  } catch { /* best-effort; standalone.html will simply fail to render if missing */ }
  zip.file('three.global.js', threeGlobalSrc);

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Shader Export</title>
  <style>
    html, body, canvas { margin:0; width:100%; height:100%; background:#000; display:block; overflow:hidden; }
  </style>
</head>
<body>
<canvas id="c"></canvas>
<script src="three.global.js"></script>
<script>
const THREE = window.THREE;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const uniforms = {
  iResolution: { value: new THREE.Vector3() },
  iTime: { value: 0 },
  iTimeDelta: { value: 0 },
  iFrame: { value: 0 },
  iMouse: { value: new THREE.Vector4() },
};
const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: 'void main(){ gl_Position = vec4(position,1.0); }',
  fragmentShader: \`precision highp float;\nuniform vec3 iResolution;\nuniform float iTime;\nuniform float iTimeDelta;\nuniform int iFrame;\nuniform vec4 iMouse;\n${(code || '').replace(/`/g, '\\`')}\nvoid main(){ vec4 c=vec4(0.0); mainImage(c,gl_FragCoord.xy); gl_FragColor=c; }\`,
});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), material));
let t0 = performance.now();
function resize(){
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  uniforms.iResolution.value.set(w, h, 1);
}
addEventListener('resize', resize); resize();
function frame(){
  const now = performance.now();
  uniforms.iTimeDelta.value = (now - t0) / 1000;
  uniforms.iTime.value += uniforms.iTimeDelta.value;
  uniforms.iFrame.value++;
  t0 = now;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
</script>
</body>
</html>`;
  zip.file('standalone.html', html);

  const content = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = `${(state.currentPreset || 'z-gl-project').replace(/[^\w.-]+/g, '_')}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('ZIP exported', 'ok');
}

function exportCurrentFrame() {
  const cw = document.getElementById('cwrap');
  const w = cw ? cw.clientWidth : 1920;
  const h = cw ? cw.clientHeight : 1080;

  let offRenderer = null;
  let offMat = null;
  let offMesh = null;
  let done = false;

  const finish = (msg, type) => {
    if (done) return;
    done = true;
    try { if (offMesh?.geometry) offMesh.geometry.dispose(); } catch(e){}
    try { if (offMat) offMat.dispose(); } catch(e){}
    try { if (offRenderer) offRenderer.dispose(); } catch(e){}
    if (msg) toast(msg, type || '');
  };

  try {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = w; offCanvas.height = h;
    offRenderer = new THREE.WebGLRenderer({
      canvas: offCanvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    offRenderer.setPixelRatio(1);
    offRenderer.setSize(w, h, false);

    offMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: state.mat3.fragmentShader,
      uniforms: Object.assign({}, state.mat3.uniforms, {
        iResolution: { value: new THREE.Vector3(w, h, 1) },
        iTime:      { value: state.mat3.uniforms.iTime.value },
        iTimeDelta: { value: state.mat3.uniforms.iTimeDelta.value },
        iFrame:     { value: state.mat3.uniforms.iFrame.value },
        iMouse:     { value: state.mat3.uniforms.iMouse.value },
      }),
      transparent: false,
    });

    const offScene = new THREE.Scene();
    const offCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    offMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), offMat);
    offScene.add(offMesh);
    offRenderer.render(offScene, offCam);

    offCanvas.toBlob(blob => {
      if (!blob) { finish('Export failed: empty buffer', 'err'); return; }
      const a = document.createElement('a');
      const blobUrl = URL.createObjectURL(blob);
      a.href = blobUrl;
      const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      a.download = `z-gl-frame-${ts}.png`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      finish(`Frame exported ${w}×${h}`, 'ok');
    }, 'image/png');
  } catch(e) {
    finish('Export failed: ' + e.message, 'err');
  }
}

export { openExportModal, closeExportModal, switchExportTab, exportScreenshot, exportCurrentFrame, _mediaRecorder, _recordChunks, _recordTimer, _recordStart, _recordDuration, toggleVideoRecord, startVideoRecord, stopVideoRecord, finalizeVideoExport, exportPureGLSL, exportMinifiedGLSL, exportThreeSnippet, exportStandaloneHTML, exportProjectZip };

// ── Phase 6 additions ─────────────────────────────────────────────────────────
export {
  exportP5Sketch,
  exportGLSLSandbox,
  exportShaderToyFormat,
  renderExportPreview,
} from './export-phase6.js';
