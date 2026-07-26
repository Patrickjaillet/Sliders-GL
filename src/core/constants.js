// Pure GLSL constants
import { state } from './state.js';


const EXAMPLE = `void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    // Normalized pixel coordinates (from 0 to 1)
    vec2 uv = fragCoord/iResolution.xy;

    // Time varying pixel color
    vec3 col = 0.5 + 0.5*cos(iTime+uv.xyx+vec3(0,2,4));

    // Output to screen
    fragColor = vec4(col,1.0);
}`;


// ── Caméra helpers ─────────────────────────────────────────────────────────────

/**
 * Retourne tous les #define annotés @group(Caméra) dans le shader courant.
 * @returns {{ key: string, value: number, label?: string, range?: [number,number] }[]}
 */
export function getCameraGroupDefines() {
  if (!state.editor) return [];
  const code = state.editor.getValue();
  const lineRe = /#define\s+(\w+)\s+([-+]?\d*\.?\d+)([^\n]*)/gm;
  const results = [];
  let m;
  while ((m = lineRe.exec(code)) !== null) {
    const comment = m[3] || '';
    if (!/@group\((?:Cam[eé]ra?|Cam)\)/i.test(comment)) continue;
    const rangeM = /@range\(([-\d.]+)\s*,\s*([-\d.]+)\)/.exec(comment);
    const labelM = /@label\("?([^")]+)"?\)/.exec(comment);
    results.push({
      key:   m[1],
      value: parseFloat(m[2]),
      range: rangeM ? [parseFloat(rangeM[1]), parseFloat(rangeM[2])] : null,
      label: labelM ? labelM[1] : m[1],
    });
  }
  return results;
}

export { EXAMPLE };
