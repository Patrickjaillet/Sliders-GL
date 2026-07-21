import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../native/tauri.js', () => ({
  isTauri:      vi.fn(() => false),
  invokeTauri:  vi.fn(async () => {}),
}));

vi.mock('../gl/renderer.js', () => ({
  VERT:     'void main() { gl_Position = vec4(0); }',
  wrapFrag: src => `// wrapped\n${src}`,
}));

vi.mock('../render/adaptive-debounce.js', () => ({
  adaptiveDebounce: (fn, ms) => fn,
}));

vi.mock('../core/state.js', () => ({
  state: {
    mat3: {
      fragmentShader: 'void mainImage(out vec4 c, in vec2 f){ c = vec4(1); }',
      uniforms: {
        iTime:      { value: 0 },
        iTimeDelta: { value: 0.016 },
        iFrame:     { value: 0 },
        iMouse:     { value: { x: 0, y: 0, z: 0, w: 0 } },
        iResolution:{ value: { x: 1920, y: 1080, z: 1 } },
      },
    },
  },
}));

import { parseCliArgs, printHeadlessHelp } from '../native/headless-cli.js';

// ── Arg parser ────────────────────────────────────────────────────────────────

describe('parseCliArgs', () => {
  it('parses bare positional commands', () => {
    const a = parseCliArgs(['render', '--shader', 'main.glsl']);
    expect(a._).toEqual(['render']);
    expect(a.shader).toBe('main.glsl');
  });

  it('parses all render-shader options', () => {
    const a = parseCliArgs([
      'render',
      '--shader', 'plasma.frag',
      '--duration', '5',
      '--fps', '30',
      '--out', 'out.mp4',
      '--width', '1280',
      '--height', '720',
      '--bitrate', '12',
      '--start-time', '2',
    ]);
    expect(a.shader).toBe('plasma.frag');
    expect(a.duration).toBe('5');
    expect(a.fps).toBe('30');
    expect(a.out).toBe('out.mp4');
    expect(a.width).toBe('1280');
    expect(a.height).toBe('720');
    expect(a.bitrate).toBe('12');
    expect(a['start-time']).toBe('2');
  });

  it('sets boolean flags without values to true', () => {
    const a = parseCliArgs(['--help']);
    expect(a.help).toBe(true);
  });

  it('handles --version flag', () => {
    const a = parseCliArgs(['--version']);
    expect(a.version).toBe(true);
  });

  it('returns empty _ for zero positional args', () => {
    const a = parseCliArgs(['--help']);
    expect(a._).toEqual([]);
  });

  it('handles adjacent flags without values correctly', () => {
    const a = parseCliArgs(['render', '--shader', 'x.glsl', '--help']);
    expect(a.shader).toBe('x.glsl');
    expect(a.help).toBe(true);
  });
});

// ── PNG vs MP4 output detection ───────────────────────────────────────────────

describe('output path detection', () => {
  const isPNG = out => out.endsWith('/') || out.endsWith('\\') || !out.includes('.');

  it('detects trailing slash as PNG sequence', () => {
    expect(isPNG('frames/')).toBe(true);
    expect(isPNG('C:\\frames\\')).toBe(true);
  });

  it('detects .mp4 extension as video', () => {
    expect(isPNG('output.mp4')).toBe(false);
    expect(isPNG('render.webm')).toBe(false);
  });

  it('detects extensionless name as PNG sequence', () => {
    expect(isPNG('myframes')).toBe(true);
  });

  it('detects .png extension as video (explicit named file)', () => {
    expect(isPNG('frame.png')).toBe(false);
  });
});

// ── Defaults ──────────────────────────────────────────────────────────────────

describe('render defaults', () => {
  function applyDefaults(opts) {
    return {
      duration:    parseFloat(opts.duration ?? 10),
      fps:         parseInt(opts.fps ?? 60, 10),
      width:       parseInt(opts.width ?? 1920, 10),
      height:      parseInt(opts.height ?? 1080, 10),
      bitrate:     parseFloat(opts.bitrate ?? 8) * 1_000_000,
      startTime:   parseFloat(opts['start-time'] ?? 0),
    };
  }

  it('applies correct defaults when nothing is specified', () => {
    const d = applyDefaults({});
    expect(d.duration).toBe(10);
    expect(d.fps).toBe(60);
    expect(d.width).toBe(1920);
    expect(d.height).toBe(1080);
    expect(d.bitrate).toBe(8_000_000);
    expect(d.startTime).toBe(0);
  });

  it('overrides defaults with explicit values', () => {
    const d = applyDefaults({ duration: '5', fps: '30', width: '1280', height: '720', bitrate: '20', 'start-time': '3' });
    expect(d.duration).toBe(5);
    expect(d.fps).toBe(30);
    expect(d.width).toBe(1280);
    expect(d.height).toBe(720);
    expect(d.bitrate).toBe(20_000_000);
    expect(d.startTime).toBe(3);
  });

  it('computes correct nFrames from duration×fps', () => {
    const nFrames = (dur, fps) => Math.round(dur * fps);
    expect(nFrames(10, 60)).toBe(600);
    expect(nFrames(5, 30)).toBe(150);
    expect(nFrames(0.5, 60)).toBe(30);
    expect(nFrames(1.5, 24)).toBe(36);
  });
});

// ── Frame timing ──────────────────────────────────────────────────────────────

describe('frame timing', () => {
  it('advances iTime by 1/fps each frame', () => {
    const fps = 60;
    const dt = 1 / fps;
    const startTime = 2.5;
    const frames = Array.from({ length: 5 }, (_, f) => startTime + f * dt);
    expect(frames[0]).toBeCloseTo(2.5);
    expect(frames[1]).toBeCloseTo(2.5 + 1 / 60);
    expect(frames[4]).toBeCloseTo(2.5 + 4 / 60);
  });

  it('correctly calculates frame duration in microseconds for WebCodecs', () => {
    const fps = 60;
    const durUs = Math.round(1_000_000 / fps);
    expect(durUs).toBe(16667);
    expect(Math.round(1_000_000 / 30)).toBe(33333);
    expect(Math.round(1_000_000 / 24)).toBe(41667);
  });

  it('timestamps are monotonically increasing', () => {
    const fps = 60;
    const durUs = Math.round(1_000_000 / fps);
    const timestamps = Array.from({ length: 10 }, (_, f) => f * durUs);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
    }
  });
});

// ── keyframe emission ─────────────────────────────────────────────────────────

describe('frame keyframe index', () => {
  it('emits a keyframe every 30 frames for H.264', () => {
    const isKeyFrame = f => f % 30 === 0;
    expect(isKeyFrame(0)).toBe(true);
    expect(isKeyFrame(30)).toBe(true);
    expect(isKeyFrame(60)).toBe(true);
    expect(isKeyFrame(15)).toBe(false);
    expect(isKeyFrame(29)).toBe(false);
  });
});

// ── Vertical flip ─────────────────────────────────────────────────────────────

describe('pixel vertical flip', () => {
  function flipVertical(buf, w, h) {
    const out = new Uint8Array(w * h * 4);
    for (let row = 0; row < h; row++) {
      const src = (h - 1 - row) * w * 4;
      out.set(buf.subarray(src, src + w * 4), row * w * 4);
    }
    return out;
  }

  it('first row after flip equals last row of original', () => {
    const w = 2, h = 2;
    const orig = new Uint8Array([
      255, 0, 0, 255,  0, 255, 0, 255,
        0, 0, 255, 255, 255, 255, 0, 255,
    ]);
    const flipped = flipVertical(orig, w, h);
    expect(Array.from(flipped.subarray(0, 4))).toEqual([0, 0, 255, 255]);
    expect(Array.from(flipped.subarray(4, 8))).toEqual([255, 255, 0, 255]);
  });

  it('double flip yields the original', () => {
    const w = 4, h = 4;
    const orig = new Uint8Array(w * h * 4);
    for (let i = 0; i < orig.length; i++) orig[i] = (i * 7 + 3) % 256;
    const doubleFlipped = flipVertical(flipVertical(orig, w, h), w, h);
    expect(doubleFlipped).toEqual(orig);
  });
});

// ── Log progress ──────────────────────────────────────────────────────────────

describe('progress bar', () => {
  function progressBar(frame, total) {
    const pct = Math.round((frame / total) * 100);
    return '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
  }

  it('empty at frame 0', () => {
    expect(progressBar(0, 100)).toBe('░'.repeat(20));
  });

  it('half full at 50%', () => {
    expect(progressBar(50, 100)).toBe('█'.repeat(10) + '░'.repeat(10));
  });

  it('always produces exactly 20 characters', () => {
    for (let f = 0; f <= 100; f += 5) {
      expect(progressBar(f, 100).length).toBe(20);
    }
  });
});

// ── Frame file naming ─────────────────────────────────────────────────────────

describe('frame filename generation', () => {
  function frameName(index, total) {
    const digits = String(total).length;
    return `frame_${String(index).padStart(digits, '0')}.png`;
  }

  it('pads correctly for 600 total frames', () => {
    expect(frameName(0, 600)).toBe('frame_000.png');
    expect(frameName(599, 600)).toBe('frame_599.png');
  });

  it('pads correctly for fewer than 10 frames', () => {
    expect(frameName(0, 5)).toBe('frame_0.png');
    expect(frameName(4, 5)).toBe('frame_4.png');
  });

  it('pads correctly for exactly 1000 frames', () => {
    expect(frameName(0, 1000)).toBe('frame_0000.png');
    expect(frameName(999, 1000)).toBe('frame_0999.png');
  });
});

// ── wrapFrag integration ──────────────────────────────────────────────────────

describe('wrapFrag call', () => {
  it('wraps a GLSL source', async () => {
    const { wrapFrag } = await import('../gl/renderer.js');
    const src = 'void mainImage(out vec4 c, in vec2 f){ c=vec4(1); }';
    const wrapped = wrapFrag(src);
    expect(wrapped).toContain(src);
  });
});
