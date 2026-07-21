/**
 * shader-doc-panel.js — Phase 19.4
 * F1 documentation panel: full-page doc viewer for GLSL builtins.
 * - Opens on F1 with word-under-cursor lookup
 * - Search across GLSL docs
 * - Markdown rendering (signatures, description, examples, see-also links)
 * - Keyboard navigation (Escape to close, click see-also to navigate)
 */

import { GLSL_DOCS, glslFormatPage } from '../shader/glsl-docs-db.js';

let _overlay = null;
let _isOpen  = false;

// ── Search index ──────────────────────────────────────────────────────────────

const _index = (() => {
  const entries = [];
  for (const [k, v] of Object.entries(GLSL_DOCS)) entries.push({ lang: 'glsl', name: k, entry: v });
  return entries;
})();

function _search(query) {
  const q = query.toLowerCase().trim();
  if (!q) return _index.slice(0, 60);
  const words = q.split(/\s+/);
  return _index.filter(e => {
    const text = [e.name, e.entry.desc || '', e.entry.version || '', ...(e.entry.see || [])].join(' ').toLowerCase();
    return words.every(w => text.includes(w));
  }).slice(0, 80);
}

function _lookupWord(word) {
  if (GLSL_DOCS[word]) return { lang: 'glsl', name: word, entry: GLSL_DOCS[word] };
  return null;
}

// ── Markdown → HTML (minimal, no deps) ───────────────────────────────────────

function _md(text) {
  if (!text) return '';
  // Code fences
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre class="sdp-code sdp-code-${lang || 'plain'}"><code>${_esc(code.trim())}</code></pre>`
  );
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code class="sdp-inline">$1</code>');
  // Bold
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Headings
  text = text.replace(/^## (.+)$/gm, '<h2 class="sdp-h2">$1</h2>');
  text = text.replace(/^### (.+)$/gm, '<h3 class="sdp-h3">$1</h3>');
  // Blockquote
  text = text.replace(/^> (.+)$/gm, '<div class="sdp-version">$1</div>');
  // Newlines → br (outside blocks)
  text = text.replace(/\n\n/g, '</p><p class="sdp-p">');
  return '<p class="sdp-p">' + text + '</p>';
}

function _esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Panel HTML ────────────────────────────────────────────────────────────────

const CSS = `
#sdpOverlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(2px);
  z-index: 320;
  display: flex; align-items: center; justify-content: center;
}
#sdpPanel {
  background: #13141f; border: 1px solid #2a2d45;
  border-radius: 12px; box-shadow: 0 24px 80px rgba(0,0,0,0.8);
  width: min(900px, 96vw); height: min(80vh, 800px);
  display: flex; flex-direction: column;
  font-family: system-ui, sans-serif; color: #ccc;
  overflow: hidden;
}
#sdpHeader {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; background: #1a1b2e;
  border-bottom: 1px solid #2a2d45; flex-shrink: 0;
}
#sdpTitle { font-weight: 700; font-size: 14px; color: #aaa; flex-shrink: 0; }
#sdpSearch {
  flex: 1; background: #22243a; border: 1px solid #333655;
  border-radius: 6px; padding: 5px 10px; font-size: 12px; color: #ddd;
  outline: none;
}
#sdpSearch:focus { border-color: #5566cc; }
#sdpClose {
  background: none; border: none; color: #666; font-size: 18px;
  cursor: pointer; padding: 0 4px; flex-shrink: 0;
}
#sdpClose:hover { color: #ccc; }
#sdpBody { display: flex; flex: 1; overflow: hidden; }
#sdpList {
  width: 220px; flex-shrink: 0; overflow-y: auto;
  border-right: 1px solid #1e2030; padding: 6px;
}
#sdpList::-webkit-scrollbar { width: 4px; }
#sdpList::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
.sdp-list-item {
  padding: 5px 8px; border-radius: 5px; cursor: pointer; font-size: 11px;
  display: flex; align-items: center; gap: 6px;
}
.sdp-list-item:hover { background: rgba(255,255,255,0.05); }
.sdp-list-item.active { background: #1e2248; color: #aabbff; }
.sdp-lang-tag {
  font-size: 9px; padding: 1px 4px; border-radius: 3px;
  flex-shrink: 0; font-weight: 600; letter-spacing: 0.3px;
}
.sdp-lang-tag-glsl { background: #1a3a1a; color: #66cc66; }
.sdp-list-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#sdpDetail {
  flex: 1; overflow-y: auto; padding: 20px 24px;
  font-size: 13px; line-height: 1.6;
}
#sdpDetail::-webkit-scrollbar { width: 5px; }
#sdpDetail::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
#sdpEmpty { color: #555; text-align: center; padding: 60px 20px; }
#sdpEmpty .sdp-hint { font-size: 11px; color: #444; margin-top: 8px; }
.sdp-h2 { color: #ccd6f6; font-size: 20px; margin: 0 0 4px; font-weight: 700; }
.sdp-h3 { color: #aabbd4; font-size: 14px; margin: 16px 0 6px; font-weight: 600;
  padding-top: 12px; border-top: 1px solid #1e2030; }
.sdp-version {
  display: inline-block; background: #1e2838; color: #7799bb;
  border-left: 3px solid #3355aa; padding: 3px 10px; border-radius: 0 4px 4px 0;
  font-size: 11px; margin-bottom: 8px;
}
.sdp-code {
  background: #0d0f1a; border: 1px solid #222440; border-radius: 6px;
  padding: 12px 16px; overflow-x: auto; font-size: 12px; line-height: 1.5;
  margin: 8px 0;
}
.sdp-code code { font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; color: #c0d0f0; }
.sdp-code-glsl code { color: #aaccaa; }
.sdp-inline {
  background: #1a1c30; border: 1px solid #2a2d45; border-radius: 3px;
  padding: 1px 5px; font-family: Consolas, monospace; font-size: 12px; color: #99ccbb;
}
.sdp-p { margin: 0 0 8px; }
.sdp-p:last-child { margin-bottom: 0; }
.sdp-see-link {
  color: #7799dd; cursor: pointer; text-decoration: none;
  background: #1a1f38; border: 1px solid #2a2f50; border-radius: 3px;
  padding: 1px 6px; font-size: 11px; display: inline-block; margin: 2px;
}
.sdp-see-link:hover { color: #aabbff; border-color: #5566cc; }
.sdp-result-count { font-size: 10px; color: #444; padding: 4px 8px; }
`;

function _buildPanel() {
  const overlay = document.createElement('div');
  overlay.id = 'sdpOverlay';
  overlay.innerHTML = `
    <style>${CSS}</style>
    <div id="sdpPanel" role="dialog" aria-modal="true" aria-label="Shader Documentation">
      <div id="sdpHeader">
        <span id="sdpTitle">📖 Shader Docs</span>
        <input id="sdpSearch" type="search" placeholder="Search GLSL functions…" autocomplete="off" spellcheck="false">
        <button id="sdpClose" aria-label="Close documentation">✕</button>
      </div>
      <div id="sdpBody">
        <div id="sdpList"></div>
        <div id="sdpDetail">
          <div id="sdpEmpty">
            <div>Start typing to search, or hover a builtin in the editor and press <strong>F1</strong></div>
            <div class="sdp-hint">GLSL ES 1.00 / 3.00 / 4.60</div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  _overlay = overlay;

  const searchEl  = overlay.querySelector('#sdpSearch');
  const listEl    = overlay.querySelector('#sdpList');
  const detailEl  = overlay.querySelector('#sdpDetail');
  const emptyEl   = overlay.querySelector('#sdpEmpty');
  let _selected   = null;

  function _renderList(query) {
    const results = _search(query);
    listEl.innerHTML = '';
    const count = document.createElement('div');
    count.className = 'sdp-result-count';
    count.textContent = `${results.length} result${results.length !== 1 ? 's' : ''}`;
    listEl.appendChild(count);

    for (const r of results) {
      const item = document.createElement('div');
      item.className = 'sdp-list-item' + (r === _selected ? ' active' : '');
      item.dataset.name = r.name;
      item.dataset.lang = r.lang;
      const tag = document.createElement('span');
      tag.className = `sdp-lang-tag sdp-lang-tag-${r.lang}`;
      tag.textContent = 'GLSL';
      const name = document.createElement('span');
      name.className = 'sdp-list-name';
      name.textContent = r.name;
      item.appendChild(tag);
      item.appendChild(name);
      item.addEventListener('click', () => _showEntry(r));
      listEl.appendChild(item);
    }

    if (!results.length) {
      const noRes = document.createElement('div');
      noRes.style.cssText = 'color:#444;font-size:11px;padding:12px 8px;text-align:center;';
      noRes.textContent = 'No results';
      listEl.appendChild(noRes);
    }
  }

  function _showEntry(r) {
    _selected = r;
    // Update list selection
    listEl.querySelectorAll('.sdp-list-item').forEach(el => {
      el.classList.toggle('active', el.dataset.name === r.name && el.dataset.lang === r.lang);
    });

    // Format page
    const md = glslFormatPage(r.name, r.entry);
    const html = _md(md);

    detailEl.innerHTML = `<div id="sdpContent">${html}</div>`;
    emptyEl && (emptyEl.style.display = 'none');

    // Wire see-also links
    detailEl.querySelectorAll('.sdp-see-link').forEach(link => {
      link.addEventListener('click', () => {
        const word = link.dataset.word;
        const result = _lookupWord(word);
        if (result) _showEntry(result);
      });
    });

    // Post-process: convert see-also inline code into clickable links
    const contentEl = detailEl.querySelector('#sdpContent');
    if (contentEl && r.entry.see?.length) {
      const seeSection = contentEl.querySelector('.sdp-p:last-child');
      if (seeSection) {
        const codeEls = seeSection.querySelectorAll('code.sdp-inline');
        codeEls.forEach(c => {
          const word = c.textContent;
          const hasEntry = GLSL_DOCS[word];
          if (hasEntry) {
            const link = document.createElement('span');
            link.className = 'sdp-see-link';
            link.dataset.word = word;
            link.textContent = word;
            link.addEventListener('click', () => {
              const result = _lookupWord(word);
              if (result) _showEntry(result);
            });
            c.replaceWith(link);
          }
        });
      }
    }
  }

  // Public API stored on overlay
  overlay._showWord = (word) => {
    if (word) {
      searchEl.value = word;
      const result = _lookupWord(word);
      if (result) {
        _renderList(word);
        _showEntry(result);
      } else {
        _renderList(word);
      }
    } else {
      _renderList('');
    }
  };

  overlay._focusSearch = () => {
    setTimeout(() => searchEl.focus(), 50);
  };

  searchEl.addEventListener('input', () => _renderList(searchEl.value));
  searchEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeShaderDocPanel();
    if (e.key === 'ArrowDown') {
      const first = listEl.querySelector('.sdp-list-item');
      if (first) first.focus();
    }
  });

  overlay.querySelector('#sdpClose').addEventListener('click', closeShaderDocPanel);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeShaderDocPanel(); });
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') closeShaderDocPanel(); });

  _renderList('');
}

// ── Public API ────────────────────────────────────────────────────────────────

export function openShaderDocPanel(word) {
  if (!_overlay) _buildPanel();
  _overlay.style.display = 'flex';
  _isOpen = true;
  _overlay._showWord(word);
  _overlay._focusSearch();
}

export function closeShaderDocPanel() {
  if (_overlay) _overlay.style.display = 'none';
  _isOpen = false;
}

export function toggleShaderDocPanel(word) {
  if (_isOpen && !word) closeShaderDocPanel();
  else openShaderDocPanel(word);
}

export function isShaderDocOpen() { return _isOpen; }

/**
 * Register F1 key binding in Monaco for the GLSL language.
 */
export function registerF1DocAction(monaco, editor, lang) {
  editor.addAction({
    id:    `z-gl.doc-f1-${lang}`,
    label: `Show Documentation (${lang.toUpperCase()})`,
    keybindings: [monaco.KeyCode.F1],
    run: (ed) => {
      const pos  = ed.getPosition();
      const word = ed.getModel()?.getWordAtPosition(pos)?.word ?? '';
      openShaderDocPanel(word || '');
    },
  });
}

/**
 * Convenience: look up a word in the GLSL docs and return the entry,
 * or null if not found.
 */
export function lookupDoc(word) {
  return _lookupWord(word);
}
