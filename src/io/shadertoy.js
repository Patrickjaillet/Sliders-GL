import { state, notify } from '../core/state.js';
import { toast, openModalDialog, closeModalDialog, applyAndParse } from './actions.js';
import { safeLocalGet, safeLocalSet } from '../core/utils.js';
import { pushHistory } from './history.js';
import { clearSliderCustomizations } from '../ui/slider-customizations.js';
import { chGenProcTex, defaultProcTexParams } from '../channels/channels-proc-tex.js';

// ── Security helpers ──────────────────────────────────────────────────────────
/**
 * Minimal HTML escaper used to sanitise external data before innerHTML injection.
 * (Mirrors the project-wide esc() from slider.js but kept local to avoid a
 * circular-import on the io layer.)
 */
function escHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeShaderToyNoteValue(value, fallback = '') {
  const source = value || fallback;
  return String(source).replace(/[\r\n]+/g, ' ').slice(0, 100);
}

// Built-in ShaderToy texture stubs (common ones).
// Maps ShaderToy channel "src" patterns → placeholder colour (RGBA)
const ST_TEX_MAP = {
  '/media/a/': [128,128,128,255],   // various abstract textures → grey
  'noise':     [80,80,80,255],
  'organic':   [60,100,80,255],
  'wood':      [120,80,40,255],
  'rock':      [100,90,80,255],
  'font':      [255,255,255,255],
  'keyboard':  [0,0,0,255],
};

// ShaderToy built-in textures tex00–tex20 → description Z-GL lisible
// Source: https://www.shadertoy.com/howto (channel presets)
const ST_BUILTIN_TEX = {
  'tex00': 'Abstract (512×512 RGBA)',
  'tex01': 'Noise (256×256 RGBA LUT)',
  'tex02': 'Stone wall (512×512)',
  'tex03': 'Organic / cells (512×512)',
  'tex04': 'Wood rings (512×512)',
  'tex05': 'Rock / cliff (512×512)',
  'tex06': 'Pebbles (512×512)',
  'tex07': 'Rusted metal (512×512)',
  'tex08': 'Abstract paint (512×512)',
  'tex09': 'Paper (512×512)',
  'tex10': 'Nyan cat (256×256 RGBA)',
  'tex11': 'Abstract neon (256×256)',
  'tex12': 'Font atlas (1024×64 RGBA)',
  'tex14': 'Bayer dithering (256×256)',
  'tex15': 'RGBA noise (256×256)',
  'tex16': 'Grayscale noise small (64×64)',
  'tex17': 'Abstract (512×512)',
  'tex18': 'Gray noise medium (256×256)',
  'tex19': 'Gray noise large (512×512)',
  'tex20': 'Abstract tile (512×512)',
};

// F-9.5 — maps ShaderToy texXX IDs to proc-tex equivalents auto-configured on import
const SHADERTOY_TEX_MAP = {
  'tex00': { type: 'iq_palette', params: {} },
  'tex01': { type: 'perlin',     params: { frequency: 4, octaves: 3 } },
  'tex02': { type: 'fbm',        params: { octaves: 1, lacunarity: 2 } },
  'tex06': { type: 'grid',       params: {} },
  'tex11': { type: 'worley',     params: {} },
  'tex14': { type: 'cellular',   params: {} },
  'tex15': { type: 'simplex',    params: { frequency: 6 } },
  'tex16': { type: 'curl',       params: {} },
  'tex18': { type: 'perlin',     params: { frequency: 2, octaves: 2 } },
  'tex19': { type: 'fbm',        params: { octaves: 5 } },
};

let _stLastCode = null; // store last imported code for "Open in ST"
const ST_PROXY_ENABLED_KEY = 'sl_stProxyEnabled';
const ST_PROXY_URL_KEY = 'sl_stProxyUrl';

function stStoreProxyEnabled(enabled) {
  safeLocalSet(ST_PROXY_ENABLED_KEY, enabled ? '1' : '0');
}

function stLoadProxyEnabled() {
  return safeLocalGet(ST_PROXY_ENABLED_KEY, '0') === '1';
}

function stStoreProxyUrl(value) {
  safeLocalSet(ST_PROXY_URL_KEY, value || '');
}

function stLoadProxyUrl() {
  return safeLocalGet(ST_PROXY_URL_KEY, '');
}

function normalizeProxyUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('/')) return s;
  try {
    const u = new URL(s);
    if (!/^https?:$/i.test(u.protocol)) return '';
    return u.toString();
  } catch {
    return '';
  }
}

function stStoreApiKey(value) {
  safeLocalSet('sl_stKey', value || '');
}

function stLoadApiKey() {
  return safeLocalGet('sl_stKey', '');
}

function openSTModal() {
  const modal = document.getElementById('stModal');
  if (!modal) return;
  // Restore saved API key
  const savedKey = stLoadApiKey();
  const useProxy = stLoadProxyEnabled();
  const proxyUrl = stLoadProxyUrl();
  document.getElementById('stApiKey').value = savedKey;
  const useProxyEl = document.getElementById('stUseProxy');
  const proxyUrlEl = document.getElementById('stProxyUrl');
  if (useProxyEl) useProxyEl.checked = useProxy;
  if (proxyUrlEl) proxyUrlEl.value = proxyUrl;
  // Security notice: warn user if a key is already stored
  const noticeEl = document.getElementById('stKeyNotice');
  if (noticeEl) {
    if (useProxy && proxyUrl) {
      noticeEl.textContent = savedKey
        ? 'Proxy mode enabled: key is sent to your proxy endpoint (not directly to ShaderToy in URL query string). Keep using a dedicated key.'
        : 'Proxy mode enabled. Imports will use your proxy endpoint to avoid direct key-in-query requests to ShaderToy.';
    } else {
      noticeEl.textContent = savedKey
        ? '⚠ API key stored in localStorage (plaintext) and sent in URL query string (visible in network/server logs). Use a dedicated key.'
        : 'API key will be stored in localStorage and sent in URL query string (visible in network/server logs). Prefer a dedicated key.';
    }
    noticeEl.style.color = savedKey ? 'var(--ac4)' : 'var(--t3)';
  }
  document.getElementById('stShaderId').value = '';
  document.getElementById('stStatus').textContent = '';
  document.getElementById('stOpenBtn').style.display = 'none';
  _stLastCode = null;
  openModalDialog('stModal', '#stShaderId');
}

function closeSTModal() {
  closeModalDialog('stModal');
}

function stParseId(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?shadertoy\.com\/view\/([A-Za-z0-9]{6,8})(?:[/?#].*)?$/i)
    || s.match(/^([A-Za-z0-9]{6,8})$/);
  const id = m ? (m[1] || m[2]) : null;
  if (!id) {
    throw new Error('ID shader invalide — format attendu: XxXxXxXx ou shadertoy.com/view/XxXxXxXx');
  }
  return id;
}

function stStoreProxyUrlInput(value) {
  stStoreProxyUrl(String(value || '').trim());
}

function stSetUseProxyInput(value) {
  stStoreProxyEnabled(!!value);
}

async function doSTImport() {
  const apiKey = document.getElementById('stApiKey').value.trim();
  const rawId  = document.getElementById('stShaderId').value.trim();
  const useProxy = !!document.getElementById('stUseProxy')?.checked;
  const proxyUrlRaw = document.getElementById('stProxyUrl')?.value || '';
  const proxyUrl = normalizeProxyUrl(proxyUrlRaw);
  const statusEl = document.getElementById('stStatus');

  stStoreProxyEnabled(useProxy);
  stStoreProxyUrl(proxyUrlRaw.trim());

  if (!apiKey) { statusEl.textContent = '⚠ API key required'; statusEl.style.color = 'var(--ac4)'; return; }
  if (!rawId)  { statusEl.textContent = '⚠ Shader ID required'; statusEl.style.color = 'var(--ac4)'; return; }
  if (useProxy && !proxyUrl) {
    statusEl.textContent = '⚠ Proxy URL invalid (use /api/... or http(s)://...)';
    statusEl.style.color = 'var(--ac4)';
    return;
  }

  let shaderId;
  try {
    shaderId = stParseId(rawId);
  } catch (err) {
    statusEl.textContent = `⚠ ${err.message}`;
    statusEl.style.color = 'var(--ac4)';
    return;
  }
  statusEl.textContent = 'Fetching…'; statusEl.style.color = 'var(--t3)';
  document.getElementById('stImportBtn').disabled = true;

  try {
    let res;
    if (useProxy && proxyUrl) {
      // Proxy mode: send credentials to a trusted backend endpoint.
      // Expected contract: POST { shaderId, apiKey } and return ShaderToy JSON payload.
      res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shaderId, apiKey }),
      });
    } else {
      // Direct mode (API constraint): key must be in query string.
      const url = `https://www.shadertoy.com/api/v1/shaders/${shaderId}?key=${encodeURIComponent(apiKey)}`;
      res = await fetch(url);
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.Error) throw new Error(data.Error);

    const shader = data.Shader;
    const info   = shader.info;
    const passes = shader.renderpass;

    // Find the Image pass
    const imgPass = passes.find(p => p.type === 'image') || passes[0];
    if (!imgPass) throw new Error('No image pass found');

    // ── Detect all buffer passes (bufferA/B/C/D, sound, cubemapA) ──
    // ST pass types: 'image' | 'buffer' | 'sound' | 'cubemapA'
    // ST uses bufferA→bufferD; we map them to our internal 'bufA'→'bufD'
    const ST_BUF_PASS_ORDER = ['buffer']; // first 4 'buffer' passes → bufA…bufD
    const stBufPasses = []; // [{stPass, appId:'bufA'|'bufB'|'bufC'|'bufD'}]
    const APP_BUF_IDS = ['bufA', 'bufB', 'bufC', 'bufD'];
    let bufSlot = 0;
    // Sort passes: buffers first, then image, others last
    for (const pass of passes) {
      if (pass.type === 'buffer' && bufSlot < 4) {
        stBufPasses.push({ stPass: pass, appId: APP_BUF_IDS[bufSlot++] });
      }
    }

    // Build a lookup: ST pass name/id → appId (for channel wiring)
    // ShaderToy identifies buffer passes by their output name in inputs[].id
    // We use index order (first buffer pass → bufA, etc.)
    // Also map by pass.name field when present
    const stPassIdToAppId = new Map(); // ST renderpass output id → appId
    stBufPasses.forEach(({ stPass, appId }) => {
      if (stPass.outputs) {
        stPass.outputs.forEach(out => stPassIdToAppId.set(String(out.id), appId));
      }
      // Fallback: map by pass name
      if (stPass.name) stPassIdToAppId.set(stPass.name, appId);
    });

    // ── Channel resolver — used for each pass ──
    function resolvePassChannels(pass) {
      // Returns: { channelNotes: string[], cubemapChannels: number[], bufferChannelMap: Map<ch, appId> }
      const channelNotes = [];
      const cubemapChannels = [];
      const soundChannels = [];
      const bufferChannelMap = new Map(); // ch index → appId
      const procTexChannelMap = new Map(); // ch index → {type, params} — F-9.5
      (pass.inputs || []).forEach(inp => {
        const ch = inp.channel;
        const src = inp.src || '';
        const ctype = inp.ctype || 'texture';
        const safeSrc = sanitizeShaderToyNoteValue(src, ctype);
        if (ctype === 'buffer') {
          // Try to resolve which buffer pass feeds this channel
          // ST gives us inp.id which matches the output id of another pass
          const srcAppId = stPassIdToAppId.get(String(inp.id)) || null;
          if (srcAppId) {
            bufferChannelMap.set(ch, srcAppId);
            channelNotes.push(`// iChannel${ch}: BUFFER → ${srcAppId} (wired automatically)`);
          } else {
            // Unknown buffer mapping — fallback to black
            bufferChannelMap.set(ch, null);
            channelNotes.push(`// iChannel${ch}: BUFFER PASS (source unknown → vec4(0.))`);
          }
        } else if (ctype === 'cubemap') {
          cubemapChannels.push(ch);
          const cubeName = sanitizeShaderToyNoteValue(src || 'cubemap', '');
          channelNotes.push(`// iChannel${ch}: CUBEMAP [${cubeName}] → upload 6 faces in Channels panel (PX,NX,PY,NY,PZ,NZ)`);
        } else if (ctype === 'sound' || ctype === 'music') {
          soundChannels.push(ch);
          channelNotes.push(`// iChannel${ch}: SOUND [${safeSrc}] → use Mic/Audio FFT in Channels panel`);
        } else if (ctype === 'video') {
          channelNotes.push(`// iChannel${ch}: VIDEO [${safeSrc}] → upload video or use Webcam in Channels panel`);
        } else if (ctype === 'keyboard') {
          channelNotes.push(`// iChannel${ch}: KEYBOARD → set channel type to "keyboard" in the Channels panel`);
        } else {
          // Regular texture — try to identify built-in tex00–tex20 or pattern match
          let mapped = 'upload in Channels panel';
          let texDesc = '';
          const texMatch = src.match(/tex(\d{2})/);
          if (texMatch) {
            const texKey = `tex${texMatch[1]}`;
            texDesc = ST_BUILTIN_TEX[texKey] || `ShaderToy built-in ${texKey}`;
            mapped = texDesc;
            // F-9.5 — auto-map to proc-tex if known
            if (SHADERTOY_TEX_MAP[texKey]) {
              const m = SHADERTOY_TEX_MAP[texKey];
              procTexChannelMap.set(ch, { type: m.type, params: { ...defaultProcTexParams(m.type), ...m.params } });
              mapped += ' → proc-tex auto-configured';
            }
          } else {
            for (const [key] of Object.entries(ST_TEX_MAP)) {
              if (src.includes(key)) { mapped = key.split('/').filter(Boolean).pop() || 'grey'; break; }
            }
          }
          const samplerType = ctype === 'volume' ? 'sampler3D' : 'sampler2D';
          channelNotes.push(`// iChannel${ch} [${samplerType}]: ${safeSrc || ctype} — ${mapped}`);
        }
      });
      return { channelNotes, cubemapChannels, soundChannels, bufferChannelMap, procTexChannelMap };
    }

    // ── Process image pass ──
    let code = imgPass.code;
    const imgResolved = resolvePassChannels(imgPass);

    // Replace unresolvable buffer channels with black fallback in image pass code
    for (const [ch, appId] of imgResolved.bufferChannelMap) {
      if (!appId) {
        code = code.replace(
          new RegExp(`texture(?:2D)?\\s*\\(\\s*iChannel${ch}\\b[^)]*\\)`, 'g'),
          'vec4(0.0)'
        );
      }
    }

    // ── Crédits auteur + description en tête ──
    const authorLines = [];
    if (info.username) authorLines.push(`// Author  : ${sanitizeShaderToyNoteValue(info.username)}`);
    if (info.name)     authorLines.push(`// Title   : ${sanitizeShaderToyNoteValue(info.name)}`);
    if (info.date)     authorLines.push(`// Date    : ${sanitizeShaderToyNoteValue(String(info.date))}`);
    const stTags = Array.isArray(info.tags) ? info.tags.map(t => sanitizeShaderToyNoteValue(t)).join(', ') : '';
    if (stTags) authorLines.push(`// Tags    : ${stTags}`);
    if (info.description) {
      const desc = sanitizeShaderToyNoteValue(info.description).slice(0, 200);
      authorLines.push(`// Info    : ${desc}${info.description.length > 200 ? '…' : ''}`);
    }
    authorLines.push(`// Source  : https://www.shadertoy.com/view/${shaderId}`);
    const creditsBlock = `// ═══════════════════════════════════════════════════\n${authorLines.join('\n')}\n// ═══════════════════════════════════════════════════\n`;

    // Build channel header comment for image pass
    let channelBlock = '';
    if (imgResolved.channelNotes.length > 0) {
      const hasUnresolved = [...imgResolved.bufferChannelMap.values()].some(v => v === null);
      const warnLine = hasUnresolved
        ? `// ⚠ Some buffer channels unresolved → replaced with vec4(0.)\n`
        : (imgResolved.cubemapChannels.length ? `// ⚠ Cubemap channel(s) need manual upload in Channels panel\n` : '');
      channelBlock = `// === ShaderToy channels ===\n${imgResolved.channelNotes.join('\n')}\n${warnLine}// ===========================\n`;
    }

    code = creditsBlock + (channelBlock ? '\n' + channelBlock : '') + '\n' + code;

    _stLastCode = code;
    const title = escHTML(info.name || shaderId);

    // ── Thumbnail preview dans le modal ──
    _stShowThumbnail(shaderId, info);

    // ── Wire up buffer passes via multipass callback ──
    if (stBufPasses.length > 0 && state.callbacks.stImportMultipass) {
      // Build multipass import descriptor
      const mpDescriptor = {
        imagCode: code,
        imageChannelMap: imgResolved.bufferChannelMap, // Map<chIdx, appId|null>
        buffers: stBufPasses.map(({ stPass, appId }) => {
          const resolved = resolvePassChannels(stPass);
          // Patch buffer pass code: replace unresolvable buffer channels
          let bufCode = stPass.code || '';
          for (const [ch, srcAppId] of resolved.bufferChannelMap) {
            if (!srcAppId) {
              bufCode = bufCode.replace(
                new RegExp(`texture(?:2D)?\\s*\\(\\s*iChannel${ch}\\b[^)]*\\)`, 'g'),
                'vec4(0.0)'
              );
            }
          }
          if (resolved.channelNotes.length > 0) {
            bufCode = `// === ShaderToy channels (${appId}) ===\n${resolved.channelNotes.join('\n')}\n// ===========================\n\n${bufCode}`;
          }
          return {
            appId,             // 'bufA'|'bufB'|'bufC'|'bufD'
            code: bufCode,
            channelMap: resolved.bufferChannelMap, // Map<chIdx, appId|null>
          };
        }),
      };

      // Load into editor first (image pass)
      if (state.editor) {
        pushHistory(state.editor.getValue() !== '' ? 'Before ST import' : null, state.editor.getValue());
        state.editor.setValue(code);
        state.pinnedIds.clear();
        notify('pinnedIds', state.pinnedIds);
        clearSliderCustomizations();
      }

      // Delegate multipass wiring to render layer
      state.callbacks.stImportMultipass(mpDescriptor);
      // F-9.5 — auto-configure proc-tex for image pass texture channels
      if (imgResolved.procTexChannelMap.size > 0) {
        setTimeout(() => {
          for (const [ch, { type, params }] of imgResolved.procTexChannelMap) {
            if (ch >= 0 && ch < state.channels.length) chGenProcTex(ch, type, params);
          }
          state.callbacks.renderChannelUI?.(-1);
        }, 300);
      }
    } else {
      // Single-pass import (no buffer passes)
      if (state.editor) {
        pushHistory(state.editor.getValue() !== '' ? 'Before ST import' : null, state.editor.getValue());
        state.editor.setValue(code);
        state.pinnedIds.clear();
        notify('pinnedIds', state.pinnedIds);
        clearSliderCustomizations();
      }
      setTimeout(applyAndParse, 80);
      // F-9.5 — auto-configure proc-tex channels for recognised ST textures
      if (imgResolved.procTexChannelMap.size > 0) {
        setTimeout(() => {
          for (const [ch, { type, params }] of imgResolved.procTexChannelMap) {
            if (ch >= 0 && ch < state.channels.length) chGenProcTex(ch, type, params);
          }
          state.callbacks.renderChannelUI?.(-1);
        }, 200);
      }
    }

    // Summary note
    const multipassNote = stBufPasses.length
      ? ` (${stBufPasses.length} buffer pass${stBufPasses.length > 1 ? 'es' : ''} wired)`
      : '';
    const cubemapNote = imgResolved.cubemapChannels.length
      ? ` + ${imgResolved.cubemapChannels.length} cubemap channel${imgResolved.cubemapChannels.length > 1 ? 's' : ''}`
      : '';
    const summaryNote = multipassNote + cubemapNote;

    statusEl.textContent = `✓ Imported "${title}"${summaryNote}`;
    statusEl.style.color = 'var(--ac3)';
    document.getElementById('stOpenBtn').style.display = '';
    document.getElementById('stOpenBtn').onclick = () => window.open(`https://www.shadertoy.com/view/${shaderId}`, '_blank');

    toast(`Imported: ${title}${summaryNote}`, 'ok');
    setTimeout(closeSTModal, 1500);
  } catch(err) {
    statusEl.textContent = `✗ ${err.message}`;
    statusEl.style.color = '#ff8080';
  } finally {
    document.getElementById('stImportBtn').disabled = false;
  }
}

function stOpenInST() {
  // If we have the shader ID currently in the input, open it
  const rawId = document.getElementById('stShaderId').value.trim();
  if (!rawId) return;
  try {
    const shaderId = stParseId(rawId);
    window.open(`https://www.shadertoy.com/view/${shaderId}`, '_blank');
  } catch (err) {
    toast(err.message, 'warn');
  }
}

// "Open in ShaderToy" from header (current shader, if it looks like mainImage)
function openCurrentInST() {
  if (!state.editor) {
    console.warn('openCurrentInST called before editor is ready');
    return;
  }
  const code = state.editor.getValue();
  if (!/void\s+mainImage/.test(code)) {
    toast('Shader must use mainImage() for ShaderToy', 'warn');
    return;
  }
  // Encode as data URI for Shadertoy's "new" page paste flow isn't possible via URL,
  // so we just open shadertoy.com/new and copy to clipboard
  navigator.clipboard?.writeText(code).catch(()=>{});
  window.open('https://www.shadertoy.com/new', '_blank');
  toast('Code copied — paste in ShaderToy editor', 'ok');
}

// ── Aperçu thumbnail ShaderToy dans le modal ─────────────────────────────────

function _stShowThumbnail(shaderId, info) {
  const statusEl = document.getElementById('stStatus');
  if (!statusEl) return;

  let thumbEl = document.getElementById('stThumb');
  if (!thumbEl) {
    thumbEl = document.createElement('div');
    thumbEl.id = 'stThumb';
    thumbEl.style.cssText = 'margin-top:10px;text-align:center;';
    statusEl.parentNode.insertBefore(thumbEl, statusEl.nextSibling);
    if (!document.getElementById('stThumbStyle')) {
      const s = document.createElement('style');
      s.id = 'stThumbStyle';
      s.textContent = `
        #stThumb img { max-width:100%;border-radius:4px;border:1px solid var(--border,#2a2d32);margin-top:4px; }
        #stThumb .st-meta { font-size:10px;color:var(--t3,#666);margin-top:4px;line-height:1.4; }
      `;
      document.head.appendChild(s);
    }
  }

  const thumbnailUrl = `https://www.shadertoy.com/media/shaders/${shaderId}.jpg`;
  const likes = info.likes ?? 0;
  const views = info.viewed ?? 0;
  const tagsHtml = Array.isArray(info.tags) && info.tags.length
    ? `<div class="st-meta">Tags: ${info.tags.slice(0, 6).map(t => escHTML(t)).join(', ')}</div>`
    : '';

  thumbEl.innerHTML = `
    <img src="${thumbnailUrl}" alt="Shader preview" loading="lazy"
         onerror="this.style.display='none'" crossorigin="anonymous">
    <div class="st-meta">By <strong>${escHTML(info.username || 'unknown')}</strong>
      · ♥ ${likes} · 👁 ${views}</div>
    ${tagsHtml}
  `;
}

export {
  ST_TEX_MAP,
  ST_BUILTIN_TEX,
  _stLastCode,
  stStoreApiKey,
  stLoadApiKey,
  openSTModal,
  closeSTModal,
  stParseId,
  doSTImport,
  stOpenInST,
  openCurrentInST,
  stStoreProxyUrlInput,
  stSetUseProxyInput,
};
