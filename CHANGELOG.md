# Changelog

All notable changes to Sliders GL are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.3] — 2026-09-12

### Added

- New end-to-end test coverage: the sound toggle, Help menu additions,
  Shader Library/Includes Manager buttons, and canvas gizmos/compare-view
  toggles are now covered by automated regression tests, as is the viewport
  resize pipeline (confirming the canvas actually changes GL resolution,
  not just its CSS size, on a window resize) and overall layout coverage
  at four common desktop resolutions.

### Removed

- Removed `scripts/benchmark.js` and the `npm run benchmark` command: it
  measured the throughput of a GLSL→WGSL transpiler that no longer exists
  in this codebase, and had been silently broken for a while.

## [1.9.2] — 2026-09-12

### Fixed

- Restoring a saved UI zoom level on startup no longer shows the "zoom
  changed" toast or triggers a screen-reader announcement — those are now
  reserved for an actual Ctrl+=/-/0 keypress, matching what a real user
  action should trigger.
- Removed a redundant, partially broken second "Skip to editor" link that
  was being injected right after the real one, pointing at page anchors
  that no longer exist.
- Reduced an intermittent accessibility-test false positive around the
  first-launch welcome dialog's fade-in animation.

## [1.9.1] — 2026-09-12

### Fixed

- The sidebar no longer stays at full width under 900px viewport width when
  the inspector panel is closed (the common case) — the responsive
  breakpoint's narrower-sidebar rule wasn't reaching the grid in that state.
- The sidebar is now actually hidden (not just visually squeezed to zero)
  under the 640px single-column breakpoint.
- The custom desktop title bar's minimize/maximize/close buttons now use
  their intended Windows 11–style appearance (full-height, 46px wide, red
  hover on Close) instead of the small generic toolbar-button style they
  were inheriting by coincidence — their real stylesheet was never linked
  into the app.

## [1.9.0] — 2026-09-12

### Added

- A sound feedback toggle button is now in the topbar. It was already fully
  wired up in code (state syncing, click sounds, icon swap) but the button
  itself was missing from the page, so the feature was completely
  unreachable.
- The Help menu gained two entries: "Replay Tutorial" and "GLSL Quick
  Reference", both already implemented but previously only reachable via
  the one-time first-launch welcome screen or a dedicated keyboard
  shortcut.

## [1.8.0] — 2026-09-12

### Added

- The export dialog now shows a "Last export" thumbnail after a successful
  screenshot download, not just a preview of what's about to be exported.
- ShaderToy import is now a real two-step flow: "Fetch & Preview" loads the
  shader's thumbnail and metadata for review, and a new "Confirm Import"
  button is required before the code actually replaces what's in the
  editor — previously the editor was overwritten immediately, with the
  preview only appearing afterward.
- The command palette (Ctrl+Shift+P) gained roughly two dozen entries that
  were missing: reset/randomize sliders, all 8 export formats, Help
  Center, Keyboard Shortcuts, the which-key overlay, guides/HUD/gizmo/
  compare toggles, and project New/Open/Save/Save As/Import from ShaderToy.

### Fixed

- The export dialog's "Preview Frame" button always rendered at a fixed
  1920×1080 regardless of the resolution actually selected in the dropdown.
- The 8 code-export format buttons now sit in a fixed 2-column grid instead
  of a wrapping flex row, which could leave an uneven last row depending
  on the modal's exact width.
- Removed a phantom keyboard shortcut ("Randomize Sliders" via Alt+R) shown
  in Settings that was never actually bound to anything.
- The "info" toast type (used in a dozen places) had a dedicated icon but
  no color styling, so it looked identical to an untyped toast.

## [1.7.0] — 2026-09-12

### Added

- Angle dial sliders (rotation) and XY-pad sliders (grouped vec2 values)
  now have complete visual styling — they previously rendered with bare
  browser/SVG defaults (a plain black circle, no background, no hover or
  active-drag feedback) despite their drag interaction being fully
  functional.

### Fixed

- The shader complexity badge could never actually become visible: a
  native `hidden` HTML attribute was permanently overriding the CSS
  classes the badge's own code toggles to show it.
- The slider and slider-group context menus, and the color picker popups,
  now use the same shadow depth as every other popup in the app instead
  of one-off shadow values.

## [1.6.0] — 2026-09-12

### Added

- The Outliner now shows a real structure tree: every slider category
  group with a live count, click to jump to and expand that group in the
  Uniforms panel.
- The Inspector's default "Pass" view now shows an always-accurate shader
  summary (uniform count, how many differ from their default, complexity
  score) instead of a permanently stuck "No active pass." message.

### Fixed

- The Outliner's "Uniforms" count was never actually updated by any code
  and always read "0".
- The left sidebar's resize handle is now keyboard/screen-reader
  accessible (role="separator" + label), matching the inspector column's
  and tool shelf's handles, which already had this.

## [1.5.0] — 2026-09-12

### Added

- The editor's "⋯ More options" menu now has quick toggles for word wrap
  and auto-format on compile, in sync with the full Editor Settings panel.
- The viewport header gained three new controls: a canvas position-gizmos
  toggle, a persistent before/after compare toggle (previously only a
  hidden "hold B" shortcut) with both a split-line and a new opacity-blend
  mode, and a HUD density menu (compact FPS-only vs. detailed).
- The timeline strip now has its own play/pause and loop buttons, in sync
  with the topbar's global pause button regardless of which one is used.

### Fixed

- Fixed a near-invisible slider-gutter indicator dot in the code editor —
  it used the app's light-theme accent color, which has very poor contrast
  against the (intentionally dark) code editor background.
- The editor's hover tooltips, quick-fix lightbulb, and suggestion widget
  now use colors matching the custom editor theme instead of Monaco's
  generic defaults.
- Alt-dragging a number in the code editor to scrub its value now shows a
  visual hint (underline + cursor) on hover, before the drag starts, so the
  feature is discoverable.

## [1.4.0] — 2026-09-12

### Added

- The Render sidebar tab now shows read-only GPU/renderer diagnostics
  (GPU name, WebGL version, max texture size, best compressed texture
  format), the persisted shader-program cache's entry count with a "Clear
  program cache" button, and the current adaptive apply-debounce delay for
  the loaded shader — all previously invisible outside developer console logs.
- The empty state in the Uniforms panel ("Paste a ShaderToy shader") now
  has direct "Load Example Shader" and "Browse Shader Library" buttons
  instead of only accepting a manual paste.
- The Export sidebar tab now shows the last export format used and lists
  saved export presets with one-click apply.
- The Settings sidebar tab now shows a live summary of active preferences
  (font size, AAA contrast, dyslexia-friendly font, reduced motion, sound
  feedback) without needing to open the settings sub-panel.

### Fixed

- Fixed insufficient WCAG AA color contrast on the About panel's license
  and credits text, and on the command palette's empty state — all three
  used the disabled-control-only contrast token for visible, non-disabled
  text.

## [1.3.0] — 2026-09-12

### Added

- The tool shelf now has direct buttons for four features that were
  previously only reachable through the hidden command palette or a
  keyboard shortcut: the Shader Library, the Includes Manager, the Shader
  Anatomy overlay (with a visible on/off state), and the keyboard shortcut
  map ("which-key").
- Tool shelf tooltips are now full descriptions rather than short labels.

### Changed

- Tool shelf icons are now grouped into clearer sections: Navigation,
  Render, Export, Library, and Help.

## [1.2.0] — 2026-09-11

### Added

- Workspace tabs (Editor / Shading / Layout) now have distinct icons instead
  of text-only labels.
- Two new topbar quick-access buttons: **Shader Library** and **Includes
  Manager** — both were already fully implemented but only reachable via
  the hidden command palette or a keyboard shortcut.
- The File menu button now shows a tooltip with the exact time of the last
  save, and plays a brief confirmation pulse right when a save completes.

### Changed

- All topbar menu icons (File/Edit/Render/Window/Help) are now 100% SVG,
  replacing the previous mix of Unicode emoji and SVG icons, for a more
  consistent, professional look.

## [1.1.1] — 2026-09-11

### Fixed

- Fixed insufficient WCAG AA color contrast on the empty-state Inspector
  panes ("No active pass.", "Hover a slider…") and several onboarding/
  welcome-modal captions, which used the disabled-control-only
  `--text-ghost` token for visible, non-disabled text.

## [1.1.0] — 2026-09-11

### Added

- The Outliner/Inspector column now opens by default on desktop screens
  ≥1280px wide, instead of starting collapsed — an explicit user toggle is
  still remembered and respected on future launches.
- New design tokens: a continuous elevation scale (`--elevation-0..5`), a
  4px-based spacing scale (`--space-1..8`), and a typography scale
  (`--fs-*`/`--lh-*`/`--fw-*`), documented in the new `docs/design-system.md`.

### Changed

- The render viewport now fills the available space in its column instead
  of staying fixed at 800×450px with a large empty gray area around it on
  wide screens — both the display surface and the underlying GL render
  resolution adapt to the window size (capped at 2560×1440 for
  performance), with elegant letterboxing when the aspect ratio doesn't
  match.

### Fixed

- Fixed a bug where the WebGL canvas could get pinned to an inline
  800×450px CSS size regardless of its actual container size.

## [1.0.1] — 2026-07-28

### Fixed

- Accessibility: fixed several WCAG 2.1 AA color-contrast issues across the
  gray theme — control borders, status toasts, the active pass/workspace
  tabs, viewport HUD readouts, and status-bar text now all meet or exceed
  the required contrast ratios.
- Accessibility: the Outliner and Inspector panels are now reachable and
  scrollable by keyboard.

## [1.0.0] — 2026-07-26

### Added

- Initial public release of **Sliders GL**, a full rebrand of the
  Z-GL Shadertoy project into a standalone, Blender-style GLSL shader editor.
- Blender-identical UI architecture: topbar, tool shelf, tabbed Properties
  editor, status bar, draggable/collapsible areas, and area-split gizmos.
- Unique light/medium-gray theme.
- Ultra-professional, high-precision sliders for every shader uniform, with
  keyboard fine control and undo/redo.
- Monaco-based GLSL editor with syntax highlighting, inline diagnostics,
  autocomplete, and code formatting.
- ShaderToy-compatible rendering (`mainImage`, `iResolution`, `iTime`,
  `iMouse`, channel uniforms) and direct ShaderToy import by ID or URL.
- Export pipeline: current-frame image export, video recording, standalone
  HTML export, and full project ZIP export.
- Shader library and preset system.
- In-app Help Center with a full reference and keyboard shortcut list.
- "About" tab with copyright, contact, and website information.
- Offline-first architecture: all runtimes, fonts, and tooling are bundled
  locally — zero network dependency for core functionality.
- MIT license.

[1.9.3]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.9.3
[1.9.2]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.9.2
[1.9.1]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.9.1
[1.9.0]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.9.0
[1.8.0]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.8.0
[1.7.0]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.7.0
[1.6.0]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.6.0
[1.5.0]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.5.0
[1.4.0]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.4.0
[1.3.0]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.3.0
[1.2.0]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.2.0
[1.1.1]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.1.1
[1.1.0]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.1.0
[1.0.1]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.0.1
[1.0.0]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.0.0
