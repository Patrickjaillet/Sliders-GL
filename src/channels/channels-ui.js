import { state } from '../core/state.js';
import { esc, escAttr } from '../core/utils.js';

import { PROC_TEX_TYPES, defaultProcTexParams, chGenProcTex, chExportProcTexPng, drawProcTexPreview, getProcTexParamMeta } from './channels-proc-tex.js';
import { chVideoSetPlayback } from './channels-media.js';

let chPanelOpen = false;

document.addEventListener('keydown', ev => {
  if ((ev.key === 'Enter' || ev.key === ' ') && document.activeElement?.id === 'chHead') {
    ev.preventDefault();
    toggleChannelPanel();
  }
});

export function toggleChannelPanel() {
  chPanelOpen = !chPanelOpen;
  const body = document.getElementById('chBody');
  const head = document.getElementById('chHead');
  const arrow = document.getElementById('chArrow');
  body.classList.toggle('open', chPanelOpen);
  head.classList.toggle('open', chPanelOpen);
  head.setAttribute('aria-expanded', String(chPanelOpen));
  arrow.style.transform = chPanelOpen ? 'rotate(180deg)' : '';
  if (chPanelOpen) renderChannelUI();
}

export function renderChannelUI(i = null) {
  const body = document.getElementById('chBody');
  if (!body || !chPanelOpen) return;
  if (!Number.isInteger(i)) {
    body.innerHTML = state.channels.map(ch => channelRowHTML(ch)).join('');
    state.channels.forEach(ch => {
      if (ch.type === 'cubemap') drawCubemapPreview(ch.i);
      if (ch.type === 'proc-tex' && ch.status === 'ok') {
        const c = document.getElementById('ch-proc-tex-thumb-' + ch.i);
        if (c) drawProcTexPreview(c, ch.procTexType, ch.procTexParams || {});
      }
    });
    return;
  }

  const row = document.getElementById('ch-row-' + i);
  if (!row) {
    body.innerHTML = state.channels.map(ch => channelRowHTML(ch)).join('');
    return;
  }
  row.outerHTML = channelRowHTML(state.channels[i]);
  if (state.channels[i].type === 'cubemap') drawCubemapPreview(i);
  if (state.channels[i].type === 'proc-tex' && state.channels[i].status === 'ok') {
    const c = document.getElementById('ch-proc-tex-thumb-' + i);
    if (c) drawProcTexPreview(c, state.channels[i].procTexType, state.channels[i].procTexParams || {});
  }
}

export function channelRowHTML(ch) {
  const i = ch.i;
  const typeOpts = ['none','image','cubemap','audio-mic','audio-file','webcam','video','prev-frame','keyboard','proc-tex']
    .map(t => '<option value="' + t + '"' + (ch.type===t?' selected':'') + '>' + t + '</option>').join('');

  let thumbHTML = '';
  if (ch.type === 'audio-mic' || ch.type === 'audio-file') {
    thumbHTML = `<canvas class="fft-viz" id="fft-viz-${i}" width="200" height="28"></canvas>`;
  } else if (ch.type === 'cubemap') {
    thumbHTML = `<canvas class="ch-thumb-canvas" id="ch-cube-thumb-${i}" width="72" height="48"></canvas>`;
  } else if (ch.type === 'prev-frame' && ch.status === 'ok') {
    thumbHTML = '<div class="ch-thumb" style="display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:7px;color:var(--ac3);font-family:\'JetBrains Mono\',monospace;gap:2px"><span>PREV</span><span>frame</span></div>';
  } else if (ch.type === 'keyboard') {
    thumbHTML = '<div class="ch-thumb" style="display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:7px;color:var(--ac3);font-family:\'JetBrains Mono\',monospace;gap:2px"><span>KB</span><span>256\xd72</span></div>';
  } else if (ch.type === 'proc-tex' && ch.status === 'ok') {
    thumbHTML = `<canvas class="ch-thumb-canvas" id="ch-proc-tex-thumb-${i}" width="72" height="48"></canvas>`;
  } else if (ch.videoEl || ch.videoTexture) {
    thumbHTML = `<canvas class="ch-thumb-canvas" id="ch-thumb-${i}"></canvas>`;
  } else if (ch.texture && ch.texture.image) {
    const src = String(ch.texture.image.src || '');
    thumbHTML = src ? `<img class="ch-thumb" src="${escAttr(src)}" id="ch-thumb-${i}">` :
      `<canvas class="ch-thumb-canvas" id="ch-thumb-${i}"></canvas>`;
  } else {
    thumbHTML = `<div class="ch-thumb" style="display:flex;align-items:center;justify-content:center;font-size:7px;color:var(--t3)">∅</div>`;
  }

  let controls = '';
  if (ch.type === 'image') {
    controls = `
    <div class="ch-controls">
      <label class="ch-file-btn">↑ upload image
        <input type="file" accept="image/*" style="display:none" onchange="chLoadImageFile(${i},this)" aria-label="Upload image for channel ${i}">
      </label>
      <div class="ch-url-row">
        <input class="ch-url-input" id="ch-url-${i}" placeholder="https://…/image.png" onkeydown="if(event.key==='Enter')chLoadURL(${i})" aria-label="Image URL for channel ${i}">
        <button class="ch-url-go" onclick="chLoadURL(${i})" aria-label="Load image from URL for channel ${i}">load</button>
      </div>
      <div class="ch-wrap-row">
        <span class="ch-wrap-label">Wrap:</span>
        <select class="ch-wrap-sel" onchange="chSetWrap(${i},this.value)" aria-label="Texture wrap mode for channel ${i}">
          <option value="repeat"${ch.wrap==='repeat'?' selected':''}>Repeat</option>
          <option value="clamp"${ch.wrap==='clamp'?' selected':''}>Clamp</option>
          <option value="mirror"${ch.wrap==='mirror'?' selected':''}>Mirror</option>
        </select>
      </div>
    </div>`;
  } else if (ch.type === 'cubemap') {
    controls = `
    <div class="ch-controls">
      <label class="ch-file-btn">⬢ upload cube faces (+X -X +Y -Y +Z -Z)
        <input type="file" accept="image/*" multiple style="display:none" onchange="chLoadCubeFiles(${i},this)" aria-label="Upload 6 cube face images for channel ${i}">
      </label>
      <label class="ch-file-btn" style="margin-top:4px">⬡ upload .ktx2 cubemap
        <input type="file" accept=".ktx2" style="display:none" onchange="chLoadKTX2CubeFile(${i},this)" aria-label="Upload .ktx2 cubemap file for channel ${i}">
      </label>
      <div class="ch-status" style="margin-top:6px">6-image order: +X, -X, +Y, -Y, +Z, -Z · KTX2: RGBA8/RGB8 uncompressed</div>
      <div class="ch-status${ch.status==='ok'?' ok':ch.status==='err'?' err':''}" id="ch-status-${i}">${esc(ch.statusMsg||'')}</div>
    </div>`;
  } else if (ch.type === 'audio-mic') {
    controls = `
    <div class="ch-controls">
      <button class="ch-file-btn" onclick="chStartMic(${i})" aria-label="Start microphone for channel ${i}">&#127908; Start microphone</button>
      <canvas class="fft-viz" id="fft-viz-${i}" width="260" height="28"></canvas>
      ${audioParamsHTML(i, ch)}
      <div class="ch-status${ch.status==='ok'?' ok':ch.status==='err'?' err':''}" id="ch-status-${i}">${esc(ch.statusMsg||'')}</div>
    </div>`;
  } else if (ch.type === 'audio-file') {
    controls = `
    <div class="ch-controls">
      <label class="ch-file-btn">♪ upload audio
        <input type="file" accept="audio/*" style="display:none" onchange="chLoadAudioFile(${i},this)" aria-label="Upload audio file for channel ${i}">
      </label>
      <canvas class="fft-viz" id="fft-viz-${i}" width="260" height="28"></canvas>
      ${audioParamsHTML(i, ch)}
      <div class="ch-status${ch.status==='ok'?' ok':ch.status==='err'?' err':''}" id="ch-status-${i}">${esc(ch.statusMsg||'')}</div>
    </div>`;
  } else if (ch.type === 'webcam') {
    controls = `
    <div class="ch-controls">
      <button class="ch-file-btn" onclick="chStartWebcam(${i})" aria-label="Start webcam for channel ${i}">&#128247; Start webcam</button>
      <div class="ch-status${ch.status==='ok'?' ok':ch.status==='err'?' err':''}" id="ch-status-${i}">${esc(ch.statusMsg||'')}</div>
    </div>`;
  } else if (ch.type === 'video') {
    const vRate  = ch.videoRate  ?? 1;
    const vMode  = ch.videoMode  ?? 'loop';
    const vInPt  = ch.videoInPoint  ?? 0;
    const vOutPt = ch.videoOutPoint ?? '';
    const vSync  = ch.videoSyncToTime ? ' checked' : '';
    controls = `
    <div class="ch-controls">
      <label class="ch-file-btn">▶ upload video
        <input type="file" accept="video/*" style="display:none" onchange="chLoadVideoFile(${i},this)" aria-label="Upload video file for channel ${i}">
      </label>
      <div class="ch-wrap-row">
        <label style="font-size:8px;font-family:'JetBrains Mono',monospace;color:var(--t3);display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="checkbox" id="ch-flipy-${i}" onchange="chSetFlipY(${i},this.checked)"${ch.flipY?' checked':''} aria-label="Flip video vertically for channel ${i}"> flipY
        </label>
      </div>
      ${ch.videoEl ? `
      <div class="ch-video-controls" style="display:flex;flex-direction:column;gap:4px;margin-top:6px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:8px;color:var(--t3);width:32px">speed</span>
          <select style="font-size:9px;background:var(--inp);border:1px solid var(--border);color:var(--fg);border-radius:3px;padding:1px 2px" onchange="chVideoSetPlayback(${i},{rate:this.value})" aria-label="Playback speed for channel ${i} video">
            ${[0.25,0.5,1,2,4].map(r => `<option value="${r}"${vRate===r?' selected':''}>${r}×</option>`).join('')}
          </select>
          <select style="font-size:9px;background:var(--inp);border:1px solid var(--border);color:var(--fg);border-radius:3px;padding:1px 2px" onchange="chVideoSetPlayback(${i},{mode:this.value})" aria-label="Playback mode for channel ${i} video">
            <option value="loop"${vMode==='loop'?' selected':''}>loop</option>
            <option value="ping-pong"${vMode==='ping-pong'?' selected':''}>ping-pong</option>
            <option value="once"${vMode==='once'?' selected':''}>once</option>
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="font-size:8px;color:var(--t3);width:32px">in/out</span>
          <input type="number" min="0" step="0.1" value="${vInPt}" placeholder="0" style="width:44px;font-size:9px;background:var(--inp);border:1px solid var(--border);color:var(--fg);border-radius:3px;padding:2px 4px" onchange="chVideoSetPlayback(${i},{inPoint:this.value})" aria-label="In point (seconds) for channel ${i} video">
          <span style="font-size:8px;color:var(--t3)">→</span>
          <input type="number" min="0" step="0.1" value="${vOutPt}" placeholder="end" style="width:44px;font-size:9px;background:var(--inp);border:1px solid var(--border);color:var(--fg);border-radius:3px;padding:2px 4px" onchange="chVideoSetPlayback(${i},{outPoint:this.value})" aria-label="Out point (seconds) for channel ${i} video">
        </div>
        <label style="font-size:8px;font-family:'JetBrains Mono',monospace;color:var(--t3);display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="checkbox"${vSync} onchange="chVideoSetPlayback(${i},{syncToTime:this.checked})" aria-label="Sync video position to iTime for channel ${i}"> sync to iTime
        </label>
      </div>` : ''}
      <div class="ch-status${ch.status==='ok'?' ok':ch.status==='err'?' err':''}" id="ch-status-${i}">${esc(ch.statusMsg||'')}</div>
    </div>`;
  } else if (ch.type === 'prev-frame') {
    controls = `
    <div class="ch-controls">
      <button class="ch-file-btn" onclick="chEnablePrevFrame(${i})" aria-label="Activate previous frame feedback for channel ${i}">⧉ Activate previous frame</button>
      <div class="ch-status" style="margin-top:4px;font-size:8px;color:var(--t3)">Feeds the last rendered frame back as a texture. Useful for feedback effects without buffer passes.</div>
      <div class="ch-status${ch.status==='ok'?' ok':ch.status==='err'?' err':''}" id="ch-status-${i}">${esc(ch.statusMsg||'')}</div>
    </div>`;
  } else if (ch.type === 'keyboard') {
    controls = `
    <div class="ch-controls">
      <button class="ch-file-btn" onclick="chEnableKeyboard(${i})" aria-label="Activate keyboard input for channel ${i}">⌨ Activate keyboard</button>
      <div class="ch-status" style="margin-top:4px;font-size:8px;color:var(--t3)">256\xd72 texture — row 0: held state, row 1: toggle. Sample with texelFetch(iChannel${i}, ivec2(keyCode, 0), 0).r &gt; 0.5</div>
      <div class="ch-status${ch.status==='ok'?' ok':ch.status==='err'?' err':''}" id="ch-status-${i}">${esc(ch.statusMsg||'')}</div>
    </div>`;
  }

  if (ch.type === 'proc-tex') {
    const pt = ch.procTexType || PROC_TEX_TYPES[0].id;
    const pp = ch.procTexParams || defaultProcTexParams(pt);
    const typeSelectOpts = PROC_TEX_TYPES
      .map(t => `<option value="${t.id}"${pt===t.id?' selected':''}>${t.label}</option>`).join('');
    const sizeOpts = [64,128,256,512,1024]
      .map(s => `<option value="${s}"${(pp.size||256)===s?' selected':''}>${s}</option>`).join('');

    // F-9.2 — Build per-type param sliders using getProcTexParamMeta (covers all types)
    let paramRows = '';
    const sliderRow = (label, paramKey, min, max, step, val) =>
      `<div class="ch-ap-row">
        <span class="ch-ap-lbl">${label}</span>
        <input type="range" class="ch-ap-range" min="${min}" max="${max}" step="${step}" value="${val}"
          oninput="chProcTexSetParam(${i},'${paramKey}',+this.value);this.nextElementSibling.textContent=(+this.value).toFixed(step<1?2:0)"
          aria-label="${label} for proc-tex channel ${i}">
        <span class="ch-ap-val">${(+val).toFixed(step<1?2:0)}</span>
      </div>`;

    // Use metadata API for all types — skip 'size' and 'seed' (shown separately)
    const meta = getProcTexParamMeta(pt);
    for (const m of meta) {
      if (m.key === 'size' || m.key === 'seed') continue;
      const curVal = pp[m.key] ?? m.def;
      // For worley/cellular mode: keep the select
      if (m.key === 'mode') {
        const modeOptions = ['f1','f2','f2-f1']
          .map(o => `<option value="${o}"${String(curVal)===o?' selected':''}>${o.toUpperCase()}</option>`).join('');
        paramRows += `<div class="ch-ap-row"><span class="ch-ap-lbl">mode</span>
          <select class="ch-wrap-sel" onchange="chProcTexSetParam(${i},'mode',this.value)" aria-label="mode">${modeOptions}</select></div>`;
      } else {
        paramRows += sliderRow(m.label, m.key, m.min, m.max, m.step, curVal);
      }
    }

    controls = `
    <div class="ch-controls">
      <div class="ch-ap-row">
        <span class="ch-ap-lbl">type</span>
        <select class="ch-wrap-sel" style="min-width:110px" onchange="chProcTexChangeType(${i},this.value)" aria-label="Procedural texture type for channel ${i}">
          ${typeSelectOpts}
        </select>
      </div>
      <div class="ch-ap-row">
        <span class="ch-ap-lbl">size</span>
        <select class="ch-wrap-sel" onchange="chProcTexSetParam(${i},'size',+this.value)" aria-label="Texture size for channel ${i}">${sizeOpts}</select>
      </div>
      <div class="ch-ap-row">
        <span class="ch-ap-lbl">seed</span>
        <input type="range" class="ch-ap-range" min="0" max="999" step="1" value="${pp.seed||0}"
          oninput="chProcTexSetParam(${i},'seed',+this.value);this.nextElementSibling.textContent=this.value"
          aria-label="Random seed for channel ${i}">
        <span class="ch-ap-val">${pp.seed||0}</span>
      </div>
      ${paramRows}
      <div class="ch-ap-row" style="gap:4px;flex-wrap:wrap">
        <button class="ch-file-btn" style="flex:1" onclick="chGenProcTex(${i})" aria-label="Regenerate procedural texture for channel ${i}">↻ generate</button>
        <button class="ch-file-btn" style="flex:1" onclick="chExportProcTexPng(${i})" aria-label="Export PNG for channel ${i}">⬇ PNG</button>
      </div>
      <div class="ch-status" style="font-size:8px;color:var(--t3)">Texture generated in memory — assigned directly to iChannel${i}</div>
      <div class="ch-status${ch.status==='ok'?' ok':ch.status==='err'?' err':''}" id="ch-status-${i}">${esc(ch.statusMsg||'')}</div>
    </div>`;
  }

  return `
<div class="ch-row" id="ch-row-${i}">
  <div class="ch-row-head">
    <div class="ch-index">iChannel${i}</div>
    ${thumbHTML}
    <select class="ch-type" onchange="chChangeType(${i},this.value)" aria-label="Channel ${i} type">${typeOpts}</select>
    ${ch.type!=='none'?`<button class="ch-clear" onclick="chClear(${i})" aria-label="Clear channel ${i}">✕</button>`:''}
  </div>
  ${controls}
</div>`;
}

export function audioParamsHTML(i, ch) {
  const s  = (ch.audioSmoothing ?? 0.8).toFixed(2);
  const g  = (ch.audioGain     ?? 1.0 ).toFixed(2);
  const bl = (ch.audioBandLow  ?? 0   ).toFixed(2);
  const bh = (ch.audioBandHigh ?? 1.0 ).toFixed(2);
  const fftSize = ch.audioFftSize || 1024;
  const windowFn = ch.audioWindowFn || 'hann';
  const mode = ch.audioMode || 'fft';
  const fftOpts = [256, 512, 1024, 2048, 4096, 8192]
    .map(v => `<option value="${v}"${fftSize===v?' selected':''}>${v}</option>`).join('');
  const winOpts = ['none','hann','blackman']
    .map(v => `<option value="${v}"${windowFn===v?' selected':''}>${v}</option>`).join('');
  return `<div class="ch-audio-params">
  <div class="ch-ap-row">
    <span class="ch-ap-lbl">mode</span>
    <select class="ch-wrap-sel" onchange="chSetAudioMode(${i},this.value)" aria-label="Audio mode for channel ${i}">
      <option value="fft"${mode==='fft'?' selected':''}>FFT</option>
      <option value="wave"${mode==='wave'?' selected':''}>waveform</option>
    </select>
  </div>
  <div class="ch-ap-row">
    <span class="ch-ap-lbl">FFT size</span>
    <select class="ch-wrap-sel" onchange="chSetFftSize(${i},+this.value)" aria-label="FFT size for channel ${i}">${fftOpts}</select>
  </div>
  <div class="ch-ap-row">
    <span class="ch-ap-lbl">window</span>
    <select class="ch-wrap-sel" onchange="chSetWindowFn(${i},this.value)" aria-label="FFT window function for channel ${i}">${winOpts}</select>
  </div>
  <div class="ch-ap-row">
    <span class="ch-ap-lbl">smoothing</span>
    <input type="range" class="ch-ap-range" min="0" max="0.99" step="0.01" value="${s}"
      oninput="chSetSmoothing(${i},+this.value);this.nextElementSibling.textContent=this.value" aria-label="Audio smoothing for channel ${i}">
    <span class="ch-ap-val">${s}</span>
  </div>
  <div class="ch-ap-row">
    <span class="ch-ap-lbl">gain</span>
    <input type="range" class="ch-ap-range" min="0" max="4" step="0.05" value="${g}"
      oninput="chSetGain(${i},+this.value);this.nextElementSibling.textContent=(+this.value).toFixed(2)" aria-label="Audio gain for channel ${i}">
    <span class="ch-ap-val">${g}</span>
  </div>
  <div class="ch-ap-row">
    <span class="ch-ap-lbl">band low</span>
    <input type="range" class="ch-ap-range" min="0" max="1" step="0.01" value="${bl}"
      oninput="chSetBand(${i},+this.value,null);this.nextElementSibling.textContent=(+this.value).toFixed(2)" aria-label="Audio band low cutoff for channel ${i}">
    <span class="ch-ap-val">${bl}</span>
  </div>
  <div class="ch-ap-row">
    <span class="ch-ap-lbl">band high</span>
    <input type="range" class="ch-ap-range" min="0" max="1" step="0.01" value="${bh}"
      oninput="chSetBand(${i},null,+this.value);this.nextElementSibling.textContent=(+this.value).toFixed(2)" aria-label="Audio band high cutoff for channel ${i}">
    <span class="ch-ap-val">${bh}</span>
  </div>
</div>`;
}

export function drawCubemapPreview(i) {
  const canvas = document.getElementById('ch-cube-thumb-' + i);
  if (!canvas) return;
  const ch = state.channels[i];
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);
  const faces = ch.cubeFaces || [];
  if (!faces.length) return;
  const cellW = Math.floor(W / 3);
  const cellH = Math.floor(H / 2);
  faces.slice(0, 6).forEach((src, idx) => {
    const img = new Image();
    img.onload = () => {
      const x = (idx % 3) * cellW;
      const y = Math.floor(idx / 3) * cellH;
      ctx.drawImage(img, x, y, cellW, cellH);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
    };
    img.src = src;
  });
}

export { chPanelOpen };

// Register callback so channels-core/audio/media can trigger UI updates

state.callbacks.renderChannelUI = renderChannelUI;

// ── Phase 19.1 — Proc-tex window helpers ──────────────────────────────────

/**
 * Called by the UI "↻ generate" button. Re-runs generation with current params.
 */
window.chGenProcTex = (i) => {
  const ch = state.channels[i];
  const typeId = ch.procTexType || PROC_TEX_TYPES[0].id;
  const params = ch.procTexParams || defaultProcTexParams(typeId);
  chGenProcTex(i, typeId, params);
};

/**
 * Called when the type <select> changes in the proc-tex controls.
 */
window.chProcTexChangeType = (i, typeId) => {
  chGenProcTex(i, typeId, defaultProcTexParams(typeId));
};

/**
 * Called by any param slider / select in the proc-tex controls.
 * Updates the stored params then re-generates.
 */
window.chProcTexSetParam = (i, key, value) => {
  const ch = state.channels[i];
  if (!ch.procTexParams) ch.procTexParams = defaultProcTexParams(ch.procTexType || PROC_TEX_TYPES[0].id);
  ch.procTexParams[key] = value;
  chGenProcTex(i, ch.procTexType || PROC_TEX_TYPES[0].id, ch.procTexParams);
};

/**
 * Export current proc-tex as PNG download.
 */
window.chExportProcTexPng = chExportProcTexPng;

// Override chChangeType to auto-generate when proc-tex is chosen
import { chChangeType as _chChangeType } from './channels-core.js';
window.chChangeType = (i, type) => {
  if (type === 'proc-tex') {
    // Generate a default texture immediately so the channel is active
    const defaultType = PROC_TEX_TYPES[0].id;
    chGenProcTex(i, defaultType, defaultProcTexParams(defaultType));
  } else {
    _chChangeType(i, type);
  }
};

