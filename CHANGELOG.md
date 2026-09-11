# Changelog

All notable changes to Sliders GL are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.2.0]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.2.0
[1.1.1]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.1.1
[1.1.0]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.1.0
[1.0.1]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.0.1
[1.0.0]: https://github.com/Patrickjaillet/Sliders-GL/releases/tag/v1.0.0
