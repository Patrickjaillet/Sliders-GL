/**
 * glsl-docs-db.js — Phase 19.4
 * Complete GLSL ES 1.00 / 3.00 / 4.60 documentation database.
 * Each entry: { sigs, desc, version, example?, see? }
 */

export const GLSL_DOCS = {

  // ── ANGLE & TRIGONOMETRY ───────────────────────────────────────────────────

  radians: {
    sigs: ['genType radians(genType degrees)'],
    desc: 'Converts degrees to radians: `result = π/180 × degrees`. Applied component-wise to vector types.',
    version: 'GLSL ES 1.00+',
    example: `float deg = 180.0;\nfloat rad = radians(deg); // 3.14159…\nvec2 v = radians(vec2(90.0, 270.0)); // vec2(π/2, 3π/2)`,
    see: ['degrees'],
  },
  degrees: {
    sigs: ['genType degrees(genType radians)'],
    desc: 'Converts radians to degrees: `result = 180/π × radians`. Applied component-wise.',
    version: 'GLSL ES 1.00+',
    example: `float deg = degrees(3.14159); // ≈ 180.0`,
    see: ['radians'],
  },
  sin: {
    sigs: ['genType sin(genType angle)'],
    desc: 'Returns the trigonometric sine of `angle` (in radians). Applied component-wise.',
    version: 'GLSL ES 1.00+',
    example: `float s = sin(0.0);          // 0.0\nvec2 v = sin(vec2(0.0, 1.5708)); // vec2(0.0, 1.0)`,
    see: ['cos', 'tan', 'asin'],
  },
  cos: {
    sigs: ['genType cos(genType angle)'],
    desc: 'Returns the trigonometric cosine of `angle` (in radians). Applied component-wise.',
    version: 'GLSL ES 1.00+',
    example: `float c = cos(0.0); // 1.0\nfloat c2 = cos(3.14159); // ≈ -1.0`,
    see: ['sin', 'tan', 'acos'],
  },
  tan: {
    sigs: ['genType tan(genType angle)'],
    desc: 'Returns the trigonometric tangent of `angle` (in radians). Applied component-wise.',
    version: 'GLSL ES 1.00+',
    example: `float t = tan(0.7854); // ≈ 1.0 (45°)`,
    see: ['sin', 'cos', 'atan'],
  },
  asin: {
    sigs: ['genType asin(genType x)'],
    desc: 'Arc-sine — returns the angle whose sine is `x`, in [−π/2, π/2]. Result is undefined for |x| > 1.',
    version: 'GLSL ES 1.00+',
    example: `float a = asin(1.0); // π/2 ≈ 1.5708\nfloat a2 = asin(0.0); // 0.0`,
    see: ['sin', 'acos', 'atan'],
  },
  acos: {
    sigs: ['genType acos(genType x)'],
    desc: 'Arc-cosine — returns the angle whose cosine is `x`, in [0, π]. Result is undefined for |x| > 1.',
    version: 'GLSL ES 1.00+',
    example: `float a = acos(1.0); // 0.0\nfloat a2 = acos(-1.0); // π`,
    see: ['cos', 'asin'],
  },
  atan: {
    sigs: [
      'genType atan(genType y, genType x)',
      'genType atan(genType y_over_x)',
    ],
    desc: 'Arc-tangent.\n\n**Two-argument form:** returns the angle of the vector `(x, y)` in [−π, π] — equivalent to `atan2`. Both components may be zero.\n\n**Single-argument form:** returns `atan(y/x)` in [−π/2, π/2].',
    version: 'GLSL ES 1.00+',
    example: `float a = atan(1.0, 0.0); // π/2 (pointing up)\nfloat a2 = atan(0.7854);  // single-arg form`,
    see: ['tan', 'asin', 'acos'],
  },
  sinh: {
    sigs: ['genType sinh(genType x)'],
    desc: 'Hyperbolic sine: `(eˣ − e⁻ˣ) / 2`. Applied component-wise.',
    version: 'GLSL ES 3.00+',
    see: ['cosh', 'tanh', 'asinh'],
  },
  cosh: {
    sigs: ['genType cosh(genType x)'],
    desc: 'Hyperbolic cosine: `(eˣ + e⁻ˣ) / 2`. Applied component-wise.',
    version: 'GLSL ES 3.00+',
    see: ['sinh', 'tanh', 'acosh'],
  },
  tanh: {
    sigs: ['genType tanh(genType x)'],
    desc: 'Hyperbolic tangent: `sinh(x) / cosh(x)`. Applied component-wise.',
    version: 'GLSL ES 3.00+',
    see: ['sinh', 'cosh', 'atanh'],
  },
  asinh: {
    sigs: ['genType asinh(genType x)'],
    desc: 'Inverse hyperbolic sine. Applied component-wise.',
    version: 'GLSL ES 3.00+',
    see: ['sinh'],
  },
  acosh: {
    sigs: ['genType acosh(genType x)'],
    desc: 'Inverse hyperbolic cosine. Result is undefined for `x < 1`. Applied component-wise.',
    version: 'GLSL ES 3.00+',
    see: ['cosh'],
  },
  atanh: {
    sigs: ['genType atanh(genType x)'],
    desc: 'Inverse hyperbolic tangent. Result is undefined for |x| ≥ 1. Applied component-wise.',
    version: 'GLSL ES 3.00+',
    see: ['tanh'],
  },

  // ── EXPONENTIAL ───────────────────────────────────────────────────────────

  pow: {
    sigs: ['genType pow(genType x, genType y)'],
    desc: 'Returns `x` raised to the power `y` (`xʸ`). Result is undefined if `x < 0`, or if `x = 0` and `y ≤ 0`.',
    version: 'GLSL ES 1.00+',
    example: `float p = pow(2.0, 10.0); // 1024.0\nvec2 v = pow(vec2(2.0,3.0), vec2(2.0,2.0)); // vec2(4.0,9.0)`,
    see: ['exp', 'log', 'sqrt'],
  },
  exp: {
    sigs: ['genType exp(genType x)'],
    desc: 'Natural exponentiation: returns `eˣ`. Applied component-wise.',
    version: 'GLSL ES 1.00+',
    example: `float e = exp(1.0); // 2.71828…\nfloat e0 = exp(0.0); // 1.0`,
    see: ['log', 'exp2', 'pow'],
  },
  log: {
    sigs: ['genType log(genType x)'],
    desc: 'Natural logarithm: returns `ln(x)`. Result is undefined for `x ≤ 0`.',
    version: 'GLSL ES 1.00+',
    example: `float l = log(2.71828); // ≈ 1.0\nfloat l2 = log(1.0); // 0.0`,
    see: ['exp', 'log2'],
  },
  exp2: {
    sigs: ['genType exp2(genType x)'],
    desc: 'Returns `2` raised to the power `x` (`2ˣ`). Applied component-wise.',
    version: 'GLSL ES 1.00+',
    example: `float e = exp2(10.0); // 1024.0`,
    see: ['log2', 'exp', 'pow'],
  },
  log2: {
    sigs: ['genType log2(genType x)'],
    desc: 'Base-2 logarithm. Result is undefined for `x ≤ 0`.',
    version: 'GLSL ES 1.00+',
    example: `float l = log2(1024.0); // 10.0`,
    see: ['exp2', 'log'],
  },
  sqrt: {
    sigs: ['genType sqrt(genType x)'],
    desc: 'Returns the square root of `x`. Result is undefined for `x < 0`.',
    version: 'GLSL ES 1.00+',
    example: `float s = sqrt(4.0); // 2.0\nvec2 v = sqrt(vec2(9.0, 16.0)); // vec2(3.0, 4.0)`,
    see: ['inversesqrt', 'pow'],
  },
  inversesqrt: {
    sigs: ['genType inversesqrt(genType x)'],
    desc: 'Returns `1 / √x` — the reciprocal square root. Faster than `1.0 / sqrt(x)` on most GPUs. Result is undefined for `x ≤ 0`.',
    version: 'GLSL ES 1.00+',
    example: `float r = inversesqrt(4.0); // 0.5\n// Fast normalize:\nvec3 n = v * inversesqrt(dot(v, v));`,
    see: ['sqrt'],
  },

  // ── COMMON ────────────────────────────────────────────────────────────────

  abs: {
    sigs: [
      'genType  abs(genType  x)',
      'genIType abs(genIType x)',
    ],
    desc: 'Returns the absolute value of `x`: `|x|`. Applied component-wise.',
    version: 'GLSL ES 1.00+',
    example: `float a = abs(-3.0); // 3.0\nvec3 v = abs(vec3(-1.0, 2.0, -3.0)); // vec3(1.0, 2.0, 3.0)`,
    see: ['sign'],
  },
  sign: {
    sigs: [
      'genType  sign(genType  x)',
      'genIType sign(genIType x)',
    ],
    desc: 'Returns -1.0 if `x < 0`, 0.0 if `x = 0`, or 1.0 if `x > 0`. Applied component-wise.',
    version: 'GLSL ES 1.00+',
    example: `float s = sign(-5.0); // -1.0\nfloat s2 = sign(0.0);  // 0.0`,
    see: ['abs'],
  },
  floor: {
    sigs: ['genType floor(genType x)'],
    desc: 'Returns the largest integer ≤ `x` (rounds toward −∞). Applied component-wise.',
    version: 'GLSL ES 1.00+',
    example: `float f = floor(1.9); // 1.0\nfloat f2 = floor(-1.1); // -2.0`,
    see: ['ceil', 'round', 'fract', 'trunc'],
  },
  trunc: {
    sigs: ['genType trunc(genType x)'],
    desc: 'Returns a value equal to the nearest integer to `x` whose absolute value is not larger than `x` (truncates toward zero).',
    version: 'GLSL ES 3.00+',
    example: `float t = trunc(1.9);  // 1.0\nfloat t2 = trunc(-1.9); // -1.0`,
    see: ['floor', 'ceil', 'round'],
  },
  round: {
    sigs: ['genType round(genType x)'],
    desc: 'Returns the value equal to the nearest integer to `x`. A value halfway between integers rounds away from zero.',
    version: 'GLSL ES 3.00+',
    example: `float r = round(1.5);  // 2.0\nfloat r2 = round(-0.5); // -1.0`,
    see: ['roundEven', 'floor', 'ceil'],
  },
  roundEven: {
    sigs: ['genType roundEven(genType x)'],
    desc: 'Rounds to the nearest even integer (banker\'s rounding). A halfway value rounds to the nearest even integer.',
    version: 'GLSL ES 3.00+',
    example: `float r = roundEven(0.5); // 0.0 (even)\nfloat r2 = roundEven(1.5); // 2.0 (even)`,
    see: ['round'],
  },
  ceil: {
    sigs: ['genType ceil(genType x)'],
    desc: 'Returns the smallest integer ≥ `x` (rounds toward +∞). Applied component-wise.',
    version: 'GLSL ES 1.00+',
    example: `float c = ceil(1.1); // 2.0\nfloat c2 = ceil(-1.9); // -1.0`,
    see: ['floor', 'round'],
  },
  fract: {
    sigs: ['genType fract(genType x)'],
    desc: 'Returns the fractional part of `x`: `x - floor(x)`. Result is always in `[0.0, 1.0)`. Essential for procedural patterns.',
    version: 'GLSL ES 1.00+',
    example: `float f = fract(1.75); // 0.75\nvec2 uv = fract(fragCoord / iResolution.xy * 3.0); // 3x tiling`,
    see: ['floor', 'mod'],
  },
  mod: {
    sigs: [
      'genType mod(genType x, float y)',
      'genType mod(genType x, genType y)',
    ],
    desc: 'Modulo: returns `x - y * floor(x/y)`. Unlike the `%` operator in C, the result has the **same sign as `y`**.',
    version: 'GLSL ES 1.00+',
    example: `float m = mod(7.0, 3.0); // 1.0\nfloat m2 = mod(-1.0, 3.0); // 2.0 (note: positive!)`,
    see: ['fract', 'floor'],
  },
  modf: {
    sigs: ['genType modf(genType x, out genType i)'],
    desc: 'Separates `x` into integer and fractional parts. Returns the fractional part and stores the integer part in `i`. Both parts have the same sign as `x`.',
    version: 'GLSL ES 3.00+',
    example: `float frac, intPart;\nfrac = modf(3.75, intPart); // frac=0.75, intPart=3.0`,
    see: ['fract', 'floor'],
  },
  min: {
    sigs: [
      'genType  min(genType  x, genType  y)',
      'genType  min(genType  x, float    y)',
      'genIType min(genIType x, genIType y)',
      'genUType min(genUType x, genUType y)',
    ],
    desc: 'Returns the minimum of `x` and `y`. Applied component-wise.',
    version: 'GLSL ES 1.00+',
    example: `float m = min(3.0, 5.0); // 3.0\nvec3 v = min(vec3(1,2,3), vec3(3,2,1)); // vec3(1,2,1)`,
    see: ['max', 'clamp'],
  },
  max: {
    sigs: [
      'genType  max(genType  x, genType  y)',
      'genType  max(genType  x, float    y)',
      'genIType max(genIType x, genIType y)',
      'genUType max(genUType x, genUType y)',
    ],
    desc: 'Returns the maximum of `x` and `y`. Applied component-wise.',
    version: 'GLSL ES 1.00+',
    example: `float m = max(3.0, 5.0); // 5.0\nvec3 v = max(vec3(1,2,3), 2.0); // vec3(2,2,3)`,
    see: ['min', 'clamp'],
  },
  clamp: {
    sigs: [
      'genType  clamp(genType  x, genType  minVal, genType  maxVal)',
      'genType  clamp(genType  x, float    minVal, float    maxVal)',
      'genIType clamp(genIType x, genIType minVal, genIType maxVal)',
      'genUType clamp(genUType x, genUType minVal, genUType maxVal)',
    ],
    desc: 'Clamps `x` to the range `[minVal, maxVal]`: `min(max(x, minVal), maxVal)`. Result is undefined if `minVal > maxVal`.',
    version: 'GLSL ES 1.00+',
    example: `float c = clamp(1.5, 0.0, 1.0); // 1.0\nfloat c2 = clamp(-0.5, 0.0, 1.0); // 0.0\nvec4 col = clamp(rawColor, 0.0, 1.0); // keep in range`,
    see: ['min', 'max', 'saturate'],
  },
  mix: {
    sigs: [
      'genType mix(genType x, genType y, genType  a)',
      'genType mix(genType x, genType y, float    a)',
      'genType mix(genType x, genType y, genBType a)',
    ],
    desc: 'Linear blend / lerp: `x*(1−a) + y*a`. When `a` is 0 returns `x`; when `a` is 1 returns `y`.\n\nThe `genBType` overload selects between `x` and `y` component-wise based on boolean vector.',
    version: 'GLSL ES 1.00+',
    example: `float m = mix(0.0, 10.0, 0.3); // 3.0\nvec3 col = mix(colorA, colorB, t);`,
    see: ['smoothstep', 'step', 'clamp'],
  },
  step: {
    sigs: [
      'genType step(genType  edge, genType x)',
      'genType step(float    edge, genType x)',
    ],
    desc: 'Returns 0.0 if `x < edge`, else 1.0. Component-wise.',
    version: 'GLSL ES 1.00+',
    example: `float s = step(0.5, 0.3); // 0.0\nfloat s2 = step(0.5, 0.7); // 1.0\n// Create a hard edge:\nvec3 col = mix(a, b, step(0.5, uv.x));`,
    see: ['smoothstep', 'mix'],
  },
  smoothstep: {
    sigs: [
      'genType smoothstep(genType  edge0, genType  edge1, genType  x)',
      'genType smoothstep(float    edge0, float    edge1, genType  x)',
    ],
    desc: 'Performs smooth Hermite interpolation. Returns 0 for `x ≤ edge0`, 1 for `x ≥ edge1`, and smooth cubic interpolation in between: `t = clamp((x-e0)/(e1-e0), 0, 1); return t*t*(3-2*t)`. Result is undefined if `edge0 ≥ edge1`.',
    version: 'GLSL ES 1.00+',
    example: `float s = smoothstep(0.0, 1.0, 0.5); // 0.5\nfloat s2 = smoothstep(0.4, 0.6, uv.x); // anti-aliased edge`,
    see: ['step', 'mix'],
  },
  isnan: {
    sigs: ['genBType isnan(genType x)'],
    desc: 'Returns true if `x` holds a NaN (Not a Number). The result may always be false on hardware that doesn\'t support NaN.',
    version: 'GLSL ES 3.00+',
    see: ['isinf'],
  },
  isinf: {
    sigs: ['genBType isinf(genType x)'],
    desc: 'Returns true if `x` holds a positive or negative infinity.',
    version: 'GLSL ES 3.00+',
    see: ['isnan'],
  },

  // ── FLOATING-POINT BIT MANIPULATION ───────────────────────────────────────

  floatBitsToInt: {
    sigs: ['genIType floatBitsToInt(genType value)'],
    desc: 'Returns the IEEE 754 bit encoding of a `float` as a signed integer — no conversion, just reinterpretation.',
    version: 'GLSL ES 3.00+',
    example: `int bits = floatBitsToInt(1.0); // 0x3F800000`,
    see: ['intBitsToFloat', 'floatBitsToUint'],
  },
  floatBitsToUint: {
    sigs: ['genUType floatBitsToUint(genType value)'],
    desc: 'Reinterprets the bits of a float as an unsigned integer.',
    version: 'GLSL ES 3.00+',
    see: ['uintBitsToFloat', 'floatBitsToInt'],
  },
  intBitsToFloat: {
    sigs: ['genType intBitsToFloat(genIType value)'],
    desc: 'Reinterprets the bits of a signed integer as a float.',
    version: 'GLSL ES 3.00+',
    see: ['floatBitsToInt'],
  },
  uintBitsToFloat: {
    sigs: ['genType uintBitsToFloat(genUType value)'],
    desc: 'Reinterprets the bits of an unsigned integer as a float.',
    version: 'GLSL ES 3.00+',
    see: ['floatBitsToUint'],
  },
  packSnorm2x16: {
    sigs: ['uint packSnorm2x16(vec2 v)'],
    desc: 'Packs two normalized floats (-1..1) into a 16-bit signed integer each, returning a `uint`.',
    version: 'GLSL ES 3.00+',
    see: ['unpackSnorm2x16', 'packUnorm2x16'],
  },
  unpackSnorm2x16: {
    sigs: ['vec2 unpackSnorm2x16(uint p)'],
    desc: 'Unpacks a `uint` into two signed normalized floats (-1..1).',
    version: 'GLSL ES 3.00+',
    see: ['packSnorm2x16'],
  },
  packUnorm2x16: {
    sigs: ['uint packUnorm2x16(vec2 v)'],
    desc: 'Packs two unsigned normalized floats (0..1) into 16 bits each.',
    version: 'GLSL ES 3.00+',
    see: ['unpackUnorm2x16'],
  },
  unpackUnorm2x16: {
    sigs: ['vec2 unpackUnorm2x16(uint p)'],
    desc: 'Unpacks two 16-bit unsigned normalized values from a `uint`.',
    version: 'GLSL ES 3.00+',
    see: ['packUnorm2x16'],
  },
  packHalf2x16: {
    sigs: ['uint packHalf2x16(vec2 v)'],
    desc: 'Packs two floats into 16-bit half-precision representation each.',
    version: 'GLSL ES 3.00+',
    see: ['unpackHalf2x16'],
  },
  unpackHalf2x16: {
    sigs: ['vec2 unpackHalf2x16(uint v)'],
    desc: 'Unpacks two half-precision floats from a `uint`.',
    version: 'GLSL ES 3.00+',
    see: ['packHalf2x16'],
  },

  // ── GEOMETRIC ─────────────────────────────────────────────────────────────

  length: {
    sigs: ['float length(genType x)'],
    desc: 'Returns the Euclidean length (magnitude) of vector `x`: `√(x₀²+x₁²+…)`. For a scalar, equivalent to `abs(x)`.',
    version: 'GLSL ES 1.00+',
    example: `float l = length(vec2(3.0, 4.0)); // 5.0\nfloat l2 = length(vec3(1.0, 2.0, 2.0)); // 3.0`,
    see: ['distance', 'normalize', 'dot'],
  },
  distance: {
    sigs: ['float distance(genType p0, genType p1)'],
    desc: 'Returns the Euclidean distance between `p0` and `p1`: `length(p1 - p0)`.',
    version: 'GLSL ES 1.00+',
    example: `float d = distance(vec2(0.0), vec2(3.0, 4.0)); // 5.0`,
    see: ['length'],
  },
  dot: {
    sigs: ['float dot(genType x, genType y)'],
    desc: 'Returns the dot product of `x` and `y`: `x₀·y₀ + x₁·y₁ + …`. For unit vectors, `dot(a,b) = cos(angle)` between them.',
    version: 'GLSL ES 1.00+',
    example: `float d = dot(vec3(1,0,0), vec3(0,1,0)); // 0.0 (perpendicular)\nfloat d2 = dot(normalize(v), normalize(l)); // cos(angle)`,
    see: ['cross', 'normalize', 'length'],
  },
  cross: {
    sigs: ['vec3 cross(vec3 x, vec3 y)'],
    desc: 'Returns the cross product of `x` and `y`. The result is a vector perpendicular to both, with magnitude `|x|·|y|·sin(θ)`. Only defined for `vec3`.',
    version: 'GLSL ES 1.00+',
    example: `vec3 up = cross(vec3(1,0,0), vec3(0,0,-1)); // vec3(0,1,0)\nvec3 normal = normalize(cross(edge1, edge2));`,
    see: ['dot', 'normalize'],
  },
  normalize: {
    sigs: ['genType normalize(genType x)'],
    desc: 'Returns a unit-length vector in the same direction as `x`: `x / length(x)`. Result is undefined for zero-length input.',
    version: 'GLSL ES 1.00+',
    example: `vec3 n = normalize(vec3(1.0, 2.0, 3.0)); // length ≈ 1.0\nvec3 lightDir = normalize(lightPos - fragPos);`,
    see: ['length', 'dot', 'inversesqrt'],
  },
  faceforward: {
    sigs: ['genType faceforward(genType N, genType I, genType Nref)'],
    desc: 'Returns `N` if `dot(Nref, I) < 0`, otherwise returns `−N`. Ensures the surface normal faces in the same hemisphere as the viewing direction.',
    version: 'GLSL ES 1.00+',
    example: `// Ensure normal faces viewer:\nvec3 n = faceforward(normal, viewDir, normal);`,
    see: ['reflect', 'refract'],
  },
  reflect: {
    sigs: ['genType reflect(genType I, genType N)'],
    desc: 'Reflects incident vector `I` around surface normal `N`: `I - 2·dot(N,I)·N`. `N` must be normalized.',
    version: 'GLSL ES 1.00+',
    example: `vec3 reflected = reflect(incident, normal);\n// Mirror ray:\nvec3 rd2 = reflect(rd, hitNormal);`,
    see: ['refract', 'faceforward'],
  },
  refract: {
    sigs: ['genType refract(genType I, genType N, float eta)'],
    desc: 'Computes the refraction vector for incident vector `I`, surface normal `N`, and ratio of indices of refraction `eta` (n₁/n₂). `N` must be normalized. Returns zero vector for total internal reflection.',
    version: 'GLSL ES 1.00+',
    example: `// Glass (eta = air/glass ≈ 1.0/1.5):\nvec3 refracted = refract(incident, normal, 1.0/1.5);`,
    see: ['reflect'],
  },

  // ── MATRIX ────────────────────────────────────────────────────────────────

  matrixCompMult: {
    sigs: ['mat matrixCompMult(mat x, mat y)'],
    desc: 'Component-wise matrix multiplication (Hadamard product) — NOT standard matrix multiplication. For matrix multiplication use `x * y`.',
    version: 'GLSL ES 1.00+',
    see: ['outerProduct', 'transpose'],
  },
  outerProduct: {
    sigs: [
      'mat2 outerProduct(vec2 c, vec2 r)',
      'mat3 outerProduct(vec3 c, vec3 r)',
      'mat4 outerProduct(vec4 c, vec4 r)',
    ],
    desc: 'Returns the outer product (tensor product) of column vector `c` and row vector `r`, producing a matrix.',
    version: 'GLSL ES 3.00+',
    see: ['matrixCompMult', 'transpose'],
  },
  transpose: {
    sigs: ['mat2 transpose(mat2 m)', 'mat3 transpose(mat3 m)', 'mat4 transpose(mat4 m)'],
    desc: 'Returns the transpose of matrix `m` — rows become columns.',
    version: 'GLSL ES 3.00+',
    see: ['inverse', 'determinant'],
  },
  determinant: {
    sigs: ['float determinant(mat2 m)', 'float determinant(mat3 m)', 'float determinant(mat4 m)'],
    desc: 'Returns the scalar determinant of matrix `m`. A non-zero determinant indicates an invertible matrix.',
    version: 'GLSL ES 3.00+',
    see: ['inverse', 'transpose'],
  },
  inverse: {
    sigs: ['mat2 inverse(mat2 m)', 'mat3 inverse(mat3 m)', 'mat4 inverse(mat4 m)'],
    desc: 'Returns the inverse of matrix `m`. Result is undefined if `m` is singular (non-invertible).',
    version: 'GLSL ES 3.00+',
    example: `mat4 invModel = inverse(modelMatrix);\n// Transform normal correctly:\nvec3 n = normalize(mat3(transpose(inverse(model))) * normal);`,
    see: ['transpose', 'determinant'],
  },

  // ── VECTOR RELATIONAL ─────────────────────────────────────────────────────

  lessThan: {
    sigs: [
      'bvec lessThan(vec  x, vec  y)',
      'bvec lessThan(ivec x, ivec y)',
      'bvec lessThan(uvec x, uvec y)',
    ],
    desc: 'Returns a boolean vector of component-wise `x < y`.',
    version: 'GLSL ES 1.00+',
    see: ['lessThanEqual', 'greaterThan', 'equal'],
  },
  lessThanEqual: {
    sigs: ['bvec lessThanEqual(vec x, vec y)', 'bvec lessThanEqual(ivec x, ivec y)'],
    desc: 'Returns a boolean vector of component-wise `x ≤ y`.',
    version: 'GLSL ES 1.00+',
    see: ['lessThan'],
  },
  greaterThan: {
    sigs: ['bvec greaterThan(vec x, vec y)', 'bvec greaterThan(ivec x, ivec y)'],
    desc: 'Returns a boolean vector of component-wise `x > y`.',
    version: 'GLSL ES 1.00+',
    see: ['greaterThanEqual', 'lessThan'],
  },
  greaterThanEqual: {
    sigs: ['bvec greaterThanEqual(vec x, vec y)', 'bvec greaterThanEqual(ivec x, ivec y)'],
    desc: 'Returns a boolean vector of component-wise `x ≥ y`.',
    version: 'GLSL ES 1.00+',
    see: ['greaterThan'],
  },
  equal: {
    sigs: [
      'bvec equal(vec  x, vec  y)',
      'bvec equal(ivec x, ivec y)',
      'bvec equal(bvec x, bvec y)',
    ],
    desc: 'Returns a boolean vector of component-wise `x == y`.',
    version: 'GLSL ES 1.00+',
    see: ['notEqual', 'any', 'all'],
  },
  notEqual: {
    sigs: ['bvec notEqual(vec x, vec y)', 'bvec notEqual(ivec x, ivec y)', 'bvec notEqual(bvec x, bvec y)'],
    desc: 'Returns a boolean vector of component-wise `x ≠ y`.',
    version: 'GLSL ES 1.00+',
    see: ['equal'],
  },
  any: {
    sigs: ['bool any(bvec x)'],
    desc: 'Returns `true` if any component of the boolean vector `x` is `true`.',
    version: 'GLSL ES 1.00+',
    example: `bvec2 v = lessThan(uv, vec2(0.5));\nbool anySmall = any(v);`,
    see: ['all', 'not', 'equal'],
  },
  all: {
    sigs: ['bool all(bvec x)'],
    desc: 'Returns `true` if all components of the boolean vector `x` are `true`.',
    version: 'GLSL ES 1.00+',
    see: ['any', 'not'],
  },
  not: {
    sigs: ['bvec not(bvec x)'],
    desc: 'Returns the component-wise logical complement of `x`.',
    version: 'GLSL ES 1.00+',
    see: ['any', 'all'],
  },

  // ── TEXTURE ───────────────────────────────────────────────────────────────

  texture: {
    sigs: [
      'vec4 texture(sampler2D      sampler, vec2 coord)',
      'vec4 texture(sampler2D      sampler, vec2 coord, float bias)',
      'vec4 texture(sampler3D      sampler, vec3 coord)',
      'vec4 texture(samplerCube    sampler, vec3 coord)',
      'vec4 texture(sampler2DArray sampler, vec3 coord)',
      'vec4 texture(sampler2DShadow sampler, vec3 coord)',
    ],
    desc: 'Samples a texture at the given normalized coordinates. The optional `bias` value is added to the computed mip level. Available in GLSL ES 3.00+ (use `texture2D` in ES 1.00).',
    version: 'GLSL ES 3.00+',
    example: `vec4 col = texture(iChannel0, uv);\nvec4 col2 = texture(iChannel0, uv, -0.5); // bias toward sharper mip`,
    see: ['textureLod', 'textureGrad', 'texelFetch', 'textureSize'],
  },
  texture2D: {
    sigs: [
      'vec4 texture2D(sampler2D sampler, vec2 coord)',
      'vec4 texture2D(sampler2D sampler, vec2 coord, float bias)',
    ],
    desc: 'Samples a 2D texture. **GLSL ES 1.00 version of `texture()`** — use `texture()` in GLSL ES 3.00+.',
    version: 'GLSL ES 1.00',
    example: `vec4 col = texture2D(iChannel0, uv);`,
    see: ['texture', 'texture2DLod'],
  },
  texture2DLod: {
    sigs: ['vec4 texture2DLod(sampler2D sampler, vec2 coord, float lod)'],
    desc: 'Samples a 2D texture at an explicit mip level. **GLSL ES 1.00 version of `textureLod()`**.',
    version: 'GLSL ES 1.00 (vertex/fragment with extension)',
    see: ['textureLod', 'texture2D'],
  },
  texture2DProj: {
    sigs: [
      'vec4 texture2DProj(sampler2D sampler, vec3 coord)',
      'vec4 texture2DProj(sampler2D sampler, vec4 coord)',
    ],
    desc: 'Projective texture lookup: divides `coord.xy` by `coord.z` (or `coord.w`) before sampling.',
    version: 'GLSL ES 1.00+',
    see: ['textureProj', 'texture2D'],
  },
  textureCube: {
    sigs: ['vec4 textureCube(samplerCube sampler, vec3 coord)'],
    desc: 'Samples a cube map texture using direction vector `coord`. **GLSL ES 1.00 version of `texture(samplerCube, …)`**.',
    version: 'GLSL ES 1.00',
    see: ['texture'],
  },
  textureCubeLod: {
    sigs: ['vec4 textureCubeLod(samplerCube sampler, vec3 coord, float lod)'],
    desc: 'Samples a cube map at an explicit mip level.',
    version: 'GLSL ES 1.00 (vertex/with extension)',
    see: ['textureLod', 'textureCube'],
  },
  textureLod: {
    sigs: [
      'vec4 textureLod(sampler2D      sampler, vec2 coord, float lod)',
      'vec4 textureLod(samplerCube    sampler, vec3 coord, float lod)',
      'vec4 textureLod(sampler3D      sampler, vec3 coord, float lod)',
      'vec4 textureLod(sampler2DArray sampler, vec3 coord, float lod)',
    ],
    desc: 'Samples a texture at an explicit mip level (LOD). LOD 0 is the full-resolution texture.',
    version: 'GLSL ES 3.00+',
    example: `// Sample blurry version (mip 2):\nvec4 blurry = textureLod(iChannel0, uv, 2.0);`,
    see: ['texture', 'textureGrad'],
  },
  textureGrad: {
    sigs: [
      'vec4 textureGrad(sampler2D sampler, vec2 coord, vec2 dPdx, vec2 dPdy)',
      'vec4 textureGrad(samplerCube sampler, vec3 coord, vec3 dPdx, vec3 dPdy)',
    ],
    desc: 'Samples a texture using explicit gradients (derivatives) for mip-level computation. Useful in non-fragment contexts or for custom filtering.',
    version: 'GLSL ES 3.00+',
    example: `vec2 dx = dFdx(uv * 4.0);\nvec2 dy = dFdy(uv * 4.0);\nvec4 col = textureGrad(iChannel0, uv, dx, dy);`,
    see: ['textureLod', 'dFdx', 'dFdy'],
  },
  textureGradOffset: {
    sigs: ['vec4 textureGradOffset(sampler2D sampler, vec2 coord, vec2 dPdx, vec2 dPdy, ivec2 offset)'],
    desc: 'Like `textureGrad` but with an additional texel offset.',
    version: 'GLSL ES 3.00+',
    see: ['textureGrad', 'textureOffset'],
  },
  texelFetch: {
    sigs: [
      'vec4 texelFetch(sampler2D      sampler, ivec2 coord, int lod)',
      'vec4 texelFetch(sampler3D      sampler, ivec3 coord, int lod)',
      'vec4 texelFetch(sampler2DArray sampler, ivec3 coord, int lod)',
    ],
    desc: 'Fetches a single texel at integer coordinates (not normalized). No filtering applied.',
    version: 'GLSL ES 3.00+',
    example: `// Fetch exact pixel at integer coordinate:\nvec4 px = texelFetch(iChannel0, ivec2(x, y), 0);`,
    see: ['texture', 'textureSize'],
  },
  texelFetchOffset: {
    sigs: ['vec4 texelFetchOffset(sampler2D sampler, ivec2 coord, int lod, ivec2 offset)'],
    desc: 'Like `texelFetch` but adds an integer texel offset to the coordinates.',
    version: 'GLSL ES 3.00+',
    see: ['texelFetch'],
  },
  textureOffset: {
    sigs: [
      'vec4 textureOffset(sampler2D sampler, vec2 coord, ivec2 offset)',
      'vec4 textureOffset(sampler2D sampler, vec2 coord, ivec2 offset, float bias)',
    ],
    desc: 'Samples a texture with an additional texel offset applied before the lookup. Useful for box filters, PCF shadow maps.',
    version: 'GLSL ES 3.00+',
    example: `// Simple box blur sample:\nvec4 right = textureOffset(iChannel0, uv, ivec2(1, 0));`,
    see: ['texture', 'texelFetch'],
  },
  textureSize: {
    sigs: [
      'ivec2 textureSize(sampler2D      sampler, int lod)',
      'ivec3 textureSize(sampler3D      sampler, int lod)',
      'ivec3 textureSize(sampler2DArray sampler, int lod)',
    ],
    desc: 'Returns the dimensions of the texture at the given mip level. Use `lod = 0` for full resolution.',
    version: 'GLSL ES 3.00+',
    example: `ivec2 sz = textureSize(iChannel0, 0);\nvec2 texelSize = 1.0 / vec2(sz);`,
    see: ['texelFetch'],
  },
  textureProj: {
    sigs: [
      'vec4 textureProj(sampler2D sampler, vec3 coord)',
      'vec4 textureProj(sampler2D sampler, vec4 coord)',
    ],
    desc: 'Projective texture lookup. Divides `coord.xy` by `coord.z` before sampling (or `coord.xyz` by `coord.w` for the vec4 overload).',
    version: 'GLSL ES 3.00+',
    see: ['texture', 'texture2DProj'],
  },
  textureProjLod: {
    sigs: ['vec4 textureProjLod(sampler2D sampler, vec3 coord, float lod)'],
    desc: 'Projective texture lookup at explicit mip level.',
    version: 'GLSL ES 3.00+',
    see: ['textureProj', 'textureLod'],
  },
  textureProjGrad: {
    sigs: ['vec4 textureProjGrad(sampler2D sampler, vec3 coord, vec2 dPdx, vec2 dPdy)'],
    desc: 'Projective texture lookup with explicit gradients.',
    version: 'GLSL ES 3.00+',
    see: ['textureGrad', 'textureProj'],
  },
  textureProjGradOffset: {
    sigs: ['vec4 textureProjGradOffset(sampler2D sampler, vec3 coord, vec2 dPdx, vec2 dPdy, ivec2 offset)'],
    desc: 'Projective texture lookup with explicit gradients and texel offset.',
    version: 'GLSL ES 3.00+',
    see: ['textureProjGrad'],
  },
  textureProjOffset: {
    sigs: ['vec4 textureProjOffset(sampler2D sampler, vec3 coord, ivec2 offset)'],
    desc: 'Projective texture lookup with a texel offset.',
    version: 'GLSL ES 3.00+',
    see: ['textureOffset', 'textureProj'],
  },
  textureLodOffset: {
    sigs: ['vec4 textureLodOffset(sampler2D sampler, vec2 coord, float lod, ivec2 offset)'],
    desc: 'Texture lookup at explicit mip level with texel offset.',
    version: 'GLSL ES 3.00+',
    see: ['textureLod', 'textureOffset'],
  },
  textureProjLodOffset: {
    sigs: ['vec4 textureProjLodOffset(sampler2D sampler, vec3 coord, float lod, ivec2 offset)'],
    desc: 'Projective texture lookup at explicit mip with offset.',
    version: 'GLSL ES 3.00+',
    see: ['textureProjLod'],
  },

  // ── DERIVATIVE / SCREEN-SPACE ─────────────────────────────────────────────

  dFdx: {
    sigs: ['genType dFdx(genType p)'],
    desc: 'Returns the approximate partial derivative of `p` with respect to window X coordinate. Computed using adjacent fragments evaluated in a 2×2 block. Only available in fragment shaders.',
    version: 'GLSL ES 3.00+ (ES 1.00 requires `GL_OES_standard_derivatives`)',
    example: `// Anti-aliased SDF edge:\nfloat w = fwidth(sdf);\nfloat aa = smoothstep(w, -w, sdf);`,
    see: ['dFdy', 'fwidth'],
  },
  dFdy: {
    sigs: ['genType dFdy(genType p)'],
    desc: 'Returns the approximate partial derivative of `p` with respect to window Y coordinate.',
    version: 'GLSL ES 3.00+',
    see: ['dFdx', 'fwidth'],
  },
  fwidth: {
    sigs: ['genType fwidth(genType p)'],
    desc: 'Returns `abs(dFdx(p)) + abs(dFdy(p))`. Approximates the rate of change across a pixel, useful for anti-aliasing.',
    version: 'GLSL ES 3.00+',
    example: `// SDF anti-aliasing:\nfloat d = sdCircle(uv, 0.5);\nfloat edge = smoothstep(fwidth(d), 0.0, d);`,
    see: ['dFdx', 'dFdy'],
  },

  // ── INTEGER / BIT ─────────────────────────────────────────────────────────

  bitfieldExtract: {
    sigs: [
      'genIType bitfieldExtract(genIType value, int offset, int bits)',
      'genUType bitfieldExtract(genUType value, int offset, int bits)',
    ],
    desc: 'Extracts `bits` bits from `value` starting at bit `offset`. For signed integers, sign-extends the result.',
    version: 'GLSL ES 3.10+ / GLSL 4.00+',
    see: ['bitfieldInsert', 'bitCount'],
  },
  bitfieldInsert: {
    sigs: ['genIType bitfieldInsert(genIType base, genIType insert, int offset, int bits)'],
    desc: 'Inserts `bits` bits from `insert` into `base` starting at bit `offset`.',
    version: 'GLSL ES 3.10+ / GLSL 4.00+',
    see: ['bitfieldExtract'],
  },
  bitfieldReverse: {
    sigs: ['genIType bitfieldReverse(genIType value)', 'genUType bitfieldReverse(genUType value)'],
    desc: 'Reverses the bits of `value`.',
    version: 'GLSL ES 3.10+ / GLSL 4.00+',
    see: ['bitCount'],
  },
  bitCount: {
    sigs: ['genIType bitCount(genIType value)', 'genUType bitCount(genUType value)'],
    desc: 'Returns the number of set (1) bits in `value` (population count / popcount).',
    version: 'GLSL ES 3.10+ / GLSL 4.00+',
    see: ['bitfieldReverse'],
  },
  findLSB: {
    sigs: ['genIType findLSB(genIType value)', 'genIType findLSB(genUType value)'],
    desc: 'Returns the bit position of the least significant bit set in `value`, or -1 if `value` is 0.',
    version: 'GLSL ES 3.10+ / GLSL 4.00+',
    see: ['findMSB'],
  },
  findMSB: {
    sigs: ['genIType findMSB(genIType value)', 'genIType findMSB(genUType value)'],
    desc: 'Returns the bit position of the most significant bit set in `value`, or -1 if `value` is 0.',
    version: 'GLSL ES 3.10+ / GLSL 4.00+',
    see: ['findLSB'],
  },

  // ── ATOMIC (GLSL 4.30+ / ES 3.10+) ───────────────────────────────────────

  atomicAdd: {
    sigs: ['int atomicAdd(inout int mem, int data)', 'uint atomicAdd(inout uint mem, uint data)'],
    desc: 'Atomically adds `data` to `mem` and returns the original value of `mem`. Only valid on shader storage buffer objects or shared variables.',
    version: 'GLSL 4.30+ / GLSL ES 3.10+',
    see: ['atomicMin', 'atomicMax', 'atomicExchange'],
  },
  atomicMin: {
    sigs: ['int atomicMin(inout int mem, int data)', 'uint atomicMin(inout uint mem, uint data)'],
    desc: 'Atomically stores `min(mem, data)` into `mem` and returns the original value.',
    version: 'GLSL 4.30+ / GLSL ES 3.10+',
    see: ['atomicAdd', 'atomicMax'],
  },
  atomicMax: {
    sigs: ['int atomicMax(inout int mem, int data)', 'uint atomicMax(inout uint mem, uint data)'],
    desc: 'Atomically stores `max(mem, data)` into `mem` and returns the original value.',
    version: 'GLSL 4.30+ / GLSL ES 3.10+',
    see: ['atomicMin', 'atomicAdd'],
  },
  atomicExchange: {
    sigs: ['int atomicExchange(inout int mem, int data)'],
    desc: 'Atomically stores `data` into `mem` and returns the original value.',
    version: 'GLSL 4.30+ / GLSL ES 3.10+',
    see: ['atomicCompSwap'],
  },
  atomicCompSwap: {
    sigs: ['int atomicCompSwap(inout int mem, int compare, int data)'],
    desc: 'Atomically compares `mem` with `compare`; if equal, stores `data`, otherwise leaves `mem` unchanged. Returns the original value.',
    version: 'GLSL 4.30+ / GLSL ES 3.10+',
    see: ['atomicExchange'],
  },

  // ── CONTROL FLOW ──────────────────────────────────────────────────────────

  discard: {
    sigs: ['discard;'],
    desc: 'Fragment-only statement. Discards the current fragment — the fragment is not written to the framebuffer. Execution continues after `discard` but the output is discarded.',
    version: 'GLSL ES 1.00+ (fragment shader only)',
    example: `// Punch-hole transparency:\nif (texture(iChannel0, uv).a < 0.1) discard;`,
  },

  // ── BUILT-IN VARIABLES ────────────────────────────────────────────────────

  gl_FragCoord: {
    sigs: ['vec4 gl_FragCoord'],
    desc: 'The window-space (screen-space) position of the fragment. `gl_FragCoord.xy` gives pixel coordinates (0,0 at bottom-left on most implementations). `gl_FragCoord.z` is the depth [0,1] and `gl_FragCoord.w` is `1/w` for perspective.\n\n**In Sliders GL** this is the same as `fragCoord` passed to `mainImage()`.',
    version: 'GLSL ES 1.00+ (fragment shader)',
    example: `vec2 uv = gl_FragCoord.xy / iResolution.xy;`,
    see: ['gl_Position', 'iResolution'],
  },
  gl_Position: {
    sigs: ['vec4 gl_Position'],
    desc: 'The clip-space output position of the vertex. Must be written by every vertex shader. Homogeneous coordinates — the GPU divides by `.w` for perspective.',
    version: 'GLSL ES 1.00+ (vertex shader)',
    example: `gl_Position = projMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);`,
    see: ['gl_FragCoord'],
  },
  gl_PointSize: {
    sigs: ['float gl_PointSize'],
    desc: 'The size of rasterized points in pixels. Written by the vertex shader when rendering `GL_POINTS`. Clamped to `[gl_aliased_point_size_range]`.',
    version: 'GLSL ES 1.00+ (vertex shader, points only)',
  },
  gl_PointCoord: {
    sigs: ['vec2 gl_PointCoord'],
    desc: 'The 2D coordinate within a point primitive, ranging from (0,0) to (1,1). Only meaningful when rendering `GL_POINTS`.',
    version: 'GLSL ES 1.00+ (fragment shader, points only)',
    example: `// Circular point sprites:\nif (length(gl_PointCoord - 0.5) > 0.5) discard;`,
  },
  gl_FrontFacing: {
    sigs: ['bool gl_FrontFacing'],
    desc: 'True if the fragment belongs to a front-facing primitive. Determined by winding order.',
    version: 'GLSL ES 1.00+ (fragment shader)',
    example: `// Two-sided lighting:\nvec3 n = gl_FrontFacing ? normal : -normal;`,
  },
  gl_FragDepth: {
    sigs: ['float gl_FragDepth'],
    desc: 'The depth value written to the depth buffer. If not written, the default `gl_FragCoord.z` is used. Writing this value disables early-Z optimization.',
    version: 'GLSL ES 3.00+ (fragment shader)',
  },
  gl_VertexID: {
    sigs: ['int gl_VertexID'],
    desc: 'The index of the current vertex being processed. Useful for procedural geometry without vertex buffers.',
    version: 'GLSL ES 3.00+ (vertex shader)',
    example: `// Fullscreen triangle without VBO:\nvec2 pos = vec2((gl_VertexID & 1) * 4.0 - 1.0, (gl_VertexID >> 1) * 4.0 - 1.0);`,
  },
  gl_InstanceID: {
    sigs: ['int gl_InstanceID'],
    desc: 'The index of the current instance in an instanced draw call.',
    version: 'GLSL ES 3.00+ (vertex shader)',
  },
  gl_SampleID: {
    sigs: ['int gl_SampleID'],
    desc: 'The index of the current sample when using multisampling.',
    version: 'GLSL ES 3.10+',
  },
  gl_SamplePosition: {
    sigs: ['vec2 gl_SamplePosition'],
    desc: 'Position of the current sample within the pixel, in [0,1].',
    version: 'GLSL ES 3.10+',
  },
  gl_SampleMask: {
    sigs: ['int gl_SampleMask[]'],
    desc: 'The sample mask for the current fragment. Written by the shader to control which samples are updated.',
    version: 'GLSL ES 3.10+',
  },
  gl_SampleMaskIn: {
    sigs: ['int gl_SampleMaskIn[]'],
    desc: 'The incoming sample mask for the current fragment.',
    version: 'GLSL ES 3.10+',
  },
  gl_FragColor: {
    sigs: ['vec4 gl_FragColor'],
    desc: '**Deprecated in GLSL ES 3.00+.** The output color of the fragment. Use a user-defined `out vec4` variable instead in GLSL ES 3.00+.',
    version: 'GLSL ES 1.00 only',
    example: `// ES 1.00:\ngl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);\n\n// ES 3.00+ preferred:\nout vec4 fragColor;\nfragColor = vec4(1.0, 0.0, 0.0, 1.0);`,
  },
  gl_FragData: {
    sigs: ['vec4 gl_FragData[gl_MaxDrawBuffers]'],
    desc: '**Deprecated.** Array of fragment outputs for MRT (Multiple Render Targets) in GLSL ES 1.00.',
    version: 'GLSL ES 1.00 with GL_EXT_draw_buffers',
  },

  // ── SHADERTOY / Sliders GL UNIFORMS ─────────────────────────────────────────────

  iResolution: {
    sigs: ['uniform vec3 iResolution'],
    desc: 'The resolution of the viewport in pixels: `iResolution.xy = (width, height)`. `iResolution.z` is the pixel aspect ratio (usually 1.0).',
    version: 'Sliders GL / ShaderToy uniform',
    example: `vec2 uv = fragCoord / iResolution.xy; // [0,1]\nvec2 p = (fragCoord - 0.5*iResolution.xy) / iResolution.y; // centered`,
    see: ['iTime', 'iMouse'],
  },
  iTime: {
    sigs: ['uniform float iTime'],
    desc: 'Shader playback time in seconds. Advances at real-time speed.',
    version: 'Sliders GL / ShaderToy uniform',
    example: `float t = iTime;\nfloat wave = sin(iTime * 2.0);\nvec2 dir = vec2(cos(iTime), sin(iTime));`,
    see: ['iTimeDelta', 'iFrame'],
  },
  iTimeDelta: {
    sigs: ['uniform float iTimeDelta'],
    desc: 'Time elapsed since the last frame in seconds. Use for frame-rate-independent animation.',
    version: 'Sliders GL / ShaderToy uniform',
    example: `// Frame-rate independent movement:\npos += vel * iTimeDelta;`,
    see: ['iTime', 'iFrame'],
  },
  iFrame: {
    sigs: ['uniform int iFrame'],
    desc: 'The current frame number, starting at 0. Increments by 1 each frame.',
    version: 'Sliders GL / ShaderToy uniform',
    example: `float t = float(iFrame) / 60.0; // 60fps assumption`,
    see: ['iTime'],
  },
  iMouse: {
    sigs: ['uniform vec4 iMouse'],
    desc: '`iMouse.xy` = current mouse position in pixels (origin at bottom-left). `iMouse.zw` = pixel where the mouse was last clicked. `iMouse.z` > 0 when the mouse button is held down.',
    version: 'Sliders GL / ShaderToy uniform',
    example: `vec2 mouse = iMouse.xy / iResolution.xy;\nbool mouseDown = iMouse.z > 0.0;\n// Attract to mouse:\nvec2 toMouse = normalize(mouse - uv);`,
    see: ['iResolution'],
  },
  iChannel0: {
    sigs: ['uniform sampler2D iChannel0'],
    desc: 'First texture channel input. Can be a texture, BufferA, mic/audio, video, or procedural. Sample with `texture(iChannel0, uv)`.',
    version: 'Sliders GL / ShaderToy uniform',
    example: `vec4 col = texture(iChannel0, uv);\n// Audio spectrum (FFT row 0):\nfloat freq = texture(iChannel0, vec2(uv.x, 0.0)).r;`,
    see: ['iChannel1', 'iChannel2', 'iChannel3', 'texture'],
  },
  iChannel1: {
    sigs: ['uniform sampler2D iChannel1'],
    desc: 'Second texture channel input.',
    version: 'Sliders GL / ShaderToy uniform',
    see: ['iChannel0'],
  },
  iChannel2: {
    sigs: ['uniform sampler2D iChannel2'],
    desc: 'Third texture channel input.',
    version: 'Sliders GL / ShaderToy uniform',
    see: ['iChannel0'],
  },
  iChannel3: {
    sigs: ['uniform sampler2D iChannel3'],
    desc: 'Fourth texture channel input.',
    version: 'Sliders GL / ShaderToy uniform',
    see: ['iChannel0'],
  },
  iChannelResolution: {
    sigs: ['uniform vec3 iChannelResolution[4]'],
    desc: 'Resolution of each channel: `iChannelResolution[0].xy = size of iChannel0`.',
    version: 'Sliders GL / ShaderToy uniform',
  },
  iChannelTime: {
    sigs: ['uniform float iChannelTime[4]'],
    desc: 'Playback time for video channels.',
    version: 'Sliders GL / ShaderToy uniform',
  },
  iDate: {
    sigs: ['uniform vec4 iDate'],
    desc: 'The current date: `iDate.x = year`, `.y = month`, `.z = day`, `.w = seconds since midnight`.',
    version: 'Sliders GL / ShaderToy uniform',
  },
  iFrameRate: {
    sigs: ['uniform float iFrameRate'],
    desc: 'The estimated frame rate of the shader in Hz.',
    version: 'Sliders GL / ShaderToy uniform',
  },
  iSampleRate: {
    sigs: ['uniform float iSampleRate'],
    desc: 'Audio sample rate in Hz (typically 44100).',
    version: 'Sliders GL / ShaderToy uniform',
  },
};

/**
 * Build the compact hover string (markdown) from a GLSL_DOCS entry.
 * Used by the Monaco hover provider.
 */
export function glslFormatHover(entry) {
  const parts = [];
  parts.push('```glsl\n' + entry.sigs.join('\n') + '\n```');
  parts.push(entry.desc);
  if (entry.version) parts.push(`*${entry.version}*`);
  if (entry.see?.length) parts.push(`**See also:** ${entry.see.map(s => '`' + s + '`').join(', ')}`);
  return parts.join('\n\n');
}

/**
 * Build the full doc page markdown (used by the F1 panel).
 */
export function glslFormatPage(name, entry) {
  const lines = [];
  lines.push(`## \`${name}\``);
  if (entry.version) lines.push(`> ${entry.version}`);
  lines.push('');
  lines.push('### Signatures');
  lines.push('```glsl');
  for (const s of entry.sigs) lines.push(s);
  lines.push('```');
  lines.push('');
  lines.push('### Description');
  lines.push(entry.desc);
  if (entry.example) {
    lines.push('');
    lines.push('### Example');
    lines.push('```glsl');
    lines.push(entry.example);
    lines.push('```');
  }
  if (entry.see?.length) {
    lines.push('');
    lines.push('### See Also');
    lines.push(entry.see.map(s => '`' + s + '`').join('  ·  '));
  }
  return lines.join('\n');
}
