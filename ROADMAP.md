# Roadmap — Professional Compositor-Style UI Redesign

Project: `z-gl-js`
Goal: fully replace the current interface (Dark IDE / Terminal-Chic, multi-theme) with a single, locked-in UI in the spirit of a **professional motion-graphics compositing application**:
- a **fixed 800×450** composition viewport, styled like a compositor's monitor (no fluid flex sizing),
- **a single theme**, brighter and far more readable than the current one (the whole theming system is removed),
- **simplified sliders**, styled like a compositor's scrubbable numeric fields,
- **text and controls always visible** (no more low-contrast ghost grays).

This roadmap is based on a real audit of the repository (all files referenced below already exist) and is split into phases that can be shipped independently, in the order they must be done (each phase depends on the previous one).

All decisions below are **finalized** (see "Decisions" section at the end). All project documentation, including every `.md` file, must be written in English going forward.

---

## License and Copyright

**Z-GL Shadertoy**
Copyright © 2026 SANDEFJORD DEVELOPMENT (Patrick JAILLET) — All rights reserved
Email: contact.shaderstudio@gmail.com
Website: https://patrickjaillet.github.io/sandefjord-software

---

## Development Conventions

- [ ] General language only English
- [ ] Theme White only
- [ ] Source language entirely in English (variable names, functions, classes)
- [ ] No comments in the source code
- [ ] Strict Windows 10/11 compatibility only
- [ ] Every added feature must be reflected in this ROADMAP.md
- [ ] Automatic software version serialization for each Phase and each build
- [ ] Every modification must be reflected for the end-user in the CHANGELOG.md
- [ ] The README.md must be created and updated for the end-user with every modification and include a software screenshot in docs/screenshot.png
- [ ] Systematic synchronization (commit+push) with the https://github.com/Patrickjaillet/Z-GL-Shadertoy repository upon every project modification
- [ ] Strictly Never integrate Claude AI into GitHub, the files, or the GitHub contributors list
- [ ] Creation of all files and documents required for the GitHub repository
- [ ] Integrate copyright / Email / Website information into an "About" tab
- [ ] Create icons for both the "Inno Setup" installer and the software
- [ ] Offline-First Isolation: Zero network dependencies for execution. All resources (runtimes, parsers, computational libraries) must be embedded locally within the binary or the installer.
- [ ] MIT license

---

## Current state (audit)

| Topic | Files involved | Findings |
|---|---|---|
| Design tokens | `src/style/tokens.css` (466 lines) | 1 default theme (`:root`) + 9 variants (`.ayu-theme`, `.nord-theme`, `.gruvbox-theme`, `.catppuccin-theme`, `.oled-black-theme`, `.high-contrast-theme`, `.paper-theme`, `.solarized-theme`, `custom`). Secondary text has very low contrast (`--text-dim:#6B7280`, `--text-ghost:#3D4455` on a `#0D0F14` background). |
| Theme logic | `src/ui/theme.js` (229 lines) | Handles dark/light/system mode, 11 named themes (`THEMES`), UI density (compact/micro), Tauri system accent color. |
| Custom theme studio | `src/ui/theme-studio.js` (158 lines) | Live color-token editor with presets (Midnight/Ember/Forest/Mono), persisted to `localStorage`. |
| Already-emptied files | `src/style/dark-mode-force.css`, `src/style/ui-redesign.css` | Leftovers from a previous, unfinished theme lock-in cleanup (3 lines each) — confirms this direction was already attempted but never completed on the selector side. |
| Remaining theme selectors | `src/ui/settings-panel.js`, `src/ui.html` (`themeDark/Light/System` buttons, `themeSwatchGrid` with 9 swatches), `src/ui/events.js` (`applyTheme`, `applyThemeByName`), `src/app/init.js` (`initSystemTheme`, `applyThemeOverrides`, `theme-changed` listener) | The theme selector is wired in 4 different places (settings panel, toolbar, perf panel, init). All of it must be removed consistently. |
| Layout / viewport | `src/style/layout.css` (1470 lines) | The layout is **documented** for 800×450 (header comment) but implemented as fluid `100dvh` (`html`, `body`) with `#viewport-zone { flex:1 }`: the render area currently **stretches** with the window, it is **not** fixed at 800×450 today. |
| Sliders | `src/ui/slider.js` (1633 lines), `src/style/sliders.css` (596 lines), plus `slider-curve.js`, `slider-modulation.js`, `slider-color.js`, `slider-macro.js`, `slider-animation.js`, `slider-customizations.js`, `slider-gutter.js`, `slider-logic.js` | A very rich "custom canvas" slider system (curves, modulation, macros, animation, inline color) but heavy and not straightforward to use — no simple compositor-style scrub interaction. |
| Panels | `src/ui/panel-manager.js`, `panel-dock.js`, `sidebar-tabs.js`, `inspector-context.js` | Three-column architecture (`#sidebar` 280px / `#viewport-zone` flex / `#inspector` 200px) + 28px bottom toolbar — already close to an "Assets / Composition / Properties" layout, reusable for the compositor skin. |

**Audit conclusion:** the 3-column DOM/JS structure is reusable. The real work is (1) the color/text design system, (2) fully removing the theming layer, (3) hard-locking the viewport to 800×450, and (4) simplifying the slider component.

---

## Decisions (finalized)

1. **Accent color: compositor selection blue.** The current phosphor green (`#39FF6A`) is dropped in favor of a classic professional-compositor signature selection blue.
2. **The "◑ themes" (shader ambiance presets) toolbar button is removed from the code entirely** — not just hidden, the button, its markup, and its wiring are deleted.
3. **UI density (compact/micro) is removed from the code.** Since the viewport is now permanently fixed at 800×450, density switching no longer serves a purpose.
4. **Advanced slider features (curves, modulation, macros, animation) are purely deleted**, not hidden behind a context menu. Only the core scrub/type/color-pick behavior is kept.
5. **Language: everything is in English**, including all `.md` documentation, UI copy, code comments touched during this work, and this roadmap.

### Compositor color palette (final)

```css
--bg-app:        #1E1E1E;  /* application background, pasteboard */
--bg-panel:      #2B2B2B;  /* panels (Assets, Properties) */
--bg-panel-alt:  #323232;  /* panel headers, alternating rows */
--bg-raised:     #3C3C3C;  /* inputs, buttons */
--bg-hover:      #454545;
--bg-active:     #0E639C33; /* selection, compositor blue tint */

--text-primary:  #E6E6E6;  /* main text — AAA contrast on #2B2B2B */
--text-dim:      #B4B4B4;  /* secondary labels — still clearly readable */
--text-disabled: #7A7A7A;  /* disabled state, never unreadable */

--accent:        #4A90E2;  /* compositor selection blue */
--accent-hover:  #6FA8EA;
--warn:          #E5A93C;
--error:         #E5484D;

--border:        #464646;
--border-strong: #5A5A5A;
```

> Target: **≥ 10:1** contrast for primary text on panel background, **≥ 4.5:1** for secondary text (WCAG AA minimum everywhere, AAA on primary text). Verify with a contrast checker before merging.

---

## Phase 0 — Scope freeze (done)

- [x] Compositor palette validated (above). Single theme, no class name needed — it simply becomes the only `:root`.
- [x] Fixed dimensions confirmed: **composition canvas = 800×450 physical px, not resizable**, with a pasteboard area around it if the window is larger, exactly like a professional compositor's composition monitor.
- [x] Accent color, density, advanced sliders, and shader-themes button decisions locked in (see "Decisions" above).

---

 - [x] ## Phase 1 — Full removal of the theming system (1 day)

Goal: there must be **no** alternate theme, no dark/light/system toggle, and no customization studio left anywhere. One single hardcoded color set.

1. **`src/style/tokens.css`** - [x]
   - Delete all `:root.ayu-theme`, `.nord-theme`, `.gruvbox-theme`, `.catppuccin-theme`, `.oled-black-theme`, `.high-contrast-theme`, `.paper-theme`, `.solarized-theme` blocks.
   - Replace the `:root` content with the compositor palette (Phase 0).
   - Remove aliases that become unused (Catppuccin's `--lavender`/`--mauve`, etc.) — keep only aliases still actually consumed elsewhere in the code (verify via grep before deleting, see Phase 5).
   - Remove the density variant block (`#sw.compact, #sw.micro`) — density no longer exists (Decision 3).

2. **`src/ui/theme.js`** - [x]
   - Delete: `THEMES`, `applyThemeByName`, `getCurrentTheme`, `getAvailableThemes`, `getThemeDisplayName`, `initThemeSystem`, `applyTheme`, `initSystemTheme`, and everything managing `_currentMode` / `_systemMQ` / dark-light-system.
   - Delete `toggleCompactMode`, `_applyDensity`, `applyUiPreset`, `_UI_PRESETS`, `_DENSITY_*` constants (Decision 3).
   - Delete `applySystemAccent` as well, since accent color is now a fixed compositor blue, not derived from the OS.
   - Once trimmed, this file has essentially nothing left — delete `src/ui/theme.js` entirely and remove its imports.

3. **`src/ui/theme-studio.js`** - [x]
   - Delete the file entirely (custom theme studio is a removed feature).

4. **`src/ui.html`** - [x]
   - Remove the `themeSwatchGrid` block (9 `.theme-swatch` buttons) and the 3 `themeDark`/`themeLight`/`themeSystem` buttons.
   - Remove the `toggleThemePanel` button (Decision 2 — this is the same "◑ themes" button; delete it fully, do not repurpose it).
   - Remove the `<select id="theme-selector">` from the settings panel.
   - Remove the compact/micro density toggle button (`compactToggle`) and the `uiPresetDesktop`/`uiPresetCompact` buttons (Decision 3).

5. **`src/ui/events.js`** - [x]
   - Remove the imports `toggleCompactMode, _applyDensity, applyUiPreset, applyTheme, applyThemeByName` and the `setThemeMode`, `applyThemeByName` action-dispatcher entries.

6. **`src/ui/settings-panel.js`** - [x]
   - Remove the entire "Theme" section (label + `<select>`).

7. **`src/app/init.js`** - [x]
   - Remove the call to `initSystemTheme()`, the `theme-changed` listener, and the import/call to `applyThemeOverrides()` (theme-studio).

8. **`src/ui/shader-themes.js`** and any panel it powers - [x]
   - Delete entirely, per Decision 2 — the "◑ themes" button and everything behind it (shader ambiance presets) is removed from the codebase, not just hidden.

9. **Already-empty files** (`dark-mode-force.css`, `ui-redesign.css`): delete them outright and remove their `@import` from `src/style/index.css`. - [x]

**Definition of done:** `grep -ri "theme" src/` returns nothing UI-related (no shader-themes leftovers either, since that button is fully removed per Decision 2). - [x]

---

 - [x] ## Phase 2 — Fixed 800×450 viewport, compositor composition-monitor style

1. **`src/style/layout.css`** - [x]
   - `.cw#cwrap`: `width:800px; height:450px`, `flex-shrink:0; flex-grow:0`. `margin:auto 20px 20px` centres the monitor vertically in the pasteboard when no editor panel sits below it, and leaves a 20px gutter on all sides.
   - `#viewport-zone` pasteboard: `background-color:--bg-app` + compositor-style dot-grid overlay, `overflow:auto` for scrollbars when the window is smaller than sidebar+800+inspector, `align-items:center` for horizontal centering. `justify-content` removed — it conflicts with `overflow:auto`; vertical centering is handled by `margin:auto` on `.cw`.
   - Crisp 1px `--border-strong` `outline` on `.cw`.
   - `.scale-fit` + `--cw-scale` CSS custom property for display-only scale-to-fit when the column is narrower than 840px; the GL canvas attribute stays 800×450 and no `doResize` is triggered.
   - Code-focus thumbnail: fixed 200×112px (exact 16:9 at 800×450 ratio) positioned `absolute top:8px right:8px`; `canvas#glc` scaled visually with `transform:scale(0.25)` — display-only, GL resolution unchanged.

2. **`src/ui/viewport.js`** - [x]
   - Added `initPasteboardObserver()`: a `ResizeObserver` on `#viewport-zone` that sets `--cw-scale` and toggles `.scale-fit` on `.cw#cwrap` when available width drops below 840px. The GL canvas is never resized.
   - Exported and wired into `src/app/init.js` alongside `initTimeScrubber`.
   - Fullscreen and code-focus modes unchanged: they already call `doResize()`, which now enforces the fixed 800×450.

3. **`src/render/resolution.js`** - [x]
   - `_getViewportSize()` always returns `[800, 450]`. The `viewport` preset therefore always targets the fixed composition resolution regardless of CSS layout.

4. **`src/gl/renderer.js`** - [x]
   - `COMP_W = 800`, `COMP_H = 450` constants.
   - `initGL` initialises the renderer at 800×450 with `setPixelRatio(1)`.
   - `doResize()` always calls `setSize(800, 450, false)` in the `viewport` preset path; it no longer reads any CSS dimensions from the DOM.
   - `onWindowResize` delegates to `doResize()` — window resize only repositions the pasteboard, never the GL viewport.
   - Adaptive-DPR PID loop disabled: pixel ratio locked to 1.

**Definition of done:** resizing the app window never changes the composition canvas size; only the pasteboard margin moves. [x]

---

 - [x] ## Phase 3 — Simplified, compositor-style sliders (1.5–2 days)

Goal: a slider is a **scrubbable numeric field**, not a complex custom canvas widget.

Target behavior (matching a professional compositor):
- Label on the left, editable numeric value on the right. - [x]
- **Horizontal scrub**: click-and-drag left/right on the value increments/decrements it (a plain drag, no separate track handle to aim for). - [x]
- **Mouse wheel** on hover = fine increment. - [x]
- **Double-click** = direct text editing (type an exact value). - [x] (a plain click already focuses the field for typing; double-click just re-confirms this — the old click-to-seek/dblclick-to-reset track behavior is gone, since there's no longer a spatial track to seek along)
- **Alt/Shift + drag** = fine/coarse step. - [x] (kept the codebase's existing convention — Shift = ×0.1 fine / Ctrl = ×10 coarse, consistent with the angle dial, XY pad, and `value-scrub.js` elsewhere in this file; not Alt, which is already the global trigger for Monaco value-scrub)
- A thin fill bar behind the field to visualize min/max, no separate handle to target with the mouse. - [x]

Technical plan:

1. **`src/ui/slider.js`** - [x]
   - `_sliderRowHTML` merges the old two-row layout (separate `.sv` input above a `.st > .sl-track` div with `.sl-fill`/SVG `.sl-thumb`) into one `.sl-field` wrapper containing the `.sv` input; the fill is a CSS `--fill-pct` custom property instead of a separate element.
   - `_initTrack` rewritten as `_initScrubField`: pointerdown always calls `preventDefault()` (blocking native focus/caret) and tracks movement; a release under a small pixel threshold (covers both a plain click and a double-click) focuses+selects the input for typing, crossing the threshold turns the press into a delta-based scrub. Removed `_seekToPointer` (click-to-jump-to-position no longer applies) and the floating hover tooltip (`_showSliderTooltip`/`_posSliderTooltip`/`_hideSliderTooltip`) — redundant now that the value is always visible inside the drag target itself.
   - Public API (`buildUI`/`onValChange`/`onSlide`/`syncSlidersFromCode`/pin/group/filter/drag-reorder) untouched; dial, XY pad, stepper, enum, bool, and colour swatch widgets untouched.
2. **`src/style/sliders.css`** - [x] — `.st`/`.sl-track`/`.sl-fill`/`.sl-thumb`/`.thumb-halo` replaced with a single `.sl-field` rule (background `--bg-raised` + `--accent-dim` fill gradient sized by `--fill-pct`, `--border-hot` outline on `.active`/`.editing`).
3. **Advanced features — purely deleted (Decision 4):** - [x]
   - `slider-curve.js`, `slider-modulation.js` (+ its test), `slider-macro.js`, `slider-animation.js`, `curve-editor.js` deleted outright, along with `modulation-panel.js` (the whole "Modulation" sidebar tab/panel, which turned out to be 100% built on `slider-modulation.js` with no other purpose).
   - Full cascade of the resulting dead imports/UI, beyond the roadmap's original file list: the modulation popover + curve-widget wiring in `slider.js`; `toggleCurveEditor`/`toggleMacroPanel`/`openModPopover` in `events.js`; `openModulationPanel`/`closeModulationPanel`/`toggleModulationPanel` in `editor.js`; the modulation/animation frame-tick in `raf-loop.js` and a dead `modulationTick` callback hook in `renderer.js`; the `mod` tab in `sidebar-tabs.js` and its dock entry in `panel-dock.js`; the modulator readout in `inspector-context.js`; `clearAllModulators()` calls across `io/shadertoy.js`/`project.js`/`api.js`/`actions.js`; the `#modulationToggleBtn`, `#sbtab-mod`/`#sidebar-pane-mod`, `data-action="toggleMacroPanel"`, `#sbMods`, and `#beatSnapBtn`/`#beatSnapPopup` markup in `ui.html`; the `@curve` shader annotation in `parser.js`; the `z-gl:mod-cycle` toast listener in `main.js`; and the Modulation Guide / mentions in `help-center.js`/`onboarding.js`.
   - `slider-customizations.js` (+ its test) → **kept** — it also backs rename/reorder/manual-range persistence for the core scrub slider, not just the removed advanced features.
   - `slider-color.js` / `color-picker.js` (colour swatch + HSL picker) → **kept** as-is; also removed ~75 lines of already-dead legacy inline colour-picker code in `slider.js` that sat behind an unconditional early `return`.
4. **`src/ui/value-scrub.js`** - [x] — audited; it scrubs raw numeric literals directly in the Monaco editor text (a separate Alt+drag mechanism, unrelated DOM), so its implementation isn't reusable as a module, but its proven drag-math pattern (dx-based delta, Shift/Ctrl multipliers, pointer capture) is what `_initScrubField` is modeled on.

**Definition of done:** a user can change any shader value with a direct click-and-drag on the number, with no small handle to aim for, and none of the deleted advanced-slider files remain referenced anywhere. - [x] Verified via `npx vitest run` (424/424 passing) and a Playwright pass against the running dev server: drag scrubs the value, a plain click focuses the field for typing, mouse wheel does a fine increment, and the Modulation tab / macro toolbar button / BeatSnap widget are all absent from the DOM with no console errors.

---

 - [x] ## Phase 4 — Global readability: text and controls always visible (1 day)

- [x] Systematic grep of every use of `--text-dim`, `--text-ghost`, `--text-disabled`, `--text-secondary`, `opacity:0.4–0.7` in `src/style/*.css`, resolved per call-site rather than a blind find-replace:
  - `--text-secondary`/`--text-dim` are already aliased to the same near-AAA value (~10:1 on the panel background) — these needed no change.
  - `--text-ghost`/`--text-disabled` (aliased together, ~3.2:1 — fails normal-text AA) were audited one by one: kept as-is on genuinely disabled/inert content (disabled pass tabs, disabled buttons, empty states, placeholders — WCAG exempts inactive UI components from the contrast requirement), promoted to `--text-dim` everywhere else it was mistakenly covering always-visible structural content: panel titles (`.ph-title`, `.inspector-title`), group/section headers (`.sh`, `.fmenu-section-title`, `.tmenu-section-title`, `.panel-dock-title`, `.pass-nav-title`, `.pinned-zone-header`), the inspector's key/label column (`.insp-k`), keyboard-shortcut hints (`.fmenu-shortcut`, `.tmenu-shortcut`, `.zcp-kbd`, `.ctx-shortcut`), the viewport's active-pass-name HUD (`.vp-pass-name`), the which-key overlay hint (`.wk-hint`), a blend-mode description line (`.ng-blend-desc`), an inline node-graph rename button (`.ng-edit-btn`), and a GPU-caps "unsupported" value (`.caps-no`).
  - Removed opacity stacked on top of an already-dim/colored value (the exact bug a stale code comment in `editor.css` had already diagnosed for one case but not fixed elsewhere): the enabled-but-inactive Sound/Compute pass tabs (`.ptab-sound`/`.ptab-compute`, `opacity:0.7` on top of their status color), every context-menu row icon (`.ctx-item svg`, `opacity:0.7` dimming icons that sit next to full-contrast labels), and a doubled-up status-bar separator (`.sb-sep`, ghost color *and* `opacity:0.5`).
- [x] `header.css`, `panels.css`, `editor.css`, `modals.css` — checked as called out; `accessibility.css`'s "Maximum contrast (AAA)" toggle was **kept, not removed** — checked against the post-sweep base contrast and it still does real work for the border token (`--border-mid` → `#c8c8c8`) and for genuinely-disabled content, so removing it would be a real accessibility regression, not just dropping redundant code.
- [x] Borders: `--border-sub` raised from `rgba(255,255,255,0.05)` (near-invisible) to `rgba(255,255,255,0.14)` (a perceptible hairline). Major region dividers that need to read as crisp panel separations, as in a professional compositor, were promoted a step further to the solid `--border-mid` token: the native titlebar (`.tauri-titlebar`), the inspector header (`.inspector-header`), the sidebar tab bar (`.sidebar-tabs`), and the app footer/status bar (`.app-footer`/`#appStatusBar`). Minor in-panel hairlines (menu separators, sub-section dividers, list-row borders) were left on the raised `--border-sub` — full `--border-mid` there would read as too heavy for a flat compositor-style panel. Also fixed a genuine duplicate/dead `.lp-sep` rule (`header.css` defined it with the old faint value, silently overridden by `panels.css`'s later, correct definition — removed the dead one).
- [x] Removed the one actual neon-glow effect found (`--accent-glow`/`--shadow-neon*` tokens themselves didn't exist — already clean): a leftover green `text-shadow` bloom on the FPS-pill compile-success flash in `animations.css`, using the *old* pre-Phase-1 neon-green accent color, not even the current compositor blue. Replaced with a flat color-only flash matching the sibling `valueFlash` animation. The handful of 0-blur `box-shadow` "flash ring"/focus-ring effects elsewhere are not glows (no color bleed) and were left as-is.

**Definition of done:** screenshot review of every panel confirms no text falls below the target contrast ratio. - [x] Verified via `npx vitest run` (424/424 passing — CSS-only change, no logic regressions) and a Playwright screenshot pass against the running dev server covering the sidebar/uniform panel, a slider's right-click context menu, and the Performance panel: every label, title, and readout is clearly legible with no console errors.

---

 - [x] ## Phase 5 — Compositor skin on existing panels (1.5 days)

Reusing the existing 3-column + toolbar architecture, with a professional-compositor visual skin:

- **`#sidebar`** (280px) → "Assets panel" style: panel header with flat tabs, alternating-row list (`--bg-panel` / `--bg-panel-alt`), monochrome icons. - [x] Audited first: the flat-tab header and monochrome category icons already existed from earlier phases. The one missing piece — alternating-row striping — is now applied in `slider.js`'s `buildUI` as a post-render pass (`.sr:nth-child` can't track visual row order since group headers are interspersed in the DOM), toggling a `.row-alt` class rendered as `--bg-panel-alt` in `sliders.css`.
- **`#inspector`** (200px) → "Properties" style: property groups with disclosure triangles, labels left-aligned, values (new sliders) right-aligned. - [x] Audited first: `.insp-row`'s flex `space-between` layout already put labels left / values right. Added the missing piece — disclosure triangles — to the inspector's perf-section groups (`▾` rotating to `▸` on collapse, same visual language as the sidebar's `.sh-arrow`) via a CSS `::before` + a delegated click handler in `inspector-context.js` toggling `.collapsed` on `.perf-section` (pure-CSS `> *:not(.perf-section-title) { display:none }`, no markup restructuring needed).
- **Bottom toolbar** (28px) → compositor toolbar style: flat rectangular buttons, thin vertical separators, no glow icons. - [x] Audited: already satisfied by earlier phases — `#toolbar` buttons are already small-radius flat rectangles (`.pb`, `.ph-icon-btn`), `.vsep`/`.sep` hairline separators already exist, and Phase 4 already removed the one glow effect in the app (the FPS-pill flash). No changes needed here.
- **Panel tabs** (`sidebar-tabs.js`, `panel-dock.js`) → compositor tab style (active tab underlined in accent blue, inactive tabs in `--text-dim` but still readable). - [x] Audited: already exactly matches spec (`.sidebar-tab[aria-selected="true"]` → `border-bottom:2px solid var(--accent)` + accent text; inactive → `--text-dim`). No changes needed.
- **Monaco editor** (`editor.js`): force a single Monaco theme consistent with the compositor palette, no light-theme branch. - [x] The shader editor's own dark palette (`z-gl-dark`, a separate deliberate palette from the app chrome tokens) was already the only theme ever applied. Removed the dead code that remained: `setMonacoTheme(mode)` in `editor.js` (exported, zero callers, still branched on `mode === 'light'` → Monaco's built-in `'vs'` theme) and an orphaned `document.documentElement.classList.contains('light')` check in `perf.js` (nothing ever added that class) that picked light-mode colors for the FPS sparkline stroke. (No `monaco-env.js` file exists — it was never created; Monaco env/worker setup lives directly in `editor.js`.)

**Definition of done:** the whole app, once opened, visually reads as a professional compositing application window (Assets / Composition / Properties / toolbar), with no theme options visible anywhere, and no density toggle. - [x] Verified via `npx vitest run` (424/424 passing) and a Playwright pass against the running dev server: alternating row striping confirmed present on exactly every other `.sr` row (`rgb(50,50,50)` vs transparent), the perf-section disclosure triangle collapses/expands its group on click, and both are visible in screenshots with no console errors.

---

 - [x] ## Phase 6 — Cleanup, tests, QA (0.5–1 day)

- [x] `grep -ri "theme" src/` → confirmed clean (Monaco's own code-editor theme naming, a cache-key variable, generic test key names, a tmLanguage grammar comment — no UI-theming leftovers).
- [x] Ran the full suite (424/424 passing): `slider-customizations.test.js` (kept), `slider-modulation.test.js` (confirmed deleted with the module in Phase 3), `slider-color.test.js`, `slider-logic.test.js`, `undo.test.js` all pass.
- [x] `localStorage`: added `_cleanupObsoleteStorageKeys()` in `src/app/init.js`, run once at startup, removing `sl_theme`, `sl_theme_name`, `sl_themeOverrides`, `sl_uiPreset`, `sl_density` via the existing `safeLocalRemove` helper (handles both the versioned and legacy raw key forms).
- [x] Ran an automated accessibility audit with `@axe-core/playwright` (added as a devDependency) against the running dev server. Found and fixed real issues:
  - A genuine **ARIA regression from Phase 3**: the new `.sl-field` scrub wrapper had `role="slider" tabindex="0"` while also containing a real `<input>`, tripping axe's `nested-interactive` check (26 nodes). Fixed by removing the redundant role/tabindex/aria-value* from the wrapper — the native `<input type="number">` (now also carrying `min`/`max`) already provides full keyboard/AT semantics on its own. Moved `Home`/`End`-to-min/max handling from the now-unreachable wrapper keydown into the input's own handler in `_bindSvInput` so no keyboard behavior was lost.
  - A color-contrast miss from Phase 4's CSS-file-scoped sweep: an inline `opacity:.7` on `#taaVelSummaryText` in `ui.html` (Phase 4 only grepped `.css` files, not inline styles) — removed.
  - The shader editor's own Monaco theme (`z-gl-dark` in `editor.js`) still had pre-Phase-1 leftover colors never touched by Phase 4's CSS sweep (which only covered `src/style/*.css`, not this JS-defined theme object): line numbers and comments at `#3D4455`/`#4D5566` measured 1.45:1 and 1.89:1 against the editor background — both bumped to `#99A6C0`.
  - Remaining findings, left as-is with reasoning: disabled/not-yet-enabled pass-tab labels and the footer copyright line (ghost-token text on genuinely inactive/decorative content — WCAG exempts inactive UI components, and both were already deliberately reviewed and kept in Phase 4); the active-tab underline text and the "READY" status badge (`--accent` on the panel background, 3.89:1 / 4.3:1) — fixing these means changing the foundational Phase 0 accent-blue token used pervasively across the whole app, which needs an explicit decision rather than a unilateral Phase 6 tweak; and a pre-existing, unrelated `aria-required-children` structural issue on `#layoutPresetPopup` (mixes `role="menu"` with non-menuitem children like a save-layout input) and `#passTabs` (a `role="tablist"` containing a non-tab "add pass" button) — both predate this redesign and need a small ARIA/DOM restructure, not a quick fix, so left documented rather than patched blind.
  - Note: installing `@axe-core/playwright` triggered npm to prune an undeclared phantom dependency (`@tailwindcss/postcss`, referenced by `postcss.config.mjs` but absent from `package.json`/lock), which briefly broke the dev server. Reinstalled it (also now properly declared) rather than removing the config, since deciding that file was disposable wasn't mine to make unilaterally.
- [x] Verified the 800×450 canvas behavior at 3 window sizes via Playwright (1000×700 narrower than sidebar+800+inspector, 1280×700 exactly equal, 1600×900 larger): the canvas's backing resolution (`width`/`height` attributes) stayed exactly 800×450 in all three; only `.scale-fit`/`--cw-scale` (display-only) and the pasteboard margin responded to the window size.
- [x] Confirmed every `.md` file is in English: `CHANGELOG.md` and this roadmap were already English (only incidental typographic characters like `×`/`—`/`©`); **`README.md` was entirely in French** — rewritten in English, and corrected in the process to drop stale references to features removed earlier in this redesign (the modulation/macro/curve-editor section, "predefined render themes", "interface themes", supersampling, and the `Ctrl+Shift+E` shortcut) and fixed the sidebar-tab shortcut list (`Alt+1/3/4`, no tab 2 since Phase 3 removed the Modulation tab).

**Follow-up (addressed):** the `CHANGELOG.md`/version gap flagged above has since been backfilled — end-user-facing entries now exist for Phases 1 and 3–6 (in plain English, not just the technical file-level notes), `package.json` bumped to `2.12.0`, and the two hardcoded About/help-center version strings (`v1.21.0`, `v1.1.0`) that had drifted out of sync were corrected to match.

---

## Phase summary

| Phase | Estimated time | Deliverable |
|---|---|---|
| 0 — Scope freeze | done | Compositor palette + decisions locked in |
| 1 — Remove theming system | 1 day | A single theme, no selector left, density and shader-themes button removed |
| 2 — Fixed 800×450 viewport | done | Non-resizable canvas, pasteboard around it — GL always 800×450 |
| 3 — Simplified sliders | 1.5–2 days | Compositor-style numeric scrub on all controls, advanced slider files deleted |
| 4 — Global readability | 1 day | AA/AAA contrast everywhere, no more ghost text |
| 5 — Compositor skin on panels | 1.5 days | Sidebar/inspector/toolbar/editor styled like a professional compositor |
| 6 — QA / cleanup | 0.5–1 day | Green tests, migrated localStorage, contrast audit, English docs check |

**Total estimate: ~6.5–8 days** of work for a complete, clean pass (excluding surprises from the ~90 `src/ui/*` modules that consume the current tokens and will need to be checked along the way).
