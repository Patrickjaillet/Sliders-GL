// §G.2 (UI v2) — « Explain this error » déterministe (sans IA)
//
// Table de règles : motif de message compilateur GLSL → cause + correctif en
// langage clair. 100 % hors-ligne, transparent, sans inférence.

const RULES = [
  {
    re: /undeclared identifier\s*[:'"]*\s*(['"]?)([A-Za-z_]\w*)\1/i,
    msg: (m) => `« ${m[2]} » n'est pas déclaré. Vérifiez l'orthographe, déclarez-le (ex. \`float ${m[2]};\`), ou ajoutez l'uniform/le channel correspondant.`,
  },
  { re: /'(\w+)'\s*:\s*undeclared identifier/i, msg: (m) => `« ${m[1]} » n'est pas déclaré (typo, variable hors portée, ou uniform manquant).` },
  { re: /no matching overloaded function|no matching function/i, msg: () => `Aucune surcharge ne correspond : vérifiez le nombre et le type des arguments (ex. \`mix(vec3, vec3, float)\`).` },
  { re: /cannot convert|implicit conversion|incompatible types|'=' : cannot/i, msg: () => `Types incompatibles. GLSL est strict : écrivez \`1.0\` (pas \`1\`) pour un float, et castez explicitement (ex. \`float(i)\`, \`vec3(x)\`).` },
  { re: /syntax error|parse error|unexpected/i, msg: () => `Erreur de syntaxe — il manque probablement un \`;\`, \`,\`, \`)\` ou \`}\` juste avant cette ligne.` },
  { re: /redefinition|already has a body|previously declared/i, msg: () => `Redéfinition : ce nom (variable ou fonction) est déjà défini. Renommez-le ou supprimez le doublon.` },
  { re: /is not a structure|no such field|field selection/i, msg: () => `Sélection de champ invalide : un swizzle (\`.xy\`, \`.rgb\`) ne s'applique qu'à un vecteur, pas à un scalaire.` },
  { re: /constructor|wrong number of arguments/i, msg: () => `Constructeur invalide : le nombre de composantes ne correspond pas (ex. \`vec3(1.0, 0.0)\` doit avoir 1 ou 3 arguments).` },
  { re: /return.*not matching|function return is not/i, msg: () => `Le type retourné ne correspond pas à la signature de la fonction.` },
  { re: /array size must be|constant integer expression/i, msg: () => `Taille de tableau ou borne de boucle : doit être une constante entière (ex. \`const int N = 8;\`).` },
  { re: /gl_FragColor|gl_FragData/i, msg: () => `\`gl_FragColor\` est obsolète en GLSL ES 3.0. Utilisez la sortie via \`mainImage(out vec4 fragColor, ...)\` (convention ShaderToy).` },
  { re: /texture2D|textureCube\s*\(/i, msg: () => `\`texture2D\` est obsolète : utilisez \`texture(sampler, uv)\` en GLSL ES 3.0.` },
  { re: /division by zero|inf|nan/i, msg: () => `Valeur non finie possible (division par 0). Protégez le dénominateur (ex. \`max(d, 1e-6)\`).` },
];

/**
 * @param {string} message  message d'erreur du compilateur GLSL
 * @returns {string|null}    explication en langage clair, ou null
 */
export function explainGLSLError(message) {
  if (!message) return null;
  for (const r of RULES) {
    const m = r.re.exec(message);
    if (m) return r.msg(m);
  }
  return null;
}
