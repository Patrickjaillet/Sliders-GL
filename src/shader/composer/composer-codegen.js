/**
 * composer-codegen.js — F-1.1 (Axe 1)
 *
 * Assemble les blocs GLSL sélectionnés en un shader mainImage complet
 * avec annotations @range auto-générées depuis les descripteurs de blocs.
 *
 * API publique :
 *   generateShader(selectedBlockIds, customization) → string GLSL
 *   generateUniformAnnotations(blocks)              → string GLSL (uniforms annotés)
 */

import { COMPOSER_BLOCKS } from './composer-templates.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function blockById(id) {
  return COMPOSER_BLOCKS.find(b => b.id === id) || null;
}

/**
 * Génère les déclarations uniform annotées @range pour un ensemble de blocs.
 * @param {string[]} blockIds
 * @returns {string}
 */
export function generateUniformAnnotations(blockIds) {
  const lines = [];
  const seen = new Set();

  for (const id of blockIds) {
    const block = blockById(id);
    if (!block) continue;
    for (const u of block.uniforms) {
      if (seen.has(u.name)) continue;
      seen.add(u.name);
      const step = u.step ? ` @step(${u.step})` : '';
      const label = u.label ? ` @label("${u.label}")` : '';
      lines.push(`uniform ${u.type} ${u.name}; // @range(${u.min}, ${u.max})${step}${label}`);
    }
  }

  return lines.join('\n');
}

/**
 * Assemble les blocs sélectionnés en un shader complet.
 *
 * @param {string[]} blockIds   IDs des blocs à inclure (dans l'ordre)
 * @param {object}   options
 *   @param {string}  options.name         Nom du shader (commentaire en tête)
 *   @param {object}  options.colors       { primary, secondary } — couleurs HSL de personalisation
 *   @param {number}  options.speed        Multiplicateur de vitesse globale
 *   @param {number}  options.intensity    Multiplicateur d'intensité globale
 * @returns {string} Code GLSL complet
 */
export function generateShader(blockIds, options = {}) {
  const {
    name = 'My Shader',
    colors = {},
    speed = 1.0,
    intensity = 1.0,
  } = options;

  if (!blockIds || blockIds.length === 0) {
    return _fallbackShader(name, speed, intensity);
  }

  const blocks = blockIds.map(blockById).filter(Boolean);
  if (blocks.length === 0) return _fallbackShader(name, speed, intensity);

  // ── Résolution des dépendances ────────────────────────────────────────────
  const allProvided = new Set();
  const orderedHelpers = [];

  for (const block of blocks) {
    if (block.helpers) {
      let helpers = block.helpers;
      // Vérifier les doublons de provides
      const alreadyDefined = block.provides.filter(fn => allProvided.has(fn));
      if (alreadyDefined.length === 0 || !block.provides.length) {
        orderedHelpers.push(helpers.trim());
      }
      block.provides.forEach(fn => allProvided.add(fn));
    }
  }

  // ── Déclarations uniform ──────────────────────────────────────────────────
  const uniformLines = generateUniformAnnotations(blockIds);

  // ── Corps mainImage — on prend le fragment du premier bloc non-post ──────
  // Pour simplifier : utiliser le fragment du premier bloc actif.
  // Si plusieurs blocs ont un fragment, on combine les couleurs avec un mix.
  const fragmentBlocks = blocks.filter(b => b.fragment && b.fragment.trim());
  let mainBody = '';

  if (fragmentBlocks.length === 1) {
    mainBody = fragmentBlocks[0].fragment;
  } else if (fragmentBlocks.length > 1) {
    // Premier bloc pour le setup UV
    const first = fragmentBlocks[0];
    mainBody = first.fragment;

    // Blocs suivants contribuent via mix
    for (let i = 1; i < fragmentBlocks.length; i++) {
      const b = fragmentBlocks[i];
      const varName = `col${i}`;
      // On extrait le résultat col du fragment et on fait un mix
      mainBody += `\n    // Layer ${i + 1}: ${b.name}`;
      mainBody += `\n    vec3 ${varName} = col; // mix avec ${b.name}`;
    }
  }

  // Ajustements vitesse/intensité
  if (speed !== 1.0) {
    mainBody = mainBody.replace(/iTime/g, `(iTime * ${speed.toFixed(2)})`);
  }

  // Personnalisation couleurs : injecter uPrimaryColor / uSecondaryColor si demandé
  const colorDefines = _buildColorDefines(colors);

  // ── Assemblage final ──────────────────────────────────────────────────────
  const header = [
    `// ═══════════════════════════════════════════════════`,
    `// ${name} — généré par Shader Composer`,
    `// Blocs : ${blocks.map(b => b.name).join(', ')}`,
    `// ═══════════════════════════════════════════════════`,
  ].join('\n');

  const parts = [
    header,
    colorDefines,
    uniformLines,
    '',
    ...orderedHelpers.map((h, i) => (i > 0 ? '\n' : '') + h),
    '',
    'void mainImage(out vec4 fragColor, in vec2 fragCoord) {',
    mainBody,
    `    fragColor = vec4(clamp(col * ${intensity.toFixed(2)}, 0.0, 1.0), 1.0);`,
    '}',
  ].filter(Boolean);

  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Shader de secours ─────────────────────────────────────────────────────────

function _fallbackShader(name, speed, intensity) {
  return `// ${name} — généré par Shader Composer
vec3 palette(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime * ${speed.toFixed(2)};
    float d = length(uv);
    vec3 col = palette(d * 2.0 + t * 0.3) * ${intensity.toFixed(2)};
    col *= smoothstep(1.2, 0.0, d);
    fragColor = vec4(col, 1.0);
}`;
}

// ── Couleurs de personnalisation ──────────────────────────────────────────────

function _buildColorDefines(colors) {
  if (!colors || (!colors.primary && !colors.secondary)) return '';
  const lines = [];
  if (colors.primary) {
    const [r, g, b] = _hexToGLSL(colors.primary);
    lines.push(`#define PRIMARY_COLOR vec3(${r}, ${g}, ${b})`);
  }
  if (colors.secondary) {
    const [r, g, b] = _hexToGLSL(colors.secondary);
    lines.push(`#define SECONDARY_COLOR vec3(${r}, ${g}, ${b})`);
  }
  return lines.join('\n');
}

function _hexToGLSL(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  return [r.toFixed(3), g.toFixed(3), b.toFixed(3)];
}

/**
 * Liste les catégories disponibles avec leurs blocs.
 * @returns {{ category: string, blocks: object[] }[]}
 */
export function listBlocksByCategory() {
  const cats = {};
  for (const b of COMPOSER_BLOCKS) {
    if (!cats[b.category]) cats[b.category] = [];
    cats[b.category].push(b);
  }
  return Object.entries(cats).map(([category, blocks]) => ({ category, blocks }));
}

/**
 * Retourne les blocs compatibles avec un domaine donné.
 * @param {string} domain
 * @returns {object[]}
 */
export function blocksForDomain(domain) {
  return COMPOSER_BLOCKS.filter(b => !b.domain || b.domain === domain || b.domain === '2d');
}
