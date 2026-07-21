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
// Z-GL dark theme colours
const BG       = [13, 13, 15];      // #0D0D0F  — deep dark background
const ACCENT   = [102, 51, 255];    // #6633FF  — purple accent
const ACCENT2  = [0, 180, 255];     // #00B4FF  — cyan accent
const WHITE    = [255, 255, 255];
const GREY     = [120, 120, 140];

/** Linear interpolation between two colours */
function lerp(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

/** Draw a simple "Z-GL" logotype as pixel art into the pixel function */
function drawLogo(x, y, cx, cy, size) {
  // Simplified: just return true if (x,y) is "inside" any letter stroke
  // We define bounding box relative to centre (cx, cy), scale = size px per unit.
  const lx = (x - cx) / size;
  const ly = (y - cy) / size;

  // Z: top bar, diagonal, bottom bar
  const Z =
    (Math.abs(ly + 1.2) < 0.25 && lx >= -1.8 && lx <= 1.8) ||  // top bar
    (Math.abs(ly - 1.2) < 0.25 && lx >= -1.8 && lx <= 1.8) ||  // bottom bar
    (Math.abs(lx + ly * 1.0) < 0.32 && ly > -1.0 && ly < 1.0); // diagonal

  // Hyphen separator
  const SEP = Math.abs(ly) < 0.18 && lx >= 2.5 && lx <= 3.5;

  // G: partial circle + stem
  const gCx = 6.0, gCy = 0;
  const gr = Math.sqrt((lx - gCx) ** 2 + (ly - gCy) ** 2);
  const G =
    (Math.abs(gr - 1.6) < 0.32 && !(lx > gCx && ly > -0.2)) ||   // arc
    (lx > gCx && lx < gCx + 1.65 && Math.abs(ly) < 0.28 && ly > -0.2); // stem

  // L: vertical bar + bottom bar
  const lCx = 10.5;
  const L =
    (lx >= lCx - 0.25 && lx <= lCx + 0.25 && ly >= -1.5 && ly <= 1.5) ||
    (Math.abs(ly - 1.4) < 0.25 && lx >= lCx - 0.25 && lx <= lCx + 1.8);

  return Z || SEP || G || L;
}

// ── Splash  (494 × 312) ───────────────────────────────────────────────────────
writeBmp(join(OUT, "splash.bmp"), 494, 312, (x, y) => {
  const nx = x / 494;
  const ny = y / 312;

  // Background: vertical gradient dark → slightly lighter
  let color = lerp(BG, [20, 20, 26], ny);

  // Scanline shimmer (subtle horizontal banding every 2px)
  if (y % 2 === 0) color = lerp(color, [30, 30, 36], 0.08);

  // Glow blob behind logo (centred around 247, 130)
  const dist = Math.sqrt((x - 247) ** 2 + (y - 130) ** 2);
  if (dist < 160) {
    const t = (1 - dist / 160) ** 2.5;
    color = lerp(color, ACCENT, t * 0.35);
  }

  // Logo pixel art
  if (drawLogo(x, y, 247, 118, 14)) {
    const blend = Math.max(0, 1 - Math.abs(x - 247) / 120);
    color = lerp(ACCENT, ACCENT2, blend);
    color = lerp(color, WHITE, 0.55);
  }

  // Tagline area — thin cyan rule at y≈172
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
  // Dark left panel with purple → cyan gradient
  const t = x / 150;
  let color = lerp(BG, [16, 16, 22], y / 57);
  color = lerp(color, lerp(ACCENT, ACCENT2, t), 0.4 * (1 - y / 57) + 0.1);

  // Logo — small, right-aligned
  if (drawLogo(x, y, 105, 26, 5.5)) {
    color = lerp(ACCENT2, WHITE, 0.6);
  }

  // Bottom rule
  if (y === 56) color = lerp(ACCENT, ACCENT2, x / 150);

  return color;
});

// ── Sidebar  (164 × 314) ──────────────────────────────────────────────────────
writeBmp(join(OUT, "sidebar.bmp"), 164, 314, (x, y) => {
  const t = y / 314;
  let color = lerp([10, 10, 14], [20, 18, 30], t);

  // Vertical accent stripe on the right edge
  if (x >= 158) {
    color = lerp(ACCENT, ACCENT2, t);
  }

  // Centred glow
  const dist = Math.sqrt((x - 82) ** 2 + (y - 110) ** 2);
  if (dist < 80) {
    color = lerp(color, ACCENT, ((1 - dist / 80) ** 2) * 0.3);
  }

  // Logo — centred at (82, 100)
  if (drawLogo(x, y, 82, 98, 10)) {
    const blend = (y - 60) / 80;
    color = lerp(ACCENT, ACCENT2, Math.max(0, Math.min(1, blend)));
    color = lerp(color, WHITE, 0.5);
  }

  // Tagline rule
  if (y >= 140 && y <= 143 && x >= 24 && x <= 140) {
    color = lerp(GREY, ACCENT2, 0.5);
  }

  return color;
});

// ── LICENSE.rtf ───────────────────────────────────────────────────────────────
// Minimal RTF that NSIS can render in the licence page.
const rtf = String.raw`{\rtf1\ansi\ansicpg1252\deff0
{\fonttbl{\f0\fnil\fcharset0 Segoe UI;}}
{\colortbl;\red13\green13\blue15;\red102\green51\blue255;\red200\green200\blue220;}
\viewkind4\uc1\pard\cf3\f0\fs20
{\b\fs28 Z-GL Shader Editor — End-User Licence Agreement}\par
\par
Copyright \u169? 2026 Z-GL\par
\par
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to use the Software for personal and commercial purposes, subject to the following conditions:\par
\par
{\b 1. Restrictions}\par
You may not: (a) redistribute, sublicense, or sell copies of the Software; (b) remove or alter any copyright notices; (c) reverse-engineer the Software except as permitted by applicable law.\par
\par
{\b 2. Disclaimer of Warranty}\par
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.\par
\par
{\b 3. Limitation of Liability}\par
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\par
\par
By clicking "I Agree" you accept these terms.\par
}`;

writeFileSync(join(OUT, "LICENSE.rtf"), rtf, "utf8");
console.log(`  ✓  src-tauri/installer/LICENSE.rtf`);

console.log("\n✅  All installer assets generated in src-tauri/installer/");
console.log(
  "   Run this script again any time you update the brand colours or tagline."
);
