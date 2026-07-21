const INDENT = '  ';

const PREPROCESSOR_RE = /^\s*#/;
const BLOCK_OPEN_RE   = /\{[^}]*$/;
const BLOCK_CLOSE_RE  = /^\s*\}/;

function _tokenise(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '/') {
      let end = src.indexOf('\n', i);
      if (end === -1) end = src.length;
      tokens.push({ type: 'line_comment', text: src.slice(i, end) });
      i = end;
      continue;
    }
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const close = end === -1 ? src.length : end + 2;
      tokens.push({ type: 'block_comment', text: src.slice(i, close) });
      i = close;
      continue;
    }
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i];
      let j = i + 1;
      while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; }
      tokens.push({ type: 'string', text: src.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    tokens.push({ type: 'code', text: src[i] });
    i++;
  }
  return tokens;
}

function _stripAndRestore(src) {
  const slots = [];
  const tokens = _tokenise(src);
  let code = '';
  for (const tok of tokens) {
    if (tok.type === 'line_comment' || tok.type === 'block_comment' || tok.type === 'string') {
      slots.push(tok.text);
      code += `\x00SLOT${slots.length - 1}\x00`;
    } else {
      code += tok.text;
    }
  }
  return { code, slots };
}

function _restore(code, slots) {
  return code.replace(/\x00SLOT(\d+)\x00/g, (_, i) => slots[Number(i)]);
}

function _normaliseOperators(code) {
  code = code.replace(/[ \t]*([,;])[ \t]*/g, '$1 ');
  code = code.replace(/\s*([=+\-*/%&|^~!<>?:]+)\s*/g, (m, op) => {
    const no_space = ['++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
      '<=', '>=', '==', '!=', '&&', '||', '<<', '>>', '<<=', '>>=', '!', '~',
      '->', '::'];
    const unary = ['!', '~'];
    if (no_space.includes(op.trim())) return ` ${op.trim()} `;
    if (unary.includes(op.trim())) return op.trim();
    return ` ${op.trim()} `;
  });
  code = code.replace(/\(\s+/g, '(');
  code = code.replace(/\s+\)/g, ')');
  code = code.replace(/\[\s+/g, '[');
  code = code.replace(/\s+\]/g, ']');
  code = code.replace(/\s*\.\s*/g, '.');
  code = code.replace(/([,;]) +/g, '$1 ');
  code = code.replace(/ +([,;])/g, '$1');
  return code;
}

function _splitLines(code) {
  const raw = code.split('\n');
  const out = [];
  for (const line of raw) {
    const trimmed = line.trim();
    if (!trimmed) { out.push(''); continue; }
    if (PREPROCESSOR_RE.test(trimmed)) { out.push(trimmed); continue; }
    const parts = trimmed
      .replace(/\{/g, '{\n')
      .replace(/\}/g, '\n}\n')
      .replace(/;(?!\n)/g, ';\n')
      .split('\n');
    for (const p of parts) {
      const t = p.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

function _indent(lines) {
  let depth = 0;
  const out = [];
  for (const line of lines) {
    if (!line) { out.push(''); continue; }
    if (PREPROCESSOR_RE.test(line)) { out.push(line); continue; }
    const closes = BLOCK_CLOSE_RE.test(line);
    if (closes && depth > 0) depth--;
    out.push(INDENT.repeat(depth) + line);
    if (BLOCK_OPEN_RE.test(line)) depth++;
  }
  return out;
}

function _collapseBlankLines(lines) {
  const out = [];
  let prev_blank = false;
  for (const line of lines) {
    const blank = line.trim() === '';
    if (blank && prev_blank) continue;
    out.push(line);
    prev_blank = blank;
  }
  return out;
}

/**
 * Flash "FORMATTED ✓" in the status bar for 1.2 s.
 */
export function flashFormattedStatus() {
  const badge = document.getElementById('statusBadge');
  const txt   = document.getElementById('stxt');
  if (!txt || !badge) return;
  const prevText  = txt.textContent;
  const prevClass = badge.className;
  txt.textContent = 'FORMATTED ✓';
  badge.className = 'status-badge ok';
  setTimeout(() => {
    txt.textContent = prevText;
    badge.className = prevClass;
  }, 1200);
}

export function formatGLSL(src) {
  const { code, slots } = _stripAndRestore(src);
  let processed = _normaliseOperators(code);
  const raw_lines = _splitLines(processed);
  const indented  = _indent(raw_lines);
  const collapsed = _collapseBlankLines(indented);
  const joined    = collapsed.join('\n').trim() + '\n';
  return _restore(joined, slots);
}
