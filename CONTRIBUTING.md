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
