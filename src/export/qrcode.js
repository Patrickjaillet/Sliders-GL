// §10.2 — Générateur de QR Code autonome (mode octet, ECC, sélection de masque)
//
// Implémentation compacte et correcte (algorithme de référence Nayuki, domaine
// public), sans dépendance externe — l'app reste 100 % hors-ligne. Encode du
// texte UTF-8 en mode octet, choisit automatiquement la plus petite version
// (1–40) pour le niveau de correction donné, applique le meilleur masque.

// Tables officielles (version 1..40). Pour rester compact on encode :
//  - nombre de codewords ECC par bloc
//  - nombre de blocs groupe 1 / groupe 2
// Source : ISO/IEC 18004, tables reproduites par Nayuki (domaine public).
const ECC_PER_BLOCK = {
  L: [7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
  M: [10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
  Q: [13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
  H: [17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
};
const NUM_BLOCKS = {
  L: [1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
  M: [1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
  Q: [1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
  H: [1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81],
};
const ALIGN_POS = [
  [],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],
  [6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],
  [6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],
  [6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],
  [6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],
  [6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],
  [6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170],
];

// ── Galois field GF(256), poly 0x11D ──────────────────────────────────────────
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
function gfMul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

function rsGenPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}
function rsEncode(data, eccLen) {
  const gen = rsGenPoly(eccLen);
  const res = new Array(eccLen).fill(0);
  for (const b of data) {
    const factor = b ^ res[0];
    res.shift(); res.push(0);
    for (let i = 0; i < eccLen; i++) res[i] ^= gfMul(gen[i + 1], factor);
  }
  return res;
}

function _capacityBytes(version, level) {
  const total = _totalDataCodewords(version, level);
  // header : 4 bits mode + count bits (8 if v<10 else 16) + 4 terminator
  const countBits = version < 10 ? 8 : 16;
  return Math.floor((total * 8 - 4 - countBits) / 8);
}
function _numRawCodewords(version) {
  // total data modules / 8 (formule officielle)
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = ALIGN_POS[version - 1].length;
    modules -= (25 * align - 10) * align - 55;
    if (version >= 7) modules -= 36;
  }
  return Math.floor(modules / 8);
}
function _totalDataCodewords(version, level) {
  const blocks = NUM_BLOCKS[level][version - 1];
  const ecc = ECC_PER_BLOCK[level][version - 1];
  return _numRawCodewords(version) - ecc * blocks;
}

function _pickVersion(byteLen, level) {
  for (let v = 1; v <= 40; v++) if (_capacityBytes(v, level) >= byteLen) return v;
  return -1;
}

// ── Construction de la matrice ────────────────────────────────────────────────
function _buildMatrix(version, level, dataBytes) {
  const size = version * 4 + 17;
  const grid = Array.from({ length: size }, () => new Int8Array(size).fill(-1)); // -1 = libre
  const fn = Array.from({ length: size }, () => new Uint8Array(size)); // module fonctionnel ?

  const setFn = (r, c, v) => { if (r >= 0 && r < size && c >= 0 && c < size) { grid[r][c] = v; fn[r][c] = 1; } };

  // Finder + séparateurs
  const finder = (R, C) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const r = R + dr, c = C + dc;
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      const inRing = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) || (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6));
      const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      setFn(r, c, inRing || inCore ? 1 : 0);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  // Timing
  for (let i = 8; i < size - 8; i++) { setFn(6, i, i % 2 === 0 ? 1 : 0); setFn(i, 6, i % 2 === 0 ? 1 : 0); }

  // Alignement
  const ap = ALIGN_POS[version - 1];
  for (const r of ap) for (const c of ap) {
    if ((r <= 7 && c <= 7) || (r <= 7 && c >= size - 8) || (r >= size - 8 && c <= 7)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const ring = Math.max(Math.abs(dr), Math.abs(dc));
      setFn(r + dr, c + dc, ring === 1 ? 0 : 1);
    }
  }

  // Dark module + réservation format/version
  setFn(size - 8, 8, 1);
  // i===6 est la croisée avec les patterns de synchronisation (timing) :
  // ne pas l'écraser, sinon le QR devient illisible.
  for (let i = 0; i < 9; i++) { if (i === 6) continue; setFn(8, i, 0); setFn(i, 8, 0); }
  for (let i = 0; i < 8; i++) { setFn(8, size - 1 - i, 0); setFn(size - 1 - i, 8, 0); }
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = Math.floor(i / 3), b = i % 3;
      setFn(size - 11 + b, a, 0); setFn(a, size - 11 + b, 0);
    }
  }

  // Flux de bits → placement zig-zag
  const bits = [];
  for (const byte of dataBytes) for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  let bi = 0;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let t = 0; t < size; t++) {
      for (let k = 0; k < 2; k++) {
        const c = col - k;
        const upward = ((col + 1) & 2) === 0;
        const r = upward ? size - 1 - t : t;
        if (fn[r][c]) continue;
        grid[r][c] = bi < bits.length ? bits[bi++] : 0;
      }
    }
  }

  return { grid, fn, size };
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function _applyMaskAndFormat(base, version, level, mask) {
  const { fn, size } = base;
  const grid = base.grid.map(row => Int8Array.from(row));
  const fmtBits = _formatBits(level, mask);
  // format info
  for (let i = 0; i <= 5; i++) { grid[8][i] = fmtBits[i]; grid[i][8] = fmtBits[14 - i]; }
  grid[8][7] = fmtBits[6]; grid[8][8] = fmtBits[7]; grid[7][8] = fmtBits[8];
  for (let i = 9; i < 15; i++) grid[14 - i][8] = fmtBits[i];
  for (let i = 0; i < 8; i++) grid[8][size - 1 - i] = fmtBits[i];
  for (let i = 8; i < 15; i++) grid[size - 15 + i][8] = fmtBits[i];
  grid[size - 8][8] = 1;
  if (version >= 7) {
    const vb = _versionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = vb[17 - i];
      const a = Math.floor(i / 3), b = i % 3;
      grid[size - 11 + b][a] = bit; grid[a][size - 11 + b] = bit;
    }
  }
  // masque sur les modules de données
  const fmask = MASKS[mask];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (!fn[r][c] && fmask(r, c)) grid[r][c] ^= 1;
  }
  return grid;
}

function _formatBits(level, mask) {
  const lvlBits = { L: 1, M: 0, Q: 3, H: 2 }[level];
  let data = (lvlBits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >> 9) & 1) * 0x537);
  let bits = ((data << 10) | rem) ^ 0x5412;
  const out = [];
  for (let i = 14; i >= 0; i--) out.push((bits >> i) & 1);
  return out;
}
function _versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ (((rem >> 11) & 1) * 0x1F25);
  let bits = (version << 12) | rem;
  const out = [];
  for (let i = 17; i >= 0; i--) out.push((bits >> i) & 1);
  return out;
}

function _penalty(grid, size) {
  let p = 0;
  // règle 1 : runs ≥5
  for (let r = 0; r < size; r++) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      if (grid[r][c] === grid[r][c - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
      else run = 1;
    }
  }
  for (let c = 0; c < size; c++) {
    let run = 1;
    for (let r = 1; r < size; r++) {
      if (grid[r][c] === grid[r - 1][c]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
      else run = 1;
    }
  }
  // règle 2 : blocs 2×2
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = grid[r][c];
    if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) p += 3;
  }
  // règle 4 : balance noir/blanc
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (grid[r][c]) dark++;
  const ratio = dark / (size * size);
  p += Math.floor(Math.abs(ratio * 100 - 50) / 5) * 10;
  return p;
}

/**
 * Génère une matrice QR (tableau 2D de 0/1) pour le texte donné.
 * @param {string} text
 * @param {'L'|'M'|'Q'|'H'} [level]
 * @returns {{matrix:number[][], size:number}|null}  null si trop long
 */
export function makeQR(text, level = 'M') {
  const enc = new TextEncoder().encode(text);
  const version = _pickVersion(enc.length, level);
  if (version < 0) return null;

  const countBits = version < 10 ? 8 : 16;
  // flux de bits : mode 0100, count, données
  const bitsArr = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bitsArr.push((val >> i) & 1); };
  push(0b0100, 4);
  push(enc.length, countBits);
  for (const b of enc) push(b, 8);

  const totalData = _totalDataCodewords(version, level);
  const capacityBits = totalData * 8;
  // terminateur
  for (let i = 0; i < 4 && bitsArr.length < capacityBits; i++) bitsArr.push(0);
  // padding à l'octet
  while (bitsArr.length % 8 !== 0) bitsArr.push(0);
  // codewords data
  const dataCw = [];
  for (let i = 0; i < bitsArr.length; i += 8) {
    let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bitsArr[i + j];
    dataCw.push(b);
  }
  // pad bytes
  const pads = [0xEC, 0x11];
  let pi = 0;
  while (dataCw.length < totalData) { dataCw.push(pads[pi % 2]); pi++; }

  // découpe en blocs + ECC entrelacés
  const numBlocks = NUM_BLOCKS[level][version - 1];
  const eccLen = ECC_PER_BLOCK[level][version - 1];
  const shortLen = Math.floor(totalData / numBlocks);
  const numLong = totalData % numBlocks;
  const dataBlocks = [];
  const eccBlocks = [];
  let off = 0;
  for (let b = 0; b < numBlocks; b++) {
    const len = shortLen + (b >= numBlocks - numLong ? 1 : 0);
    const blk = dataCw.slice(off, off + len); off += len;
    dataBlocks.push(blk);
    eccBlocks.push(rsEncode(blk, eccLen));
  }
  const finalCw = [];
  const maxData = shortLen + (numLong > 0 ? 1 : 0);
  for (let i = 0; i < maxData; i++) for (let b = 0; b < numBlocks; b++) {
    if (i < dataBlocks[b].length) finalCw.push(dataBlocks[b][i]);
  }
  for (let i = 0; i < eccLen; i++) for (let b = 0; b < numBlocks; b++) finalCw.push(eccBlocks[b][i]);

  const base = _buildMatrix(version, level, finalCw);
  // sélection du meilleur masque
  let best = null, bestPen = Infinity, bestMask = 0;
  for (let m = 0; m < 8; m++) {
    const g = _applyMaskAndFormat(base, version, level, m);
    const pen = _penalty(g, base.size);
    if (pen < bestPen) { bestPen = pen; best = g; bestMask = m; }
  }
  void bestMask;
  const matrix = best.map(row => Array.from(row));
  return { matrix, size: base.size };
}

/** Dessine un QR dans un canvas (modules noirs sur fond clair). */
export function drawQR(canvas, text, { level = 'M', scale = 4, margin = 4, dark = '#000', light = '#fff' } = {}) {
  const qr = makeQR(text, /** @type {'L'|'M'|'Q'|'H'} */ (level));
  if (!qr) return false;
  const dim = (qr.size + margin * 2) * scale;
  canvas.width = dim; canvas.height = dim;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = light; ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = dark;
  for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) {
    if (qr.matrix[r][c]) ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
  }
  return true;
}
