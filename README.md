<!-- SPDX-License-Identifier: MIT -->

# Sliders GL

**Sliders GL** is a Shadertoy-compatible GLSL shader editor with a
Blender-style interface: topbar, tool shelf, tabbed Properties editor,
status bar, draggable/collapsible areas, and area-split gizmos — all
reskinned in a unique light/medium-gray theme.

![Sliders GL screenshot](docs/screenshot.png)

## Features

- **Blender-identical UI architecture** — topbar with workspace tabs, tool
  shelf, tabbed Properties editor, status bar, Outliner, and a fully
  draggable/collapsible area layout.
- **Ultra-professional, high-precision sliders** for every shader uniform,
  with click-drag scrubbing, fine/coarse step modifiers, per-channel vector
  and color controls, and full keyboard accessibility.
- **Monaco-based GLSL editor** with syntax highlighting, inline diagnostics,
  autocomplete, and code formatting.
- **ShaderToy-compatible rendering** (`mainImage`, `iResolution`, `iTime`,
  `iMouse`, channel uniforms) with direct ShaderToy import by ID or URL.
- **Export pipeline** — current-frame image export, video recording,
  standalone HTML export, and full project ZIP export.
- **Shader library and preset system.**
- **In-app Help Center** with a full reference and keyboard shortcut list.
- **Offline-first** — all runtimes, fonts, and tooling are bundled locally;
  zero network dependency for core functionality.

## Installation (Windows 10/11)

Sliders GL targets **Windows 10 and Windows 11 only**.

1. Download the latest installer (`Sliders GL Setup.exe`) from the
   [Releases](https://github.com/Patrickjaillet/Sliders-GL/releases) page.
2. Run the installer and follow the on-screen instructions.
3. Launch **Sliders GL** from the Start menu or desktop shortcut.

No additional runtime, browser, or network connection is required — the
application works fully offline.

### Building from source

```sh
npm install
npm run tauri:build
```

Requires Node.js and the [Tauri](https://tauri.app) prerequisites for
Windows. See `CONTRIBUTING.md` for the full development setup.

## License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE)
for the full text.

```
SPDX-License-Identifier: MIT
Copyright © 2026 Patrick JAILLET
```

## Contact

- Email: [contact.shaderstudio@gmail.com](mailto:contact.shaderstudio@gmail.com)
- Website: [patrickjaillet.github.io/sandefjord-software](https://patrickjaillet.github.io/sandefjord-software)
