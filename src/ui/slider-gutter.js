// Phase Y roadmap UI/UX — Gutter annotations for sliders
//
// Adds a small accent-colored "·" in the Monaco glyph margin on every line
// that has an associated slider, so the link between code and sidebar is
// visible at a glance without hovering. Hooks into the existing (previously
// unused) state.callbacks.onBuildUI slot, refreshed on every parse.

import * as monaco from 'monaco-editor';
import { state } from '../core/state.js';
import { esc } from '../core/utils.js';

let _decoIds = [];
let _styleInjected = false;

function _injectStyle() {
  if (_styleInjected) return;
  _styleInjected = true;
  const s = document.createElement('style');
  s.id = 'zgl-slider-gutter-style';
  s.textContent = `
    .zgl-slider-gutter-dot::before {
      content: '·';
      color: var(--accent, #39FF6A);
      font-size: 20px;
      line-height: 1;
      display: inline-block;
      width: 100%;
      text-align: center;
    }
  `;
  document.head.appendChild(s);
}

function _refreshGutterDots(entries) {
  if (!state.editor) return;
  _injectStyle();
  const decos = (entries || [])
    .filter(e => Number.isFinite(e.line))
    .map(e => ({
      range: new monaco.Range(e.line + 1, 1, e.line + 1, 1),
      options: {
        glyphMarginClassName: 'zgl-slider-gutter-dot',
        glyphMarginHoverMessage: { value: `Slider: **${esc(e.label)}**` },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    }));
  _decoIds = state.editor.deltaDecorations(_decoIds, decos);
}

export function initSliderGutterDots() {
  const prev = state.callbacks.onBuildUI;
  state.callbacks.onBuildUI = (entries) => {
    if (typeof prev === 'function') prev(entries);
    _refreshGutterDots(entries);
  };
}
