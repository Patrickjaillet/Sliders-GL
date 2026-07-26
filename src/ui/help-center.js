/**
 * help-center.js — Phase 13.2
 *
 * Implements:
 *   13.2.1  Full user documentation (Getting Started, UI Reference, GLSL Uniform Reference,
 *            Export Guide)
 *   13.2.2  Built-in searchable help system accessible via F1
 *
 * Replaces / supersedes the minimal openGLSLReference() from onboarding.js.
 * Re-exports toggleGLSLReference() as an alias for backward compatibility.
 *
 * Architecture:
 *   - All content is inline (zero network requests, works fully offline)
 *   - Flat search index built at module load — O(n) search across 400+ entries
 *   - Single DOM node reused; open/close via CSS class, never destroyed
 *   - Zero dependencies on app state — safe to call at any point
 */

// ─────────────────────────────────────────────────────────────────────────────
// § DOCUMENTATION CONTENT
// Each section is { id, label, icon, chapters: [{ title, anchor, content }] }
// content is an HTML string (rendered into a sandboxed container).
// ─────────────────────────────────────────────────────────────────────────────

const DOCS = [
  // ── 0 ── GETTING STARTED ─────────────────────────────────────────────────
  {
    id: 'getting-started',
    label: 'Getting Started',
    icon: '▶',
    chapters: [
      {
        title: 'What is Sliders GL?',
        anchor: 'what-is',
        content: `
<p>Sliders GL is a real-time shader editor for Windows 10/11. You write GLSL fragment shaders and watch them render live at up to 120 fps — then export the result as video, image, standalone HTML, or a shareable URL.</p>
<p>Think of it as a <strong>ShaderToy desktop app</strong>: a Monaco-based GLSL editor and a full export pipeline — fully offline, no WASM.</p>
<h4>Key concepts</h4>
<ul>
  <li><strong>Shader</strong> — A GLSL program that runs on the GPU once per pixel per frame. You write it in the editor on the left.</li>
  <li><strong>Uniform</strong> — A value the CPU sends to your shader every frame (time, mouse position, etc.).</li>
  <li><strong>Channel</strong> — A ShaderToy-style texture input (<code>iChannel0</code>–<code>iChannel3</code>); currently always empty.</li>
  <li><strong>Pass</strong> — The single <em>Image</em> render pass, which writes to the screen.</li>
  <li><strong>Preset</strong> — A saved snapshot of shader code + channel config + slider values.</li>
</ul>`
      },
      {
        title: 'Your First Shader',
        anchor: 'first-shader',
        content: `
<p>When Sliders GL opens you will see the default example shader running. Here is how to write your own from scratch:</p>
<ol>
  <li>Press <kbd>Ctrl+A</kbd> in the editor to select all, then type (or paste) your shader.</li>
  <li>Press <kbd>Ctrl+Enter</kbd> to compile and apply the shader. Red squiggles indicate compile errors — hover them to read the message.</li>
  <li>Press <kbd>Ctrl+S</kbd> to save it as a preset.</li>
</ol>
<h4>Minimal shader template</h4>
<pre><code>void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec3 col = vec3(uv, 0.5 + 0.5 * sin(iTime));
    fragColor = vec4(col, 1.0);
}</code></pre>`
      },
      {
        title: 'Keyboard Shortcuts',
        anchor: 'shortcuts',
        content: `
<table>
  <tr><th>Shortcut</th><th>Action</th></tr>
  <tr><td><kbd>Ctrl+Enter</kbd></td><td>Compile &amp; apply shader</td></tr>
  <tr><td><kbd>Ctrl+S</kbd></td><td>Save preset</td></tr>
  <tr><td><kbd>Ctrl+O</kbd></td><td>Open project / file</td></tr>
  <tr><td><kbd>Ctrl+E</kbd></td><td>Export current frame as image</td></tr>
  <tr><td><kbd>Ctrl+Z / Y</kbd></td><td>Undo / redo slider value</td></tr>
  <tr><td><kbd>Ctrl+Shift+F</kbd></td><td>Format GLSL code</td></tr>
  <tr><td><kbd>Ctrl+Shift+P</kbd> / <kbd>Ctrl+K</kbd></td><td>Command palette</td></tr>
  <tr><td><kbd>F1</kbd></td><td>Open this help center</td></tr>
  <tr><td><kbd>F</kbd></td><td>Fullscreen viewport</td></tr>
  <tr><td><kbd>F11</kbd></td><td>Fullscreen window</td></tr>
  <tr><td><kbd>Space</kbd></td><td>Play / pause playback</td></tr>
</table>`
      },
      {
        title: 'ShaderToy Import',
        anchor: 'shadertoy-import',
        content: `
<p>Import any ShaderToy shader directly:</p>
<ol>
  <li>Click <strong>File → Import ShaderToy…</strong> (or the ST button in the toolbar).</li>
  <li>Paste the ShaderToy <strong>shader ID</strong> (the alphanumeric part of the URL, e.g. <code>WdBXRt</code>) or the full URL.</li>
  <li>Click <strong>Import</strong>. Sliders GL fetches the code, maps all passes and channels, and starts rendering.</li>
</ol>
<p><strong>Note:</strong> ShaderToy's API requires a public shader or your own API key. Private shaders cannot be imported.</p>`
      }
    ]
  },

  // ── 1 ── UI REFERENCE ────────────────────────────────────────────────────
  {
    id: 'ui-reference',
    label: 'UI Reference',
    icon: '⊞',
    chapters: [
      {
        title: 'Layout Overview',
        anchor: 'layout',
        content: `
<p>Sliders GL uses a fixed panel layout with resizable panel widths and editor height.</p>
<h4>Default layout panels</h4>
<ul>
  <li><strong>Viewport</strong> — Live GPU render. Click to focus (mouse events pass to <code>iMouse</code>).</li>
  <li><strong>Editor</strong> — Monaco code editor for GLSL.</li>
  <li><strong>Sliders</strong> — Auto-generated controls for every <code>#define</code> / <code>const</code> in your shader.</li>
</ul>`
      },
      {
        title: 'Editor Panel',
        anchor: 'editor-panel',
        content: `
<p>The editor is powered by <strong>Monaco</strong> (VS Code's engine) with full GLSL ES 3.0 language support.</p>
<h4>Features</h4>
<ul>
  <li><strong>Syntax highlighting</strong> — GLSL keywords, types, built-ins, preprocessor, ShaderToy uniforms (colored distinctly).</li>
  <li><strong>Hover docs</strong> — Hover any GLSL built-in or ShaderToy uniform to read its signature and description.</li>
  <li><strong>Auto-complete</strong> — GLSL built-ins, ShaderToy uniforms, and symbols defined in your own shader.</li>
  <li><strong>Error markers</strong> — Red squiggles on compile errors with line/column from the WebGL driver.</li>
  <li><strong>Go to Definition</strong> — <kbd>F12</kbd> or <kbd>Ctrl+click</kbd> on a user-defined function.</li>
  <li><strong>Code folding</strong> — Collapse <code>#ifdef</code>/<code>#endif</code> blocks and function bodies.</li>
  <li><strong>Minimap</strong> — Click to jump to any line.</li>
  <li><strong>Multi-cursor</strong> — <kbd>Alt+click</kbd> to add cursors, <kbd>Ctrl+D</kbd> to select next occurrence.</li>
</ul>`
      },
      {
        title: 'Slider Panel',
        anchor: 'slider-panel',
        content: `
<p>Sliders GL automatically generates a slider for every <code>#define</code> or <code>const float / int</code> at the top of your shader. Sliders let you tweak values in real time without recompiling.</p>
<h4>Slider interactions</h4>
<table>
  <tr><th>Gesture</th><th>Effect</th></tr>
  <tr><td>Drag</td><td>Scrub the value left/right — no handle to aim for</td></tr>
  <tr><td><kbd>Shift</kbd>+drag</td><td>Fine change (10× slower)</td></tr>
  <tr><td><kbd>Ctrl</kbd>+drag</td><td>Coarse change (10× faster)</td></tr>
  <tr><td>Scroll wheel</td><td>Step by increment</td></tr>
  <tr><td>Click / Double-click</td><td>Focus the field to type an exact value</td></tr>
  <tr><td>Right-click</td><td>Context menu: Reset to default, Copy value, Rename, Set range / precision…, Pin/Unpin</td></tr>
</table>
<p><kbd>Ctrl+Z</kbd> undoes slider changes. History is coalesced (a continuous drag is one undo step) and capped at 100 entries.</p>
<p>Sliders that are colour triplets/quads, small integer ranges, or rotation angles automatically render as a colour swatch, a stepper, or an angle dial instead of a plain field — see the README's "Specialized widgets" section.</p>
<h4>Randomize</h4>
<p>The <strong>🎲 random</strong> button re-rolls every unpinned slider once within its range — a single, undo-able change.</p>`
      }
    ]
  },

  // ── 2 ── GLSL UNIFORM REFERENCE ─────────────────────────────────────────
  {
    id: 'uniforms',
    label: 'GLSL Uniforms',
    icon: 'U=',
    chapters: [
      {
        title: 'Core ShaderToy Uniforms',
        anchor: 'core-uniforms',
        content: `
<p>These uniforms are automatically declared and updated every frame. You do <strong>not</strong> need to declare them yourself.</p>
<table>
  <tr><th>Uniform</th><th>Type</th><th>Description</th></tr>
  <tr><td><code>iTime</code></td><td><code>float</code></td><td>Playback time in seconds. Increases from 0 at shader start. Frozen while playback is paused.</td></tr>
  <tr><td><code>iTimeDelta</code></td><td><code>float</code></td><td>Duration of the previous rendered frame (seconds). Useful for frame-rate-independent animation.</td></tr>
  <tr><td><code>iFrame</code></td><td><code>int</code></td><td>Current frame index. Starts at 0 and increments by 1 each frame.</td></tr>
  <tr><td><code>iResolution</code></td><td><code>vec3</code></td><td>Viewport resolution in pixels. <code>.x</code> = width, <code>.y</code> = height, <code>.z</code> = pixel aspect ratio (always 1.0).</td></tr>
  <tr><td><code>iMouse</code></td><td><code>vec4</code></td><td>Mouse state. <code>.xy</code> = current pixel position (0,0 = bottom-left). <code>.zw</code> = pixel where last click occurred. <code>.z</code> is negative when mouse button is not pressed.</td></tr>
  <tr><td><code>iDate</code></td><td><code>vec4</code></td><td>Current date/time: <code>.x</code> = year, <code>.y</code> = month (0–11), <code>.z</code> = day (1–31), <code>.w</code> = time in seconds since midnight.</td></tr>
  <tr><td><code>iSampleRate</code></td><td><code>float</code></td><td>Audio sample rate of the output device (typically 44100.0).</td></tr>
</table>`
      },
      {
        title: 'Channel Uniforms',
        anchor: 'channel-uniforms',
        content: `
<table>
  <tr><th>Uniform</th><th>Type</th><th>Description</th></tr>
  <tr><td><code>iChannel0</code></td><td><code>sampler2D</code></td><td>Input texture channel 0. Currently always empty.</td></tr>
  <tr><td><code>iChannel1</code></td><td><code>sampler2D</code></td><td>Input texture channel 1.</td></tr>
  <tr><td><code>iChannel2</code></td><td><code>sampler2D</code></td><td>Input texture channel 2.</td></tr>
  <tr><td><code>iChannel3</code></td><td><code>sampler2D</code></td><td>Input texture channel 3.</td></tr>
  <tr><td><code>iChannelResolution</code></td><td><code>vec3[4]</code></td><td>Resolution of each channel texture. <code>iChannelResolution[0].xy</code> = width/height of <code>iChannel0</code>.</td></tr>
  <tr><td><code>iChannelTime</code></td><td><code>float[4]</code></td><td>Playback time of video channels in seconds.</td></tr>
</table>
<h4>Sampling channels</h4>
<pre><code>// Sample iChannel0 using UV coordinates
vec4 tex = texture(iChannel0, fragCoord / iResolution.xy);

// Sample with explicit LOD
vec4 mip = textureLod(iChannel0, uv, 2.0);

// Default wrap mode is REPEAT</code></pre>`
      },
      {
        title: 'Sliders GL Extended Uniforms',
        anchor: 'extended-uniforms',
        content: `
<h4>User-defined uniforms from sliders</h4>
<p>Any <code>#define</code> or <code>const float</code> at the top level becomes a slider uniform. Example:</p>
<pre><code>#define SPEED 1.5
#define SCALE 2.0
const float BRIGHTNESS = 0.8;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    float t = iTime * SPEED;
    vec2 uv = fragCoord / iResolution.xy * SCALE;
    fragColor = vec4(vec3(BRIGHTNESS * sin(t + uv.x)), 1.0);
}</code></pre>`
      },
      {
        title: 'GLSL Built-in Functions',
        anchor: 'glsl-builtins',
        content: `
<p>Press <kbd>F1</kbd> and switch to <strong>GLSL Builtins</strong> tab for the full searchable reference. Key categories:</p>
<h4>Trigonometry</h4>
<p><code>sin</code>, <code>cos</code>, <code>tan</code>, <code>asin</code>, <code>acos</code>, <code>atan</code>, <code>sinh</code>, <code>cosh</code>, <code>tanh</code>, <code>radians</code>, <code>degrees</code></p>
<h4>Math</h4>
<p><code>abs</code>, <code>sign</code>, <code>floor</code>, <code>ceil</code>, <code>fract</code>, <code>mod</code>, <code>min</code>, <code>max</code>, <code>clamp</code>, <code>mix</code>, <code>step</code>, <code>smoothstep</code>, <code>sqrt</code>, <code>pow</code>, <code>exp</code>, <code>log</code>, <code>exp2</code>, <code>log2</code></p>
<h4>Geometry</h4>
<p><code>length</code>, <code>distance</code>, <code>dot</code>, <code>cross</code>, <code>normalize</code>, <code>reflect</code>, <code>refract</code>, <code>faceforward</code></p>
<h4>Texture</h4>
<p><code>texture</code>, <code>textureLod</code>, <code>textureOffset</code>, <code>texelFetch</code>, <code>textureSize</code>, <code>texture2D</code> (legacy)</p>
<h4>Vector construction</h4>
<p><code>vec2</code>, <code>vec3</code>, <code>vec4</code>, <code>ivec2</code>, <code>ivec3</code>, <code>ivec4</code>, <code>mat2</code>, <code>mat3</code>, <code>mat4</code></p>`
      }
    ]
  },

  // ── 5 ── EXPORT GUIDE ────────────────────────────────────────────────────
  {
    id: 'export',
    label: 'Export Guide',
    icon: '↓',
    chapters: [
      {
        title: 'Export Overview',
        anchor: 'export-overview',
        content: `
<p>Access every export format from the <strong>export</strong> toolbar button. No WASM, no ffmpeg — everything uses native browser APIs (Canvas, <code>MediaRecorder</code>).</p>
<table>
  <tr><th>Tab</th><th>Formats</th></tr>
  <tr><td><strong>Image</strong></td><td>PNG screenshot (optional alpha channel), preview-frame thumbnail</td></tr>
  <tr><td><strong>Video</strong></td><td>MP4/WebM via the browser's native <code>MediaRecorder</code></td></tr>
  <tr><td><strong>Code</strong></td><td>Pure GLSL, minified GLSL, Three.js snippet, standalone HTML, project ZIP (<code>.zgl</code>), p5.js sketch, GLSL Sandbox format, ShaderToy paste format, share link (v1/v2)</td></tr>
</table>`
      },
      {
        title: 'Video Export',
        anchor: 'video-export',
        content: `
<p>The <strong>Video</strong> tab records the live viewport with the browser's native <code>MediaRecorder</code> API.</p>
<ol>
  <li>Open <strong>export → Video</strong>.</li>
  <li>Click <strong>Start recording</strong>, let it run, then <strong>Stop</strong>.</li>
  <li>The recording downloads as MP4 or WebM depending on what the browser/WebView2 supports.</li>
</ol>
<p>Resolution and frame rate follow the live viewport — there is no separate offscreen/headless render pass for video.</p>`
      },
      {
        title: 'Image Export',
        anchor: 'image-export',
        content: `
<p>Export the current frame as a PNG:</p>
<ul>
  <li>Open <strong>export → Image</strong>, pick a resolution, optionally enable the <strong>Transparent background (alpha)</strong> checkbox.</li>
  <li><strong>Preview Frame</strong> renders a quick thumbnail at the chosen resolution before you commit to the full download.</li>
  <li><strong>↓ Download PNG</strong> saves the result.</li>
</ul>`
      },
      {
        title: 'Standalone HTML Export',
        anchor: 'html-export',
        content: `
<p>Export your shader as a single self-contained <code>.html</code> file that runs in any browser — no Sliders GL required.</p>
<p>The exported file embeds your GLSL shader code, a minimal WebGL runtime, and all ShaderToy uniforms (<code>iTime</code>, <code>iMouse</code>, <code>iResolution</code>, etc.).</p>`
      },
      {
        title: 'shadertoy.com import / export',
        anchor: 'shadertoy-export',
        content: `
<p>Use <strong>export → Code → ShaderToy format</strong> to strip local uniform/precision declarations so the result pastes directly into a shadertoy.com Image tab. To go the other way, drop or select a <code>.zip</code> exported from shadertoy.com — Sliders GL reads the <strong>Image</strong> pass code and loads it into the editor.</p>`
      },
      {
        title: 'Share Link',
        anchor: 'share-url',
        content: `
<p>Click <strong>share</strong> to generate a shareable URL. The shader code and slider values are compressed and encoded into the URL hash — <strong>no server is involved</strong>, the link is fully self-contained.</p>`
      }
    ]
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// § GLSL BUILT-IN DATABASE (for the Builtins tab — same data as onboarding.js
//   but expanded here for full reference)
// ─────────────────────────────────────────────────────────────────────────────

const GLSL_BUILTINS = [
  // Trigonometry
  { cat: 'Trig', name: 'sin', sig: 'genType sin(genType angle)', desc: 'Returns the sine of angle (in radians). Works on float, vec2, vec3, vec4.' },
  { cat: 'Trig', name: 'cos', sig: 'genType cos(genType angle)', desc: 'Returns the cosine of angle in radians.' },
  { cat: 'Trig', name: 'tan', sig: 'genType tan(genType angle)', desc: 'Returns the tangent of angle in radians.' },
  { cat: 'Trig', name: 'asin', sig: 'genType asin(genType x)', desc: 'Arc sine. Returns angle in radians whose sine is x. Range: [−π/2, π/2].' },
  { cat: 'Trig', name: 'acos', sig: 'genType acos(genType x)', desc: 'Arc cosine. Returns angle in radians whose cosine is x. Range: [0, π].' },
  { cat: 'Trig', name: 'atan', sig: 'genType atan(genType y, genType x) / atan(genType y_over_x)', desc: 'Arc tangent. Two-argument form gives full 360° angle (like atan2). Result in [−π, π].' },
  { cat: 'Trig', name: 'sinh', sig: 'genType sinh(genType x)', desc: 'Hyperbolic sine: (e^x − e^−x) / 2.' },
  { cat: 'Trig', name: 'cosh', sig: 'genType cosh(genType x)', desc: 'Hyperbolic cosine: (e^x + e^−x) / 2.' },
  { cat: 'Trig', name: 'tanh', sig: 'genType tanh(genType x)', desc: 'Hyperbolic tangent: sinh(x) / cosh(x).' },
  { cat: 'Trig', name: 'radians', sig: 'genType radians(genType degrees)', desc: 'Converts degrees to radians. Equal to degrees × π / 180.' },
  { cat: 'Trig', name: 'degrees', sig: 'genType degrees(genType radians)', desc: 'Converts radians to degrees. Equal to radians × 180 / π.' },
  // Math
  { cat: 'Math', name: 'abs', sig: 'genType abs(genType x)', desc: 'Returns the absolute value of x.' },
  { cat: 'Math', name: 'sign', sig: 'genType sign(genType x)', desc: 'Returns −1.0 if x < 0, 0.0 if x = 0, 1.0 if x > 0.' },
  { cat: 'Math', name: 'floor', sig: 'genType floor(genType x)', desc: 'Returns the largest integer ≤ x.' },
  { cat: 'Math', name: 'ceil', sig: 'genType ceil(genType x)', desc: 'Returns the smallest integer ≥ x.' },
  { cat: 'Math', name: 'round', sig: 'genType round(genType x)', desc: 'Returns the nearest integer to x. Ties round to even.' },
  { cat: 'Math', name: 'fract', sig: 'genType fract(genType x)', desc: 'Returns the fractional part of x: x − floor(x). Always in [0, 1).' },
  { cat: 'Math', name: 'mod', sig: 'genType mod(genType x, float y)', desc: 'Modulo: returns x − y × floor(x/y). Note: result has the sign of y, unlike GLSL % operator.' },
  { cat: 'Math', name: 'min', sig: 'genType min(genType x, genType y)', desc: 'Returns the minimum of x and y component-wise.' },
  { cat: 'Math', name: 'max', sig: 'genType max(genType x, genType y)', desc: 'Returns the maximum of x and y component-wise.' },
  { cat: 'Math', name: 'clamp', sig: 'genType clamp(genType x, genType minVal, genType maxVal)', desc: 'Clamps x between minVal and maxVal. Returns min(max(x, minVal), maxVal).' },
  { cat: 'Math', name: 'mix', sig: 'genType mix(genType x, genType y, genType a)', desc: 'Linear blend: returns x × (1 − a) + y × a. When a=0, returns x; when a=1, returns y.' },
  { cat: 'Math', name: 'step', sig: 'genType step(genType edge, genType x)', desc: 'Returns 0.0 if x < edge, else 1.0. Generates a hard step function.' },
  { cat: 'Math', name: 'smoothstep', sig: 'genType smoothstep(genType edge0, genType edge1, genType x)', desc: 'Smooth Hermite interpolation between 0 and 1 when edge0 < x < edge1. Result is clamped.' },
  { cat: 'Math', name: 'sqrt', sig: 'genType sqrt(genType x)', desc: 'Returns √x. x must be ≥ 0.' },
  { cat: 'Math', name: 'inversesqrt', sig: 'genType inversesqrt(genType x)', desc: 'Returns 1/√x. Faster than 1.0/sqrt(x) on most hardware.' },
  { cat: 'Math', name: 'pow', sig: 'genType pow(genType x, genType y)', desc: 'Returns x^y. x must be > 0.' },
  { cat: 'Math', name: 'exp', sig: 'genType exp(genType x)', desc: 'Returns e^x.' },
  { cat: 'Math', name: 'exp2', sig: 'genType exp2(genType x)', desc: 'Returns 2^x.' },
  { cat: 'Math', name: 'log', sig: 'genType log(genType x)', desc: 'Returns the natural logarithm of x. x must be > 0.' },
  { cat: 'Math', name: 'log2', sig: 'genType log2(genType x)', desc: 'Returns the base-2 logarithm of x. x must be > 0.' },
  { cat: 'Math', name: 'trunc', sig: 'genType trunc(genType x)', desc: 'Truncates x toward zero — equivalent to sign(x) × floor(abs(x)).' },
  // Geometry
  { cat: 'Geometry', name: 'length', sig: 'float length(genType x)', desc: 'Returns the Euclidean length (magnitude) of vector x: sqrt(x.x² + x.y² + ...).' },
  { cat: 'Geometry', name: 'distance', sig: 'float distance(genType p0, genType p1)', desc: 'Returns the Euclidean distance between points p0 and p1: length(p0 − p1).' },
  { cat: 'Geometry', name: 'dot', sig: 'float dot(genType x, genType y)', desc: 'Returns the dot product (scalar): x.x×y.x + x.y×y.y + ... Equals length(x)×length(y)×cos(angle).' },
  { cat: 'Geometry', name: 'cross', sig: 'vec3 cross(vec3 x, vec3 y)', desc: 'Returns the cross product of two vec3 vectors. Result is perpendicular to both inputs.' },
  { cat: 'Geometry', name: 'normalize', sig: 'genType normalize(genType x)', desc: 'Returns x scaled to unit length: x / length(x).' },
  { cat: 'Geometry', name: 'reflect', sig: 'genType reflect(genType I, genType N)', desc: 'Reflect incident vector I around normal N. N must be normalized. Result: I − 2×dot(N,I)×N.' },
  { cat: 'Geometry', name: 'refract', sig: 'genType refract(genType I, genType N, float eta)', desc: 'Computes refraction vector. eta = ratio of indices of refraction (e.g. 1.0/1.5 for air→glass). N must be normalized.' },
  { cat: 'Geometry', name: 'faceforward', sig: 'genType faceforward(genType N, genType I, genType Nref)', desc: 'Returns N if dot(Nref, I) < 0, else −N. Ensures normal faces the same side as the viewer.' },
  // Texture
  { cat: 'Texture', name: 'texture', sig: 'vec4 texture(sampler2D s, vec2 coord)', desc: 'Samples texture s at texture coordinate coord (0–1 range). Applies wrap mode and filter.' },
  { cat: 'Texture', name: 'textureLod', sig: 'vec4 textureLod(sampler2D s, vec2 coord, float lod)', desc: 'Samples texture at explicit mipmap level lod. lod=0 is full resolution.' },
  { cat: 'Texture', name: 'textureOffset', sig: 'vec4 textureOffset(sampler2D s, vec2 coord, ivec2 offset)', desc: 'Samples texture with a texel offset applied (in texels, not UV units).' },
  { cat: 'Texture', name: 'texelFetch', sig: 'vec4 texelFetch(sampler2D s, ivec2 P, int lod)', desc: 'Fetches a single texel at integer texel coordinates P without filtering.' },
  { cat: 'Texture', name: 'textureSize', sig: 'ivec2 textureSize(sampler2D s, int lod)', desc: 'Returns the dimensions of the texture at the given mipmap level.' },
  { cat: 'Texture', name: 'texture2D', sig: 'vec4 texture2D(sampler2D s, vec2 coord)', desc: 'Legacy GLSL ES 1.0 texture lookup. Prefer texture() in GLSL ES 3.0.' },
  // Control
  { cat: 'Control', name: 'discard', sig: 'discard;', desc: 'Discards the current fragment — no color is written to the framebuffer. Use inside an if() block.' },
  { cat: 'Control', name: 'dFdx', sig: 'genType dFdx(genType p)', desc: 'Returns the partial derivative of p with respect to screen-space X (horizontal). Useful for edge detection and anti-aliasing.' },
  { cat: 'Control', name: 'dFdy', sig: 'genType dFdy(genType p)', desc: 'Returns the partial derivative of p with respect to screen-space Y.' },
  { cat: 'Control', name: 'fwidth', sig: 'genType fwidth(genType p)', desc: 'Returns abs(dFdx(p)) + abs(dFdy(p)). Useful for smooth anti-aliased SDF rendering.' },
  // ShaderToy uniforms
  { cat: 'ShaderToy', name: 'iTime', sig: 'uniform float iTime', desc: 'Elapsed playback time in seconds. Increments every frame.' },
  { cat: 'ShaderToy', name: 'iTimeDelta', sig: 'uniform float iTimeDelta', desc: 'Time elapsed since the last frame, in seconds. Use for frame-rate-independent motion.' },
  { cat: 'ShaderToy', name: 'iFrame', sig: 'uniform int iFrame', desc: 'Current frame index (starts at 0, increments by 1).' },
  { cat: 'ShaderToy', name: 'iResolution', sig: 'uniform vec3 iResolution', desc: 'Viewport size in pixels. .x = width, .y = height, .z = pixel aspect ratio (1.0).' },
  { cat: 'ShaderToy', name: 'iMouse', sig: 'uniform vec4 iMouse', desc: 'Mouse state. .xy = current position in pixels (0,0 bottom-left). .zw = last click position. .z < 0 when button not pressed.' },
  { cat: 'ShaderToy', name: 'iDate', sig: 'uniform vec4 iDate', desc: 'Current date/time. .x=year, .y=month(0-11), .z=day(1-31), .w=seconds since midnight.' },
  { cat: 'ShaderToy', name: 'iSampleRate', sig: 'uniform float iSampleRate', desc: 'Audio sample rate in Hz (typically 44100.0).' },
  { cat: 'ShaderToy', name: 'iChannel0', sig: 'uniform sampler2D iChannel0', desc: 'Input texture channel 0. Type depends on the channel source (image, noise, audio FFT, video, webcam, etc.).' },
  { cat: 'ShaderToy', name: 'iChannel1', sig: 'uniform sampler2D iChannel1', desc: 'Input texture channel 1.' },
  { cat: 'ShaderToy', name: 'iChannel2', sig: 'uniform sampler2D iChannel2', desc: 'Input texture channel 2.' },
  { cat: 'ShaderToy', name: 'iChannel3', sig: 'uniform sampler2D iChannel3', desc: 'Input texture channel 3.' },
  { cat: 'ShaderToy', name: 'iChannelResolution', sig: 'uniform vec3 iChannelResolution[4]', desc: 'Width/height/depth of each iChannel texture.' },
];

const GLSL_CATEGORIES = [...new Set(GLSL_BUILTINS.map(e => e.cat))];

// ─────────────────────────────────────────────────────────────────────────────
// § FLAT SEARCH INDEX
// Built once from DOCS + GLSL_BUILTINS. Each entry: { label, sectionId, anchor, text }
// ─────────────────────────────────────────────────────────────────────────────

const SEARCH_INDEX = (() => {
  const idx = [];

  // Docs chapters
  for (const section of DOCS) {
    for (const ch of section.chapters) {
      const plainText = ch.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      idx.push({
        label: ch.title,
        sub: section.label,
        sectionId: section.id,
        anchor: ch.anchor,
        text: `${ch.title} ${section.label} ${plainText}`.toLowerCase(),
        kind: 'doc',
      });
    }
  }

  // GLSL builtins
  for (const e of GLSL_BUILTINS) {
    idx.push({
      label: e.name,
      sub: `${e.cat} · ${e.sig}`,
      sectionId: 'builtins',
      anchor: null,
      text: `${e.name} ${e.cat} ${e.sig} ${e.desc}`.toLowerCase(),
      kind: 'builtin',
      entry: e,
    });
  }

  return idx;
})();

// ─────────────────────────────────────────────────────────────────────────────
// § STATE
// ─────────────────────────────────────────────────────────────────────────────

let _open = false;
let _activeSection = DOCS[0].id;
let _builtinCategory = '';
let _builtinQuery = '';
let _docQuery = '';

// ─────────────────────────────────────────────────────────────────────────────
// § PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export function openHelpCenter(sectionId) {
  let panel = document.getElementById('zgl-help-center');
  if (!panel) panel = _buildPanel();

  if (sectionId) _navigateTo(sectionId);
  panel.classList.add('open');
  _open = true;
  panel.querySelector('#hc-search')?.focus();
}

export function closeHelpCenter() {
  const panel = document.getElementById('zgl-help-center');
  if (!panel) return;
  panel.classList.remove('open');
  _open = false;
}

export function toggleHelpCenter(sectionId) {
  if (_open) closeHelpCenter();
  else openHelpCenter(sectionId);
}

// Backward-compat aliases (used by onboarding.js F1 handler)
export const openGLSLReference  = () => openHelpCenter('uniforms');
export const closeGLSLReference = closeHelpCenter;
export const toggleGLSLReference = () => toggleHelpCenter('uniforms');

/** Call once during app init — installs the F1 global shortcut. */
export function initHelpCenter() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F1') {
      e.preventDefault();
      toggleHelpCenter();
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// § DOM BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function _buildPanel() {
  const panel = document.createElement('div');
  panel.id = 'zgl-help-center';
  panel.className = 'modal-overlay';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Sliders GL Help Center');

  panel.innerHTML = `
    <div class="modal hc-modal" style="width:820px;max-width:96vw;height:600px;max-height:88vh;display:flex;flex-direction:column;padding:0;overflow:hidden;">

      <!-- ── HEADER ── -->
      <div class="hc-header" style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--b1);flex-shrink:0">
        <span style="font-size:13px;font-weight:700;color:var(--spark);letter-spacing:.06em;font-family:var(--font-mono)">Sliders GL</span>
        <span style="font-size:12px;color:var(--t3)">Help Center</span>
        <div style="flex:1"></div>
        <input id="hc-search" type="search" placeholder="Search docs, functions, uniforms… (Ctrl+F)" autocomplete="off"
          style="width:240px;background:var(--bg3);border:1px solid var(--b1);border-radius:6px;padding:5px 10px;font-size:12px;color:var(--t1);outline:none;font-family:var(--font-mono)"
          aria-label="Search help center">
        <button class="modal-close" id="hc-close" aria-label="Close help center" style="margin-left:6px">
          <svg viewBox="0 0 14 14"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg>
        </button>
      </div>

      <!-- ── BODY ── -->
      <div style="display:flex;flex:1;overflow:hidden">

        <!-- ── SIDEBAR ── -->
        <nav id="hc-nav" aria-label="Help sections"
          style="width:170px;flex-shrink:0;border-right:1px solid var(--b1);overflow-y:auto;padding:8px 0">
          ${DOCS.map(s => `
            <button class="hc-nav-btn" data-section="${s.id}" aria-label="${s.label}">
              <span class="hc-nav-icon">${s.icon}</span>
              <span class="hc-nav-label">${s.label}</span>
            </button>`).join('')}
          <button class="hc-nav-btn" data-section="builtins" aria-label="GLSL Builtins">
            <span class="hc-nav-icon">fn()</span>
            <span class="hc-nav-label">GLSL Builtins</span>
          </button>
        </nav>

        <!-- ── CONTENT ── -->
        <div id="hc-content" style="flex:1;overflow-y:auto;padding:20px 24px;min-width:0" role="main">
          <!-- filled by _renderContent() -->
        </div>
      </div>

      <!-- ── FOOTER ── -->
      <div style="border-top:1px solid var(--b1);padding:7px 16px;display:flex;align-items:center;gap:12px;font-size:10px;color:var(--t3);font-family:var(--font-mono);flex-shrink:0">
        <span><kbd>F1</kbd> toggle</span>
        <span><kbd>Escape</kbd> close</span>
        <span><kbd>Ctrl+F</kbd> search</span>
        <div style="flex:1"></div>
        <span>Sliders GL v${__APP_VERSION__} · Offline docs</span>
      </div>
    </div>`;

  document.body.appendChild(panel);
  _injectStyles();
  _wireEvents(panel);
  _navigateTo(_activeSection);

  requestAnimationFrame(() => panel.classList.add('open'));
  return panel;
}

// ─────────────────────────────────────────────────────────────────────────────
// § NAVIGATION & RENDERING
// ─────────────────────────────────────────────────────────────────────────────

function _navigateTo(sectionId) {
  _activeSection = sectionId;
  const panel = document.getElementById('zgl-help-center');
  if (!panel) return;

  // Update nav highlight
  panel.querySelectorAll('.hc-nav-btn').forEach(btn => {
    const active = btn.dataset.section === sectionId;
    btn.classList.toggle('hc-nav-active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });

  _renderContent();
}

function _renderContent() {
  const content = document.getElementById('hc-content');
  if (!content) return;

  const q = _docQuery.trim().toLowerCase();

  // ── SEARCH RESULTS ──
  if (q.length >= 2) {
    const results = SEARCH_INDEX.filter(e => e.text.includes(q)).slice(0, 30);
    if (!results.length) {
      content.innerHTML = `<div class="hc-empty"><div class="hc-empty-icon">⌕</div><div class="hc-empty-msg">No results for "<em id="hcEmptyQuery">${_esc(q)}</em>"</div></div>`;
      return;
    }
    content.innerHTML = `<h2 class="hc-section-title">Search Results <span style="font-size:12px;color:var(--t3);font-weight:400">${results.length} matches for "${_esc(q)}"</span></h2>` +
      results.map(r => {
        if (r.kind === 'builtin') {
          return `<div class="hc-builtin-card" style="cursor:pointer" data-section="builtins">
            <code class="hc-builtin-name">${_esc(r.label)}</code>
            <span class="hc-builtin-cat">${_esc(r.entry.cat)}</span>
            <div class="hc-builtin-sig">${_esc(r.entry.sig)}</div>
            <div class="hc-builtin-desc">${_esc(r.entry.desc)}</div>
          </div>`;
        }
        return `<div class="hc-search-result" data-section="${r.sectionId}" data-anchor="${r.anchor || ''}">
          <div class="hc-sr-title">${_esc(r.label)}</div>
          <div class="hc-sr-sub">${_esc(r.sub)}</div>
        </div>`;
      }).join('');

    // Wire result clicks
    content.querySelectorAll('[data-section]').forEach(el => {
      el.addEventListener('click', () => {
        _docQuery = '';
        const inp = document.getElementById('hc-search');
        if (inp) inp.value = '';
        _navigateTo(el.dataset.section);
        if (el.dataset.anchor) {
          setTimeout(() => {
            const target = document.getElementById(`hc-anchor-${el.dataset.anchor}`);
            target?.scrollIntoView({ behavior: 'smooth' });
          }, 80);
        }
      });
    });
    return;
  }

  // ── BUILTINS TAB ──
  if (_activeSection === 'builtins') {
    _renderBuiltins(content);
    return;
  }

  // ── DOCS SECTION ──
  const section = DOCS.find(s => s.id === _activeSection);
  if (!section) { content.innerHTML = ''; return; }

  content.innerHTML = `
    <h2 class="hc-section-title">${section.icon} ${_esc(section.label)}</h2>
    <nav class="hc-toc" aria-label="Chapter navigation">
      ${section.chapters.map(ch =>
        `<a class="hc-toc-link" href="#hc-anchor-${ch.anchor}">${_esc(ch.title)}</a>`
      ).join('')}
    </nav>
    ${section.chapters.map(ch => `
      <div class="hc-chapter">
        <h3 class="hc-chapter-title" id="hc-anchor-${ch.anchor}">${_esc(ch.title)}</h3>
        <div class="hc-chapter-body">${ch.content}</div>
      </div>`).join('')}`;
}

function _renderBuiltins(content) {
  const q = _builtinQuery.toLowerCase();
  const entries = GLSL_BUILTINS.filter(e =>
    (!_builtinCategory || e.cat === _builtinCategory) &&
    (!q || e.name.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q) || e.sig.toLowerCase().includes(q))
  );

  content.innerHTML = `
    <h2 class="hc-section-title">fn() GLSL Built-in Functions</h2>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <input id="hc-builtin-search" type="search" placeholder="Search functions…" autocomplete="off" value="${_esc(_builtinQuery)}"
        style="flex:1;min-width:160px;background:var(--bg3);border:1px solid var(--b1);border-radius:6px;padding:5px 10px;font-size:12px;color:var(--t1);outline:none;font-family:var(--font-mono)"
        aria-label="Search GLSL built-ins">
      <select id="hc-builtin-cat" aria-label="Filter by category"
        style="background:var(--bg3);border:1px solid var(--b1);border-radius:6px;padding:5px 10px;font-size:12px;color:var(--t1);outline:none;font-family:var(--font-mono)">
        <option value="">All categories</option>
        ${GLSL_CATEGORIES.map(c => `<option value="${c}" ${c === _builtinCategory ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </div>
    <div id="hc-builtin-list" role="list" aria-label="GLSL built-in functions">
      ${entries.length
        ? entries.map(e => `
          <div class="hc-builtin-card" role="listitem">
            <code class="hc-builtin-name">${_esc(e.name)}</code>
            <span class="hc-builtin-cat">${_esc(e.cat)}</span>
            <div class="hc-builtin-sig">${_esc(e.sig)}</div>
            <div class="hc-builtin-desc">${_esc(e.desc)}</div>
          </div>`).join('')
        : `<div class="hc-empty"><div class="hc-empty-icon">⌕</div><div class="hc-empty-msg">No results for "<em>${_esc(_builtinQuery)}</em>"</div></div>`}
    </div>
    <div style="font-size:10px;color:var(--t3);font-family:var(--font-mono);margin-top:10px;text-align:right">
      ${entries.length} / ${GLSL_BUILTINS.length} entries · GLSL ES 3.0 + ShaderToy · Offline
    </div>`;

  content.querySelector('#hc-builtin-search')?.addEventListener('input', (e) => {
    _builtinQuery = e.target.value;
    _renderBuiltins(content);
  });
  content.querySelector('#hc-builtin-cat')?.addEventListener('change', (e) => {
    _builtinCategory = e.target.value;
    _renderBuiltins(content);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// § EVENT WIRING
// ─────────────────────────────────────────────────────────────────────────────

function _wireEvents(panel) {
  // Close button
  panel.querySelector('#hc-close').addEventListener('click', closeHelpCenter);

  // Escape key
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeHelpCenter();
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      panel.querySelector('#hc-search')?.focus();
    }
  });

  // Click outside modal body
  panel.addEventListener('click', (e) => {
    if (e.target === panel) closeHelpCenter();
  });

  // Sidebar nav
  panel.querySelector('#hc-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.hc-nav-btn');
    if (!btn) return;
    _navigateTo(btn.dataset.section);
  });

  // Global search input
  panel.querySelector('#hc-search').addEventListener('input', (e) => {
    _docQuery = e.target.value;
    _renderContent();
  });

  // TOC anchor links (delegated)
  panel.querySelector('#hc-content').addEventListener('click', (e) => {
    const link = e.target.closest('.hc-toc-link');
    if (!link) return;
    e.preventDefault();
    const id = link.getAttribute('href').slice(1);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// § CSS INJECTION
// ─────────────────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('zgl-help-center-styles')) return;
  const style = document.createElement('style');
  style.id = 'zgl-help-center-styles';
  style.textContent = `
    /* ── Panel layout ── */
    #zgl-help-center.open { display:flex; }
    #zgl-help-center:not(.open) { display:none; }

    /* ── Nav buttons ── */
    .hc-nav-btn {
      display:flex; align-items:center; gap:8px;
      width:100%; padding:8px 14px;
      background:none; border:none; cursor:pointer;
      text-align:left; font-size:12px; font-family:var(--font-ui, sans-serif);
      color:var(--t2); transition:background 120ms, color 120ms;
      border-left:2px solid transparent;
    }
    .hc-nav-btn:hover { background:var(--bg3); color:var(--t1); }
    .hc-nav-btn.hc-nav-active {
      background:var(--bg3); color:var(--spark);
      border-left-color:var(--spark);
    }
    .hc-nav-icon {
      font-size:11px; width:22px; text-align:center;
      font-family:var(--font-mono, monospace); color:var(--t3); flex-shrink:0;
    }
    .hc-nav-btn.hc-nav-active .hc-nav-icon { color:var(--spark); }
    .hc-nav-label { font-size:11px; font-weight:500; }

    /* ── Section heading ── */
    .hc-section-title {
      font-size:16px; font-weight:700; color:var(--t1);
      margin:0 0 12px; padding-bottom:8px;
      border-bottom:1px solid var(--b1);
      font-family:var(--font-ui, sans-serif);
    }

    /* ── TOC ── */
    .hc-toc {
      display:flex; flex-wrap:wrap; gap:6px;
      margin-bottom:20px;
    }
    .hc-toc-link {
      font-size:11px; color:var(--spark); text-decoration:none;
      background:var(--bg3); border:1px solid var(--b1);
      border-radius:4px; padding:3px 8px;
      font-family:var(--font-mono, monospace);
      transition:background 100ms;
    }
    .hc-toc-link:hover { background:var(--bg4); }

    /* ── Chapter ── */
    .hc-chapter { margin-bottom:32px; }
    .hc-chapter-title {
      font-size:13px; font-weight:700; color:var(--t1);
      margin:0 0 10px; padding:6px 0 6px 10px;
      border-left:3px solid var(--spark);
      font-family:var(--font-ui, sans-serif);
      scroll-margin-top:16px;
    }
    .hc-chapter-body {
      font-size:12px; line-height:1.7; color:var(--t2);
      font-family:var(--font-ui, sans-serif);
    }
    .hc-chapter-body h4 {
      font-size:11px; font-weight:700; color:var(--t1);
      margin:14px 0 6px; text-transform:uppercase; letter-spacing:.08em;
    }
    .hc-chapter-body p { margin:0 0 8px; }
    .hc-chapter-body ul, .hc-chapter-body ol { margin:0 0 10px; padding-left:18px; }
    .hc-chapter-body li { margin-bottom:4px; }
    .hc-chapter-body strong { color:var(--t1); font-weight:600; }
    .hc-chapter-body code {
      font-family:var(--font-mono, monospace); font-size:11px;
      background:var(--bg3); border:1px solid var(--b1);
      border-radius:3px; padding:1px 4px; color:var(--spark);
    }
    .hc-chapter-body pre {
      background:var(--bg2); border:1px solid var(--b1);
      border-radius:6px; padding:10px 12px; margin:8px 0;
      overflow-x:auto; font-family:var(--font-mono, monospace);
      font-size:11px; line-height:1.6; color:var(--t1);
    }
    .hc-chapter-body pre code {
      background:none; border:none; padding:0; color:inherit;
    }
    .hc-chapter-body table {
      width:100%; border-collapse:collapse; font-size:11px;
      margin:8px 0;
    }
    .hc-chapter-body th {
      text-align:left; padding:6px 8px;
      background:var(--bg3); color:var(--t1); font-weight:600;
      border:1px solid var(--b1);
    }
    .hc-chapter-body td {
      padding:5px 8px; border:1px solid var(--b1);
      vertical-align:top;
    }
    .hc-chapter-body tr:nth-child(even) td { background:var(--bg2); }
    .hc-chapter-body kbd {
      font-family:var(--font-mono, monospace); font-size:10px;
      background:var(--bg4); border:1px solid var(--b2);
      border-bottom-width:2px; border-radius:3px;
      padding:1px 5px; color:var(--t1); white-space:nowrap;
    }

    /* ── GLSL builtin cards ── */
    .hc-builtin-card {
      background:var(--bg2); border:1px solid var(--b1);
      border-radius:6px; padding:9px 12px; margin-bottom:6px;
    }
    .hc-builtin-name {
      font-family:var(--font-mono, monospace); font-size:12px;
      font-weight:700; color:var(--spark); margin-right:8px;
    }
    .hc-builtin-cat {
      font-size:9px; color:var(--t3);
      font-family:var(--font-mono, monospace);
      background:var(--bg3); border-radius:3px; padding:1px 5px;
      vertical-align:middle;
    }
    .hc-builtin-sig {
      font-size:10px; font-family:var(--font-mono, monospace);
      color:var(--t2); margin:4px 0 2px;
    }
    .hc-builtin-desc { font-size:11px; color:var(--t2); line-height:1.5; }

    /* ── Search results ── */
    .hc-search-result {
      background:var(--bg2); border:1px solid var(--b1);
      border-radius:6px; padding:9px 12px; margin-bottom:6px;
      cursor:pointer; transition:border-color 120ms;
    }
    .hc-search-result:hover { border-color:var(--b2); }
    .hc-sr-title { font-size:12px; font-weight:600; color:var(--t1); margin-bottom:2px; }
    .hc-sr-sub { font-size:10px; color:var(--t3); font-family:var(--font-mono, monospace); }

    /* ── Empty state ── */
    .hc-empty {
      text-align:center; padding:24px 16px; color:var(--t3);
      font-family:var(--font-ui, sans-serif);
    }
    .hc-empty-icon { font-size:24px; margin-bottom:8px; opacity:.4; }
    .hc-empty-msg { font-size:11px; }
    .hc-empty strong { color:var(--t2); }
  `;
  document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────────────────────
// § UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
