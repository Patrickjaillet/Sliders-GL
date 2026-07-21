import { state } from '../core/state.js';
import { parseCubeFile, createLUTTexture, setLUTEnabled, setLUTStrength } from './lut-grading.js';

const LUT_SIZE = 32;

function identity(r, _g, _b) { return [r, _g, _b]; }

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function srgbToLinear(v) {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function linearToSrgb(v) {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (pp, qq, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return pp + (qq - pp) * 6 * t;
    if (t < 1/2) return qq;
    if (t < 2/3) return pp + (qq - pp) * (2/3 - t) * 6;
    return pp;
  };
  return [hue2rgb(p, q, h + 1/3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1/3)];
}

function aces(r, g, b) {
  const m = [
    [0.59719, 0.35458, 0.04823],
    [0.07600, 0.90834, 0.01566],
    [0.02840, 0.13383, 0.83777],
  ];
  const [x, y, z] = [
    m[0][0]*r + m[0][1]*g + m[0][2]*b,
    m[1][0]*r + m[1][1]*g + m[1][2]*b,
    m[2][0]*r + m[2][1]*g + m[2][2]*b,
  ];
  const rrt = (v) => (v*(v+0.0245786)-0.000090537) / (v*(0.983729*v+0.4329510)+0.238081);
  const [ox, oy, oz] = [rrt(x), rrt(y), rrt(z)];
  const im = [
    [1.60475, -0.53108, -0.07367],
    [-0.10208, 1.10813, -0.00605],
    [-0.00327, -0.07276, 1.07602],
  ];
  return [
    clamp01(im[0][0]*ox + im[0][1]*oy + im[0][2]*oz),
    clamp01(im[1][0]*ox + im[1][1]*oy + im[1][2]*oz),
    clamp01(im[2][0]*ox + im[2][1]*oy + im[2][2]*oz),
  ];
}

function buildLUT3D(fn) {
  const s = LUT_SIZE;
  const data = [];
  for (let b = 0; b < s; b++) {
    for (let g = 0; g < s; g++) {
      for (let r = 0; r < s; r++) {
        const [ro, go, bo] = fn(r/(s-1), g/(s-1), b/(s-1));
        data.push(clamp01(ro), clamp01(go), clamp01(bo));
      }
    }
  }
  return { size: s, domain: { min: [0,0,0], max: [1,1,1] }, data: new Float32Array(data) };
}

function serializeCube(lutData, title) {
  const s = lutData.size;
  let out = `TITLE "${title}"\nLUT_3D_SIZE ${s}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n\n`;
  for (let i = 0; i < lutData.data.length; i += 3) {
    out += `${lutData.data[i].toFixed(6)} ${lutData.data[i+1].toFixed(6)} ${lutData.data[i+2].toFixed(6)}\n`;
  }
  return out;
}

function contrast(r, g, b, amount) {
  const c = (v) => clamp01((v - 0.5) * amount + 0.5);
  return [c(r), c(g), c(b)];
}
function saturation(r, g, b, sat) {
  const lum = 0.2126*r + 0.7152*g + 0.0722*b;
  return [clamp01(lum + sat*(r-lum)), clamp01(lum + sat*(g-lum)), clamp01(lum + sat*(b-lum))];
}
function lift(r, g, b, lr, lg, lb) {
  return [clamp01(r + lr*(1-r)), clamp01(g + lg*(1-g)), clamp01(b + lb*(1-b))];
}
function gamma(r, g, b, gr, gg, gb) {
  const safe = (v, g) => v <= 0 ? 0 : Math.pow(v, 1/g);
  return [clamp01(safe(r,gr)), clamp01(safe(g,gg)), clamp01(safe(b,gb))];
}
function gain(r, g, b, gn) {
  return [clamp01(r*gn), clamp01(g*gn), clamp01(b*gn)];
}
function shadows(r, g, b, str, cr, cg, cb) {
  const dark = Math.max(0, 1 - (r+g+b)/3);
  return [clamp01(r + dark*str*cr), clamp01(g + dark*str*cg), clamp01(b + dark*str*cb)];
}
function highlights(r, g, b, str, cr, cg, cb) {
  const bright = (r+g+b)/3;
  return [clamp01(r + bright*str*cr), clamp01(g + bright*str*cg), clamp01(b + bright*str*cb)];
}
function vignette(_r, _g, _b) { return [_r, _g, _b]; }
function filmCurve(v, toe, shoulder) {
  if (v < toe) return v * v / (2 * toe);
  if (v > 1 - shoulder) return 1 - Math.pow(1 - v, 2) / (2 * shoulder);
  return v;
}

const LUT_DEFINITIONS = [
  {
    id: 'identity', name: 'Identity (No Grade)', category: 'Utility',
    tags: ['flat', 'neutral'],
    build: () => buildLUT3D(identity),
  },
  {
    id: 'aces-filmic', name: 'ACES Filmic', category: 'Cinematic',
    tags: ['cinema', 'hdr', 'filmic'],
    build: () => buildLUT3D((r,g,b) => aces(r,g,b)),
  },
  {
    id: 'bleach-bypass', name: 'Bleach Bypass', category: 'Cinematic',
    tags: ['cinema', 'silver', 'contrast'],
    build: () => buildLUT3D((r,g,b) => {
      const lum = 0.2126*r + 0.7152*g + 0.0722*b;
      let [ro,go,bo] = saturation(r,g,b, 0.3);
      [ro,go,bo] = contrast(ro,go,bo, 1.5);
      return [clamp01(ro*0.7+lum*0.3), clamp01(go*0.7+lum*0.3), clamp01(bo*0.7+lum*0.3)];
    }),
  },
  {
    id: 'day-for-night', name: 'Day for Night', category: 'Cinematic',
    tags: ['cinema', 'night', 'blue', 'dark'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = [r*0.4, g*0.45, b*0.65];
      [ro,go,bo] = saturation(ro,go,bo, 0.5);
      return [clamp01(ro), clamp01(go), clamp01(bo)];
    }),
  },
  {
    id: 'orange-teal', name: 'Orange & Teal', category: 'Cinematic',
    tags: ['cinema', 'blockbuster', 'complementary'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,1.5);
      const dark = Math.max(0, 1-(r+g+b)/3);
      const bright = (r+g+b)/3;
      ro = clamp01(ro + bright*0.12);
      go = clamp01(go + bright*0.03 - dark*0.04);
      bo = clamp01(bo - bright*0.08 + dark*0.12);
      return [ro,go,bo];
    }),
  },
  {
    id: 'cold-steel', name: 'Cold Steel', category: 'Cinematic',
    tags: ['cinema', 'cold', 'blue', 'desaturated'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,0.7);
      [ro,go,bo] = contrast(ro,go,bo,1.2);
      bo = clamp01(bo + 0.04);
      ro = clamp01(ro - 0.02);
      return [ro,go,bo];
    }),
  },
  {
    id: 'warm-sunset', name: 'Warm Sunset', category: 'Cinematic',
    tags: ['cinema', 'warm', 'orange', 'golden'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,1.2);
      ro = clamp01(ro + 0.08);
      go = clamp01(go + 0.02);
      bo = clamp01(bo - 0.05);
      [ro,go,bo] = contrast(ro,go,bo,1.15);
      return [ro,go,bo];
    }),
  },
  {
    id: 'film-noir', name: 'Film Noir', category: 'Black & White',
    tags: ['bw', 'noir', 'high-contrast'],
    build: () => buildLUT3D((r,g,b) => {
      const lum = filmCurve(clamp01(0.2126*r + 0.7152*g + 0.0722*b), 0.1, 0.1);
      const c = clamp01((lum-0.5)*1.6+0.5);
      return [c, c, c];
    }),
  },
  {
    id: 'bw-classic', name: 'B&W Classic', category: 'Black & White',
    tags: ['bw', 'classic', 'neutral'],
    build: () => buildLUT3D((r,g,b) => {
      const lum = clamp01(0.299*r + 0.587*g + 0.114*b);
      return [lum,lum,lum];
    }),
  },
  {
    id: 'bw-red-filter', name: 'B&W Red Filter', category: 'Black & White',
    tags: ['bw', 'red', 'landscape', 'dramatic'],
    build: () => buildLUT3D((r,g,b) => {
      const lum = clamp01(0.6*r + 0.28*g + 0.12*b);
      const c = clamp01((lum-0.5)*1.3+0.5);
      return [c,c,c];
    }),
  },
  {
    id: 'bw-green-filter', name: 'B&W Green Filter', category: 'Black & White',
    tags: ['bw', 'green', 'portrait', 'smooth'],
    build: () => buildLUT3D((r,g,b) => {
      const lum = clamp01(0.12*r + 0.72*g + 0.16*b);
      return [lum,lum,lum];
    }),
  },
  {
    id: 'bw-infrared', name: 'B&W Infrared', category: 'Black & White',
    tags: ['bw', 'infrared', 'surreal', 'foliage'],
    build: () => buildLUT3D((r,g,b) => {
      const lum = clamp01(r*0.9 - g*0.3 + b*(-0.1) + 0.3);
      const c = clamp01((lum-0.5)*1.5+0.5);
      return [c,c,c];
    }),
  },
  {
    id: 'sepia-tone', name: 'Sepia Tone', category: 'Vintage',
    tags: ['vintage', 'warm', 'brown', 'aged'],
    build: () => buildLUT3D((r,g,b) => {
      const lum = 0.299*r + 0.587*g + 0.114*b;
      return [clamp01(lum*1.07+0.07), clamp01(lum*0.88+0.02), clamp01(lum*0.64)];
    }),
  },
  {
    id: 'vintage-faded', name: 'Vintage Faded', category: 'Vintage',
    tags: ['vintage', 'faded', 'muted', 'retro'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,0.6);
      [ro,go,bo] = lift(ro,go,bo, 0.08, 0.06, 0.04);
      [ro,go,bo] = contrast(ro,go,bo,0.9);
      return [ro,go,bo];
    }),
  },
  {
    id: 'kodak-vision', name: 'Kodak Vision (inspired)', category: 'Vintage',
    tags: ['vintage', 'film', 'kodak', 'warm'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = gamma(r,g,b,0.9,0.95,1.05);
      [ro,go,bo] = saturation(ro,go,bo,0.85);
      [ro,go,bo] = lift(ro,go,bo,0.05,0.03,0.02);
      return [ro,go,bo];
    }),
  },
  {
    id: 'fuji-velvia', name: 'Fuji Velvia (inspired)', category: 'Vintage',
    tags: ['vintage', 'film', 'fuji', 'saturated'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,1.6);
      [ro,go,bo] = contrast(ro,go,bo,1.25);
      bo = clamp01(bo + 0.02);
      return [ro,go,bo];
    }),
  },
  {
    id: 'polaroid', name: 'Polaroid', category: 'Vintage',
    tags: ['vintage', 'polaroid', 'faded', 'warm'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,0.75);
      [ro,go,bo] = lift(ro,go,bo,0.10,0.07,0.05);
      [ro,go,bo] = contrast(ro,go,bo,0.85);
      ro = clamp01(ro + 0.04);
      bo = clamp01(bo - 0.03);
      return [ro,go,bo];
    }),
  },
  {
    id: 'cross-process', name: 'Cross Process', category: 'Vintage',
    tags: ['vintage', 'cross', 'psychedelic', 'quirky'],
    build: () => buildLUT3D((r,g,b) => {
      const rc = clamp01(Math.pow(r, 0.7) * 1.1);
      const gc = clamp01(Math.pow(g, 1.3));
      const bc = clamp01(Math.pow(b, 0.6) * 1.15);
      return [rc,gc,bc];
    }),
  },
  {
    id: 'super8', name: 'Super 8', category: 'Vintage',
    tags: ['vintage', 'film', 'grain', 'warm'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,0.8);
      [ro,go,bo] = contrast(ro,go,bo,1.1);
      ro = clamp01(ro + 0.06);
      go = clamp01(go + 0.02);
      return shadows(ro,go,bo, 0.4, 0.1, 0.05, -0.05);
    }),
  },
  {
    id: 'cine-log', name: 'Cine Log (Flat)', category: 'Cinematic',
    tags: ['cinema', 'log', 'flat', 'grade'],
    build: () => buildLUT3D((r,g,b) => {
      const logFn = v => clamp01(0.1 + 0.36 * Math.log(v * 9 + 1) / Math.log(10));
      return [logFn(r), logFn(g), logFn(b)];
    }),
  },
  {
    id: 'rec709', name: 'Rec.709 Broadcast', category: 'Cinematic',
    tags: ['cinema', 'broadcast', 'tv', 'standard'],
    build: () => buildLUT3D((r,g,b) => {
      const fn = v => clamp01(v < 0.018 ? v*4.5 : 1.099*Math.pow(v,0.45)-0.099);
      return [fn(r), fn(g), fn(b)];
    }),
  },
  {
    id: 'horror', name: 'Horror / Desaturated Cold', category: 'Cinematic',
    tags: ['cinema', 'horror', 'cold', 'dark'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,0.3);
      [ro,go,bo] = contrast(ro,go,bo,1.4);
      [ro,go,bo] = shadows(ro,go,bo,0.5,-0.05,0,-0.05);
      bo = clamp01(bo + 0.05);
      return [ro,go,bo];
    }),
  },
  {
    id: 'arctic', name: 'Arctic Blue', category: 'Cinematic',
    tags: ['cinema', 'cold', 'arctic', 'ice', 'blue'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,0.8);
      [ro,go,bo] = contrast(ro,go,bo,1.1);
      bo = clamp01(bo + 0.08);
      ro = clamp01(ro - 0.03);
      go = clamp01(go + 0.02);
      return [ro,go,bo];
    }),
  },
  {
    id: 'sci-fi-blue', name: 'Sci-Fi Blue', category: 'Sci-Fi',
    tags: ['sci-fi', 'blue', 'cyber', 'cool'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,1.4);
      bo = clamp01(bo * 1.3);
      ro = clamp01(ro * 0.8);
      go = clamp01(go * 0.9 + 0.05);
      [ro,go,bo] = contrast(ro,go,bo,1.2);
      return [ro,go,bo];
    }),
  },
  {
    id: 'tron-legacy', name: 'Tron Legacy (inspired)', category: 'Sci-Fi',
    tags: ['sci-fi', 'tron', 'neon', 'dark', 'blue'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,1.2);
      [ro,go,bo] = contrast(ro,go,bo,1.4);
      const lum = (r+g+b)/3;
      if (lum < 0.15) {
        bo = clamp01(bo + 0.1);
        go = clamp01(go + 0.08);
        ro = clamp01(ro * 0.7);
      } else if (lum > 0.85) {
        bo = clamp01(bo + 0.12);
        go = clamp01(go + 0.12);
      }
      return [ro,go,bo];
    }),
  },
  {
    id: 'matrix-green', name: 'Matrix Green', category: 'Sci-Fi',
    tags: ['sci-fi', 'matrix', 'green', 'monochrome'],
    build: () => buildLUT3D((r,g,b) => {
      const lum = 0.299*r + 0.587*g + 0.114*b;
      let [ro,go,bo] = [lum*0.4, lum, lum*0.4];
      [ro,go,bo] = contrast(ro,go,bo,1.3);
      return [ro,go,bo];
    }),
  },
  {
    id: 'cyberpunk', name: 'Cyberpunk', category: 'Sci-Fi',
    tags: ['sci-fi', 'cyberpunk', 'neon', 'purple', 'pink'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,1.7);
      [ro,go,bo] = contrast(ro,go,bo,1.25);
      const lum = (r+g+b)/3;
      ro = clamp01(ro + lum*0.08);
      bo = clamp01(bo + lum*0.12);
      go = clamp01(go * 0.85);
      return [ro,go,bo];
    }),
  },
  {
    id: 'vhs-lo-fi', name: 'VHS Lo-Fi', category: 'Sci-Fi',
    tags: ['sci-fi', 'vhs', 'retro', 'lo-fi', 'glitch'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,1.3);
      [ro,go,bo] = contrast(ro,go,bo,1.15);
      ro = clamp01(ro * 1.1);
      go = clamp01(go * 0.95);
      bo = clamp01(bo * 0.85);
      [ro,go,bo] = lift(ro,go,bo,0.03,0.02,0.04);
      return [ro,go,bo];
    }),
  },
  {
    id: 'blade-runner', name: 'Blade Runner (inspired)', category: 'Sci-Fi',
    tags: ['sci-fi', 'noir', 'orange', 'dark', 'moody'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,0.9);
      [ro,go,bo] = contrast(ro,go,bo,1.3);
      [ro,go,bo] = shadows(ro,go,bo, 0.6, 0.05, 0.02, -0.05);
      [ro,go,bo] = highlights(ro,go,bo, 0.3, 0.05, 0.02, -0.02);
      return [ro,go,bo];
    }),
  },
  {
    id: 'tropical', name: 'Tropical', category: 'Artistic',
    tags: ['artistic', 'warm', 'vivid', 'summer'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,1.5);
      ro = clamp01(ro + 0.05);
      go = clamp01(go + 0.03);
      bo = clamp01(bo - 0.02);
      return [ro,go,bo];
    }),
  },
  {
    id: 'golden-hour', name: 'Golden Hour', category: 'Artistic',
    tags: ['artistic', 'golden', 'warm', 'sunset'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,1.3);
      ro = clamp01(r*1.15);
      go = clamp01(g*1.05);
      bo = clamp01(b*0.75);
      [ro,go,bo] = contrast(ro,go,bo,1.1);
      return [ro,go,bo];
    }),
  },
  {
    id: 'faded-green', name: 'Faded Green', category: 'Artistic',
    tags: ['artistic', 'faded', 'green', 'muted'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,0.7);
      [ro,go,bo] = lift(ro,go,bo,0.05,0.08,0.04);
      go = clamp01(go + 0.04);
      [ro,go,bo] = contrast(ro,go,bo,0.9);
      return [ro,go,bo];
    }),
  },
  {
    id: 'duotone-purple', name: 'Duotone Purple & Gold', category: 'Artistic',
    tags: ['artistic', 'duotone', 'purple', 'gold'],
    build: () => buildLUT3D((r,g,b) => {
      const lum = 0.299*r + 0.587*g + 0.114*b;
      const darkR = 0.25, darkG = 0.1, darkB = 0.5;
      const brightR = 0.95, brightG = 0.8, brightB = 0.2;
      return [
        clamp01(darkR*(1-lum) + brightR*lum),
        clamp01(darkG*(1-lum) + brightG*lum),
        clamp01(darkB*(1-lum) + brightB*lum),
      ];
    }),
  },
  {
    id: 'duotone-cyan', name: 'Duotone Cyan & Red', category: 'Artistic',
    tags: ['artistic', 'duotone', 'cyan', 'red'],
    build: () => buildLUT3D((r,g,b) => {
      const lum = 0.299*r + 0.587*g + 0.114*b;
      return [
        clamp01(0.9*(1-lum) + 0.1*lum),
        clamp01(0.05*(1-lum) + 0.85*lum),
        clamp01(0.1*(1-lum) + 0.9*lum),
      ];
    }),
  },
  {
    id: 'pastel', name: 'Pastel Dream', category: 'Artistic',
    tags: ['artistic', 'pastel', 'soft', 'dreamy'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,0.5);
      [ro,go,bo] = lift(ro,go,bo,0.12,0.12,0.15);
      [ro,go,bo] = contrast(ro,go,bo,0.8);
      return [ro,go,bo];
    }),
  },
  {
    id: 'cinematic-teal', name: 'Cinematic Teal', category: 'Cinematic',
    tags: ['cinema', 'teal', 'dark', 'shadows'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = shadows(r,g,b,0.8,-0.05,0.05,0.08);
      [ro,go,bo] = contrast(ro,go,bo,1.2);
      [ro,go,bo] = saturation(ro,go,bo,0.9);
      return [ro,go,bo];
    }),
  },
  {
    id: 'split-tone-film', name: 'Split Tone Film', category: 'Cinematic',
    tags: ['cinema', 'split-tone', 'blue', 'orange'],
    build: () => buildLUT3D((r,g,b) => {
      const lum = (r+g+b)/3;
      let [ro,go,bo] = [r,g,b];
      if (lum < 0.5) {
        bo = clamp01(bo + 0.1*(1-lum*2));
        ro = clamp01(ro - 0.03*(1-lum*2));
      } else {
        ro = clamp01(ro + 0.08*(lum-0.5)*2);
        go = clamp01(go + 0.03*(lum-0.5)*2);
        bo = clamp01(bo - 0.04*(lum-0.5)*2);
      }
      return [ro,go,bo];
    }),
  },
  {
    id: 'vivid', name: 'Vivid Boost', category: 'Artistic',
    tags: ['artistic', 'vivid', 'saturated', 'pop'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,1.8);
      [ro,go,bo] = contrast(ro,go,bo,1.15);
      return [ro,go,bo];
    }),
  },
  {
    id: 'muted-earth', name: 'Muted Earth Tones', category: 'Artistic',
    tags: ['artistic', 'muted', 'earth', 'natural'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,0.65);
      ro = clamp01(ro * 1.05 + 0.02);
      go = clamp01(go * 1.02);
      bo = clamp01(bo * 0.9);
      [ro,go,bo] = contrast(ro,go,bo,0.95);
      return [ro,go,bo];
    }),
  },
  {
    id: 'burnt-shadow', name: 'Burnt Shadows', category: 'Cinematic',
    tags: ['cinema', 'warm', 'dark', 'shadows'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = contrast(r,g,b,1.35);
      [ro,go,bo] = shadows(ro,go,bo,0.6,0.08,0.02,-0.04);
      return [ro,go,bo];
    }),
  },
  {
    id: 'moonlight', name: 'Moonlight', category: 'Cinematic',
    tags: ['cinema', 'blue', 'night', 'cool', 'silver'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,0.6);
      bo = clamp01(bo + 0.06);
      ro = clamp01(ro - 0.02);
      [ro,go,bo] = contrast(ro,go,bo,1.15);
      return [ro,go,bo];
    }),
  },
  {
    id: 'amber', name: 'Amber Glow', category: 'Artistic',
    tags: ['artistic', 'amber', 'warm', 'fire'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = gain(r,g,b,1.1);
      ro = clamp01(ro + 0.1);
      go = clamp01(go + 0.04);
      bo = clamp01(bo * 0.7);
      return saturation(ro,go,bo,1.2);
    }),
  },
  {
    id: 'rose', name: 'Rose Pink', category: 'Artistic',
    tags: ['artistic', 'pink', 'rose', 'romantic'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,1.1);
      ro = clamp01(ro + 0.08);
      bo = clamp01(bo + 0.04);
      go = clamp01(go * 0.92);
      return [ro,go,bo];
    }),
  },
  {
    id: 'emerald', name: 'Emerald Forest', category: 'Artistic',
    tags: ['artistic', 'green', 'forest', 'nature'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,1.2);
      go = clamp01(go * 1.12);
      ro = clamp01(ro * 0.92);
      bo = clamp01(bo * 0.88);
      return [ro,go,bo];
    }),
  },
  {
    id: 'neon-night', name: 'Neon Night', category: 'Sci-Fi',
    tags: ['sci-fi', 'neon', 'night', 'vivid', 'dark'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,2.0);
      [ro,go,bo] = contrast(ro,go,bo,1.5);
      const lum = (r+g+b)/3;
      if (lum < 0.2) { ro = clamp01(ro*0.5); go = clamp01(go*0.5); bo = clamp01(bo*0.5); }
      return [ro,go,bo];
    }),
  },
  {
    id: 'holographic', name: 'Holographic', category: 'Sci-Fi',
    tags: ['sci-fi', 'holographic', 'iridescent', 'rainbow'],
    build: () => buildLUT3D((r,g,b) => {
      const [h,s,l] = rgbToHsl(r,g,b);
      const h2 = (h + 0.15) % 1.0;
      const s2 = Math.min(1, s * 1.5);
      const [ro,go,bo] = hslToRgb(h2, s2, l);
      return [clamp01(ro), clamp01(go), clamp01(bo)];
    }),
  },
  {
    id: 'desaturate-blue', name: 'Desaturate (Blue tint)', category: 'Utility',
    tags: ['utility', 'desaturate', 'blue'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,0.3);
      bo = clamp01(bo + 0.06);
      return [ro,go,bo];
    }),
  },
  {
    id: 'high-contrast', name: 'High Contrast', category: 'Utility',
    tags: ['utility', 'contrast', 'punch'],
    build: () => buildLUT3D((r,g,b) => contrast(r,g,b,1.6)),
  },
  {
    id: 'low-contrast', name: 'Low Contrast (Log)', category: 'Utility',
    tags: ['utility', 'flat', 'low-contrast', 'log'],
    build: () => buildLUT3D((r,g,b) => contrast(r,g,b,0.7)),
  },
  {
    id: 'invert', name: 'Invert', category: 'Utility',
    tags: ['utility', 'invert', 'negative'],
    build: () => buildLUT3D((r,g,b) => [1-r, 1-g, 1-b]),
  },
  {
    id: 'hue-rotate', name: 'Hue Rotate +120°', category: 'Utility',
    tags: ['utility', 'hue', 'rotate'],
    build: () => buildLUT3D((r,g,b) => {
      const [h,s,l] = rgbToHsl(r,g,b);
      const [ro,go,bo] = hslToRgb((h + 0.333) % 1, s, l);
      return [clamp01(ro), clamp01(go), clamp01(bo)];
    }),
  },
  {
    id: 'night-vision', name: 'Night Vision Green', category: 'Sci-Fi',
    tags: ['sci-fi', 'night-vision', 'green', 'military'],
    build: () => buildLUT3D((r,g,b) => {
      const lum = 0.299*r + 0.587*g + 0.114*b;
      const c = clamp01((lum-0.5)*1.4+0.5);
      return [c*0.1, c, c*0.15];
    }),
  },
  {
    id: 'thermal', name: 'Thermal Heatmap', category: 'Sci-Fi',
    tags: ['sci-fi', 'thermal', 'heatmap', 'infrared'],
    build: () => buildLUT3D((r,g,b) => {
      const lum = 0.299*r + 0.587*g + 0.114*b;
      if (lum < 0.25) return [0, 0, clamp01(lum*4)];
      if (lum < 0.5) return [0, clamp01((lum-0.25)*4), 1];
      if (lum < 0.75) return [clamp01((lum-0.5)*4), 1, clamp01(1-(lum-0.5)*4)];
      return [1, clamp01(1-(lum-0.75)*4), 0];
    }),
  },
  {
    id: 'film-print', name: 'Film Print Wash', category: 'Vintage',
    tags: ['vintage', 'film', 'print', 'aged', 'yellow'],
    build: () => buildLUT3D((r,g,b) => {
      let [ro,go,bo] = saturation(r,g,b,0.75);
      [ro,go,bo] = lift(ro,go,bo,0.07,0.06,0.02);
      [ro,go,bo] = contrast(ro,go,bo,0.88);
      ro = clamp01(ro*1.06);
      return [ro,go,bo];
    }),
  },
  {
    id: 'tungsten', name: 'Tungsten Correction', category: 'Utility',
    tags: ['utility', 'tungsten', 'warm', 'correction'],
    build: () => buildLUT3D((r,g,b) => {
      return [clamp01(r*0.82), clamp01(g*0.92), clamp01(b*1.35)];
    }),
  },
  {
    id: 'daylight', name: 'Daylight Correction', category: 'Utility',
    tags: ['utility', 'daylight', 'cool', 'correction'],
    build: () => buildLUT3D((r,g,b) => {
      return [clamp01(r*1.15), clamp01(g*1.0), clamp01(b*0.85)];
    }),
  },
];

const _lutCache = new Map();

function getLUTDefinitions() {
  return LUT_DEFINITIONS;
}

function getLUTById(id) {
  return LUT_DEFINITIONS.find(d => d.id === id) || null;
}

function getLUTsByCategory() {
  const cats = {};
  for (const d of LUT_DEFINITIONS) {
    if (!cats[d.category]) cats[d.category] = [];
    cats[d.category].push(d);
  }
  return cats;
}

function buildLUTData(id) {
  if (_lutCache.has(id)) return _lutCache.get(id);
  const def = getLUTById(id);
  if (!def) throw new Error(`Unknown LUT id: ${id}`);
  const data = def.build();
  _lutCache.set(id, data);
  return data;
}

function applyEmbeddedLUT(id, strength) {
  const def = getLUTById(id);
  if (!def) return;
  const lutData = buildLUTData(id);
  const texture = createLUTTexture(lutData);
  state.perf.lutTexture = texture;
  state.perf.lutSize = lutData.size;
  state.perf.lutCurrentId = id;
  if (state.perf.lutMat) {
    state.perf.lutMat.uniforms.tLUT.value = texture;
  }
  setLUTEnabled(true);
  if (strength !== undefined) setLUTStrength(strength);
}

function exportCubeFile(id) {
  const def = getLUTById(id);
  if (!def) return;
  const data = buildLUTData(id);
  const content = serializeCube(data, def.name);
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${id}.cube`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export {
  LUT_DEFINITIONS,
  getLUTDefinitions,
  getLUTById,
  getLUTsByCategory,
  buildLUTData,
  buildLUT3D,
  serializeCube,
  applyEmbeddedLUT,
  exportCubeFile,
  clamp01,
  rgbToHsl,
  hslToRgb,
};
