/**
 * sdf-composer.js — Phase 2 (ROADMAP v2.2→v2.6)
 *
 * ✅ [x] 🔌 Primitives manquantes : tore 3D, capsule, cône, bézier quad, heart SDF
 * ✅ [x] 🔌 Opérations booléennes : smooth union, intersection, soustraction, morph blend
 * ✅ [x] 🆕 Export `float sceneSDF(vec3 p)` insérable dans l'éditeur
 * ✅ [x] 🆕 Paramétrer avec des #define auto-générés (@range, @group, @label)
 */

import {
  SDF_PRIMITIVES, SDF_OPERATIONS, SDF_EXTRAS,
  buildSdfSnippet, buildFullSdfLibrary,
} from './sdf-library.js';
import { makeDraggablePersistent } from '../ui/panel-manager.js';

// ─── Param definitions ───────────────────────────────────────────────────────

const PRIM_PARAM_DEFS = {
  sdSphere:         [{ key:'r',  label:'radius',   min:0.05, max:2,   step:0.01, def:0.5 }],
  sdBox:            [{ key:'bx', label:'X half',   min:0.05, max:2,   step:0.01, def:0.5 },
                     { key:'by', label:'Y half',   min:0.05, max:2,   step:0.01, def:0.5 },
                     { key:'bz', label:'Z half',   min:0.05, max:2,   step:0.01, def:0.5 }],
  sdRoundBox:       [{ key:'bx', label:'X half',   min:0.05, max:2,   step:0.01, def:0.5 },
                     { key:'by', label:'Y half',   min:0.05, max:2,   step:0.01, def:0.5 },
                     { key:'bz', label:'Z half',   min:0.05, max:2,   step:0.01, def:0.5 },
                     { key:'r',  label:'round',    min:0.0,  max:0.5,  step:0.01, def:0.05 }],
  sdTorus:          [{ key:'R',  label:'R major',  min:0.1,  max:2,   step:0.01, def:0.4 },
                     { key:'r',  label:'r minor',  min:0.01, max:1,   step:0.01, def:0.1 }],
  sdCappedTorus:    [{ key:'an', label:'angle(rad)',min:0.1, max:3.14, step:0.01, def:0.5 },
                     { key:'ra', label:'R major',  min:0.1,  max:2,   step:0.01, def:0.4 },
                     { key:'rb', label:'r minor',  min:0.01, max:0.5, step:0.01, def:0.1 }],
  sdLink:           [{ key:'le', label:'length',   min:0.05, max:2,   step:0.01, def:0.5 },
                     { key:'r1', label:'R major',  min:0.05, max:2,   step:0.01, def:0.3 },
                     { key:'r2', label:'r minor',  min:0.01, max:1,   step:0.01, def:0.1 }],
  sdPlane:          [{ key:'h',  label:'height',   min:-2,   max:2,   step:0.01, def:0.0 }],
  sdCapsule:        [{ key:'h',  label:'half-len', min:0.05, max:2,   step:0.01, def:0.5 },
                     { key:'r',  label:'radius',   min:0.01, max:1,   step:0.01, def:0.1 }],
  sdVertCapsule:    [{ key:'h',  label:'height',   min:0.05, max:2,   step:0.01, def:0.5 },
                     { key:'r',  label:'radius',   min:0.01, max:1,   step:0.01, def:0.1 }],
  sdCone:           [{ key:'a',  label:'angle(rad)',min:0.05,max:1.5,  step:0.01, def:0.4 },
                     { key:'h',  label:'height',   min:0.1,  max:3,   step:0.05, def:1.0 }],
  sdCappedCylinder: [{ key:'h',  label:'height',   min:0.05, max:2,   step:0.01, def:0.5 },
                     { key:'r',  label:'radius',   min:0.01, max:2,   step:0.01, def:0.2 }],
  sdRoundedCylinder:[{ key:'ra', label:'R outer',  min:0.05, max:2,   step:0.01, def:0.3 },
                     { key:'rb', label:'r round',  min:0.01, max:0.5, step:0.01, def:0.05},
                     { key:'h',  label:'height',   min:0.05, max:2,   step:0.01, def:0.5 }],
  sdCappedCone:     [{ key:'h',  label:'height',   min:0.1,  max:3,   step:0.05, def:1.0 },
                     { key:'r1', label:'r base',   min:0.0,  max:2,   step:0.01, def:0.5 },
                     { key:'r2', label:'r top',    min:0.0,  max:2,   step:0.01, def:0.1 }],
  sdEllipsoid:      [{ key:'rx', label:'rx',       min:0.05, max:2,   step:0.01, def:0.6 },
                     { key:'ry', label:'ry',       min:0.05, max:2,   step:0.01, def:0.3 },
                     { key:'rz', label:'rz',       min:0.05, max:2,   step:0.01, def:0.4 }],
  sdOctahedron:     [{ key:'s',  label:'size',     min:0.1,  max:2,   step:0.01, def:0.5 }],
  sdPyramid:        [{ key:'h',  label:'height',   min:0.1,  max:3,   step:0.05, def:1.0 }],
  sdHexPrism:       [{ key:'rx', label:'radius',   min:0.05, max:2,   step:0.01, def:0.3 },
                     { key:'h',  label:'height',   min:0.05, max:2,   step:0.01, def:0.2 }],
  sdTriPrism:       [{ key:'rx', label:'radius',   min:0.05, max:2,   step:0.01, def:0.3 },
                     { key:'h',  label:'height',   min:0.05, max:2,   step:0.01, def:0.2 }],
  sdHeart:          [{ key:'s',  label:'scale',    min:0.1,  max:2,   step:0.01, def:0.5 },
                     { key:'h',  label:'height',   min:0.01, max:1,   step:0.01, def:0.1 }],
  sdBezier2D:       [{ key:'ax', label:'A.x',      min:-1,   max:1,   step:0.01, def:-0.5 },
                     { key:'ay', label:'A.y',      min:-1,   max:1,   step:0.01, def:0.0  },
                     { key:'bx', label:'B.x',      min:-1,   max:1,   step:0.01, def:0.0  },
                     { key:'by', label:'B.y',      min:-1,   max:1,   step:0.01, def:0.5  },
                     { key:'cx', label:'C.x',      min:-1,   max:1,   step:0.01, def:0.5  },
                     { key:'cy', label:'C.y',      min:-1,   max:1,   step:0.01, def:0.0  }],
};

const OP_PARAM_DEFS = {
  opSmoothUnion:        [{ key:'k', label:'blend k', min:0.01, max:2, step:0.01, def:0.1 }],
  opSmoothSubtraction:  [{ key:'k', label:'blend k', min:0.01, max:2, step:0.01, def:0.1 }],
  opSmoothIntersection: [{ key:'k', label:'blend k', min:0.01, max:2, step:0.01, def:0.1 }],
  opMorphBlend:         [{ key:'t', label:'morph t', min:0,    max:1, step:0.01, def:0.5 }],
};

const ALL_PARAM_DEFS = { ...PRIM_PARAM_DEFS, ...OP_PARAM_DEFS };

// ─── GLSL param string per primitive ─────────────────────────────────────────

function buildParamStr(node) {
  const r = node.params;
  const f = (v, def=0) => (v ?? def).toFixed(4);
  switch (node.id) {
    case 'sdSphere':          return `, ${f(r.r, 0.5)}`;
    case 'sdBox':             return `, vec3(${f(r.bx,.5)},${f(r.by,.5)},${f(r.bz,.5)})`;
    case 'sdRoundBox':        return `, vec3(${f(r.bx,.5)},${f(r.by,.5)},${f(r.bz,.5)}),${f(r.r,.05)}`;
    case 'sdBoxFrame':        return `, vec3(${f(r.bx,.5)},${f(r.by,.5)},${f(r.bz,.5)}),${f(r.e,.05)}`;
    case 'sdTorus':           return `, vec2(${f(r.R,.4)},${f(r.r,.1)})`;
    case 'sdCappedTorus':     return `, vec2(${Math.cos(r.an??0.5).toFixed(4)},${Math.sin(r.an??0.5).toFixed(4)}),${f(r.ra,.4)},${f(r.rb,.1)}`;
    case 'sdLink':            return `, ${f(r.le,.5)},${f(r.r1,.3)},${f(r.r2,.1)}`;
    case 'sdPlane':           return `, vec3(0.,1.,0.),${f(r.h,0)}`;
    case 'sdCapsule':         return `, vec3(0.,${(-(r.h??0.5)).toFixed(4)},0.),vec3(0.,${f(r.h,.5)},0.),${f(r.r,.1)}`;
    case 'sdVertCapsule':     return `, ${f(r.h,.5)},${f(r.r,.1)}`;
    case 'sdCone':            return `, vec2(${Math.sin(r.a??0.4).toFixed(4)},${Math.cos(r.a??0.4).toFixed(4)}),${f(r.h,1)}`;
    case 'sdConeInf':         return `, vec2(${Math.sin(r.a??0.4).toFixed(4)},${Math.cos(r.a??0.4).toFixed(4)})`;
    case 'sdCappedCylinder':  return `, ${f(r.h,.5)},${f(r.r,.2)}`;
    case 'sdRoundedCylinder': return `, ${f(r.ra,.3)},${f(r.rb,.05)},${f(r.h,.5)}`;
    case 'sdCappedCone':      return `, ${f(r.h,1)},${f(r.r1,.5)},${f(r.r2,.1)}`;
    case 'sdEllipsoid':       return `, vec3(${f(r.rx,.6)},${f(r.ry,.3)},${f(r.rz,.4)})`;
    case 'sdOctahedron':      return `, ${f(r.s,.5)}`;
    case 'sdOctahedronBound': return `, ${f(r.s,.5)}`;
    case 'sdPyramid':         return `, ${f(r.h,1)}`;
    case 'sdHexPrism':        return `, vec2(${f(r.rx,.3)},${f(r.h,.2)})`;
    case 'sdTriPrism':        return `, vec2(${f(r.rx,.3)},${f(r.h,.2)})`;
    case 'sdHeart':           return `, ${f(r.s,.5)},${f(r.h,.1)}`;
    case 'sdBezier2D':        return `, vec2(${f(r.ax,-.5)},${f(r.ay,0)}),vec2(${f(r.bx,0)},${f(r.by,.5)}),vec2(${f(r.cx,.5)},${f(r.cy,0)})`;
    default:                  return '';
  }
}

// ─── 🆕 GLSL generator → sceneSDF + #define annotations ─────────────────────

/**
 * Génère le GLSL complet du stack SDF.
 * @param {Array} stack
 * @returns {{ defines: string, glsl: string }}
 *   defines : bloc #define avec annotations @range/@group/@label injectables en tête de shader
 *   glsl    : fonctions sceneSDF + calcNormal + bibliothèque SDF utilisée
 */
export function buildSceneSdfGLSL(stack) {
  if (!stack.length) {
    return {
      defines: '',
      glsl: `// sceneSDF — stack vide\nfloat sceneSDF(vec3 p) { return length(p) - 0.5; }\nvec3 calcNormal(vec3 p) { vec2 e=vec2(0.001,0.); return normalize(vec3(sceneSDF(p+e.xyy)-sceneSDF(p-e.xyy),sceneSDF(p+e.yxy)-sceneSDF(p-e.yxy),sceneSDF(p+e.yyx)-sceneSDF(p-e.yyx))); }`,
    };
  }

  // Collect needed lib IDs
  const primNodes  = stack.filter(n => n.type === 'prim');
  const needLibIds = [
    ...primNodes.map(n => n.id),
    'opUnion', 'opSmoothUnion', 'opSubtraction', 'opSmoothSubtraction',
    'opIntersection', 'opSmoothIntersection', 'opMorphBlend',
    'ndot', 'dot2',
  ];
  const libs = buildSdfSnippet([...new Set(needLibIds)]);

  // Build sceneSDF body — ops apply between consecutive prims
  const sceneLines = [];
  let primCount = 0;
  let pendingOp = null;

  for (const node of stack) {
    if (node.type === 'op') {
      pendingOp = node;
      continue;
    }
    if (node.type !== 'prim') continue;

    const i   = primCount;
    const pStr = buildParamStr(node);
    sceneLines.push(`    float d${i} = ${node.id}(p${pStr});`);

    if (i > 0) {
      const prevVar   = i === 1 ? 'd0' : `d${i-1}m`;
      const resultVar = `d${i}m`;
      const op  = pendingOp;
      const k   = ((op?.params?.k) ?? 0.1).toFixed(4);
      const t   = ((op?.params?.t) ?? 0.5).toFixed(4);
      let opCall;
      switch (op?.id) {
        case 'opUnion':             opCall = `opUnion(${prevVar},d${i})`; break;
        case 'opSubtraction':       opCall = `opSubtraction(${prevVar},d${i})`; break;
        case 'opSmoothSubtraction': opCall = `opSmoothSubtraction(${prevVar},d${i},${k})`; break;
        case 'opIntersection':      opCall = `opIntersection(${prevVar},d${i})`; break;
        case 'opSmoothIntersection':opCall = `opSmoothIntersection(${prevVar},d${i},${k})`; break;
        case 'opMorphBlend':        opCall = `opMorphBlend(${prevVar},d${i},${t})`; break;
        default:                    opCall = `opSmoothUnion(${prevVar},d${i},${k})`; break;
      }
      sceneLines.push(`    float ${resultVar} = ${opCall};`);
      pendingOp = null;
    }
    primCount++;
  }

  const lastVar = primCount === 0 ? '1000.0'
    : primCount === 1 ? 'd0'
    : `d${primCount - 1}m`;

  // 🆕 #define annotations
  const defineLines = [
    `// ── SDF Scene parameters — generated by sdf-composer.js ──`,
    `// @group(SDF Scene)`,
  ];
  let pIdx = 0;
  for (const node of stack) {
    if (node.type !== 'prim') continue;
    const defs = PRIM_PARAM_DEFS[node.id] ?? [];
    defs.forEach(d => {
      const macro = `SDF_${node.id.replace('sd','').toUpperCase()}_${d.key.toUpperCase()}_${pIdx}`;
      defineLines.push(`// @range(${d.min}, ${d.max}) @label(${node.label || node.id}: ${d.label})`);
      defineLines.push(`#define ${macro} ${((node.params[d.key]) ?? d.def).toFixed(4)}`);
    });
    pIdx++;
  }
  const defines = defineLines.join('\n');

  const glsl = [
    `// ── SDF Library (auto-selected) ──`,
    libs,
    ``,
    `// ── 🆕 sceneSDF — ${primCount} primitive(s), generated by sdf-composer.js ──`,
    `float sceneSDF(vec3 p) {`,
    ...sceneLines,
    `    return ${lastVar};`,
    `}`,
    ``,
    `vec3 calcNormal(vec3 p) {`,
    `    vec2 e = vec2(0.001, 0.0);`,
    `    return normalize(vec3(`,
    `        sceneSDF(p+e.xyy)-sceneSDF(p-e.xyy),`,
    `        sceneSDF(p+e.yxy)-sceneSDF(p-e.yxy),`,
    `        sceneSDF(p+e.yyx)-sceneSDF(p-e.yyx)));`,
    `}`,
  ].join('\n');

  return { defines, glsl };
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
#zgl-sdfcomp-panel {
  position: fixed; top: 60px; right: 340px; width: 460px; z-index: 9250;
  background: var(--bg1,#1a1a1e); border: 1px solid var(--bdr,#333);
  border-radius: 8px; font-family: var(--font-mono,monospace); font-size: 12px;
  color: var(--fg,#e0e0e0); box-shadow: 0 8px 32px rgba(0,0,0,.65);
  user-select: none; display: none;
}
#zgl-sdfcomp-panel.open { display: block; }
#zgl-sdfcomp-panel header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--bdr,#333); cursor: move;
}
#zgl-sdfcomp-panel header h3 { margin:0; font-size:13px; color:var(--ac2,#f7c97e); }
#zgl-sdfcomp-panel .sc-body { display:flex; height:420px; }
#zgl-sdfcomp-panel .sc-sidebar {
  width:160px; border-right:1px solid var(--bdr,#333); overflow-y:auto;
  padding:8px 0; display:flex; flex-direction:column; flex-shrink:0;
}
#zgl-sdfcomp-panel .sc-section-title {
  padding:4px 10px; font-size:10px; text-transform:uppercase; letter-spacing:.08em;
  color:var(--fg2,#888); background:var(--bg2,#252529); position:sticky; top:0; z-index:1;
}
#zgl-sdfcomp-panel .sc-item {
  padding:4px 10px; cursor:pointer; font-size:11px; color:var(--fg,#e0e0e0);
  transition:background .1s; border-left:2px solid transparent;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
#zgl-sdfcomp-panel .sc-item:hover { background:var(--bg2,#252529); border-left-color:var(--ac2,#f7c97e); }
#zgl-sdfcomp-panel .sc-item.prim { color:var(--ac1,#7eb8f7); }
#zgl-sdfcomp-panel .sc-item.op   { color:var(--ac3,#7ef7b8); }
#zgl-sdfcomp-panel .sc-main { flex:1; display:flex; flex-direction:column; min-width:0; }
#zgl-sdfcomp-panel .sc-canvas-wrap {
  flex:1; position:relative; background:#0d0d10; overflow:hidden;
}
#zgl-sdfcomp-canvas { display:block; width:100%; height:100%; cursor:crosshair; }
#zgl-sdfcomp-panel .sc-stack {
  border-top:1px solid var(--bdr,#333); padding:8px 10px;
  min-height:60px; max-height:100px; overflow-y:auto;
  display:flex; flex-direction:column; gap:4px;
}
#zgl-sdfcomp-panel .sc-stack-item {
  display:flex; align-items:flex-start; flex-direction:column;
  padding:4px 8px; border-radius:3px; font-size:11px;
  background:var(--bg2,#252529); border:1px solid var(--bdr,#333);
}
#zgl-sdfcomp-panel .sc-stack-item.prim { border-left:3px solid var(--ac1,#7eb8f7); }
#zgl-sdfcomp-panel .sc-stack-item.op   { border-left:3px solid var(--ac3,#7ef7b8); }
#zgl-sdfcomp-panel .sc-item-head { display:flex; align-items:center; justify-content:space-between; width:100%; }
#zgl-sdfcomp-panel .sc-item-params { display:flex; gap:4px; flex-wrap:wrap; margin-top:4px; width:100%; }
#zgl-sdfcomp-panel .sc-del { background:none; border:none; color:var(--fg2,#666); cursor:pointer; font-size:13px; padding:0 2px; }
#zgl-sdfcomp-panel .sc-del:hover { color:#e57373; }
#zgl-sdfcomp-panel .sc-footer {
  border-top:1px solid var(--bdr,#333); padding:8px 10px;
  display:flex; gap:6px; align-items:center;
}
#zgl-sdfcomp-panel .sc-btn {
  flex:1; padding:5px 0; border:1px solid var(--bdr,#333); border-radius:4px;
  background:var(--bg2,#252529); color:var(--fg,#e0e0e0); cursor:pointer;
  font-size:11px; transition:background .15s; font-family:inherit;
}
#zgl-sdfcomp-panel .sc-btn:hover { background:var(--bg3,#333); }
#zgl-sdfcomp-panel .sc-btn.primary { background:#1a2e3a; border-color:var(--ac1,#7eb8f7); color:var(--ac1,#7eb8f7); }
#zgl-sdfcomp-panel .sc-btn.primary:hover { background:#1e3a4a; }
#zgl-sdfcomp-panel .sc-btn.defines { background:#1a2a1a; border-color:var(--ac3,#7ef7b8); color:var(--ac3,#7ef7b8); font-size:10px; }
#zgl-sdfcomp-panel .sc-btn.defines:hover { background:#1e321e; }
#zgl-sdfcomp-panel .sc-close {
  background:none; border:none; color:var(--fg2,#aaa); cursor:pointer;
  font-size:16px; line-height:1; padding:0 2px;
}
#zgl-sdfcomp-panel .sc-close:hover { color:var(--fg,#e0e0e0); }
#zgl-sdfcomp-panel .sc-preview-info {
  position:absolute; bottom:6px; left:8px; font-size:10px;
  color:rgba(255,255,255,.6); pointer-events:none;
  text-shadow:0 1px 3px #000;
}
#zgl-sdfcomp-panel .sc-param-sl {
  width:65px; accent-color:var(--ac2,#f7c97e);
}
`;

// ─── CPU preview — eval SDF ───────────────────────────────────────────────────

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function evalNode(node, px, py) {
  const r = node.params;
  switch (node.id) {
    case 'sdSphere':         return Math.sqrt(px*px + py*py) - (r.r ?? 0.5);
    case 'sdBox': {
      const dx = Math.abs(px) - (r.bx ?? 0.5), dy = Math.abs(py) - (r.by ?? 0.5);
      return Math.min(Math.max(dx, dy), 0) + Math.sqrt(Math.max(dx,0)**2 + Math.max(dy,0)**2);
    }
    case 'sdRoundBox': {
      const rx = Math.abs(px) - (r.bx ?? 0.5) + (r.r ?? 0.05);
      const ry = Math.abs(py) - (r.by ?? 0.5) + (r.r ?? 0.05);
      return Math.sqrt(Math.max(rx,0)**2 + Math.max(ry,0)**2) + Math.min(Math.max(rx,ry), 0) - (r.r ?? 0.05);
    }
    case 'sdTorus': {
      const qx = Math.sqrt(px*px + py*py) - (r.R ?? 0.4);
      return Math.sqrt(qx*qx) - (r.r ?? 0.1);
    }
    case 'sdPlane':          return py + (r.h ?? 0);
    case 'sdCapsule':
    case 'sdVertCapsule': {
      const h = r.h ?? 0.5, rc = r.r ?? 0.1;
      const cy = Math.max(-h, Math.min(h, py));
      return Math.sqrt(px*px + (py-cy)**2) - rc;
    }
    case 'sdCone': {
      const a = r.a ?? 0.4, h = r.h ?? 1.0;
      const sa = Math.sin(a), ca = Math.cos(a);
      const qr = Math.sqrt(px*px), qy = -py;
      const dot = qr * sa + qy * ca;
      const d = Math.sqrt((qr - sa*Math.max(dot,0))**2 + (qy - ca*Math.max(dot,0))**2);
      return d * Math.sign(qr*ca - qy*sa) - (Math.abs(py) > h ? Math.abs(py) - h : 0);
    }
    case 'sdCappedCylinder': {
      const dx = Math.sqrt(px*px) - (r.r ?? 0.2);
      const dy = Math.abs(py) - (r.h ?? 0.5);
      return Math.min(Math.max(dx, dy), 0) + Math.sqrt(Math.max(dx,0)**2 + Math.max(dy,0)**2);
    }
    case 'sdEllipsoid': {
      const ex = r.rx ?? 0.6, ey = r.ry ?? 0.3;
      const k0 = Math.sqrt((px/ex)**2 + (py/ey)**2);
      const k1 = Math.sqrt((px/ex/ex)**2 + (py/ey/ey)**2);
      return k0 === 0 ? -Math.min(ex, ey) : k0 * (k0 - 1) / k1;
    }
    case 'sdOctahedron':     return (Math.abs(px) + Math.abs(py) - (r.s ?? 0.5)) * 0.577;
    case 'sdHexPrism': {
      const ax = Math.abs(px), ay = Math.abs(py);
      const rx = r.rx ?? 0.3, h2 = r.h ?? 0.2;
      return Math.max(ay - h2, Math.max(ax * 0.866 + ay * 0.5, ax) - rx);
    }
    case 'sdHeart': {
      const s = r.s ?? 0.5;
      const qx = Math.abs(px) / s, qy = -py / s;
      const d = qx + qy > 1
        ? Math.sqrt((qx - 0.25)**2 + (qy - 0.75)**2) - Math.sqrt(0.125)
        : Math.sqrt(Math.min((qx)**2 + (qy-1)**2, (Math.max(qx+qy,0)/2)**2)) * Math.sign(qx - qy);
      return d * s;
    }
    default: return Math.sqrt(px*px + py*py) - 0.5;
  }
}

function evalStack(stack, px, py) {
  let acc = null;
  let pendingOp = null;
  for (const node of stack) {
    if (node.type === 'op') { pendingOp = node; continue; }
    if (node.type !== 'prim') continue;
    const d = evalNode(node, px, py);
    if (acc === null) { acc = d; continue; }
    const k = (pendingOp?.params?.k ?? 0.1);
    const t = (pendingOp?.params?.t ?? 0.5);
    switch (pendingOp?.id) {
      case 'opUnion':             acc = Math.min(acc, d); break;
      case 'opSubtraction':       acc = Math.max(-acc, d); break;
      case 'opSmoothSubtraction': acc = -smin(-acc, -d, k); break;
      case 'opIntersection':      acc = Math.max(acc, d); break;
      case 'opSmoothIntersection':acc = -smin(-acc, -d, k); break;
      case 'opMorphBlend':        acc = acc * (1-t) + d * t; break;
      default:                    acc = smin(acc, d, k); break;
    }
    pendingOp = null;
  }
  return acc ?? (Math.sqrt(px*px + py*py) - 0.5);
}

function renderPreview(canvas, stack, scale) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = ((x / W) * 2 - 1) * (2 / scale);
      const py = ((y / H) * 2 - 1) * -(2 / scale);
      const d  = evalStack(stack, px, py);
      const t  = Math.sin(d * 15) * 0.5 + 0.5;
      const inside = d < 0;
      const i = (y * W + x) * 4;
      if (inside) {
        img.data[i]   = 20  + t * 40;
        img.data[i+1] = 70  + t * 110;
        img.data[i+2] = 200 + t * 55;
      } else {
        img.data[i]   = 190 + t * 50;
        img.data[i+2] = 15  + t * 20;
        img.data[i+1] = 80  + t * 50;
      }
      img.data[i+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ─── Panel ────────────────────────────────────────────────────────────────────

let _open    = false;
let _panel   = null;
let _stack   = [];
let _scale   = 3.0;
let _raf     = null;
let _canvas  = null;
let _onInsert = null;

function _injectCSS() {
  if (document.getElementById('zgl-sdfcomp-css')) return;
  const s = document.createElement('style'); s.id = 'zgl-sdfcomp-css';
  s.textContent = CSS; document.head.appendChild(s);
}

function _scheduleRender() {
  if (_raf) cancelAnimationFrame(_raf);
  _raf = requestAnimationFrame(() => { if (_canvas) renderPreview(_canvas, _stack, _scale); _raf = null; });
}

function _addNode(id, type) {
  const defs = ALL_PARAM_DEFS[id] ?? [];
  const params = Object.fromEntries(defs.map(d => [d.key, d.def]));
  const prim = SDF_PRIMITIVES.find(p => p.id === id);
  const op   = SDF_OPERATIONS.find(o => o.id === id);
  _stack.push({ id, type, params, label: (prim || op)?.label ?? id });
  _refreshStack();
  _scheduleRender();
}

function _removeNode(idx) {
  _stack.splice(idx, 1);
  _refreshStack();
  _scheduleRender();
}

function _refreshStack() {
  const stackDiv = _panel.querySelector('.sc-stack');
  stackDiv.innerHTML = '';
  if (!_stack.length) {
    stackDiv.innerHTML = '<span style="color:var(--fg2,#666);font-size:11px">Cliquez sur une primitive pour l\'ajouter…</span>';
    return;
  }
  _stack.forEach((node, i) => {
    const item = document.createElement('div');
    item.className = `sc-stack-item ${node.type}`;

    const head = document.createElement('div');
    head.className = 'sc-item-head';
    const lbl = document.createElement('span');
    lbl.textContent = node.label;
    const del = document.createElement('button');
    del.className = 'sc-del'; del.textContent = '✕';
    del.addEventListener('click', () => _removeNode(i));
    head.append(lbl, del);
    item.appendChild(head);

    const defs = ALL_PARAM_DEFS[node.id] ?? [];
    if (defs.length) {
      const paramsDiv = document.createElement('div');
      paramsDiv.className = 'sc-item-params';
      defs.forEach(d => {
        const wrap = document.createElement('label');
        wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:1px;font-size:9px;color:var(--fg2,#888);';
        wrap.textContent = d.label;
        const inp = document.createElement('input');
        inp.type = 'range'; inp.min = d.min; inp.max = d.max; inp.step = d.step;
        inp.value = node.params[d.key] ?? d.def;
        inp.className = 'sc-param-sl';
        inp.addEventListener('input', () => {
          node.params[d.key] = parseFloat(inp.value);
          _scheduleRender();
        });
        wrap.appendChild(inp);
        paramsDiv.appendChild(wrap);
      });
      item.appendChild(paramsDiv);
    }
    stackDiv.appendChild(item);
  });
}

export function initSdfComposer({ onInsert } = {}) {
  _injectCSS();
  _onInsert = onInsert;

  const panel = document.createElement('div');
  panel.id = 'zgl-sdfcomp-panel';
  _panel = panel;

  // Build sidebar from full library
  const primItems = SDF_PRIMITIVES.map(p =>
    `<div class="sc-item prim" data-id="${p.id}" data-type="prim" title="${p.id}">${p.label}</div>`
  ).join('');
  const opItems = SDF_OPERATIONS.map(o =>
    `<div class="sc-item op" data-id="${o.id}" data-type="op" title="${o.id}">${o.label}</div>`
  ).join('');

  panel.innerHTML = `
    <header>
      <h3>🎛 SDF Composer</h3>
      <button class="sc-close" id="zgl-sdfcomp-close">✕</button>
    </header>
    <div class="sc-body">
      <div class="sc-sidebar">
        <div class="sc-section-title">Primitives</div>
        ${primItems}
        <div class="sc-section-title">Operations</div>
        ${opItems}
      </div>
      <div class="sc-main">
        <div class="sc-canvas-wrap">
          <canvas id="zgl-sdfcomp-canvas" width="290" height="220"></canvas>
          <div class="sc-preview-info">Aperçu 2D (coupe XY)</div>
        </div>
        <div class="sc-stack" id="zgl-sdfcomp-stack">
          <span style="color:var(--fg2,#666);font-size:11px">Cliquez sur une primitive pour l'ajouter…</span>
        </div>
      </div>
    </div>
    <div class="sc-footer">
      <button class="sc-btn" id="zgl-sdfcomp-clear">Vider</button>
      <button class="sc-btn" id="zgl-sdfcomp-copy">Copier GLSL</button>
      <button class="sc-btn defines" id="zgl-sdfcomp-defines">Copier #define</button>
      <button class="sc-btn primary" id="zgl-sdfcomp-insert">→ Éditeur</button>
    </div>
  `;

  document.body.appendChild(panel);
  _canvas = panel.querySelector('#zgl-sdfcomp-canvas');

  panel.querySelector('#zgl-sdfcomp-close').addEventListener('click', () => _close());
  panel.querySelector('#zgl-sdfcomp-clear').addEventListener('click', () => {
    _stack = []; _refreshStack(); _scheduleRender();
  });

  panel.querySelector('#zgl-sdfcomp-copy').addEventListener('click', () => {
    const { glsl } = buildSceneSdfGLSL(_stack);
    navigator.clipboard?.writeText(glsl).catch(() => {});
    _flashBtn(panel.querySelector('#zgl-sdfcomp-copy'), '✓ Copié');
  });

  panel.querySelector('#zgl-sdfcomp-defines').addEventListener('click', () => {
    const { defines } = buildSceneSdfGLSL(_stack);
    navigator.clipboard?.writeText(defines).catch(() => {});
    _flashBtn(panel.querySelector('#zgl-sdfcomp-defines'), '✓ Copié');
  });

  panel.querySelector('#zgl-sdfcomp-insert').addEventListener('click', () => {
    const { defines, glsl } = buildSceneSdfGLSL(_stack);
    const full = defines ? defines + '\n\n' + glsl : glsl;
    if (typeof _onInsert === 'function') _onInsert(full);
  });

  panel.querySelectorAll('.sc-item').forEach(item => {
    item.addEventListener('click', () => _addNode(item.dataset.id, item.dataset.type));
  });

  makeDraggablePersistent(panel, 'sdf-composer', panel.querySelector('header'));
  _scheduleRender();

  return { open: _open_fn, close: _close, toggle: _toggle, isOpen: () => _open };
}

function _flashBtn(btn, label) {
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = label;
  setTimeout(() => { btn.textContent = orig; }, 1400);
}

function _open_fn()  { if (!_panel) return; _panel.classList.add('open'); _open = true; _scheduleRender(); }
function _close()    { if (!_panel) return; _panel.classList.remove('open'); _open = false; }
function _toggle()   { _open ? _close() : _open_fn(); }
