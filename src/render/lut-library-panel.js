import { state } from '../core/state.js';

let _panelEl = null;
let _isOpen = false;
let _lutLib = null;
let _lutGrading = null;
let _searchQuery = '';
let _activeCategory = 'All';
let _previewCanvas = null;
let _hoverLutId = null;
let _debounceTimer = null;

async function _ensureModules() {
  if (_lutLib && _lutGrading) return;
  [_lutLib, _lutGrading] = await Promise.all([
    import('./lut-library.js'),
    import('./lut-grading.js'),
  ]);
}

function _allCategories(defs) {
  const cats = new Set(['All']);
  for (const d of defs) cats.add(d.category);
  return [...cats];
}

function _filterDefs(defs, query, category) {
  let list = defs;
  if (category !== 'All') list = list.filter(d => d.category === category);
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    list = list.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q) ||
      (d.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
  return list;
}

function _makeGradientPreview(canvas, lutData) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const size = lutData.size;
  const mid = Math.floor(size / 2);
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const idx = Math.min(size - 1, Math.round(t * (size - 1)));
    const base = (mid * size * size + mid * size + idx) * 3;
    const r = Math.round(_lutLib.clamp01(lutData.data[base]) * 255);
    const g = Math.round(_lutLib.clamp01(lutData.data[base + 1]) * 255);
    const b = Math.round(_lutLib.clamp01(lutData.data[base + 2]) * 255);
    grad.addColorStop(t, `rgb(${r},${g},${b})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function _makeIdentityPreviewCanvas() {
  const c = document.createElement('canvas');
  c.width = 200; c.height = 28;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 200, 0);
  g.addColorStop(0, '#000'); g.addColorStop(1, '#fff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 200, 28);
  return c;
}

function _createPanel() {
  const defs = _lutLib.LUT_DEFINITIONS;
  const cats = _allCategories(defs);

  const panel = document.createElement('div');
  panel.id = 'lutLibPanel';
  panel.style.cssText = `
    position: fixed; left: 16px; top: 60px; width: 320px;
    background: #12121e; border: 1px solid #2a2a4a; border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7); z-index: 210;
    font-family: system-ui, sans-serif; font-size: 12px; color: #ccc;
    display: flex; flex-direction: column; max-height: 85vh; user-select: none;
  `;

  panel.innerHTML = `
    <div id="lutLibHeader" style="
      display:flex; align-items:center; justify-content:space-between;
      padding:10px 12px; background:#1a1a30; border-radius:10px 10px 0 0;
      cursor:move; border-bottom:1px solid #2a2a4a; flex-shrink:0;
    ">
      <span style="font-weight:700; font-size:13px; color:#bb99ff;">🎞 LUT Library</span>
      <div style="display:flex; gap:6px; align-items:center;">
        <span id="lutLibCount" style="font-size:10px; color:#666;"></span>
        <button id="lutLibEditor1D" title="Open 1D LUT Editor" style="
          background:#2a1a4a; border:1px solid #6644aa; border-radius:4px;
          color:#bb99ff; font-size:11px; padding:3px 7px; cursor:pointer;">✏ 1D Edit</button>
        <button id="lutLibClose" style="background:none;border:none;color:#777;font-size:16px;cursor:pointer;padding:0 4px;">✕</button>
      </div>
    </div>

    <div style="padding:8px 10px; border-bottom:1px solid #1e1e38; flex-shrink:0; display:flex; gap:6px;">
      <input id="lutLibSearch" type="text" placeholder="Search LUTs…"
        style="flex:1; background:#1e1e38; color:#ccc; border:1px solid #2a2a4a; border-radius:5px; padding:5px 8px; font-size:11px;" />
      <button id="lutLibImport" title="Import .cube file" style="
        background:#1e1e38; border:1px solid #333; border-radius:5px;
        color:#aaa; font-size:11px; padding:5px 8px; cursor:pointer; white-space:nowrap;">⬆ Import</button>
    </div>

    <div id="lutLibCats" style="
      display:flex; gap:4px; padding:6px 10px; flex-wrap:wrap;
      border-bottom:1px solid #1e1e38; flex-shrink:0;
    "></div>

    <div id="lutLibPreviewBar" style="
      padding:6px 10px; border-bottom:1px solid #1e1e38; flex-shrink:0;
      display:none; align-items:center; gap:8px;
    ">
      <canvas id="lutLibPreviewCanvas" width="200" height="28"
        style="border-radius:4px; flex:1; display:block;"></canvas>
      <span id="lutLibPreviewName" style="color:#aaa; font-size:11px; white-space:nowrap;"></span>
    </div>

    <div id="lutLibList" style="
      overflow-y: auto; flex:1; padding:6px 10px;
    "></div>

    <div style="padding:8px 10px; border-top:1px solid #1e1e38; flex-shrink:0; display:flex; gap:6px; align-items:center;">
      <label style="color:#888; font-size:11px; flex-shrink:0;">Strength:</label>
      <input id="lutLibStrength" type="range" min="0" max="1" step="0.01" value="${state.perf.lutStrength ?? 1}"
        style="flex:1;" />
      <span id="lutLibStrengthVal" style="color:#aaa; font-size:11px; min-width:28px; text-align:right;">
        ${Math.round((state.perf.lutStrength ?? 1) * 100)}%</span>
      <button id="lutLibClear" style="
        background:#2a1010; border:1px solid #662222; border-radius:4px;
        color:#ff8888; font-size:11px; padding:4px 8px; cursor:pointer;">✕ Clear</button>
    </div>
  `;

  document.body.appendChild(panel);
  _panelEl = panel;

  const catsEl = panel.querySelector('#lutLibCats');
  const listEl = panel.querySelector('#lutLibList');
  const searchEl = panel.querySelector('#lutLibSearch');
  const previewBar = panel.querySelector('#lutLibPreviewBar');
  const previewCanvas = panel.querySelector('#lutLibPreviewCanvas');
  const previewName = panel.querySelector('#lutLibPreviewName');
  const countEl = panel.querySelector('#lutLibCount');
  _previewCanvas = previewCanvas;

  function buildCatButtons() {
    catsEl.innerHTML = '';
    for (const cat of cats) {
      const btn = document.createElement('button');
      btn.textContent = cat;
      btn.style.cssText = `
        background: ${cat === _activeCategory ? '#3a2a6a' : '#1e1e38'};
        border: 1px solid ${cat === _activeCategory ? '#7755cc' : '#333'};
        border-radius: 4px; color: ${cat === _activeCategory ? '#cbb' : '#888'};
        padding: 3px 8px; cursor: pointer; font-size: 10px; white-space: nowrap;
      `;
      btn.onclick = () => { _activeCategory = cat; buildCatButtons(); buildList(); };
      catsEl.appendChild(btn);
    }
  }

  function buildList() {
    const filtered = _filterDefs(defs, _searchQuery, _activeCategory);
    countEl.textContent = `${filtered.length} LUT${filtered.length !== 1 ? 's' : ''}`;
    listEl.innerHTML = '';

    if (!filtered.length) {
      listEl.innerHTML = '<div style="color:#555; text-align:center; padding:20px;">No LUTs found</div>';
      return;
    }

    for (const def of filtered) {
      const item = document.createElement('div');
      const isActive = state.perf.lutCurrentId === def.id && state.perf.lutEnabled;
      item.style.cssText = `
        display:flex; align-items:center; gap:8px;
        padding:6px 8px; border-radius:6px; cursor:pointer; margin-bottom:3px;
        background: ${isActive ? '#2a1a4a' : '#1a1a2e'};
        border: 1px solid ${isActive ? '#7755cc' : 'transparent'};
        transition: background 0.15s;
      `;

      const previewThumb = document.createElement('canvas');
      previewThumb.width = 64; previewThumb.height = 20;
      previewThumb.style.cssText = 'border-radius:3px; flex-shrink:0; border:1px solid #2a2a4a;';

      const textEl = document.createElement('div');
      textEl.style.cssText = 'flex:1; min-width:0;';
      textEl.innerHTML = `
        <div style="color:${isActive ? '#cc99ff' : '#ccc'}; font-size:11px; font-weight:${isActive ? '700' : '400'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${def.name}</div>
        <div style="color:#555; font-size:10px;">${def.category}</div>
      `;

      const applyBtn = document.createElement('button');
      applyBtn.textContent = isActive ? '✓' : '▶';
      applyBtn.title = isActive ? 'Active' : 'Apply';
      applyBtn.style.cssText = `
        background: ${isActive ? '#3a2a6a' : '#1e1e38'}; border: 1px solid ${isActive ? '#7755cc' : '#333'};
        border-radius:4px; color: ${isActive ? '#bb99ff' : '#888'}; font-size:12px;
        padding:3px 7px; cursor:pointer; flex-shrink:0;
      `;

      item.appendChild(previewThumb);
      item.appendChild(textEl);
      item.appendChild(applyBtn);
      listEl.appendChild(item);

      const renderThumb = () => {
        const lutData = _lutLib.buildLUTData(def.id);
        _makeGradientPreview(previewThumb, lutData);
      };

      const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          renderThumb();
          observer.disconnect();
        }
      }, { root: listEl });
      observer.observe(item);

      item.addEventListener('mouseenter', () => {
        item.style.background = isActive ? '#2a1a4a' : '#1e1e30';
        previewBar.style.display = 'flex';
        previewName.textContent = def.name;
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => {
          const lutData = _lutLib.buildLUTData(def.id);
          _makeGradientPreview(previewCanvas, lutData);
        }, 50);
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = isActive ? '#2a1a4a' : '#1a1a2e';
      });

      const doApply = () => {
        _lutLib.applyEmbeddedLUT(def.id, parseFloat(panel.querySelector('#lutLibStrength').value));
        buildList();
      };
      item.ondblclick = doApply;
      applyBtn.onclick = (e) => { e.stopPropagation(); doApply(); };
      item.onclick = (e) => {
        if (e.target === applyBtn) return;
        const lutData = _lutLib.buildLUTData(def.id);
        _makeGradientPreview(previewCanvas, lutData);
        previewBar.style.display = 'flex';
        previewName.textContent = def.name;
      };
    }
  }

  buildCatButtons();
  buildList();

  searchEl.oninput = () => {
    _searchQuery = searchEl.value;
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => buildList(), 150);
  };

  const strSlider = panel.querySelector('#lutLibStrength');
  const strVal = panel.querySelector('#lutLibStrengthVal');
  strSlider.oninput = () => {
    const v = parseFloat(strSlider.value);
    strVal.textContent = Math.round(v * 100) + '%';
    _lutGrading.setLUTStrength(v);
  };

  panel.querySelector('#lutLibClear').onclick = () => {
    _lutGrading.clearLUT?.();
    state.perf.lutCurrentId = null;
    state.perf.lutEnabled = false;
    buildList();
  };

  panel.querySelector('#lutLibClose').onclick = () => closePanel();

  panel.querySelector('#lutLibEditor1D').onclick = async () => {
    const { toggleLUT1DEditor } = await import('./lut-1d-editor.js');
    toggleLUT1DEditor();
  };

  panel.querySelector('#lutLibImport').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.cube';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      await _lutGrading.loadLUTFromFile(file);
      state.perf.lutCurrentId = null;
      buildList();
    };
    input.click();
  };

  _makeDraggable(panel, panel.querySelector('#lutLibHeader'));
}

function _makeDraggable(el, handle) {
  let ox = 0, oy = 0, sx = 0, sy = 0;
  handle.addEventListener('mousedown', e => {
    sx = e.clientX; sy = e.clientY;
    ox = el.offsetLeft; oy = el.offsetTop;
    const mm = (e2) => {
      el.style.left = (ox + e2.clientX - sx) + 'px';
      el.style.top = (oy + e2.clientY - sy) + 'px';
      el.style.right = 'auto';
    };
    const mu = () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
  });
}

export async function initLUTLibPanel() {
  await _ensureModules();
}

export async function openPanel() {
  await _ensureModules();
  if (!_isOpen) {
    _createPanel();
    _isOpen = true;
  }
}

export function closePanel() {
  if (_panelEl) { _panelEl.remove(); _panelEl = null; }
  _isOpen = false;
}

export async function togglePanel() {
  await _ensureModules();
  if (_isOpen) closePanel();
  else await openPanel();
}
