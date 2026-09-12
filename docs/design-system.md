# Sliders GL — Design System

Source of truth: [`src/style/tokens.css`](../src/style/tokens.css). This
document explains the nomenclature and usage rules; it does not duplicate
the token values themselves — read the CSS file for the current numbers.

## Identity

Sliders GL uses a single light/medium-gray "workbench" theme (Blender's
own visual language, not a dark IDE theme) with one signature accent: a
deep teal, `--accent` (`#0b5650`). The accent is used sparingly — selection
states, active tabs, focus rings, primary actions — never as a base surface
color. Do not introduce a second accent hue or a dark theme variant; both
would dilute the identity documented in `README.md` and `CLAUDE_CODE_PROMPT.md`.

The code editor (Monaco) is the one deliberate exception: it keeps its own
dark `z-gl-dark` theme (`--bg-editor`) regardless of the app's light-gray
surfaces, because the editor's syntax-highlight palette is tuned for a dark
background.

### Category colors

A second, narrowly-scoped exception to the single-accent rule: the
`--cat-*` tokens (`--cat-globals`, `--cat-rotation`, `--cat-color`, etc.,
one per uniform group in `slider.js`'s `CAT_ORDER`) give each slider panel
group its own hue, applied only to the slider fill bar
(`.sl-field[data-cat="…"]` in `sliders.css`) at a low, consistent 20%
alpha — a scanning aid for panels with many groups, not a second brand
accent. Don't use `--cat-*` for buttons, borders, or any other UI chrome;
that stays `--accent`. When adding a new category to `CAT_ORDER`, add a
matching `--cat-*` token and `.sl-field[data-cat]` rule together, picking a
hue distinct from its neighbors at the same ~55-65% lightness the existing
set uses.

## Surfaces

Four flat surface levels, each one step lighter than the last:

| Token          | Role                                     |
| -------------- | ---------------------------------------- |
| `--bg-void`    | App background, pasteboard               |
| `--bg-surface` | Panels (Properties, Outliner, Inspector) |
| `--bg-raised`  | Panel headers, alternating rows          |
| `--bg-overlay` | Inputs, buttons                          |

Use the semantic names (`--bg-surface`, not `--bg2`) in new code. The short
aliases (`--bg2/3/4`, `--t1/2/3`, `--b1/2/3`, `--ac/3/4`, etc.) are legacy —
kept because JS modules still read them via inline styles and generated
color swatches — but are not for new references; migrate a call site to
the full name when you touch it, rather than adding a new short-alias use.

## Elevation

A continuous 6-step shadow scale (`--elevation-0` through `--elevation-5`)
for anything that floats above the flat surface stack:

- `--elevation-0` — flush, no shadow (default state of panels/columns).
- `--elevation-1`/`--elevation-2` — docked panels, dropdowns, tooltips
  (aliases of the pre-existing `--shadow-sm`/`--shadow-md`).
- `--elevation-3` — popups, context menus (alias of `--shadow-popup`).
- `--elevation-4`/`--elevation-5` — modals and top-priority overlays
  (command palette, which-key) that must read as above everything else,
  including other open popups.

Apply elevation consistently by role, not by "how important this feels" —
a dropdown is always `--elevation-2`, a modal is always `--elevation-4`,
regardless of which specific dropdown or modal it is.

## Spacing

A 4px-based scale, `--space-1` (4px) through `--space-8` (40px). Use these
for `padding`, `margin`, and `gap` in new or touched CSS. Do **not** use
them for border widths, font sizes, icon/control dimensions, or anything
that isn't genuinely a spacing value — those stay literal pixel values
(e.g. a 1px hairline border, a 28px toolbar icon) since forcing them onto
a 4px grid would be a false equivalence, not a simplification.

Existing hardcoded `px` spacing values in `layout.css`/`panels.css`/
`header.css` are being migrated to this scale incrementally, file by file,
rather than in one sweeping pass — see the "Migration status" note at the
end of this document.

## Typography

| Token          | Size | Use                                    |
| -------------- | ---- | -------------------------------------- |
| `--fs-label`   | 10px | Uppercase section/panel-header labels  |
| `--fs-body`    | 11px | Default UI text (sliders, rows, menus) |
| `--fs-value`   | 12px | Numeric readouts, inputs               |
| `--fs-title`   | 13px | Panel/section titles                   |
| `--fs-heading` | 15px | Modal/onboarding headings              |

Line-heights: `--lh-tight` (1.2, labels/single-line rows), `--lh-normal`
(1.4, body text), `--lh-loose` (1.6, prose/multi-line help text). Weights:
`--fw-regular`/`--fw-medium`/`--fw-semibold`/`--fw-bold` (400/500/600/700).

These harmonize with — they do not replace — the base type rules already
in `src/style/typography.css`.

## Geometry

Border radius is locked to the existing "workbench" scale: `--radius-sm`
(3px) for controls, `--radius-md`/`--radius-lg` (6px) for panels and
popups. Do not introduce a new radius value without updating this
document and `tokens.css` together — radius drift is one of the easiest
ways to make the UI feel inconsistent.

## Accessibility

Every text/surface pairing in `tokens.css` is tuned to clear WCAG AA (4.5:1
for text, 3:1 for UI controls/borders) — see the inline contrast-ratio
comments next to `--border-mid`, `--border-strong`, `--text-primary`, and
`--text-dim` in the CSS file itself. `--text-ghost` is the one exception,
reserved for disabled controls, which WCAG exempts from the contrast
requirement. When adding a new color token, compute and comment its
contrast ratio against the surface(s) it will sit on, the same way the
existing tokens do — do not eyeball it.

## Migration status

The spacing-token migration (replacing hardcoded `px` padding/margin/gap
with `--space-*`) is in progress. As of this pass, `layout.css` has been
audited for hardcoded spacing on the sections directly touched by the
grid/viewport rework (roadmap §2); `panels.css` and `header.css` still
contain hardcoded spacing values pending a future pass. When editing a
rule in either file, prefer migrating its spacing values to the new
tokens over leaving new hardcoded `px` next to already-migrated
neighbors.
