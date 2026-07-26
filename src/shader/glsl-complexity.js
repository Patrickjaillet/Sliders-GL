const STRIP_COMMENTS_RE = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g;

const TEXTURE_RE    = /\b(texture2D|texture|textureLod|textureCube|texture2DLod|textureSample)\s*\(/g;
const TRIG_RE       = /\b(sin|cos|tan|asin|acos|atan|sinh|cosh|tanh)\s*\(/g;
const SQRT_RE       = /\b(sqrt|inversesqrt|pow|exp|exp2|log|log2)\s*\(/g;
const LOOP_RE       = /\bfor\s*\([^)]*\)/g;
const LOOP_BOUND_RE = /[<>]=?\s*(\d+)/;
const BRANCH_RE     = /\bif\s*\(/g;
const DISCARD_RE    = /\bdiscard\b/g;
const STRUCT_RE     = /\bstruct\b/g;
const FUNC_DEF_RE   = /\b(?:void|float|vec[234]|mat[234]|int|bool)\s+\w+\s*\([^)]*\)\s*\{/g;

const WEIGHTS = {
  textureSample:  12,
  trig:            4,
  sqrt:            3,
  loopBase:       10,
  loopPerIter:     5,
  loopDefault:    32,
  branch:          2,
  discard:         5,
  struct:          1,
  funcDef:         3,
};

const BANDS = [
  { max:  30, label: 'Simple',   cls: 'score-simple'   },
  { max:  70, label: 'Medium',   cls: 'score-medium'   },
  { max: 120, label: 'Heavy',    cls: 'score-heavy'    },
  { max: Infinity, label: 'Complex', cls: 'score-complex' },
];

export function scoreGLSL(src) {
  if (!src || !src.trim()) return null;

  const clean = src.replace(STRIP_COMMENTS_RE, '');

  const textures  = (clean.match(TEXTURE_RE)  || []).length;
  const trigs     = (clean.match(TRIG_RE)     || []).length;
  const sqrts     = (clean.match(SQRT_RE)     || []).length;
  const branches  = (clean.match(BRANCH_RE)   || []).length;
  const discards  = (clean.match(DISCARD_RE)  || []).length;
  const structs   = (clean.match(STRUCT_RE)   || []).length;
  const funcDefs  = (clean.match(FUNC_DEF_RE) || []).length;

  let loopScore = 0;
  for (const m of clean.matchAll(LOOP_RE)) {
    const bound = LOOP_BOUND_RE.exec(m[0]);
    const iters = bound ? Number(bound[1]) : WEIGHTS.loopDefault;
    loopScore += WEIGHTS.loopBase + iters * WEIGHTS.loopPerIter;
  }

  const raw = (
    textures * WEIGHTS.textureSample +
    trigs    * WEIGHTS.trig          +
    sqrts    * WEIGHTS.sqrt          +
    loopScore                        +
    branches * WEIGHTS.branch        +
    discards * WEIGHTS.discard       +
    structs  * WEIGHTS.struct        +
    funcDefs * WEIGHTS.funcDef
  );

  const score = Math.round(raw);
  const band  = BANDS.find(b => score <= b.max);

  return {
    score,
    label:    band.label,
    cls:      band.cls,
    detail: {
      textures,
      trig:     trigs,
      math:     sqrts,
      loops:    (clean.match(LOOP_RE) || []).length,
      branches,
      funcDefs,
    },
  };
}
