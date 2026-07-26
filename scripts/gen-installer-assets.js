#!/usr/bin/env node
/**
 * scripts/gen-installer-assets.js
 *
 * Generates the bitmap assets required by the branded NSIS installer:
 *
 *   src-tauri/installer/splash.bmp    — 494 × 312 px  (advsplash plugin)
 *   src-tauri/installer/header.bmp   — 150 ×  57 px  (MUI2 header image)
 *   src-tauri/installer/sidebar.bmp  — 164 × 314 px  (MUI2 welcome/finish page)
 *   src-tauri/installer/LICENSE.rtf  — RTF licence shown on installer's licence page
 *
 * Uses only Node.js built-ins — no npm deps required.
 * Run: node scripts/gen-installer-assets.js
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "src-tauri", "installer");

mkdirSync(OUT, { recursive: true });

// ── BMP helpers ───────────────────────────────────────────────────────────────

/**
 * Write a 24-bit BMP file.
 * @param {string} path
 * @param {number} width
 * @param {number} height
 * @param {(x:number,y:number)=>[number,number,number]} pixelFn  returns [R,G,B]
 */
function writeBmp(path, width, height, pixelFn) {
  // Row stride must be a multiple of 4 bytes (24-bit = 3 bytes/pixel).
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;

  const buf = Buffer.alloc(fileSize, 0);

  // BMP file header (14 bytes)
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);        // reserved
  buf.writeUInt32LE(54, 10);      // pixel data offset

  // BITMAPINFOHEADER (40 bytes)
  buf.writeUInt32LE(40, 14);      // header size
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(-height, 22);  // negative = top-down
  buf.writeUInt16LE(1, 26);       // colour planes
  buf.writeUInt16LE(24, 28);      // bits per pixel
  buf.writeUInt32LE(0, 30);       // BI_RGB (no compression)
  buf.writeUInt32LE(pixelDataSize, 34);
  buf.writeInt32LE(2835, 38);     // 72 dpi X
  buf.writeInt32LE(2835, 42);     // 72 dpi Y

  // Pixel data (top-down, no palette)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y);
      const offset = 54 + y * rowSize + x * 3;
      buf[offset] = b;   // BMP stores BGR
      buf[offset + 1] = g;
      buf[offset + 2] = r;
    }
  }

  writeFileSync(path, buf);
  console.log(`  ✓  ${path.replace(ROOT + "/", "")}`);
}

// ── Colour palette ────────────────────────────────────────────────────────────
// Sliders GL brand palette — matches the app's icon set (public/icons, src-tauri/icons)
// and the §2 gray-theme accent (deep teal), replacing the old Z-GL purple/cyan scheme.
const BG       = [36, 36, 36];      // #242424 — dark charcoal (same as favicon.svg bg)
const BG2      = [46, 46, 46];      // #2E2E2E — slightly lighter charcoal for gradients
const ACCENT   = [11, 86, 80];      // #0B5650 — deep teal (theme accent)
const ACCENT2  = [20, 132, 122];    // #14847A — accent-hover teal
const WHITE    = [234, 234, 234];   // #EAEAEA — bg-hover, used as a near-white highlight
const GREY     = [90, 90, 90];      // #5A5A5A — muted slider-track grey

/** Linear interpolation between two colours */
function lerp(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

/**
 * Draw the "Sliders GL" mark — three horizontal slider tracks with round handles
 * at staggered positions, matching the app icon (public/icons/icon-512.png) and
 * public/favicon.svg. Coordinates are relative to centre (cx, cy), scale = size
 * px per unit (unit spacing mirrors the icon's 512-viewBox track/handle layout).
 */
function drawLogo(x, y, cx, cy, size) {
  const lx = (x - cx) / size;
  const ly = (y - cy) / size;

  // Track y-positions (relative units) and each handle's x-position + colour blend
  const rows = [
    { ly: -1.4, hx: -1.05 }, // row 1 — handle toward the left
    { ly: 0, hx: 1.1 },      // row 2 — handle toward the right
    { ly: 1.4, hx: -0.15 },  // row 3 — handle near centre
  ];

  let track = false;
  let handle = false;
  let handleT = 0; // 0..1 blend factor between ACCENT and ACCENT2 per row, for colour variety

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (Math.abs(ly - row.ly) < 0.14 && lx >= -2.6 && lx <= 2.6) track = true;
    const hr = Math.sqrt((lx - row.hx) ** 2 + (ly - row.ly) ** 2);
    if (hr < 0.55) {
      handle = true;
      handleT = i / (rows.length - 1);
    }
  }

  return { track, handle, handleT };
}

// ── Splash  (494 × 312) ───────────────────────────────────────────────────────
writeBmp(join(OUT, "splash.bmp"), 494, 312, (x, y) => {
  // Background: vertical gradient dark charcoal → slightly lighter charcoal
  let color = lerp(BG, BG2, y / 312);

  // Glow blob behind the mark (centred around 247, 130)
  const dist = Math.sqrt((x - 247) ** 2 + (y - 130) ** 2);
  if (dist < 160) {
    const t = (1 - dist / 160) ** 2.5;
    color = lerp(color, ACCENT, t * 0.3);
  }

  // Sliders GL mark — three tracks + staggered handles
  const logo = drawLogo(x, y, 247, 118, 26);
  if (logo.track) color = lerp(color, GREY, 0.85);
  if (logo.handle) {
    color = lerp(ACCENT, ACCENT2, logo.handleT);
    color = lerp(color, WHITE, 0.12);
  }

  // Tagline area — thin teal rule at y≈172
  if (y >= 170 && y <= 173 && x >= 140 && x <= 356) {
    const t = 1 - Math.abs(x - 248) / 108;
    color = lerp(BG, ACCENT2, t * 0.9);
  }

  // Bottom gradient strip (version / brand bar)
  if (y > 278) {
    const t = (y - 278) / 34;
    color = lerp(color, ACCENT, t * 0.6);
  }

  return color;
});

// ── Header  (150 × 57) ────────────────────────────────────────────────────────
writeBmp(join(OUT, "header.bmp"), 150, 57, (x, y) => {
  // Dark charcoal panel, subtle teal wash from the bottom-right
  const t = x / 150;
  let color = lerp(BG, BG2, y / 57);
  color = lerp(color, lerp(ACCENT, ACCENT2, t), 0.18 * (1 - y / 57) + 0.05);

  // Mark — small, right-aligned
  const logo = drawLogo(x, y, 112, 27, 2.3);
  if (logo.track) color = lerp(color, GREY, 0.7);
  if (logo.handle) color = lerp(ACCENT, ACCENT2, logo.handleT + 0.2 > 1 ? 1 : logo.handleT);

  // Bottom rule
  if (y === 56) color = lerp(ACCENT, ACCENT2, x / 150);

  return color;
});

// ── Sidebar  (164 × 314) ──────────────────────────────────────────────────────
writeBmp(join(OUT, "sidebar.bmp"), 164, 314, (x, y) => {
  const t = y / 314;
  let color = lerp(BG, BG2, t);

  // Vertical accent stripe on the right edge
  if (x >= 158) {
    color = lerp(ACCENT, ACCENT2, t);
  }

  // Centred glow
  const dist = Math.sqrt((x - 82) ** 2 + (y - 110) ** 2);
  if (dist < 80) {
    color = lerp(color, ACCENT, ((1 - dist / 80) ** 2) * 0.3);
  }

  // Mark — centred at (82, 98)
  const logo = drawLogo(x, y, 82, 98, 15);
  if (logo.track) color = lerp(color, GREY, 0.85);
  if (logo.handle) {
    color = lerp(ACCENT, ACCENT2, logo.handleT);
    color = lerp(color, WHITE, 0.1);
  }

  // Tagline rule
  if (y >= 150 && y <= 153 && x >= 24 && x <= 140) {
    color = lerp(GREY, ACCENT2, 0.5);
  }

  return color;
});

// ── LICENSE.rtf ───────────────────────────────────────────────────────────────
// Minimal RTF that NSIS can render in the licence page — MIT license text,
// kept in sync with the repo-root LICENSE file and src-tauri/installer/LICENSE.rtf
// (see ROADMAP §4). Re-running this script must never regress the licence
// back to a proprietary EULA.
const rtf = String.raw`{\rtf1\ansi\ansicpg1252\deff0
{\fonttbl{\f0\fnil\fcharset0 Segoe UI;}}
{\colortbl;\red13\green13\blue15;\red102\green51\blue255;\red200\green200\blue220;}
\viewkind4\uc1\pard\cf3\f0\fs20
{\b\fs28 Sliders GL — MIT License}\par
\par
Copyright \u169? 2026 Patrick JAILLET\par
\par
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\par
\par
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\par
\par
{\b Disclaimer of Warranty}\par
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.\par
\par
{\b Limitation of Liability}\par
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\par
\par
Contact: contact.shaderstudio@gmail.com  —  Website: https://patrickjaillet.github.io/sandefjord-software\par
\par
By clicking "I Agree" you accept the terms of the MIT License above.\par
}`;

writeFileSync(join(OUT, "LICENSE.rtf"), rtf, "utf8");
console.log(`  ✓  src-tauri/installer/LICENSE.rtf`);

console.log("\n✅  All installer assets generated in src-tauri/installer/");
console.log(
  "   Run this script again any time you update the brand colours or tagline."
);
