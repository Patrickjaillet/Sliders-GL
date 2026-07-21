/**
 * src/import/local-file-import.js
 *
 * Import de fichiers locaux — drag & drop, import ZIP Shadertoy.
 * 100 % offline, zéro réseau, zéro dépendance externe.
 *
 * ── Fonctionnalités ─────────────────────────────────────────────────────────
 *
 *  1. Drag & drop de fichiers shader dans la fenêtre du navigateur / Tauri
 *     Extensions reconnues : .glsl .frag .vert .json
 *
 *  2. Import depuis une archive ZIP locale contenant un projet Shadertoy exporté
 *     Format attendu : zip contenant image.glsl (ou *.glsl) + éventuellement
 *     bufA/bufB/bufC/bufD + info.json (métadonnées Shadertoy).
 *
 * ── API publique ─────────────────────────────────────────────────────────────
 *
 *  initBrowserFileDrop(dropTarget?)   → void   — drop zone web (hors Tauri)
 *  openLocalFileDialog()              → void   — <input type="file"> natif web
 *  importZipFile(file)                → Promise<void>  — importer un .zip
 *  openZipFileDialog()                → void   — sélecteur .zip natif web
 *  applyShaderFile(text, fileName)    → void   — appliquer un fichier texte directement
 */

import { state } from '../core/state.js';
import { toast } from '../io/actions.js';
import { applyImportedPreset } from '../io/library.js';
import JSZip from 'jszip';

const SHADER_EXTS = new Set([
  'glsl', 'frag', 'vert',
]);

const ALL_EXTS = new Set([...SHADER_EXTS, 'json', 'zip']);

function _ext(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function _basename(name) {
  return name.replace(/\.[^.]+$/, '');
}

async function _readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(new Error(`Cannot read ${file.name}`));
    r.readAsText(file);
  });
}

async function _readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(new Error(`Cannot read ${file.name}`));
    r.readAsArrayBuffer(file);
  });
}

export function applyShaderFile(text, fileName) {
  const ext = _ext(fileName);

  if (ext === 'json') {
    let parsed;
    try { parsed = JSON.parse(text); } catch {
      toast('Fichier JSON invalide', 'err');
      return;
    }

    if (_isShadertoyJSON(parsed)) {
      _applyShadertoyJSON(parsed);
      return;
    }

    if (_isZGLPreset(parsed)) {
      applyImportedPreset(parsed);
      return;
    }

    toast('Format JSON non reconnu', 'warn');
    return;
  }

  if (SHADER_EXTS.has(ext)) {
    _applyRawShader(text, fileName);
    return;
  }

  toast(`Unsupported extension: .${ext}`, 'warn');
}

function _applyRawShader(src, fileName) {
  const { applyAndParse } = _lazyActions();
  if (state.editor) {
    state.editor.setValue(src);
    setTimeout(() => applyAndParse(), 80);
    toast(`Loaded: ${fileName}`, 'ok');
  } else {
    import('../gl/renderer.js').then(({ applyGLShader }) => {
      applyGLShader(src);
      toast(`Loaded: ${fileName}`, 'ok');
    });
  }
}

function _lazyActions() {
  const mod = /** @type {any} */ (import.meta._actionsCache);
  if (mod) return mod;
  return { applyAndParse: () => {
    import('../io/actions.js').then(({ applyAndParse }) => applyAndParse());
  }};
}

function _isShadertoyJSON(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    (obj.Shader || obj.info || obj.renderpass || obj.renderpasses)
  );
}

function _isZGLPreset(obj) {
  return obj && typeof obj === 'object' && (obj.code || obj.multipass) && obj.id;
}

function _applyShadertoyJSON(obj) {
  const shader = obj.Shader ?? obj;
  const renderpasses = shader.renderpass ?? shader.renderpasses ?? [];

  const image = renderpasses.find(p =>
    (p.type === 'image' || !p.type) && p.code
  );

  if (!image) {
    toast('No image pass found in Shadertoy JSON', 'warn');
    return;
  }

  const src = image.code;
  const name = shader.info?.name ?? 'shadertoy-import';

  const extraPasses = renderpasses.filter(p =>
    p.type && p.type !== 'image' && p.code
  );

  if (extraPasses.length > 0) {
    _applyMultipassShadertoy(image, extraPasses, name);
  } else {
    _applyRawShader(src, name + '.glsl');
  }
}

function _applyMultipassShadertoy(imagePasse, extraPasses, name) {
  import('../render/multipass.js').then(({ applyAndParseActive }) => {
    if (state.editor) {
      state.editor.setValue(imagePasse.code);
    }
    (/** @type {any} */ (applyAndParseActive()))?.then(() => {
      toast(
        `Shadertoy import "${name}" — ${extraPasses.length} additional pass(es) detected. Configure passes in the Multipass panel.`,
        'info'
      );
    });
  }).catch(() => {
    _applyRawShader(imagePasse.code, name + '.glsl');
  });
}

// ── ZIP Shadertoy ─────────────────────────────────────────────────────────────

const _SHADERTOY_PASS_NAMES = {
  'image.glsl': 'image',
  'bufa.glsl':  'bufA', 'buffer_a.glsl': 'bufA',
  'bufb.glsl':  'bufB', 'buffer_b.glsl': 'bufB',
  'bufc.glsl':  'bufC', 'buffer_c.glsl': 'bufC',
  'bufd.glsl':  'bufD', 'buffer_d.glsl': 'bufD',
  'common.glsl': 'common',
  'cubea.glsl': 'cubeA', 'cube_a.glsl': 'cubeA',
  'sound.glsl': 'sound',
};

export async function importZipFile(file) {
  if (!file || _ext(file.name) !== 'zip') {
    toast('ZIP file required', 'err');
    return;
  }

  try {
    const buf = await _readFileAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(buf);
    await _processZipEntries(zip, file.name);
  } catch (err) {
    toast(`ZIP error: ${err.message}`, 'err');
  }
}

async function _processZipEntries(zip, zipName) {
  const entries = {};

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const baseLower = path.split('/').pop().toLowerCase();
    const ext = _ext(baseLower);

    if (SHADER_EXTS.has(ext) || ext === 'json') {
      entries[baseLower] = entry;
    }
  }

  if (Object.keys(entries).length === 0) {
    toast('No shader files found in ZIP archive', 'warn');
    return;
  }

  const infoEntry = entries['info.json'] ?? entries['shader.json'] ?? entries['project.json'];
  let meta = null;
  if (infoEntry) {
    try {
      const txt = await infoEntry.async('string');
      meta = JSON.parse(txt);
    } catch {}
  }

  if (meta && _isShadertoyJSON(meta)) {
    _applyShadertoyJSON(meta);
    const name = meta?.Shader?.info?.name ?? meta?.info?.name ?? _basename(zipName);
    toast(`ZIP Shadertoy imported: "${name}"`, 'ok');
    return;
  }

  const imageEntry = entries['image.glsl']
    ?? Object.entries(entries).find(([k, v]) => _ext(k) === 'glsl')?.[1];

  if (!imageEntry) {
    toast('No image.glsl file in the ZIP', 'warn');
    return;
  }

  const imageSrc = await imageEntry.async('string');
  const shaderPasses = {};

  for (const [baseLower, entry] of Object.entries(entries)) {
    const passName = _SHADERTOY_PASS_NAMES[baseLower];
    if (passName && baseLower !== 'image.glsl') {
      shaderPasses[passName] = await entry.async('string');
    }
  }

  const name = meta?.name ?? _basename(zipName);

  if (Object.keys(shaderPasses).length > 0) {
    _applyMultipassShadertoy(
      { code: imageSrc },
      Object.entries(shaderPasses).map(([type, code]) => ({ type, code })),
      name
    );
  } else {
    _applyRawShader(imageSrc, name + '.glsl');
  }

  toast(`ZIP imported: "${name}"`, 'ok');
}

// ── Drop zone navigateur ──────────────────────────────────────────────────────

let _dropInitialized = false;
let _dropTarget = null;

export function initBrowserFileDrop(target = document.body) {
  if (_dropInitialized) return;
  _dropInitialized = true;
  _dropTarget = target;

  target.addEventListener('dragover', _onDragOver, false);
  target.addEventListener('dragleave', _onDragLeave, false);
  target.addEventListener('drop', _onDrop, false);
}

function _onDragOver(e) {
  const items = e.dataTransfer?.items;
  if (!items) return;
  const hasFile = Array.from(items).some(i => i.kind === 'file');
  if (!hasFile) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  document.body.classList.add('zgl-file-dragging');
}

function _onDragLeave(e) {
  if (e.relatedTarget && document.body.contains(e.relatedTarget)) return;
  document.body.classList.remove('zgl-file-dragging');
}

async function _onDrop(e) {
  document.body.classList.remove('zgl-file-dragging');
  const items = e.dataTransfer?.items;
  if (!items) return;

  const files = Array.from(items)
    .filter(i => i.kind === 'file')
    .map(i => i.getAsFile())
    .filter(Boolean);

  if (!files.length) return;

  const zipFile = files.find(f => _ext(f.name) === 'zip');
  if (zipFile) {
    e.preventDefault();
    await importZipFile(zipFile);
    return;
  }

  const shaderFile = files.find(f => ALL_EXTS.has(_ext(f.name)));
  if (!shaderFile) return;

  e.preventDefault();

  try {
    const text = await _readFileAsText(shaderFile);
    applyShaderFile(text, shaderFile.name);
  } catch (err) {
    toast(`Read failed: ${err.message}`, 'err');
  }
}

export function openLocalFileDialog() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.glsl,.frag,.vert,.json';
  input.style.display = 'none';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await _readFileAsText(file);
      applyShaderFile(text, file.name);
    } catch (err) {
      toast(`Read failed: ${err.message}`, 'err');
    }
    document.body.removeChild(input);
  };
  document.body.appendChild(input);
  input.click();
}

export function openZipFileDialog() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip';
  input.style.display = 'none';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    await importZipFile(file);
    document.body.removeChild(input);
  };
  document.body.appendChild(input);
  input.click();
}
