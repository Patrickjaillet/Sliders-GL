import { GLSL_DOCS, glslFormatHover } from '../shader/glsl-docs-db.js';
/**
 * glsl-language.js
 * Registers a full GLSL ES 3.0 language definition in Monaco, including:
 *   - Syntax tokenizer (keywords, types, qualifiers, preprocessor, builtins)
 *   - Language configuration (brackets, auto-closing pairs, comments)
 *   - Semantic token provider (ShaderToy uniforms coloured as a distinct token type)
 *   - Hover provider (signatures for common built-ins)
 */

// ── Token sets ────────────────────────────────────────────────────────────────

export const KEYWORDS = [
  // Control flow
  'if','else','for','while','do','switch','case','default',
  'break','continue','return','discard',
  // Declaration / structure
  'struct','void',
  // Precision
  'precision','highp','mediump','lowp',
  // Storage qualifiers (ES 3.0)
  'uniform','in','out','inout','const','attribute','varying',
  'layout','location','binding',
  // GLSL ES 3.0 block qualifiers
  'flat','smooth','centroid',
  // Interface blocks (ES 3.0)
  'interface','buffer',
  // Memory qualifiers (ES 3.1+, included for completeness)
  'coherent','volatile','restrict','readonly','writeonly',
  // Invariance / auxiliary
  'invariant','precise',
  // Boolean literals (treated as keywords in GLSL)
  'true','false',
];

export const TYPES = [
  // Scalar
  'float','double','int','uint','bool',
  // Float vectors
  'vec2','vec3','vec4',
  // Double vectors (desktop GLSL, included for completeness)
  'dvec2','dvec3','dvec4',
  // Int vectors
  'ivec2','ivec3','ivec4',
  // Uint vectors
  'uvec2','uvec3','uvec4',
  // Bool vectors
  'bvec2','bvec3','bvec4',
  // Float matrices
  'mat2','mat3','mat4',
  'mat2x2','mat2x3','mat2x4',
  'mat3x2','mat3x3','mat3x4',
  'mat4x2','mat4x3','mat4x4',
  // Samplers — ES 3.0
  'sampler2D','sampler3D','samplerCube',
  'sampler2DShadow','samplerCubeShadow',
  'sampler2DArray','sampler2DArrayShadow',
  'isampler2D','isampler3D','isamplerCube','isampler2DArray',
  'usampler2D','usampler3D','usamplerCube','usampler2DArray',
  // Legacy
  'sampler2DRect','sampler2DMS',
];

export const BUILTIN_FUNCTIONS = [
  // Angle & trig
  'radians','degrees',
  'sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','asinh','acosh','atanh',
  // Exponential
  'pow','exp','log','exp2','log2','sqrt','inversesqrt',
  // Common
  'abs','sign','floor','trunc','round','roundEven','ceil','fract',
  'mod','modf','min','max','clamp','mix','step','smoothstep','isnan','isinf',
  'floatBitsToInt','floatBitsToUint','intBitsToFloat','uintBitsToFloat',
  'packSnorm2x16','unpackSnorm2x16','packUnorm2x16','unpackUnorm2x16',
  'packHalf2x16','unpackHalf2x16',
  // Geometric
  'length','distance','dot','cross','normalize','faceforward','reflect','refract',
  // Matrix
  'matrixCompMult','outerProduct','transpose','determinant','inverse',
  // Vector relational
  'lessThan','lessThanEqual','greaterThan','greaterThanEqual','equal','notEqual','any','all','not',
  // Texture (ES 3.0)
  'texture','textureProj','textureLod','textureOffset','texelFetch','texelFetchOffset',
  'textureProjOffset','textureLodOffset','textureProjLod','textureProjLodOffset',
  'textureGrad','textureGradOffset','textureProjGrad','textureProjGradOffset',
  'textureSize',
  // Legacy texture
  'texture2D','texture2DProj','texture2DLod','textureCube','textureCubeLod',
  // Fragment
  'dFdx','dFdy','fwidth',
  // Emit (geometry, included for completeness)
  'EmitVertex','EndPrimitive',
];

export const BUILTIN_VARIABLES = [
  // Vertex
  'gl_Position','gl_PointSize','gl_VertexID','gl_InstanceID',
  // Fragment
  'gl_FragCoord','gl_FrontFacing','gl_FragDepth','gl_PointCoord',
  'gl_SampleID','gl_SamplePosition','gl_SampleMaskIn','gl_SampleMask',
  // Deprecated fragment
  'gl_FragColor','gl_FragData',
];

export const PREPROCESSOR_DIRECTIVES = [
  'define','undef','if','ifdef','ifndef','else','elif','endif',
  'error','pragma','extension','version','line',
];

// ── ShaderToy built-in uniforms (semantic token targets) ──────────────────────

export const SHADERTOY_UNIFORMS = [
  'iResolution',
  'iTime',
  'iTimeDelta',
  'iFrameRate',
  'iFrame',
  'iMouse',
  'iDate',
  'iSampleRate',
  'iChannel0',
  'iChannel1',
  'iChannel2',
  'iChannel3',
  'iChannelTime',
  'iChannelResolution',
];

/** Regex that matches any ShaderToy uniform as a whole word. */
const SHADERTOY_RE = new RegExp(
  `\\b(${SHADERTOY_UNIFORMS.join('|')})\\b`,
  'g',
);

// ── Semantic token legend ─────────────────────────────────────────────────────

/**
 * We use a single custom token type "shadertoyUniform" so themes can target it
 * via the `variable.shadertoy` CSS/Monaco selector.
 * Exposed so editor.js can reference the same legend when defining themes.
 */
export const SEMANTIC_LEGEND = {
  tokenTypes:     ['shadertoyUniform'],
  tokenModifiers: [],
};



/**
 * Hover entry shape:
 *   { signatures: string[], doc: string }
 *
 * `signatures` — one entry per overload, shown in a glsl code block.
 * `doc`        — plain-English description shown below the signatures.
 *
 * Rendered by provideHover() as:
 *   ```glsl
 *   <signatures joined by \n>
 *   ```
 *   <doc>
 */

// Helper — build the markdown string from an entry.
// formatHover for legacy entries (using old {signatures, doc} shape)
function formatHover({ signatures, doc }) {
  return `\`\`\`glsl\n${signatures.join('\n')}\n\`\`\`\n${doc}`;
}

// Build merged hover DB: new GLSL_DOCS entries take priority over legacy HOVER_DB
function _buildMergedHoverDB(legacyDB) {
  const merged = {};
  // Add legacy entries first
  for (const [k, v] of Object.entries(legacyDB)) merged[k] = { _legacy: true, ...v };
  // Override/add new entries from GLSL_DOCS
  for (const [k, v] of Object.entries(GLSL_DOCS)) {
    merged[k] = { _new: true, ...v };
  }
  return merged;
}

const _LEGACY_HOVER_DB = {

  // ── Angle & trigonometry ────────────────────────────────────────────────────

  radians: {
    signatures: ['genType radians(genType degrees)'],
    doc: 'Converts degrees to radians. Applied component-wise to vector types.',
  },
  degrees: {
    signatures: ['genType degrees(genType radians)'],
    doc: 'Converts radians to degrees. Applied component-wise to vector types.',
  },
  sin: {
    signatures: ['genType sin(genType angle)'],
    doc: 'Returns the sine of `angle` (in radians). Applied component-wise.',
  },
  cos: {
    signatures: ['genType cos(genType angle)'],
    doc: 'Returns the cosine of `angle` (in radians). Applied component-wise.',
  },
  tan: {
    signatures: ['genType tan(genType angle)'],
    doc: 'Returns the tangent of `angle` (in radians). Applied component-wise.',
  },
  asin: {
    signatures: ['genType asin(genType x)'],
    doc: 'Arc-sine — returns an angle in [−π/2, π/2] whose sine is `x`. Results undefined for |x| > 1.',
  },
  acos: {
    signatures: ['genType acos(genType x)'],
    doc: 'Arc-cosine — returns an angle in [0, π] whose cosine is `x`. Results undefined for |x| > 1.',
  },
  atan: {
    signatures: [
      'genType atan(genType y, genType x)',
      'genType atan(genType y_over_x)',
    ],
    doc: 'Arc-tangent. Two-argument form returns the angle of the vector (x, y) in [−π, π], matching `atan2`. Single-argument form returns the angle in [−π/2, π/2].',
  },
  sinh: {
    signatures: ['genType sinh(genType x)'],
    doc: 'Hyperbolic sine: (eˣ − e⁻ˣ) / 2. Applied component-wise.',
  },
  cosh: {
    signatures: ['genType cosh(genType x)'],
    doc: 'Hyperbolic cosine: (eˣ + e⁻ˣ) / 2. Applied component-wise.',
  },
  tanh: {
    signatures: ['genType tanh(genType x)'],
    doc: 'Hyperbolic tangent: sinh(x) / cosh(x). Applied component-wise.',
  },
  asinh: {
    signatures: ['genType asinh(genType x)'],
    doc: 'Inverse hyperbolic sine. Applied component-wise.',
  },
  acosh: {
    signatures: ['genType acosh(genType x)'],
    doc: 'Inverse hyperbolic cosine. Result undefined for x < 1. Applied component-wise.',
  },
  atanh: {
    signatures: ['genType atanh(genType x)'],
    doc: 'Inverse hyperbolic tangent. Result undefined for |x| ≥ 1. Applied component-wise.',
  },

  // ── Exponential ─────────────────────────────────────────────────────────────

  pow: {
    signatures: ['genType pow(genType x, genType y)'],
    doc: 'Returns x raised to the power y (xʸ). Result undefined if x < 0, or if x = 0 and y ≤ 0.',
  },
  exp: {
    signatures: ['genType exp(genType x)'],
    doc: 'Natural exponentiation — returns eˣ. Applied component-wise.',
  },
  log: {
    signatures: ['genType log(genType x)'],
    doc: 'Natural logarithm — returns ln(x). Result undefined for x ≤ 0.',
  },
  exp2: {
    signatures: ['genType exp2(genType x)'],
    doc: 'Returns 2 raised to the power x (2ˣ). Applied component-wise.',
  },
  log2: {
    signatures: ['genType log2(genType x)'],
    doc: 'Base-2 logarithm. Result undefined for x ≤ 0.',
  },
  sqrt: {
    signatures: ['genType sqrt(genType x)'],
    doc: 'Square root of x. Result undefined for x < 0.',
  },
  inversesqrt: {
    signatures: ['genType inversesqrt(genType x)'],
    doc: 'Returns 1 / sqrt(x). Faster than computing separately. Result undefined for x ≤ 0.',
  },

  // ── Common math ─────────────────────────────────────────────────────────────

  abs: {
    signatures: [
      'genType  abs(genType  x)',
      'genIType abs(genIType x)',
    ],
    doc: 'Absolute value — returns x if x ≥ 0, otherwise −x. Applied component-wise.',
  },
  sign: {
    signatures: [
      'genType  sign(genType  x)',
      'genIType sign(genIType x)',
    ],
    doc: 'Returns 1.0 if x > 0, 0.0 if x = 0, −1.0 if x < 0. Applied component-wise.',
  },
  floor: {
    signatures: ['genType floor(genType x)'],
    doc: 'Returns the largest integer value ≤ x (round toward −∞). Applied component-wise.',
  },
  trunc: {
    signatures: ['genType trunc(genType x)'],
    doc: 'Returns the integer part of x by truncating toward zero. Applied component-wise.',
  },
  round: {
    signatures: ['genType round(genType x)'],
    doc: 'Rounds to the nearest integer. Halfway cases may round to even (implementation-defined). Applied component-wise.',
  },
  roundEven: {
    signatures: ['genType roundEven(genType x)'],
    doc: 'Rounds to the nearest even integer for halfway values (banker\'s rounding). Applied component-wise.',
  },
  ceil: {
    signatures: ['genType ceil(genType x)'],
    doc: 'Returns the smallest integer value ≥ x (round toward +∞). Applied component-wise.',
  },
  fract: {
    signatures: ['genType fract(genType x)'],
    doc: 'Returns the fractional part of x — equivalent to `x − floor(x)`. Applied component-wise. Common in procedural shaders.',
  },
  mod: {
    signatures: [
      'genType mod(genType x, float y)',
      'genType mod(genType x, genType y)',
    ],
    doc: 'Modulo — returns x − y · floor(x/y). Unlike GLSL integer `%`, result has the same sign as y. Applied component-wise.',
  },
  modf: {
    signatures: ['genType modf(genType x, out genType i)'],
    doc: 'Separates x into its integer part (written to `i`) and fractional part (returned). Both have the same sign as x.',
  },
  min: {
    signatures: [
      'genType  min(genType  x, genType  y)',
      'genType  min(genType  x, float   y)',
      'genIType min(genIType x, genIType y)',
      'genUType min(genUType x, genUType y)',
    ],
    doc: 'Component-wise minimum — returns the smaller of x and y.',
  },
  max: {
    signatures: [
      'genType  max(genType  x, genType  y)',
      'genType  max(genType  x, float   y)',
      'genIType max(genIType x, genIType y)',
      'genUType max(genUType x, genUType y)',
    ],
    doc: 'Component-wise maximum — returns the larger of x and y.',
  },
  clamp: {
    signatures: [
      'genType  clamp(genType  x, genType  minVal, genType  maxVal)',
      'genType  clamp(genType  x, float    minVal, float    maxVal)',
      'genIType clamp(genIType x, genIType minVal, genIType maxVal)',
      'genUType clamp(genUType x, genUType minVal, genUType maxVal)',
    ],
    doc: 'Clamps x to the range [minVal, maxVal]. Equivalent to `min(max(x, minVal), maxVal)`. Result undefined if minVal > maxVal.',
  },
  mix: {
    signatures: [
      'genType mix(genType x, genType y, genType  a)',
      'genType mix(genType x, genType y, float    a)',
      'genType mix(genType x, genType y, genBType a)',
    ],
    doc: 'Linear interpolation — returns x · (1 − a) + y · a. The boolean overload selects component-wise from x (false) or y (true).',
  },
  step: {
    signatures: [
      'genType step(genType edge, genType x)',
      'genType step(float   edge, genType x)',
    ],
    doc: 'Returns 0.0 if x < edge, otherwise 1.0. Useful as a sharp threshold.',
  },
  smoothstep: {
    signatures: [
      'genType smoothstep(genType edge0, genType edge1, genType x)',
      'genType smoothstep(float   edge0, float   edge1, genType x)',
    ],
    doc: 'Smooth Hermite interpolation between 0 and 1 when edge0 < x < edge1. Uses the cubic t² (3 − 2t). Result undefined if edge0 ≥ edge1.',
  },
  isnan: {
    signatures: ['genBType isnan(genType x)'],
    doc: 'Returns true for each component that is NaN. Always returns false if the implementation does not support NaN.',
  },
  isinf: {
    signatures: ['genBType isinf(genType x)'],
    doc: 'Returns true for each component that is ±infinity.',
  },
  floatBitsToInt: {
    signatures: ['genIType floatBitsToInt(genType value)'],
    doc: 'Reinterprets the bit pattern of a float as a signed integer — no value conversion.',
  },
  floatBitsToUint: {
    signatures: ['genUType floatBitsToUint(genType value)'],
    doc: 'Reinterprets the bit pattern of a float as an unsigned integer — no value conversion.',
  },
  intBitsToFloat: {
    signatures: ['genType intBitsToFloat(genIType value)'],
    doc: 'Reinterprets the bit pattern of a signed integer as a float — no value conversion.',
  },
  uintBitsToFloat: {
    signatures: ['genType uintBitsToFloat(genUType value)'],
    doc: 'Reinterprets the bit pattern of an unsigned integer as a float — no value conversion.',
  },
  packSnorm2x16: {
    signatures: ['uint packSnorm2x16(vec2 v)'],
    doc: 'Packs two floats in [−1, 1] into a single uint as two 16-bit signed normalized integers.',
  },
  unpackSnorm2x16: {
    signatures: ['vec2 unpackSnorm2x16(uint p)'],
    doc: 'Unpacks two 16-bit signed normalized integers from a uint into a vec2 in [−1, 1].',
  },
  packUnorm2x16: {
    signatures: ['uint packUnorm2x16(vec2 v)'],
    doc: 'Packs two floats in [0, 1] into a single uint as two 16-bit unsigned normalized integers.',
  },
  unpackUnorm2x16: {
    signatures: ['vec2 unpackUnorm2x16(uint p)'],
    doc: 'Unpacks two 16-bit unsigned normalized integers from a uint into a vec2 in [0, 1].',
  },
  packHalf2x16: {
    signatures: ['uint packHalf2x16(vec2 v)'],
    doc: 'Packs two floats as 16-bit half-precision floats into a single uint.',
  },
  unpackHalf2x16: {
    signatures: ['vec2 unpackHalf2x16(uint v)'],
    doc: 'Unpacks two 16-bit half-precision floats from a uint into a vec2.',
  },

  // ── Geometric ───────────────────────────────────────────────────────────────

  length: {
    signatures: ['float length(genType x)'],
    doc: 'Returns the Euclidean length (magnitude) of vector x — sqrt(x[0]² + x[1]² + …).',
  },
  distance: {
    signatures: ['float distance(genType p0, genType p1)'],
    doc: 'Returns the Euclidean distance between two points — equivalent to `length(p0 − p1)`.',
  },
  dot: {
    signatures: ['float dot(genType x, genType y)'],
    doc: 'Dot product — returns the sum of component-wise products. Result is a scalar.',
  },
  cross: {
    signatures: ['vec3 cross(vec3 x, vec3 y)'],
    doc: 'Cross product of two vec3 vectors. Only defined for vec3. Result is perpendicular to both inputs.',
  },
  normalize: {
    signatures: ['genType normalize(genType x)'],
    doc: 'Returns a vector with the same direction as x but with length 1. Result undefined for zero-length vectors.',
  },
  faceforward: {
    signatures: ['genType faceforward(genType N, genType I, genType Nref)'],
    doc: 'Returns N if `dot(Nref, I) < 0`, otherwise −N. Used to orient a normal toward the incoming ray.',
  },
  reflect: {
    signatures: ['genType reflect(genType I, genType N)'],
    doc: 'Computes the reflection of incident vector I about normal N. N must be normalized. Returns `I − 2 · dot(N, I) · N`.',
  },
  refract: {
    signatures: ['genType refract(genType I, genType N, float eta)'],
    doc: 'Computes the refraction direction for incident vector I, surface normal N, and index-of-refraction ratio `eta`. Returns a zero vector on total internal reflection.',
  },

  // ── Matrix ──────────────────────────────────────────────────────────────────

  matrixCompMult: {
    signatures: ['mat matrixCompMult(mat x, mat y)'],
    doc: 'Component-wise matrix multiplication (Hadamard product). **Not** the same as matrix multiplication — use the `*` operator for that.',
  },
  outerProduct: {
    signatures: [
      'mat2 outerProduct(vec2 c, vec2 r)',
      'mat3 outerProduct(vec3 c, vec3 r)',
      'mat4 outerProduct(vec4 c, vec4 r)',
    ],
    doc: 'Outer product of column vector `c` and row vector `r`, producing a matrix.',
  },
  transpose: {
    signatures: ['mat transpose(mat m)'],
    doc: 'Returns the transpose of matrix m — rows become columns.',
  },
  determinant: {
    signatures: [
      'float determinant(mat2 m)',
      'float determinant(mat3 m)',
      'float determinant(mat4 m)',
    ],
    doc: 'Returns the determinant of a square matrix.',
  },
  inverse: {
    signatures: [
      'mat2 inverse(mat2 m)',
      'mat3 inverse(mat3 m)',
      'mat4 inverse(mat4 m)',
    ],
    doc: 'Returns the inverse of a square matrix. Result undefined if the matrix is singular.',
  },

  // ── Vector relational ───────────────────────────────────────────────────────

  lessThan: {
    signatures: [
      'bvec lessThan(vec  x, vec  y)',
      'bvec lessThan(ivec x, ivec y)',
      'bvec lessThan(uvec x, uvec y)',
    ],
    doc: 'Component-wise `x < y`, returning a bool vector.',
  },
  lessThanEqual: {
    signatures: [
      'bvec lessThanEqual(vec  x, vec  y)',
      'bvec lessThanEqual(ivec x, ivec y)',
      'bvec lessThanEqual(uvec x, uvec y)',
    ],
    doc: 'Component-wise `x ≤ y`, returning a bool vector.',
  },
  greaterThan: {
    signatures: [
      'bvec greaterThan(vec  x, vec  y)',
      'bvec greaterThan(ivec x, ivec y)',
      'bvec greaterThan(uvec x, uvec y)',
    ],
    doc: 'Component-wise `x > y`, returning a bool vector.',
  },
  greaterThanEqual: {
    signatures: [
      'bvec greaterThanEqual(vec  x, vec  y)',
      'bvec greaterThanEqual(ivec x, ivec y)',
      'bvec greaterThanEqual(uvec x, uvec y)',
    ],
    doc: 'Component-wise `x ≥ y`, returning a bool vector.',
  },
  equal: {
    signatures: [
      'bvec equal(vec  x, vec  y)',
      'bvec equal(ivec x, ivec y)',
      'bvec equal(uvec x, uvec y)',
      'bvec equal(bvec x, bvec y)',
    ],
    doc: 'Component-wise equality test, returning a bool vector.',
  },
  notEqual: {
    signatures: [
      'bvec notEqual(vec  x, vec  y)',
      'bvec notEqual(ivec x, ivec y)',
      'bvec notEqual(uvec x, uvec y)',
      'bvec notEqual(bvec x, bvec y)',
    ],
    doc: 'Component-wise inequality test, returning a bool vector.',
  },
  any: {
    signatures: ['bool any(bvec x)'],
    doc: 'Returns true if any component of the bool vector is true.',
  },
  all: {
    signatures: ['bool all(bvec x)'],
    doc: 'Returns true if all components of the bool vector are true.',
  },
  not: {
    signatures: ['bvec not(bvec x)'],
    doc: 'Logical complement — negates each component of a bool vector.',
  },

  // ── Texture sampling (ES 3.0) ───────────────────────────────────────────────

  texture: {
    signatures: [
      'vec4  texture(sampler2D   sampler, vec2  coord [, float bias])',
      'vec4  texture(sampler3D   sampler, vec3  coord [, float bias])',
      'vec4  texture(samplerCube sampler, vec3  coord [, float bias])',
      'vec4  texture(sampler2DArray sampler, vec3 coord [, float bias])',
      'float texture(sampler2DShadow   sampler, vec3 coord [, float bias])',
      'float texture(samplerCubeShadow sampler, vec4 coord [, float bias])',
    ],
    doc: 'Samples a texture at the given texture coordinates. Optional `bias` is added to the computed LOD. This is the ES 3.0 unified texture function.',
  },
  textureProj: {
    signatures: [
      'vec4 textureProj(sampler2D sampler, vec3 coord [, float bias])',
      'vec4 textureProj(sampler2D sampler, vec4 coord [, float bias])',
      'vec4 textureProj(sampler3D sampler, vec4 coord [, float bias])',
    ],
    doc: 'Projective texture lookup — divides `coord.xy` (or `.xyz`) by `coord.q` before sampling.',
  },
  textureLod: {
    signatures: [
      'vec4  textureLod(sampler2D   sampler, vec2 coord, float lod)',
      'vec4  textureLod(sampler3D   sampler, vec3 coord, float lod)',
      'vec4  textureLod(samplerCube sampler, vec3 coord, float lod)',
      'float textureLod(sampler2DShadow sampler, vec3 coord, float lod)',
    ],
    doc: 'Samples a texture at an explicit mip level `lod`. Level 0 is the full-resolution base image.',
  },
  textureOffset: {
    signatures: [
      'vec4  textureOffset(sampler2D sampler, vec2 coord, ivec2 offset [, float bias])',
      'vec4  textureOffset(sampler3D sampler, vec3 coord, ivec3 offset [, float bias])',
      'float textureOffset(sampler2DShadow sampler, vec3 coord, ivec2 offset [, float bias])',
    ],
    doc: 'Texture lookup with a per-component texel offset. `offset` must be a compile-time constant.',
  },
  texelFetch: {
    signatures: [
      'vec4 texelFetch(sampler2D sampler, ivec2 P, int lod)',
      'vec4 texelFetch(sampler3D sampler, ivec3 P, int lod)',
      'vec4 texelFetch(sampler2DArray sampler, ivec3 P, int lod)',
    ],
    doc: 'Fetches a single texel at integer coordinates `P` and explicit mip level. No filtering is applied.',
  },
  texelFetchOffset: {
    signatures: [
      'vec4 texelFetchOffset(sampler2D sampler, ivec2 P, int lod, ivec2 offset)',
      'vec4 texelFetchOffset(sampler3D sampler, ivec3 P, int lod, ivec3 offset)',
    ],
    doc: 'Like `texelFetch` but with a constant texel offset.',
  },
  textureProjOffset: {
    signatures: [
      'vec4 textureProjOffset(sampler2D sampler, vec3 coord, ivec2 offset [, float bias])',
      'vec4 textureProjOffset(sampler3D sampler, vec4 coord, ivec3 offset [, float bias])',
    ],
    doc: 'Projective texture lookup with a constant texel offset.',
  },
  textureLodOffset: {
    signatures: [
      'vec4  textureLodOffset(sampler2D sampler, vec2 coord, float lod, ivec2 offset)',
      'vec4  textureLodOffset(sampler3D sampler, vec3 coord, float lod, ivec3 offset)',
      'float textureLodOffset(sampler2DShadow sampler, vec3 coord, float lod, ivec2 offset)',
    ],
    doc: 'Texture lookup at explicit LOD with a constant texel offset.',
  },
  textureProjLod: {
    signatures: [
      'vec4 textureProjLod(sampler2D sampler, vec3 coord, float lod)',
      'vec4 textureProjLod(sampler3D sampler, vec4 coord, float lod)',
    ],
    doc: 'Projective texture lookup at an explicit mip level.',
  },
  textureProjLodOffset: {
    signatures: [
      'vec4 textureProjLodOffset(sampler2D sampler, vec3 coord, float lod, ivec2 offset)',
    ],
    doc: 'Projective texture lookup at explicit LOD with a constant texel offset.',
  },
  textureGrad: {
    signatures: [
      'vec4 textureGrad(sampler2D sampler, vec2 coord, vec2 dPdx, vec2 dPdy)',
      'vec4 textureGrad(sampler3D sampler, vec3 coord, vec3 dPdx, vec3 dPdy)',
      'vec4 textureGrad(samplerCube sampler, vec3 coord, vec3 dPdx, vec3 dPdy)',
    ],
    doc: 'Texture lookup with explicit screen-space derivative vectors `dPdx` and `dPdy` for LOD computation. Useful inside non-uniform control flow.',
  },
  textureGradOffset: {
    signatures: [
      'vec4 textureGradOffset(sampler2D sampler, vec2 coord, vec2 dPdx, vec2 dPdy, ivec2 offset)',
    ],
    doc: 'Like `textureGrad` but with a constant texel offset.',
  },
  textureProjGrad: {
    signatures: [
      'vec4 textureProjGrad(sampler2D sampler, vec3 coord, vec2 dPdx, vec2 dPdy)',
      'vec4 textureProjGrad(sampler3D sampler, vec4 coord, vec3 dPdx, vec3 dPdy)',
    ],
    doc: 'Projective texture lookup with explicit derivatives.',
  },
  textureProjGradOffset: {
    signatures: [
      'vec4 textureProjGradOffset(sampler2D sampler, vec3 coord, vec2 dPdx, vec2 dPdy, ivec2 offset)',
    ],
    doc: 'Projective texture lookup with explicit derivatives and a constant texel offset.',
  },
  textureSize: {
    signatures: [
      'ivec2 textureSize(sampler2D   sampler, int lod)',
      'ivec3 textureSize(sampler3D   sampler, int lod)',
      'ivec2 textureSize(samplerCube sampler, int lod)',
      'ivec3 textureSize(sampler2DArray sampler, int lod)',
    ],
    doc: 'Returns the dimensions of the texture at mip level `lod` in texels.',
  },

  // ── Legacy texture functions ─────────────────────────────────────────────────

  texture2D: {
    signatures: [
      'vec4 texture2D(sampler2D sampler, vec2 coord [, float bias])',
    ],
    doc: '**GLSL ES 1.0 legacy.** Prefer `texture()` in ES 3.0. Samples a 2D texture at `coord`.',
  },
  texture2DProj: {
    signatures: ['vec4 texture2DProj(sampler2D sampler, vec3 coord [, float bias])'],
    doc: '**GLSL ES 1.0 legacy.** Projective 2D texture lookup. Prefer `textureProj()` in ES 3.0.',
  },
  texture2DLod: {
    signatures: ['vec4 texture2DLod(sampler2D sampler, vec2 coord, float lod)'],
    doc: '**GLSL ES 1.0 legacy.** 2D texture lookup at explicit LOD. Prefer `textureLod()` in ES 3.0.',
  },
  textureCube: {
    signatures: ['vec4 textureCube(samplerCube sampler, vec3 coord [, float bias])'],
    doc: '**GLSL ES 1.0 legacy.** Cube-map texture lookup. Prefer `texture()` in ES 3.0.',
  },
  textureCubeLod: {
    signatures: ['vec4 textureCubeLod(samplerCube sampler, vec3 coord, float lod)'],
    doc: '**GLSL ES 1.0 legacy.** Cube-map texture lookup at explicit LOD. Prefer `textureLod()` in ES 3.0.',
  },

  // ── Fragment / screen-space derivatives ────────────────────────────────────

  dFdx: {
    signatures: ['genType dFdx(genType p)'],
    doc: 'Returns the partial derivative of `p` with respect to the window x coordinate. Computed from differences between adjacent fragments in the same 2×2 quad.',
  },
  dFdy: {
    signatures: ['genType dFdy(genType p)'],
    doc: 'Returns the partial derivative of `p` with respect to the window y coordinate. Computed from differences between adjacent fragments in the same 2×2 quad.',
  },
  fwidth: {
    signatures: ['genType fwidth(genType p)'],
    doc: 'Returns `abs(dFdx(p)) + abs(dFdy(p))` — the total screen-space rate of change. Commonly used for smooth anti-aliasing (e.g. `smoothstep(edge − fwidth(d), edge + fwidth(d), d)`).',
  },

  // ── Geometry shader emit ────────────────────────────────────────────────────

  EmitVertex: {
    signatures: ['void EmitVertex()'],
    doc: 'Geometry shader — emits the current output vertex, appending it to the current output primitive.',
  },
  EndPrimitive: {
    signatures: ['void EndPrimitive()'],
    doc: 'Geometry shader — ends the current output primitive and begins a new one.',
  },

  // ── GLSL ES keyword ─────────────────────────────────────────────────────────

  discard: {
    signatures: ['discard'],
    doc: 'Fragment shader only. Terminates execution of the current fragment — the fragment is not written to any buffer. Cannot be used in vertex shaders.',
  },

  // ── Built-in variables — fragment ───────────────────────────────────────────

  gl_FragCoord: {
    signatures: ['vec4 gl_FragCoord'],
    doc: 'Read-only. Window-space position of the fragment. `xy` are pixel coordinates (origin at lower-left), `z` is the depth value written to `gl_FragDepth` by default, and `w` is 1 / clip-space w.',
  },
  gl_FrontFacing: {
    signatures: ['bool gl_FrontFacing'],
    doc: 'Read-only. True if the fragment belongs to a front-facing primitive (determined by winding order).',
  },
  gl_FragDepth: {
    signatures: ['float gl_FragDepth'],
    doc: 'Write-only. Overrides the fragment\'s depth value written to the depth buffer. If not written, the fixed-function depth (`gl_FragCoord.z`) is used.',
  },
  gl_PointCoord: {
    signatures: ['vec2 gl_PointCoord'],
    doc: 'Read-only. [0, 1]² coordinate within a point sprite, computed from the fragment\'s position within the point. Only meaningful when rendering `GL_POINTS`.',
  },
  gl_SampleID: {
    signatures: ['int gl_SampleID'],
    doc: 'Read-only. Index of the current sample when multisampling. Accessing this triggers per-sample shading.',
  },
  gl_SamplePosition: {
    signatures: ['vec2 gl_SamplePosition'],
    doc: 'Read-only. Position of the current sample within the pixel, in [0, 1]². Accessing this triggers per-sample shading.',
  },
  gl_SampleMaskIn: {
    signatures: ['int gl_SampleMaskIn[]'],
    doc: 'Read-only. Bitmask of samples covered by the fragment before any alpha-to-coverage.',
  },
  gl_SampleMask: {
    signatures: ['int gl_SampleMask[]'],
    doc: 'Write-only. Bitmask controlling which samples are updated. ANDed with the coverage mask.',
  },
  gl_FragColor: {
    signatures: ['vec4 gl_FragColor'],
    doc: '**GLSL ES 1.0 legacy.** Write-only. Sets the output color of the fragment. Prefer declaring `out vec4 fragColor` in ES 3.0.',
  },
  gl_FragData: {
    signatures: ['vec4 gl_FragData[gl_MaxDrawBuffers]'],
    doc: '**GLSL ES 1.0 legacy.** Write-only array for MRT output. Prefer named `out` variables in ES 3.0.',
  },

  // ── Built-in variables — vertex ──────────────────────────────────────────────

  gl_Position: {
    signatures: ['vec4 gl_Position'],
    doc: 'Write-only. Clip-space position output of the vertex shader. Must be written in every execution path.',
  },
  gl_PointSize: {
    signatures: ['float gl_PointSize'],
    doc: 'Write-only. Size of rasterized points in pixels. Only used when rendering `GL_POINTS`.',
  },
  gl_VertexID: {
    signatures: ['int gl_VertexID'],
    doc: 'Read-only. Integer index of the current vertex, counting from the `first` parameter of the draw call.',
  },
  gl_InstanceID: {
    signatures: ['int gl_InstanceID'],
    doc: 'Read-only. Integer index of the current instance during instanced rendering. 0 for non-instanced draws.',
  },

  // ── ShaderToy uniforms ───────────────────────────────────────────────────────

  iResolution: {
    signatures: ['uniform vec3 iResolution'],
    doc: 'Viewport resolution in pixels. `xy` is width × height; `z` is the pixel aspect ratio (usually 1.0). Divide `fragCoord.xy / iResolution.xy` to get UV coordinates in [0, 1].',
  },
  iTime: {
    signatures: ['uniform float iTime'],
    doc: 'Playback time in seconds since the shader started (or since last rewind). Increases monotonically. Use this to animate your shader.',
  },
  iTimeDelta: {
    signatures: ['uniform float iTimeDelta'],
    doc: 'Duration of the previous frame in seconds. Use for frame-rate-independent motion.',
  },
  iFrameRate: {
    signatures: ['uniform float iFrameRate'],
    doc: 'Frames per second, smoothed over recent frames.',
  },
  iFrame: {
    signatures: ['uniform int iFrame'],
    doc: 'Frame counter — starts at 0, increments by 1 each frame. Useful for per-frame randomness or temporal accumulation.',
  },
  iMouse: {
    signatures: ['uniform vec4 iMouse'],
    doc: '`xy` — current pixel coordinates of the mouse (or last touch). `zw` — pixel coordinates where the button was last clicked (z > 0 while held, z < 0 after release). Divide by `iResolution.xy` for normalised coords.',
  },
  iDate: {
    signatures: ['uniform vec4 iDate'],
    doc: 'Current date and time. `x` = year, `y` = month (1-based), `z` = day, `w` = time of day in seconds since midnight.',
  },
  iSampleRate: {
    signatures: ['uniform float iSampleRate'],
    doc: 'Audio sample rate in Hz (typically 44100). Used in audio shaders (`mainSound`).',
  },
  iChannel0: {
    signatures: ['uniform sampler2D iChannel0'],
    doc: 'Input texture / buffer channel 0. Assigned in the ShaderToy UI. Sample with `texture(iChannel0, uv)`.',
  },
  iChannel1: {
    signatures: ['uniform sampler2D iChannel1'],
    doc: 'Input texture / buffer channel 1. Assigned in the ShaderToy UI. Sample with `texture(iChannel1, uv)`.',
  },
  iChannel2: {
    signatures: ['uniform sampler2D iChannel2'],
    doc: 'Input texture / buffer channel 2. Assigned in the ShaderToy UI. Sample with `texture(iChannel2, uv)`.',
  },
  iChannel3: {
    signatures: ['uniform sampler2D iChannel3'],
    doc: 'Input texture / buffer channel 3. Assigned in the ShaderToy UI. Sample with `texture(iChannel3, uv)`.',
  },
  iChannelTime: {
    signatures: ['uniform float iChannelTime[4]'],
    doc: 'Playback time in seconds for each input channel (useful when a channel is a video).',
  },
  iChannelResolution: {
    signatures: ['uniform vec3 iChannelResolution[4]'],
    doc: 'Resolution of each input channel in texels. `xy` = width × height, `z` = depth (1 for 2D textures).',
  },
};

// ── Language registration ─────────────────────────────────────────────────────


const HOVER_DB = _buildMergedHoverDB(_LEGACY_HOVER_DB);

export function registerGLSLLanguage(monaco) {
  monaco.languages.register({
    id: 'glsl',
    extensions: ['.glsl', '.frag', '.vert', '.fs', '.vs', '.vsh', '.fsh'],
    aliases: ['GLSL', 'glsl', 'OpenGL Shading Language'],
    mimetypes: ['text/x-glsl'],
  });

  monaco.languages.setLanguageConfiguration('glsl', {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/'],
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    indentationRules: {
      increaseIndentPattern: /^.*\{[^}"']*$/,
      decreaseIndentPattern: /^\s*\}/,
    },
    wordPattern: /(-?\d*\.\d\w*)|([^`~!@#%^&*()\-=+[{\]}\\|;:'",.<>/?\s]+)/,
  });

  monaco.languages.setMonarchTokensProvider('glsl', {
    defaultToken: '',
    tokenPostfix: '.glsl',

    keywords: KEYWORDS,
    types: TYPES,
    builtinFunctions: BUILTIN_FUNCTIONS,
    builtinVariables: BUILTIN_VARIABLES,
    preprocessorDirectives: PREPROCESSOR_DIRECTIVES,

    operators: [
      '=', '>', '<', '!', '~', '?', ':',
      '==', '<=', '>=', '!=', '&&', '||', '++', '--',
      '+', '-', '*', '/', '&', '|', '^', '%', '<<', '>>',
      '+=', '-=', '*=', '/=', '&=', '|=', '^=', '%=', '<<=', '>>=',
    ],

    symbols: /[=><!~?:&|+\-*/^%]+/,

    // Hex / octal / float / int literals
    hexNumber:    /0[xX][0-9a-fA-F]+[uU]?/,
    octNumber:    /0[0-7]+[uU]?/,
    floatNumber:  /\d*\.\d+([eE][+-]?\d+)?[fF]?|\d+\.[eE][+-]?\d+[fF]?|\d+[eE][+-]?\d+[fF]?/,
    intNumber:    /\d+[uU]?/,

    tokenizer: {
      root: [
        // Preprocessor lines — must come first
        [/^\s*#\s*\w+/, { token: 'keyword.directive', next: '@preprocessor' }],

        // Identifiers and keywords
        [/[a-zA-Z_]\w*/, {
          cases: {
            'true|false':        'constant.language',
            '@keywords':         'keyword',
            '@types':            'type',
            '@builtinFunctions': 'support.function',
            '@builtinVariables': 'variable.predefined',
            '@default':          'identifier',
          },
        }],

        // Whitespace
        { include: '@whitespace' },

        // Delimiters and operators
        [/[{}()[\]]/, '@brackets'],
        [/[<>](?!@symbols)/, '@brackets'],
        [/@symbols/, {
          cases: {
            '@operators': 'operator',
            '@default':   '',
          },
        }],

        // Numbers — order matters (float before int)
        [/@hexNumber/,   'number.hex'],
        [/@octNumber/,   'number.octal'],
        [/@floatNumber/, 'number.float'],
        [/@intNumber/,   'number'],

        // Delimiter
        [/[;,.]/, 'delimiter'],

        // Strings (not legal GLSL, but useful for #include extensions)
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],
      ],

      preprocessor: [
        [/[^\\]+$/, { token: 'keyword.directive', next: '@pop' }],
        [/\\$/, 'keyword.directive'],
        [/\\/, 'keyword.directive'],
        [/$/, { token: '', next: '@pop' }],
      ],

      comment: [
        [/[^/*]+/, 'comment'],
        [/\/\*/,   'comment', '@push'],
        [/\*\//,   'comment', '@pop'],
        [/[/*]/,   'comment'],
      ],

      whitespace: [
        [/[ \t\r\n]+/, 'white'],
        [/\/\*/,       'comment', '@comment'],
        [/\/\/.*/,     'comment'],
      ],

      string: [
        [/[^\\"]+/, 'string'],
        [/\\./,     'string.escape'],
        [/"/,       { token: 'string.quote', bracket: '@close', next: '@pop' }],
      ],
    },
  });

  // ── Hover provider ──────────────────────────────────────────────────────────
  monaco.languages.registerHoverProvider('glsl', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const entry = HOVER_DB[word.word];
      if (!entry) return null;
      let hoverMd;
      if (entry._new) {
        // New rich entry from glsl-docs-db.js
        hoverMd = glslFormatHover(entry);
      } else {
        // Legacy entry
        hoverMd = formatHover({ signatures: entry.signatures, doc: entry.doc });
      }
      return {
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber:   position.lineNumber,
          startColumn:     word.startColumn,
          endColumn:       word.endColumn,
        },
        contents: [{ value: hoverMd }],
      };
    },
  });

  // ── Completion provider ─────────────────────────────────────────────────────
  monaco.languages.registerCompletionItemProvider('glsl', {
    triggerCharacters: ['#', ' ', '\t', '(', ','],

    provideCompletionItems(model, position) {
      const { CompletionItemKind, CompletionItemInsertTextRule } = monaco.languages;
      const lineText  = model.getLineContent(position.lineNumber);
      const textUpto  = lineText.slice(0, position.column - 1);
      const word      = model.getWordUntilPosition(position);
      const range     = {
        startLineNumber: position.lineNumber,
        endLineNumber:   position.lineNumber,
        startColumn:     word.startColumn,
        endColumn:       position.column,
      };

      const Snippet = CompletionItemInsertTextRule.InsertAsSnippet;
      const items   = [];

      // ── 1. Snippet — mainImage entry-point ──────────────────────────────
      items.push({
        label:         'mainImage',
        kind:          CompletionItemKind.Function,
        detail:        'ShaderToy entry-point',
        documentation: {
          value: [
            '```glsl',
            'void mainImage(out vec4 fragColor, in vec2 fragCoord)',
            '```',
            'Required ShaderToy entry-point. `fragCoord` is the pixel coordinate in pixels;',
            'divide by `iResolution.xy` to get normalised UV in `[0,1]`.',
          ].join('\n'),
        },
        insertText:     [
          'void mainImage(out vec4 fragColor, in vec2 fragCoord) {',
          '\tvec2 uv = fragCoord / iResolution.xy;',
          '\t$0',
          '\tfragColor = vec4(uv, 0.0, 1.0);',
          '}',
        ].join('\n'),
        insertTextRules: Snippet,
        range,
      });

      // ── 2. Snippets — #define / const ───────────────────────────────────

      // Only offer preprocessor snippets when the cursor is in a # context or
      // at the start of a line; keep them in the list whenever the prefix
      // starts with # or the line starts with optional whitespace + #.
      const isPreprocessorLine = /^\s*#/.test(lineText);
      const prefixIsHash      = textUpto.trimStart().startsWith('#');

      if (isPreprocessorLine || prefixIsHash || word.word === '' || word.word.startsWith('#')) {
        items.push({
          label:           '#define (constant)',
          kind:            CompletionItemKind.Snippet,
          detail:          'Preprocessor constant',
          documentation:   { value: 'Define a numeric constant visible to the whole shader.' },
          insertText:      '#define ${1:NAME} ${2:value}',
          insertTextRules:  Snippet,
          filterText:      '#define',
          range,
        });

        items.push({
          label:           '#define (function-like)',
          kind:            CompletionItemKind.Snippet,
          detail:          'Function-like macro',
          documentation:   { value: 'Define a parameterised macro.' },
          insertText:      '#define ${1:NAME}(${2:x}) (${3:x})',
          insertTextRules:  Snippet,
          filterText:      '#define',
          range,
        });
      }

      items.push({
        label:           'const float',
        kind:            CompletionItemKind.Snippet,
        detail:          'Compile-time float constant',
        documentation:   { value: 'Declare a `const float` — inlined by the compiler, zero runtime cost.' },
        insertText:      'const float ${1:NAME} = ${2:0.0};',
        insertTextRules:  Snippet,
        range,
      });

      items.push({
        label:           'const vec3',
        kind:            CompletionItemKind.Snippet,
        detail:          'Compile-time vec3 constant',
        documentation:   { value: 'Declare a `const vec3` — useful for colours, axes, and direction vectors.' },
        insertText:      'const vec3 ${1:NAME} = vec3(${2:0.0}, ${3:0.0}, ${4:0.0});',
        insertTextRules:  Snippet,
        range,
      });

      // ── 3. Pattern — ray marching template ──────────────────────────────
      items.push({
        label:         'raymarching template',
        kind:          CompletionItemKind.Snippet,
        detail:        'Full ray-marching boilerplate',
        documentation: {
          value: [
            'Inserts a minimal but complete ray-marching scaffold:',
            '- `map(p)` — scene SDF',
            '- `rayMarch(ro, rd)` — sphere-tracing loop',
            '- `calcNormal(p)` — tetrahedron-technique normal',
            '- `mainImage` — camera + shading',
          ].join('\n'),
        },
        insertText: [
          '// ── Scene SDF ────────────────────────────────────────────────────────',
          'float map(vec3 p) {',
          '\treturn length(p) - 1.0; // unit sphere at origin',
          '}',
          '',
          '// ── Ray marcher ──────────────────────────────────────────────────────',
          'const int   MAX_STEPS = 100;',
          'const float MAX_DIST  = 100.0;',
          'const float SURF_DIST = 1e-3;',
          '',
          'float rayMarch(vec3 ro, vec3 rd) {',
          '\tfloat t = 0.0;',
          '\tfor (int i = 0; i < MAX_STEPS; i++) {',
          '\t\tfloat d = map(ro + rd * t);',
          '\t\tif (d < SURF_DIST || t > MAX_DIST) break;',
          '\t\tt += d;',
          '\t}',
          '\treturn t;',
          '}',
          '',
          '// ── Normal (tetrahedron technique, 4 taps) ───────────────────────────',
          'vec3 calcNormal(vec3 p) {',
          '\tconst vec2 e = vec2(1.0, -1.0) * 5e-4;',
          '\treturn normalize(',
          '\t\te.xyy * map(p + e.xyy) +',
          '\t\te.yyx * map(p + e.yyx) +',
          '\t\te.yxy * map(p + e.yxy) +',
          '\t\te.xxx * map(p + e.xxx)',
          '\t);',
          '}',
          '',
          '// ── Entry point ──────────────────────────────────────────────────────',
          'void mainImage(out vec4 fragColor, in vec2 fragCoord) {',
          '\tvec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;',
          '',
          '\t// Camera',
          '\tvec3 ro = vec3(0.0, 0.0, 3.0);',
          '\tvec3 rd = normalize(vec3(uv, -1.0));',
          '',
          '\t// March',
          '\tfloat t = rayMarch(ro, rd);',
          '\tvec3 col = vec3(0.0);',
          '',
          '\tif (t < MAX_DIST) {',
          '\t\tvec3 p  = ro + rd * t;',
          '\t\tvec3 n  = calcNormal(p);',
          '\t\tvec3 ld = normalize(vec3(1.0, 2.0, 3.0));',
          '\t\tfloat diff = max(dot(n, ld), 0.0);',
          '\t\tcol = vec3(0.2 + 0.8 * diff);',
          '\t}',
          '',
          '\t// Gamma correction',
          '\tcol = pow(col, vec3(0.4545));',
          '\tfragColor = vec4(col, 1.0);',
          '}',
        ].join('\n'),
        insertTextRules: Snippet,
        range,
      });

      // ── 4. SDF primitives ────────────────────────────────────────────────
      const SDF_PRIMITIVES = [
        {
          label:  'sdfSphere',
          detail: 'SDF — sphere',
          doc:    'Signed distance to a sphere centred at the origin with radius `r`.',
          body:   'float sdfSphere(vec3 p, float r) {\n\treturn length(p) - r;\n}',
        },
        {
          label:  'sdfBox',
          detail: 'SDF — axis-aligned box',
          doc:    'Signed distance to an axis-aligned box with half-extents `b`.',
          body:   [
            'float sdfBox(vec3 p, vec3 b) {',
            '\tvec3 q = abs(p) - b;',
            '\treturn length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);',
            '}',
          ].join('\n'),
        },
        {
          label:  'sdfTorus',
          detail: 'SDF — torus',
          doc:    'Signed distance to a torus in the XZ plane. `t.x` = major radius, `t.y` = tube radius.',
          body:   [
            'float sdfTorus(vec3 p, vec2 t) {',
            '\tvec2 q = vec2(length(p.xz) - t.x, p.y);',
            '\treturn length(q) - t.y;',
            '}',
          ].join('\n'),
        },
        {
          label:  'sdfCylinder',
          detail: 'SDF — capped cylinder',
          doc:    'Signed distance to a capped cylinder along the Y axis. `r` = radius, `h` = half-height.',
          body:   [
            'float sdfCylinder(vec3 p, float r, float h) {',
            '\tvec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);',
            '\treturn min(max(d.x, d.y), 0.0) + length(max(d, 0.0));',
            '}',
          ].join('\n'),
        },
        {
          label:  'sdfPlane',
          detail: 'SDF — infinite plane',
          doc:    'Signed distance to an infinite plane defined by normal `n` (must be normalised) and offset `h`.',
          body:   'float sdfPlane(vec3 p, vec3 n, float h) {\n\treturn dot(p, n) + h;\n}',
        },
        {
          label:  'sdfUnion',
          detail: 'SDF op — union',
          doc:    'Boolean union of two SDFs.',
          body:   'float sdfUnion(float a, float b) { return min(a, b); }',
        },
        {
          label:  'sdfSubtract',
          detail: 'SDF op — subtraction',
          doc:    'Subtract SDF `b` from `a`.',
          body:   'float sdfSubtract(float a, float b) { return max(a, -b); }',
        },
        {
          label:  'sdfIntersect',
          detail: 'SDF op — intersection',
          doc:    'Intersection of two SDFs.',
          body:   'float sdfIntersect(float a, float b) { return max(a, b); }',
        },
        {
          label:  'sdfSmoothUnion',
          detail: 'SDF op — smooth union',
          doc:    'Smooth boolean union (Inigo Quilez). `k` controls blend radius.',
          body:   [
            'float sdfSmoothUnion(float a, float b, float k) {',
            '\tfloat h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);',
            '\treturn mix(b, a, h) - k * h * (1.0 - h);',
            '}',
          ].join('\n'),
        },
      ];

      for (const prim of SDF_PRIMITIVES) {
        items.push({
          label:           prim.label,
          kind:            CompletionItemKind.Snippet,
          detail:          prim.detail,
          documentation:   { value: prim.doc },
          insertText:      prim.body,
          insertTextRules:  Snippet,
          range,
        });
      }

      // ── 5. Color palette snippets ────────────────────────────────────────
      // IQ cosine palette: cos(2π(t·c + d)) * a + b
      items.push({
        label:         'palette (IQ cosine)',
        kind:          CompletionItemKind.Snippet,
        detail:        'Cosine colour palette (Inigo Quilez)',
        documentation: {
          value: [
            'Generates smooth, periodic palettes. All four `vec3` parameters live in `[0,1]`.',
            '`a` = brightness offset, `b` = amplitude, `c` = frequency, `d` = phase.',
            '',
            'Try the [palette tool](https://iquilezles.org/articles/palettes/) by Inigo Quilez.',
          ].join('\n'),
        },
        insertText: [
          'vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {',
          '\treturn a + b * cos(6.28318 * (c * t + d));',
          '}',
        ].join('\n'),
        insertTextRules: Snippet,
        range,
      });

      // Preset palettes — expressed as palette() call sites
      const PALETTES = [
        {
          name: 'palette — rainbow',
          a: 'vec3(0.5)', b: 'vec3(0.5)', c: 'vec3(1.0)', d: 'vec3(0.0, 0.333, 0.667)',
        },
        {
          name: 'palette — warm sunset',
          a: 'vec3(0.5, 0.4, 0.3)', b: 'vec3(0.5, 0.4, 0.3)',
          c: 'vec3(1.0, 1.0, 1.0)', d: 'vec3(0.0, 0.1, 0.2)',
        },
        {
          name: 'palette — cool cyan-magenta',
          a: 'vec3(0.5)', b: 'vec3(0.5)',
          c: 'vec3(1.0, 1.0, 0.5)', d: 'vec3(0.8, 1.0, 0.33)',
        },
        {
          name: 'palette — earth tones',
          a: 'vec3(0.5, 0.4, 0.3)', b: 'vec3(0.5, 0.3, 0.2)',
          c: 'vec3(1.0, 1.0, 1.0)', d: 'vec3(0.0, 0.15, 0.25)',
        },
      ];

      for (const p of PALETTES) {
        items.push({
          label:           p.name,
          kind:            CompletionItemKind.Snippet,
          detail:          'IQ cosine palette call',
          documentation:   { value: 'Requires the `palette(t,a,b,c,d)` function above.' },
          insertText:      `palette(\${1:t}, ${p.a}, ${p.b}, ${p.c}, ${p.d})`,
          insertTextRules:  Snippet,
          range,
        });
      }

      // ── 6. ShaderToy uniforms as plain completions ───────────────────────
      const UNIFORM_DOCS = {
        iResolution:       'vec3 — viewport width, height, and pixel ratio',
        iTime:             'float — shader playback time in seconds',
        iTimeDelta:        'float — duration of the last frame in seconds',
        iFrameRate:        'float — current frames per second',
        iFrame:            'int — current frame number',
        iMouse:            'vec4 — xy = current pixel, zw = click pixel',
        iDate:             'vec4 — year, month, day, seconds since midnight',
        iSampleRate:       'float — sound sample rate (typically 44100)',
        iChannel0:         'sampler2D / samplerCube — input texture channel 0',
        iChannel1:         'sampler2D / samplerCube — input texture channel 1',
        iChannel2:         'sampler2D / samplerCube — input texture channel 2',
        iChannel3:         'sampler2D / samplerCube — input texture channel 3',
        iChannelTime:      'float[4] — playback time of each channel',
        iChannelResolution:'vec3[4] — resolution of each channel texture',
      };

      for (const u of SHADERTOY_UNIFORMS) {
        items.push({
          label:         u,
          kind:          CompletionItemKind.Variable,
          detail:        UNIFORM_DOCS[u] ?? 'ShaderToy uniform',
          documentation: { value: `**${u}** — ${UNIFORM_DOCS[u] ?? ''}` },
          insertText:    u,
          range,
        });
      }

      // ── 7. GLSL built-in functions ───────────────────────────────────────
      for (const fn of BUILTIN_FUNCTIONS) {
        items.push({
          label:      fn,
          kind:       CompletionItemKind.Function,
          detail:     'GLSL built-in',
          insertText: fn,
          range,
        });
      }

      // ── 8. GLSL types ────────────────────────────────────────────────────
      for (const t of TYPES) {
        items.push({
          label:      t,
          kind:       CompletionItemKind.Class,
          detail:     'GLSL type',
          insertText: t,
          range,
        });
      }

      // ── 9. GLSL keywords ─────────────────────────────────────────────────
      for (const kw of KEYWORDS) {
        items.push({
          label:      kw,
          kind:       CompletionItemKind.Keyword,
          insertText: kw,
          range,
        });
      }

      return { suggestions: items };
    },
  });

  // ── Go to Definition — user-defined functions and structs ────────────────────
  //
  // Parses the current model for:
  //   • function definitions  : <returnType> <name>( …
  //   • struct definitions    : struct <name> {
  // When F12 / Ctrl+click lands on a matching identifier, jumps to the line
  // where that symbol is defined.
  //
  monaco.languages.registerDefinitionProvider('glsl', {
    provideDefinition(model, position) {
      const wordInfo = model.getWordAtPosition(position);
      if (!wordInfo) return null;
      const word = wordInfo.word;

      const code  = model.getValue();
      const lines = code.split('\n');

      // Regex patterns for definition sites.
      // Function: optional-qualifiers  returnType  name  (
      //   We use a broad pattern — any word followed by the target name then '('.
      const fnRe     = new RegExp(
        `^[\\s\\w*]*?\\b([\\w]+)\\s+\\b${word}\\s*\\(`,
      );
      // Struct: struct  name  {  (or struct name ;)
      const structRe = new RegExp(`^\\s*struct\\s+\\b${word}\\b`);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (fnRe.test(line) || structRe.test(line)) {
          return {
            uri:   model.uri,
            range: {
              startLineNumber: i + 1,
              startColumn:     1,
              endLineNumber:   i + 1,
              endColumn:       line.length + 1,
            },
          };
        }
      }
      return null;
    },
  });

  // ── Code folding — #ifdef / #ifndef / #if … #endif and function bodies ───────
  //
  // Monaco's built-in folding only handles { / } indentation.
  // This provider adds two extra fold kinds:
  //
  //   1. Preprocessor regions:
  //        #ifdef  / #ifndef  / #if   →  start
  //        #elif   / #else           →  intermediate (end previous, start new)
  //        #endif                    →  end
  //      Nested #if blocks are handled via a stack.
  //
  //   2. Function bodies:
  //        <type> <name>( … ) {      →  start   (opening brace on same/next line)
  //        matching }                →  end      (brace depth tracking)
  //
  monaco.languages.registerFoldingRangeProvider('glsl', {
    provideFoldingRanges(model) {
      const lines  = model.getLinesContent();
      const ranges = [];

      // ── 1. Preprocessor folding ─────────────────────────────────────────
      const ppStack = []; // stack of { startLine } (0-based)

      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();

        if (/^#\s*(?:ifdef|ifndef|if)\b/.test(t)) {
          ppStack.push(i);
        } else if (/^#\s*(?:elif|else)\b/.test(t)) {
          if (ppStack.length > 0) {
            const start = ppStack.pop();
            if (i - 1 >= start) {
              ranges.push({
                start:  start + 1,       // Monaco lines are 1-based
                end:    i,               // fold up to (but not including) #elif/#else
                kind:   monaco.languages.FoldingRangeKind.Region,
              });
            }
            ppStack.push(i); // start a new region from #elif / #else
          }
        } else if (/^#\s*endif\b/.test(t)) {
          if (ppStack.length > 0) {
            const start = ppStack.pop();
            if (i - 1 >= start) {
              ranges.push({
                start:  start + 1,
                end:    i + 1,
                kind:   monaco.languages.FoldingRangeKind.Region,
              });
            }
          }
        }
      }

      // ── 2. Function-body folding ────────────────────────────────────────
      //
      // Strategy: scan for lines that look like a function signature ending
      // with '{' (or a '{' on the very next line), then track brace depth to
      // find the matching '}'.
      //
      // We intentionally skip struct bodies — Monaco's built-in indentation
      // folding already handles those well, and double-registering them
      // causes duplicate fold indicators.

      // Detect the line on which a top-level function definition opens.
      // A function definition line must:
      //   • not be inside a block comment
      //   • match:  <returnType>  <name>  (  …  )  {
      //     or span the brace being on the next line
      const fnSigRe = /^\s*(?:void|float|vec[234]|mat[234]|int|uint|bool|double|[A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*\(/;

      let inBlockComment = false;
      let depth          = 0;        // global brace depth
      let fnOpenLine     = -1;       // 0-based line where current fn's '{' is

      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];

        // Track block-comment state (simplified — good enough for GLSL)
        if (inBlockComment) {
          if (raw.includes('*/')) inBlockComment = false;
          continue;
        }
        if (raw.includes('/*')) inBlockComment = true;

        // Strip line comments before counting braces
        const line = raw.replace(/\/\/.*$/, '');

        const opens  = (line.match(/{/g) || []).length;
        const closes = (line.match(/}/g) || []).length;

        // Detect function-definition start at depth 0 → 1
        if (depth === 0 && opens > closes && fnSigRe.test(raw)) {
          fnOpenLine = i;
        }

        depth += opens - closes;

        // When we return to depth 0, the function body closed
        if (depth === 0 && fnOpenLine >= 0) {
          if (i > fnOpenLine) {
            ranges.push({
              start: fnOpenLine + 1,
              end:   i + 1,
              kind:  monaco.languages.FoldingRangeKind.Region,
            });
          }
          fnOpenLine = -1;
        }
      }

      return ranges;
    },
  });

  // ── Semantic token provider ─────────────────────────────────────────────────
  //
  // Walks every line looking for ShaderToy uniform names and emits them as
  // token type 0 ("shadertoyUniform").  The encoded format Monaco expects is a
  // flat Uint32Array of 5-tuples:
  //   [ deltaLine, deltaStartChar, length, tokenType, tokenModifiers ]
  // where deltaLine / deltaStartChar are relative to the *previous* token.
  //
  monaco.languages.registerDocumentSemanticTokensProvider('glsl', {
    getLegend() {
      return SEMANTIC_LEGEND;
    },

    provideDocumentSemanticTokens(model) {
      const lines = model.getLinesContent();
      const data  = [];
      let prevLine = 0;
      let prevChar = 0;

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        SHADERTOY_RE.lastIndex = 0;
        let m;
        while ((m = SHADERTOY_RE.exec(line)) !== null) {
          const deltaLine = li - prevLine;
          const deltaChar = deltaLine === 0 ? m.index - prevChar : m.index;
          data.push(deltaLine, deltaChar, m[0].length, 0 /* shadertoyUniform */, 0);
          prevLine = li;
          prevChar = m.index;
        }
      }

      return { data: new Uint32Array(data) };
    },

    releaseDocumentSemanticTokens() {},
  });
}
