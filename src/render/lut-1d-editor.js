/**
 * lut-1d-editor.js — Phase 1 (ROADMAP v2.2→v2.6)
 *
 * Éditeur de courbes 1D (R/G/B/Master) + import .cube 3D.
 *
 * ✅ [x] 🔌  applyLUT() exposée comme style layer via registerLUTAsStyleLayer()
 * ✅ [x] 🆕  Import de fichiers .cube 3D — bouton dédié dans le panneau
 *
 * Corrections par rapport à l'original :
 *   - `closePanel` n'était pas défini → remplacé par closeLUT1DEditor()
 *   - `_lutDefs` référencé dans une closure morte → supprimé
 *   - Le bouton "→ Style Layer" appelle registerLUTAsStyleLayer() de lut-grading.js
 *
 * API publique :
 *   openLUT1DEditor()
 *   closeLUT1DEditor()
 *   toggleLUT1DEditor()
 *   applyEditorToLUT()       → lutData | undefined
 *   exportEditorCube(name)
 */

import { state } from '../core/state.js';
// lut-library.js is loaded lazily via _ensureModules() below, not statically:
// lut-grading.js and lut-library-panel.js also dynamically import it, and a
// static import here would force it into this chunk permanently, preventing
// the bundler from giving it its own shared lazy chunk (INEFFECTIVE_DYNAMIC_IMPORT).
// The bindings below are populated once _ensureModules() resolves.
let clamp01, serializeCube, buildLUTData, LUT_DEFINITIONS;

const LUT_EDITOR_1D_SIZE = 256;
const CANVAS_W = 256;
const CANVAS_H = 160;
const CONTROL_RADIUS = 6;

// ─────────────────────────────────────────────────────────────────────────────
// Maths de courbe
// ─────────────────────────────────────────────────────────────────────────────

function makeCurve(size) {
  const arr = new Float32Array(size);
  for (let i = 0; i < size; i++) arr[i] = i / (size - 1);
  return arr;
}

function cubicInterp(points, t) {
  points = [...points].sort((a, b) => a.x - b.x);
  if (t <= points[0].x) return points[0].y;
  if (t >= points[points.length - 1].x) return points[points.length - 1].y;
  let i = 0;
  while (i < points.length - 2 && points[i + 1].x < t) i++;
  const p0 = points[Math.max(0, i - 1)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(points.length - 1, i + 2)];
  const t2 = (t - p1.x) / (p2.x - p1.x);
  const t3 = t2 * t2, t4 = t3 * t2;
  const m1 = p2.x > p0.x ? (p2.y - p0.y) / (p2.x - p0.x) * (p2.x - p1.x) : 0;
  const m2 = p3.x > p1.x ? (p3.y - p1.y) / (p3.x - p1.x) * (p2.x - p1.x) : 0;
  return clamp01(
    (2*t4 - 3*t3 + 1)*p1.y + (t4 - 2*t3 + t2)*m1 +
    (-2*t4 + 3*t3)*p2.y + (t4 - t3)*m2
  );
}

function sampleCurve(points, size) {
  const arr = new Float32Array(size);
  for (let i = 0; i < size; i++) arr[i] = cubicInterp(points, i / (size - 1));
  return arr;
}

function applyLUT1DTo3D(rCurve, gCurve, bCurve) {
  const SIZE = 32;
  const data = [];
  for (let b = 0; b < SIZE; b++) {
    for (let g = 0; g < SIZE; g++) {
      for (let r = 0; r < SIZE; r++) {
        const ri = Math.round(r / (SIZE-1) * (rCurve.length-1));
        const gi = Math.round(g / (SIZE-1) * (gCurve.length-1));
        const bi = Math.round(b / (SIZE-1) * (bCurve.length-1));
        data.push(rCurve[ri], gCurve[gi], bCurve[bi]);
      }
    }
  }
  return { size: SIZE, domain: { min:[0,0,0], max:[1,1,1] }, data: new Float32Array(data) };
}

// ─────────────────────────────────────────────────────────────────────────────
// État éditeur
// ─────────────────────────────────────────────────────────────────────────────

let _editorState = null;

function createEditorState(baseId) {
  const n = LUT_EDITOR_1D_SIZE;
  return {
    baseId: baseId || null,
    channels: {
      r: { points: [{x:0,y:0},{x:1,y:1}], curve: makeCurve(n), color: '#ff4444' },
      g: { points: [{x:0,y:0},{x:1,y:1}], curve: makeCurve(n), color: '#44ff44' },
      b: { points: [{x:0,y:0},{x:1,y:1}], curve: makeCurve(n), color: '#4488ff' },
      m: { points: [{x:0,y:0},{x:1,y:1}], curve: makeCurve(n), color: '#aaaaaa' },
    },
    activeChannel: 'm',
  };
}

function resetCurve(ch) {
  _editorState.channels[ch].points = [{x:0,y:0},{x:1,y:1}];
  rebuildCurve(ch);
}

function resetAll() {
  for (const ch of ['r','g','b','m']) resetCurve(ch);
}

function rebuildCurve(ch) {
  const c = _editorState.channels[ch];
  c.curve = sampleCurve(c.points, LUT_EDITOR_1D_SIZE);
}

function rebuildAll() {
  for (const ch of ['r','g','b','m']) rebuildCurve(ch);
}

// ─────────────────────────────────────────────────────────────────────────────
// Appliquer l'état éditeur à la LUT active
// ─────────────────────────────────────────────────────────────────────────────

export function applyEditorToLUT() {
  if (!_editorState || !_lutGrading) return;
  const { r, g, b, m } = _editorState.channels;

  function applyMaster(c, master) {
    const out = new Float32Array(c.length);
    for (let i = 0; i < c.length; i++) {
      out[i] = master[Math.round(c[i] * (master.length - 1))];
    }
    return out;
  }

  const rFinal = applyMaster(r.curve, m.curve);
  const gFinal = applyMaster(g.curve, m.curve);
  const bFinal = applyMaster(b.curve, m.curve);

  let lutData = applyLUT1DTo3D(rFinal, gFinal, bFinal);

  if (_editorState.baseId) {
    const baseLut = buildLUTData(_editorState.baseId);
    const s = baseLut.size;
    const combined = new Float32Array(s * s * s * 3);
    for (let i = 0; i < baseLut.data.length; i += 3) {
      combined[i]   = rFinal[Math.max(0, Math.min(rFinal.length-1, Math.round(baseLut.data[i]   * (rFinal.length-1))))];
      combined[i+1] = gFinal[Math.max(0, Math.min(gFinal.length-1, Math.round(baseLut.data[i+1] * (gFinal.length-1))))];
      combined[i+2] = bFinal[Math.max(0, Math.min(bFinal.length-1, Math.round(baseLut.data[i+2] * (bFinal.length-1))))];
    }
    lutData = { size: s, domain: baseLut.domain, data: combined };
  }

  const tex = _lutGrading.createLUTTexture(lutData);
  if (state.perf?.lutTexture?.dispose) state.perf.lutTexture.dispose();
  if (state.perf) {
    state.perf.lutTexture = tex;
    state.perf.lutSize    = lutData.size;
    if (state.perf.lutMat) {
      state.perf.lutMat.uniforms.tLUT.value     = tex;
      state.perf.lutMat.uniforms.uLutSize.value = lutData.size;
    }
    state.perf.lutEnabled = true;
  }
  _lutGrading.setLUTEnabled(true);
  return lutData;
}

export function exportEditorCube(name) {
  const lutData = applyEditorToLUT();
  if (!lutData) return;
  const content = serializeCube(lutData, name || 'custom-1d-edit');
  const blob = new Blob([content], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${(name || 'custom-1d-edit').replace(/\s+/g, '-')}.cube`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas de courbe — dessin
// ─────────────────────────────────────────────────────────────────────────────

function drawCurveCanvas(canvas, edState) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  // Grille
  ctx.strokeStyle = '#333355'; ctx.lineWidth = 0.5;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(i*W/4, 0); ctx.lineTo(i*W/4, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i*H/4); ctx.lineTo(W, i*H/4); ctx.stroke();
  }
  // Diagonale identité
  ctx.strokeStyle = '#555577'; ctx.lineWidth = 0.8;
  ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W, 0); ctx.stroke();
  ctx.setLineDash([]);

  // Courbes
  const showChannels = edState.activeChannel === 'm'
    ? ['r','g','b']
    : [edState.activeChannel];

  for (const ch of ['m','r','g','b']) {
    const c = edState.channels[ch];
    const isActive = ch === edState.activeChannel;
    const isMaster = ch === 'm';
    if (!isActive && !isMaster && !showChannels.includes(ch)) continue;
    ctx.strokeStyle  = c.color;
    ctx.lineWidth    = isActive ? 2.5 : isMaster ? 1.5 : 1;
    ctx.globalAlpha  = isActive ? 1 : isMaster ? 0.7 : 0.3;
    ctx.beginPath();
    for (let i = 0; i < c.curve.length; i++) {
      const x = (i / (c.curve.length-1)) * W;
      const y = (1 - c.curve[i]) * H;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Points de contrôle du canal actif
  const ac = edState.channels[edState.activeChannel];
  ctx.fillStyle = ac.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  for (const pt of ac.points) {
    ctx.beginPath();
    ctx.arc(pt.x * W, (1 - pt.y) * H, CONTROL_RADIUS, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas de courbe — interaction souris
// ─────────────────────────────────────────────────────────────────────────────

function hitTest(points, px, py, W, H) {
  for (let i = 0; i < points.length; i++) {
    if (Math.hypot(px - points[i].x * W, py - (1 - points[i].y) * H) < CONTROL_RADIUS + 4) return i;
  }
  return -1;
}

function setupCanvasInteraction(canvas, edState, onUpdate) {
  let dragging = null, lastClick = 0;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clamp01((clientX - rect.left) * scaleX / canvas.width),
      y: clamp01(1 - (clientY - rect.top) * scaleY / canvas.height),
    };
  }

  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const pos = getPos(e);
    const ac  = edState.channels[edState.activeChannel];
    const px  = pos.x * canvas.width, py = (1 - pos.y) * canvas.height;
    const hit = hitTest(ac.points, px, py, canvas.width, canvas.height);
    const now = Date.now();

    if (hit >= 0) {
      if (now - lastClick < 300 && hit > 0 && hit < ac.points.length - 1) {
        ac.points.splice(hit, 1);
        rebuildCurve(edState.activeChannel);
        onUpdate();
      } else {
        dragging = hit;
      }
    } else {
      const newPt = { x: pos.x, y: pos.y };
      ac.points.push(newPt);
      ac.points.sort((a, b) => a.x - b.x);
      dragging = ac.points.indexOf(newPt);
      rebuildCurve(edState.activeChannel);
      onUpdate();
    }
    lastClick = now;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (dragging === null) return;
    e.preventDefault();
    const pos = getPos(e);
    const ac  = edState.channels[edState.activeChannel];
    const pt  = ac.points[dragging];
    if (!pt) return;
    if (dragging === 0) {
      pt.x = 0; pt.y = clamp01(pos.y);
    } else if (dragging === ac.points.length - 1) {
      pt.x = 1; pt.y = clamp01(pos.y);
    } else {
      const prev = ac.points[dragging - 1], next = ac.points[dragging + 1];
      pt.x = clamp01(Math.max(prev.x + 0.01, Math.min(next.x - 0.01, pos.x)));
      pt.y = clamp01(pos.y);
    }
    rebuildCurve(edState.activeChannel);
    onUpdate();
  });

  window.addEventListener('mouseup', () => { dragging = null; });
}

// ─────────────────────────────────────────────────────────────────────────────
// Construction du panneau
// ─────────────────────────────────────────────────────────────────────────────

let _panelEl = null;
let _isOpen  = false;

function createLUT1DEditorPanel() {
  if (_panelEl) { _panelEl.remove(); _panelEl = null; }

  _editorState = createEditorState(state.perf?.lutCurrentId || null);
  rebuildAll();

  const panel = document.createElement('div');
  panel.id = 'lut1dEditorPanel';
  panel.style.cssText = `
    position: fixed; right: 16px; top: 60px; width: 300px;
    background: #12121e; border: 1px solid #2a2a4a; border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7); z-index: 220;
    font-family: system-ui, sans-serif; font-size: 12px; color: #ccc;
    user-select: none;
  `;

  panel.innerHTML = `
    <div id="lut1dHeader" style="
      display:flex; align-items:center; justify-content:space-between;
      padding:10px 12px; background:#1a1a30; border-radius:10px 10px 0 0;
      cursor:move; border-bottom:1px solid #2a2a4a;
    ">
      <span style="font-weight:700; font-size:13px; color:#9988ff;">🎨 LUT 1D Editor</span>
      <button id="lut1dClose" style="background:none;border:none;color:#777;font-size:16px;cursor:pointer;padding:0 4px;">✕</button>
    </div>
    <div style="padding:12px; display:flex; flex-direction:column; gap:8px;">

      <!-- Base LUT -->
      <div style="display:flex; align-items:center; gap:6px;">
        <label style="color:#888; flex-shrink:0;">Base LUT:</label>
        <select id="lut1dBase" style="flex:1; background:#1e1e38; color:#ccc; border:1px solid #333; border-radius:4px; padding:3px 6px; font-size:11px;">
          <option value="">— None (identity) —</option>
        </select>
      </div>

      <!-- Sélection canal -->
      <div style="display:flex; gap:4px;">
        <button class="lut1d-ch-btn lut1d-ch-active" data-ch="m" style="flex:1; background:#2a2a4a; border:1px solid #9988ff; border-radius:4px; color:#aaa; padding:4px; cursor:pointer; font-size:11px;">Master</button>
        <button class="lut1d-ch-btn" data-ch="r" style="flex:1; background:#1e1e38; border:1px solid #333; border-radius:4px; color:#ff4444; padding:4px; cursor:pointer; font-size:11px;">R</button>
        <button class="lut1d-ch-btn" data-ch="g" style="flex:1; background:#1e1e38; border:1px solid #333; border-radius:4px; color:#44ff44; padding:4px; cursor:pointer; font-size:11px;">G</button>
        <button class="lut1d-ch-btn" data-ch="b" style="flex:1; background:#1e1e38; border:1px solid #333; border-radius:4px; color:#4488ff; padding:4px; cursor:pointer; font-size:11px;">B</button>
      </div>

      <!-- Canvas courbe -->
      <canvas id="lut1dCanvas" width="${CANVAS_W}" height="${CANVAS_H}"
        style="width:100%; height:auto; border-radius:6px; border:1px solid #2a2a4a; cursor:crosshair; display:block;"></canvas>

      <div style="font-size:10px; color:#555; text-align:center;">
        Clic = ajouter · Double-clic (intermédiaire) = supprimer · Glisser = déplacer
      </div>

      <!-- Réinitialisation -->
      <div style="display:flex; gap:4px;">
        <button id="lut1dResetCh"  style="flex:1; background:#1e1e38; border:1px solid #333; border-radius:4px; color:#aaa; padding:5px 8px; cursor:pointer; font-size:11px;">Reset Canal</button>
        <button id="lut1dResetAll" style="flex:1; background:#1e1e38; border:1px solid #333; border-radius:4px; color:#aaa; padding:5px 8px; cursor:pointer; font-size:11px;">Reset Tout</button>
      </div>

      <!-- Appliquer + Exporter 1D -->
      <div style="display:flex; gap:4px;">
        <button id="lut1dApply"  style="flex:2; background:#3a2a6a; border:1px solid #7755cc; border-radius:4px; color:#cbb; padding:6px 8px; cursor:pointer; font-size:11px;">▶ Appliquer au viewport</button>
        <button id="lut1dExport" style="flex:1; background:#1e1e38; border:1px solid #333; border-radius:4px; color:#aaa; padding:6px 8px; cursor:pointer; font-size:11px;">⬇ .cube</button>
      </div>

      <!-- Nom d'export -->
      <div style="display:flex; align-items:center; gap:6px;">
        <label style="color:#888; flex-shrink:0; font-size:11px;">Nom export:</label>
        <input id="lut1dExportName" type="text" value="my-custom-lut"
          style="flex:1; background:#1e1e38; color:#ccc; border:1px solid #333; border-radius:4px; padding:3px 6px; font-size:11px;" />
      </div>

      <!-- ─────────────────────────────────────────── -->
      <!-- [x] 🆕 Import .cube 3D  +  → Style Layer  -->
      <!-- ─────────────────────────────────────────── -->
      <div style="border-top:1px solid #2a2a4a; padding-top:8px; display:flex; flex-direction:column; gap:6px;">
        <div style="font-size:10px; color:#7766cc; font-weight:600; letter-spacing:.04em;">IMPORT .CUBE 3D / STYLE LAYER</div>

        <!-- Import fichier .cube -->
        <div style="display:flex; gap:4px; align-items:center;">
          <label id="lut1dImport3DLabel" style="
            flex:1; background:#1e2a1e; border:1px solid #335533; border-radius:4px;
            color:#88cc88; padding:6px 8px; cursor:pointer; font-size:11px; text-align:center;
          ">
            📂 Importer .cube (1D ou 3D)
            <input id="lut1dImport3DInput" type="file" accept=".cube" style="display:none;">
          </label>
        </div>

        <!-- Info fichier importé -->
        <div id="lut1dImport3DInfo" style="font-size:10px; color:#666; min-height:14px; padding:0 2px;"></div>

        <!-- → Style Layer -->
        <div style="display:flex; gap:4px;">
          <button id="lut1dToStyleLayer" style="
            flex:1; background:#1e2838; border:1px solid #335577;
            border-radius:4px; color:#88aacc; padding:6px 8px;
            cursor:pointer; font-size:11px;
          ">→ Ajouter au Style Stack</button>
          <input id="lut1dStyleName" type="text" placeholder="Nom du calque"
            style="flex:1; background:#1e1e38; color:#ccc; border:1px solid #333; border-radius:4px; padding:4px 6px; font-size:11px;" />
        </div>
        <div id="lut1dStyleMsg" style="font-size:10px; color:#666; min-height:14px;"></div>
      </div>

    </div>
  `;

  document.body.appendChild(panel);
  _panelEl = panel;

  const canvas = panel.querySelector('#lut1dCanvas');

  // ── Peupler le sélecteur de base LUT ────────────────────────────────────
  const baseSelect = panel.querySelector('#lut1dBase');
  for (const [cat, defs] of Object.entries(_lutDefsGrouped())) {
    const grp = document.createElement('optgroup');
    grp.label = cat;
    for (const d of defs) {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      if (d.id === _editorState.baseId) opt.selected = true;
      grp.appendChild(opt);
    }
    baseSelect.appendChild(grp);
  }

  // ── Repaint ────────────────────────────────────────────────────────────
  function repaint() { drawCurveCanvas(canvas, _editorState); }

  setupCanvasInteraction(canvas, _editorState, () => {
    repaint();
    applyEditorToLUT();
  });
  repaint();

  // ── Fermer ─────────────────────────────────────────────────────────────
  panel.querySelector('#lut1dClose').onclick = () => closeLUT1DEditor();

  // ── Sélection canal ────────────────────────────────────────────────────
  panel.querySelectorAll('.lut1d-ch-btn').forEach(btn => {
    btn.onclick = () => {
      _editorState.activeChannel = btn.dataset.ch;
      panel.querySelectorAll('.lut1d-ch-btn').forEach(b => {
        b.style.background  = '#1e1e38';
        b.style.borderColor = '#333';
      });
      btn.style.background  = '#2a2a4a';
      btn.style.borderColor = '#9988ff';
      repaint();
    };
  });

  // ── Reset ──────────────────────────────────────────────────────────────
  panel.querySelector('#lut1dResetCh').onclick = () => {
    resetCurve(_editorState.activeChannel); repaint(); applyEditorToLUT();
  };
  panel.querySelector('#lut1dResetAll').onclick = () => {
    resetAll(); repaint(); applyEditorToLUT();
  };

  // ── Apply / Export 1D ──────────────────────────────────────────────────
  panel.querySelector('#lut1dApply').onclick  = () => applyEditorToLUT();
  panel.querySelector('#lut1dExport').onclick = () => {
    const name = panel.querySelector('#lut1dExportName').value || 'custom-lut';
    exportEditorCube(name);
  };

  // ── Base LUT change ───────────────────────────────────────────────────
  baseSelect.onchange = () => {
    _editorState.baseId = baseSelect.value || null;
    resetAll(); repaint(); applyEditorToLUT();
  };

  // ── [x] 🆕 Import .cube 3D ────────────────────────────────────────────
  const import3DInput = panel.querySelector('#lut1dImport3DInput');
  const import3DInfo  = panel.querySelector('#lut1dImport3DInfo');

  import3DInput.addEventListener('change', async () => {
    const file = import3DInput.files?.[0];
    if (!file) return;
    import3DInfo.textContent = `⏳ Chargement de ${file.name}…`;
    import3DInfo.style.color = '#aaa';
    try {
      const meta = await _lutGrading.loadLUTFromFile(file);
      const typeLabel = meta.is1D ? '1D → promu 3D' : '3D';
      import3DInfo.style.color = '#88cc88';
      import3DInfo.textContent =
        `✓ ${file.name} — ${typeLabel}, taille ${meta.size}³, atlas ${meta.width}×${meta.height}px`;
      // Pré-remplir le nom de calque
      const nameInput = panel.querySelector('#lut1dStyleName');
      if (nameInput && !nameInput.value) {
        nameInput.value = file.name.replace(/\.cube$/i, '');
      }
    } catch (err) {
      import3DInfo.style.color = '#cc4444';
      import3DInfo.textContent = `✗ Erreur : ${err.message}`;
    }
    // Reset input pour permettre de recharger le même fichier
    import3DInput.value = '';
  });

  // ── [x] 🔌 → Style Layer ─────────────────────────────────────────────
  const styleMsg = panel.querySelector('#lut1dStyleMsg');

  panel.querySelector('#lut1dToStyleLayer').onclick = async () => {
    const nameInput = panel.querySelector('#lut1dStyleName');
    const layerName = (nameInput?.value || '').trim() || 'LUT Grade';
    styleMsg.textContent = '⏳ Enregistrement du style layer…';
    styleMsg.style.color = '#aaa';
    try {
      const layerId = await _lutGrading.registerLUTAsStyleLayer({
        name:  layerName,
        icon:  '🎨',
        lutId: _editorState.baseId || undefined,
      });
      if (layerId) {
        styleMsg.style.color = '#88aacc';
        styleMsg.textContent = `✓ Calque "${layerName}" ajouté au style stack.`;
      } else {
        styleMsg.style.color = '#cc8844';
        styleMsg.textContent = '⚠ Style layer déjà existant (doublon).';
      }
    } catch (err) {
      styleMsg.style.color = '#cc4444';
      styleMsg.textContent = `✗ Erreur : ${err.message}`;
    }
  };

  _makeDraggable(panel, panel.querySelector('#lut1dHeader'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internes
// ─────────────────────────────────────────────────────────────────────────────

function _lutDefsGrouped() {
  const cats = {};
  for (const d of LUT_DEFINITIONS) {
    if (!cats[d.category]) cats[d.category] = [];
    cats[d.category].push(d);
  }
  return cats;
}

function _makeDraggable(el, handle) {
  let ox = 0, oy = 0, startX = 0, startY = 0;
  handle.addEventListener('mousedown', e => {
    startX = e.clientX; startY = e.clientY;
    ox = el.offsetLeft;  oy = el.offsetTop;
    const mm = e2 => {
      el.style.left  = (ox + e2.clientX - startX) + 'px';
      el.style.top   = (oy + e2.clientY - startY) + 'px';
      el.style.right = 'auto';
    };
    const mu = () => {
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup', mu);
    };
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Modules lazily importés
// ─────────────────────────────────────────────────────────────────────────────

let _lutGrading = null;

async function _ensureModules() {
  if (_lutGrading) return;
  const [lutLib, grading] = await Promise.all([
    import('./lut-library.js'),
    import('./lut-grading.js'),
  ]);
  ({ clamp01, serializeCube, buildLUTData, LUT_DEFINITIONS } = lutLib);
  _lutGrading = grading;
}

// ─────────────────────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────────────────────

export async function openLUT1DEditor() {
  await _ensureModules();
  if (!_isOpen) {
    createLUT1DEditorPanel();
    _isOpen = true;
  }
}

export function closeLUT1DEditor() {
  if (_panelEl) { _panelEl.remove(); _panelEl = null; }
  _isOpen = false;
}

export async function toggleLUT1DEditor() {
  await _ensureModules();
  if (_isOpen) closeLUT1DEditor();
  else await openLUT1DEditor();
}
