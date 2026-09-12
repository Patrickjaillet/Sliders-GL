# Contributing to Sliders GL

Thanks for your interest in Sliders GL!

## Reporting bugs / requesting features

Please open an issue on the
[GitHub issue tracker](https://github.com/Patrickjaillet/Sliders-GL/issues)
using the appropriate template. Include:

- Windows version (10 or 11) and Sliders GL version (see the "About" tab).
- Steps to reproduce, expected behavior, and actual behavior.
- The shader code, if the issue is render-related.

## Development setup

```sh
npm install
npm run tauri:dev
```

- Run tests: `npm test`
- Run linting: `npm run lint`
- Run the offline-dependency check: `npm run check:offline`

## Design system

Sliders GL follows a single light/medium-gray "workbench" theme with one
teal accent (`--accent`) — see
[`docs/design-system.md`](docs/design-system.md) for the full nomenclature
(surfaces, elevation, spacing, typography, geometry tokens) before touching
CSS. In short:

- All new colors, spacing, and radii should reference the tokens in
  `src/style/tokens.css` (`--bg-surface`, `--space-*`, `--radius-*`, etc.),
  not new hardcoded values or the legacy short aliases (`--bg2`, `--t1`,
  and similar).
- Don't introduce a second accent color or a dark theme for the app shell.
  The Monaco editor's own dark theme is the one deliberate exception.
- `--text-ghost` is reserved for disabled controls only — using it for any
  visible, enabled text is a recurring contrast bug this project has fixed
  multiple times; use `--text-dim` instead for dim-but-readable text.
- When adding a new color token, compute and comment its WCAG contrast
  ratio against the surface(s) it sits on, matching the existing tokens.

## Pull requests

- Keep changes focused and scoped to a single concern.
- Add or update tests for any behavior change.
- Update `CHANGELOG.md` under an "Unreleased" section for any user-facing
  change.
- Make sure `npm test` and `npm run build` pass before opening a PR.

## Scope

Sliders GL targets **Windows 10/11 only** and is built to run **fully
offline** (see `README.md`). Contributions that introduce a hard runtime
dependency on a remote/CDN resource will not be accepted.
