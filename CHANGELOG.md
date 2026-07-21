# Changelog — Z-GL Shadertoy

All notable changes to this project are documented in this file.

Copyright © 2026 SANDEFJORD DEVELOPMENT (Patrick JAILLET) — All rights reserved

---

## [2.13.0] — 2026-07-21

### Removed

- **Share links** — the "copy share link" toolbar button and its versioned multi-pass variant have been removed. Sharing a shader now happens through the existing export formats (standalone HTML, GLSL, Three.js snippet, etc.).
- **Crash reporting** — the opt-in "Help improve Z-GL" crash-report prompt and its underlying error-log forwarding have been removed.
- **Post-processing pipeline** — the entire post-process stack has been removed: bloom, tone mapping, vignette, CRT filter, FXAA, TAA, film grain, and LUT color grading, along with the FX Stack, Style Layers, Shape Mask, Color Remap, and color-blindness simulation features that were built on top of it. The renderer now always outputs the raw shader result.
- **Performance panel** — the "perf" toolbar button and its popup (frame budget, FPS cap, resolution, profiling, GPU capabilities) have been removed.
- **Tools menu** — the toolbar's "tools" overflow menu and its pinned-tools quick-access system have been removed, along with the features it exposed: pop-out viewport, the standalone shader-docs panel (F1 still opens the full Help Center), the workspace panel, the Ray Marching Assistant, SDF Visualizer, SDF Composer, presentation mode, and the local "open shader file" / "import ZIP" actions.
- **Preset library** — the preset-browsing drawer, its save/wizard dialogs, and its ShaderToy-import row have been removed. Loading presets programmatically (embed API) and importing local shader/preset files continue to work.
- **Layout presets** — the "layout" toolbar button, its built-in presets (Coder / Performer / Animator / Minimal), custom saved layouts, and the detach-panel-into-floating-window feature have been removed. Manual panel/inspector resizing and the Uniforms/Channels tab switcher are unaffected.

---

## [2.12.0] — 2026-07-21

### Phase 6 — Cleanup, tests, QA

#### Changed

- **Accessibility** — Fixed a keyboard/screen-reader issue introduced in Phase 3: the new slider field wrapped a real editable input inside an element that also announced itself as a slider, confusing assistive technology about which one to interact with. The input alone now carries the accessible name and value, and gained proper `min`/`max` so browsers and assistive tech understand its valid range. `Home`/`End` still jump to the minimum/maximum value.
- **Readability** — The code editor's own line-number and comment colors were leftovers from the app's old dark theme and were too faint to read comfortably; both are now clearly legible.
- **`ui.html`** — A small "TAA" label in the toolbar was rendered at reduced opacity on top of an already-muted color, making it hard to read; it now matches the rest of the toolbar.
- **`src/app/init.js`** — On first launch after this update, a handful of leftover settings from the old theme system (removed in Phase 1) are silently cleaned up instead of lingering unused.
- **`README.md`** — Fully rewritten in English (it was previously in French) and brought up to date: removed mentions of the modulation/macro system, the per-slider curve editor, render themes, and interface themes — all removed earlier in this redesign — and corrected the keyboard-shortcut list.

#### Verified

- Full automated test suite (424 tests) passing.
- Automated accessibility audit (axe-core) run against the app; only pre-existing, unrelated issues and deliberate, WCAG-compliant exceptions (disabled controls, footer copyright text) remain, documented in `ROADMAP.md`.
- The fixed 800×450 composition canvas confirmed stable across smaller, equal, and larger window sizes than the app's minimum layout width.

---

## [2.11.0] — 2026-07-21

### Phase 5 — Professional compositor–style skin on existing panels

#### Changed

- **Assets panel (left sidebar)** — Rows now alternate background shading, matching the classic "Assets panel" look of professional compositing software.
- **Properties panel (right inspector)** — Property groups (Frame budget, Renderer, Interface, Profiling, GPU Capabilities) are now collapsible: click a group's title to fold it away, same as the sidebar's category groups.
- **Code editor** — Removed a leftover, never-used light-mode branch in the code editor's theme handling; the editor has one single dark theme, consistent with the rest of the app.

#### Verified

- Toolbar buttons, panel tabs, and vertical separators already matched the intended flat, glow-free compositor style from earlier phases — audited and confirmed, no changes needed.

---

## [2.10.0] — 2026-07-21

### Phase 4 — Global readability: text and controls always visible

#### Changed

- Reviewed every low-contrast text color across the app and brightened labels, titles, and status readouts that were hard to read, while intentionally leaving genuinely disabled controls and empty-state hints dimmed (as expected).
- Fixed several places where a faint text color and a reduced opacity were stacked on top of each other, making the affected text nearly invisible (disabled buffer-pass tabs, context-menu icons, a status-bar separator).
- Raised the default panel-separator line from barely visible to a clearly visible hairline, and made major panel boundaries (title bar, inspector header, sidebar tabs, bottom status bar) crisper.
- Removed a leftover green glow effect on the FPS indicator (from the app's old theme) that didn't match the new flat, glow-free visual style.
- Reviewed the "Maximum contrast" accessibility option in Settings: kept it, since it still provides a meaningful boost for users who need it, on top of these baseline improvements.

#### Verified

- Full automated test suite (424 tests) passing.
- Visually reviewed the sidebar, a slider's right-click menu, and the Performance panel — all text is clearly legible.

---

## [2.9.0] — 2026-07-21

### Phase 3 — Simplified, professional compositor–style sliders

#### Changed

- **Sliders** — Redesigned every numeric slider as a single scrubbable field, in the style of professional compositing software: click and drag left/right on the value to change it (no small handle to aim for), click once to type an exact value, scroll the mouse wheel over it for a fine adjustment, and hold Shift/Ctrl while dragging for a finer/coarser step.
- **Removed features** — As decided for this redesign, the following advanced slider features have been fully removed: per-slider curve remapping, the modulation system (LFO, noise, audio-reactive, envelopes, sequencer, expressions) and its "Modulation" panel/tab, the macro-slider panel, and keyframe animation tracks with their editor. The "randomize sliders" button remains, as it is a simple one-time action rather than continuous modulation.
- Renaming, reordering, and pinning sliders, along with custom ranges, continue to work exactly as before.

---

## [2.8.0] — 2026-07-20

### Phase 2 — Fixed 800×450 viewport, compositor composition-monitor style

#### Changed

- **`src/style/layout.css`** — `#viewport-zone` is now a scrollable pasteboard (compositor-style dot grid, `overflow:auto`). `.cw#cwrap` is fixed at `800×450 px` (`flex-shrink:0; flex-grow:0`). `margin:auto 20px 20px` centres the monitor vertically when no editor panel sits below. `justify-content:center` removed from `#viewport-zone` (conflicted with `overflow:auto`); vertical centering is handled by `margin:auto` on `.cw` instead.
- **`src/style/layout.css`** — Code-focus thumbnail: fixed 200×112 px (exact 16:9 ratio at 800×450) positioned `absolute top:8px right:8px`. `canvas#glc` is visually scaled at 0.25× using CSS `transform` — the GL resolution is unchanged.
- **`src/style/layout.css`** — Added `.cw.scale-fit` support: when the pasteboard column is narrower than 840 px, JS sets `--cw-scale` and adds `.scale-fit` on `.cw#cwrap`; the GL canvas attribute stays 800×450 and no resize event is triggered.
- **`src/gl/renderer.js`** — Added `COMP_W = 800` / `COMP_H = 450` constants. `initGL` now initialises the renderer at exactly 800×450 with `setPixelRatio(1)`. `doResize()` always calls `setSize(800, 450, false)` in the `viewport` preset path and no longer reads any CSS dimensions from the DOM. `onWindowResize` now delegates to `doResize()`.
- **`src/gl/renderer.js`** — Adaptive-DPR PID loop disabled: pixel ratio is locked to 1. Window resize only repositions the pasteboard; it never affects the GL viewport size.
- **`src/render/resolution.js`** — `_getViewportSize()` always returns `[800, 450]`. The `viewport` preset now always targets the fixed composition resolution regardless of CSS layout or window size.
- **`src/ui/viewport.js`** — Added `initPasteboardObserver()`: a `ResizeObserver` on `#viewport-zone` that sets `--cw-scale` and toggles `.scale-fit` on `.cw#cwrap` when available width drops below 840 px.
- **`src/app/init.js`** — `initPasteboardObserver()` imported and called at startup alongside `initTimeScrubber()`.

---

## [2.7.0] — 2026-07-19

### Phase 1 — Full removal of the theming system

#### Changed

- Removed the dark/light/system theme switcher, the custom theme studio, the nine alternate color themes, the shader-ambiance "themes" toolbar button, and the UI density (compact/micro) toggle. The app now has a single, fixed, high-contrast dark palette in the style of professional motion-graphics compositing software.
- Removed the corresponding settings-panel controls, toolbar buttons, and sidebar swatches.
- Existing `localStorage` settings from the old theme system are ignored gracefully rather than causing errors.
