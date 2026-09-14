// src/ui/degolf-modal.js — §2/§5 ROADMAP-GOLF.md
//
// UI controller for the "Dégolf" preview/confirm modal: shows the current
// editor code side-by-side with `expandGLSL()`'s readable reconstruction,
// and only writes it into the editor if the user explicitly confirms —
// mirrors the ShaderToy import flow's fetch-then-confirm pattern
// (src/io/shadertoy.js: doSTImport() stashes a pending result, only
// `_stConfirmImport()` calls `state.editor.setValue()`), per the decision
// recorded in ROADMAP-GOLF.md §5 that dégolf mutates the editor directly
// (relying on the existing undo stack) rather than only offering a
// download.

import { state } from '../core/state.js';
import { expandGLSL, whenExpandReady } from '../shader/glsl-expand.js';
import { applyAndParse, toast, openModalDialog, closeModalDialog } from '../io/actions.js';
import { pushHistory } from '../io/history.js';

let _pending = null; // { code } — the dégolfed result, set once preview succeeds

async function openDegolfModal() {
  if (!state.editor) return;
  const before = state.editor.getValue();
  const beforeEl = document.getElementById('degolfBefore');
  const afterEl = document.getElementById('degolfAfter');
  const warnEl = document.getElementById('degolfWarnings');
  const confirmBtn = document.getElementById('degolfConfirmBtn');
  if (!beforeEl || !afterEl) return;

  beforeEl.textContent = before;
  afterEl.textContent = 'Analyzing…';
  if (warnEl) warnEl.hidden = true;
  if (confirmBtn) confirmBtn.disabled = true;
  _pending = null;

  openModalDialog('degolfModal', '.modal-btn');

  // The AST parser package loads lazily (see glsl-expand.js) — wait for it
  // rather than risk a first-call fallback-only result right after a cold
  // app start, which would silently offer a formatting-only preview.
  await whenExpandReady();
  const { code, warnings } = expandGLSL(before);

  if (afterEl.isConnected === false) return; // modal was closed/torn down meanwhile
  afterEl.textContent = code;
  _pending = { code };
  if (confirmBtn) confirmBtn.disabled = false;

  if (warnEl) {
    if (warnings.length > 0) {
      warnEl.textContent = warnings.join(' ');
      warnEl.hidden = false;
    } else {
      warnEl.hidden = true;
    }
  }
}

function closeDegolfModal() {
  _pending = null;
  closeModalDialog('degolfModal');
}

function confirmDegolf() {
  if (!_pending || !state.editor) return;
  const { code } = _pending;
  pushHistory(state.editor.getValue() !== '' ? 'Before dégolf' : null, state.editor.getValue());
  state.editor.setValue(code);
  _pending = null;
  closeModalDialog('degolfModal');
  setTimeout(applyAndParse, 80);
  toast('Dégolfed code applied', 'ok');
}

export { openDegolfModal, closeDegolfModal, confirmDegolf };
