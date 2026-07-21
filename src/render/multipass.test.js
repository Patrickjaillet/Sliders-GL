/**
 * multipass.test.js — Phase 12.1
 *
 * Integration tests for the multi-pass rendering system.
 * Covers:
 *   §1  Pass state lifecycle (enable / disable)
 *   §2  RenderTarget ping-pong swap
 *   §3  Uniform propagation (iTime, iTimeDelta, iFrame, iResolution)
 *   §4  Channel wiring & iChannel uniform binding
 *   §5  Per-pass resolution scaling
 *   §6  Feedback-delay toggle
 *   §7  mpResizeRTs — resize propagation
 *   §8  stImportMultipass — wiring from ShaderToy descriptor
 *   §9  mpSetChannel — wiring mutations
 *   §10 Constants & labels
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// §0  Minimal THREE.js mock — only the classes multipass.js actually uses
// ─────────────────────────────────────────────────────────────────────────────

function makeTexture(label = 'tex') {
  return { isTexture: true, label, dispose: vi.fn(), needsUpdate: false };
}

function makeRT(w = 512, h = 512) {
  const texture = makeTexture('rt-tex');
  return {
    width: w,
    height: h,
    texture,
    dispose: vi.fn(),
    setSize: vi.fn(function (nw, nh) { this.width = nw; this.height = nh; }),
  };
}

const THREE_mock = {
  UnsignedByteType: 1009,
  FloatType: 1015,
  HalfFloatType: 1016,
  LinearFilter: 1006,
  RGBAFormat: 1023,

  WebGLRenderTarget: vi.fn().mockImplementation(function (w, h) {
    const rt = makeRT(w, h);
    Object.assign(this, rt);
  }),

  WebGLCubeRenderTarget: vi.fn().mockImplementation(function (sz) {
    const rt = makeRT(sz, sz);
    Object.assign(this, rt);
  }),

  ShaderMaterial: vi.fn().mockImplementation(function (opts = {}) {
    this.uniforms     = opts.uniforms ?? {};
    this.vertexShader = opts.vertexShader ?? '';
    this.fragmentShader = opts.fragmentShader ?? '';
    this.needsUpdate  = false;
    this.dispose      = vi.fn();
  }),

  Vector3: vi.fn().mockImplementation(function (x = 0, y = 0, z = 0) {
    this.x = x; this.y = y; this.z = z;
    this.set  = vi.fn(function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; });
    this.copy = vi.fn(function (v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; });
  }),
};

vi.mock('three', () => THREE_mock);

// ─────────────────────────────────────────────────────────────────────────────
// §0b  Mock heavy cross-layer dependencies
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../io/actions.js', () => ({
  toast: vi.fn(),
  applyAndParse: vi.fn(),
}));

vi.mock('../gl/renderer.js', () => ({
  wrapFrag:         (c) => `/* wrapped */\n${c}`,
  wrapFragCube:     (c) => `/* cube-wrapped */\n${c}`,
  buildUniforms:    () => ({
    iTime:              { value: 0 },
    iTimeDelta:         { value: 0 },
    iFrame:             { value: 0 },
    iResolution:        { value: new THREE_mock.Vector3(512, 512, 1) },
    iChannel0:          { value: null },
    iChannel1:          { value: null },
    iChannel2:          { value: null },
    iChannel3:          { value: null },
    iChannelResolution: { value: [
      new THREE_mock.Vector3(), new THREE_mock.Vector3(),
      new THREE_mock.Vector3(), new THREE_mock.Vector3(),
    ]},
    iFace: { value: 0 },
  }),
  VERT:             '/* vert */',
  applyGLShader:    vi.fn(),
  checkFragCompile: vi.fn(() => null),   // null = no error
  showErr:          vi.fn(),
  hideErr:          vi.fn(),
}));

vi.mock('./sound-pass.js', () => ({
  soundEnable:   vi.fn(async () => true),
  soundDisable:  vi.fn(),
  soundRebuild:  vi.fn(),
  soundIsRunning: vi.fn(() => false),
}));

// ─────────────────────────────────────────────────────────────────────────────
// §0c  Minimal DOM stub + state wiring
// ─────────────────────────────────────────────────────────────────────────────

function buildDomStub() {
  const elements = {};
  globalThis.document = {
    getElementById:   (id) => elements[id] ?? null,
    querySelector:    () => null,
    querySelectorAll: () => ({ forEach: () => {} }),
    createElement:    (tag) => ({
      tag, id: '', className: '', style: {}, innerHTML: '',
      appendChild: vi.fn(), addEventListener: vi.fn(),
    }),
    addEventListener: vi.fn(),
  };
  return elements;
}

// ─────────────────────────────────────────────────────────────────────────────
// §0d  Build a minimal renderer stub that satisfies multipass.js expectations
// ─────────────────────────────────────────────────────────────────────────────

function makeRenderer(w = 800, h = 600) {
  return {
    domElement: { width: w, height: h },
    capabilities: { isWebGL2: true },
    extensions:   { get: () => null },
    setRenderTarget: vi.fn(),
    render:          vi.fn(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §0e  Import the module under test — deferred so mocks are in place first
// ─────────────────────────────────────────────────────────────────────────────

let MP_PASS_IDS, MP_CUBE_PASS_IDS, MP_ALL_BUF_IDS, MP_PASS_LABELS;
let mpEnablePass, mpDisablePass, mpInitRT, mpResizeRTs;
let mpSyncPassUniforms, renderMultiPass;
let mpSetChannel, mpSetPassResScale, mpToggleFeedbackDelay;
let mpRebuildPassMat, stImportMultipass;
let state;

beforeEach(async () => {
  buildDomStub();
  vi.resetModules();

  // Re-import fresh state first (it holds shared singleton)
  const stateModule = await import('../core/state.js');
  state = stateModule.state;

  // Attach a renderer stub
  state.renderer3 = makeRenderer();
  state.scene3    = {};
  state.cam3      = {};
  state.mat3      = { uniforms: {
    iTime:              { value: 0 },
    iTimeDelta:         { value: 0 },
    iFrame:             { value: 0 },
    iResolution:        { value: new THREE_mock.Vector3(800, 600, 1) },
    iChannel0:          { value: null },
    iChannel1:          { value: null },
    iChannel2:          { value: null },
    iChannel3:          { value: null },
    iChannelResolution: { value: [
      new THREE_mock.Vector3(), new THREE_mock.Vector3(),
      new THREE_mock.Vector3(), new THREE_mock.Vector3(),
    ]},
  }};
  state.mesh3 = { material: null };
  state.simTime  = 0;
  state.fidx     = 0;

  // Reset all buffer passes
  const mp = state.mp;
  for (const id of ['bufA','bufB','bufC','bufD','cubeA','cubeB','sound']) {
    mp.passes[id].enabled   = false;
    mp.passes[id].rt        = null;
    mp.passes[id].rtBack    = null;
    mp.passes[id].mat       = null;
    mp.passes[id].code      = '';
    mp.passes[id].ch        = [null,null,null,null];
    if ('feedbackDelay' in mp.passes[id]) mp.passes[id].feedbackDelay = true;
    if ('resolutionScale' in mp.passes[id]) mp.passes[id].resolutionScale = 1;
  }
  mp.passes.image.ch   = [null,null,null,null];
  mp.passes.image.code = '';
  mp.active = 'image';

  const mod = await import('./multipass.js');
  MP_PASS_IDS     = mod.MP_PASS_IDS;
  MP_CUBE_PASS_IDS = mod.MP_CUBE_PASS_IDS;
  MP_ALL_BUF_IDS  = mod.MP_ALL_BUF_IDS;
  MP_PASS_LABELS  = mod.MP_PASS_LABELS;
  mpEnablePass    = mod.mpEnablePass;
  mpDisablePass   = mod.mpDisablePass;
  mpInitRT        = mod.mpInitRT;
  mpResizeRTs     = mod.mpResizeRTs;
  mpSyncPassUniforms = mod.mpSyncPassUniforms;
  renderMultiPass = mod.renderMultiPass;
  mpSetChannel    = mod.mpSetChannel;
  mpSetPassResScale = mod.mpSetPassResScale;
  mpToggleFeedbackDelay = mod.mpToggleFeedbackDelay;
  mpRebuildPassMat = mod.mpRebuildPassMat;
  stImportMultipass = mod.stImportMultipass;
});

// ─────────────────────────────────────────────────────────────────────────────
// §10  Constants & labels (no state mutation needed)
// ─────────────────────────────────────────────────────────────────────────────

describe('multipass / constants', () => {
  it('MP_PASS_IDS contains the four buffer ids', () => {
    expect(MP_PASS_IDS).toEqual(['bufA','bufB','bufC','bufD']);
  });

  it('MP_CUBE_PASS_IDS contains cubeA and cubeB', () => {
    expect(MP_CUBE_PASS_IDS).toEqual(['cubeA','cubeB']);
  });

  it('MP_ALL_BUF_IDS is the union of buffer and cube ids', () => {
    expect(MP_ALL_BUF_IDS).toEqual([...MP_PASS_IDS, ...MP_CUBE_PASS_IDS]);
  });

  it('MP_PASS_LABELS has a human label for every pass including image', () => {
    const expected = ['bufA','bufB','bufC','bufD','cubeA','cubeB','sound','image'];
    for (const id of expected) {
      expect(MP_PASS_LABELS[id], `label missing for ${id}`).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §1  Pass lifecycle — enable / disable
// ─────────────────────────────────────────────────────────────────────────────

describe('multipass / pass lifecycle', () => {
  it('mpEnablePass marks the pass as enabled', () => {
    mpEnablePass('bufA');
    expect(state.mp.passes.bufA.enabled).toBe(true);
  });

  it('mpEnablePass allocates both rt and rtBack for buffer passes', () => {
    mpEnablePass('bufA');
    expect(state.mp.passes.bufA.rt).not.toBeNull();
    expect(state.mp.passes.bufA.rtBack).not.toBeNull();
  });

  it('mpEnablePass creates a ShaderMaterial for buffer passes', () => {
    mpEnablePass('bufA');
    expect(state.mp.passes.bufA.mat).not.toBeNull();
  });

  it('mpEnablePass is idempotent — second call does not re-allocate', () => {
    mpEnablePass('bufA');
    const firstRt = state.mp.passes.bufA.rt;
    mpEnablePass('bufA');
    expect(state.mp.passes.bufA.rt).toBe(firstRt);
  });

  it('mpDisablePass marks the pass as disabled', () => {
    mpEnablePass('bufA');
    mpDisablePass('bufA');
    expect(state.mp.passes.bufA.enabled).toBe(false);
  });

  it('mpDisablePass disposes rt and rtBack', () => {
    mpEnablePass('bufA');
    const rt     = state.mp.passes.bufA.rt;
    const rtBack = state.mp.passes.bufA.rtBack;
    mpDisablePass('bufA');
    expect(rt.dispose).toHaveBeenCalled();
    expect(rtBack.dispose).toHaveBeenCalled();
  });

  it('mpDisablePass nullifies rt, rtBack, and mat', () => {
    mpEnablePass('bufA');
    mpDisablePass('bufA');
    const p = state.mp.passes.bufA;
    expect(p.rt).toBeNull();
    expect(p.rtBack).toBeNull();
    expect(p.mat).toBeNull();
  });

  it('cannot disable the image pass', () => {
    mpDisablePass('image');
    expect(state.mp.passes.image.enabled).toBe(true);
  });

  it('disabling a pass removes it from other passes channel wiring', () => {
    mpEnablePass('bufA');
    mpEnablePass('bufB');
    state.mp.passes.bufB.ch[0] = 'bufA';
    mpDisablePass('bufA');
    expect(state.mp.passes.bufB.ch[0]).toBeNull();
  });

  it('disabling a pass clears its wiring in the image pass', () => {
    mpEnablePass('bufA');
    state.mp.passes.image.ch[2] = 'bufA';
    mpDisablePass('bufA');
    expect(state.mp.passes.image.ch[2]).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §2  RenderTarget ping-pong swap
// ─────────────────────────────────────────────────────────────────────────────

describe('multipass / RenderTarget ping-pong swap', () => {
  it('renderMultiPass returns false when no buffer pass is enabled', () => {
    expect(renderMultiPass(0.016)).toBe(false);
  });

  it('renderMultiPass returns true when at least one buffer pass is enabled', () => {
    mpEnablePass('bufA');
    expect(renderMultiPass(0.016)).toBe(true);
  });

  it('ping-pong swaps rt and rtBack after each frame (feedbackDelay=true)', () => {
    mpEnablePass('bufA');
    const p = state.mp.passes.bufA;
    const initialRt     = p.rt;
    const initialRtBack = p.rtBack;

    renderMultiPass(0.016);

    // After one frame the buffers should have swapped
    expect(p.rt).toBe(initialRtBack);
    expect(p.rtBack).toBe(initialRt);
  });

  it('second frame swaps back to original assignment', () => {
    mpEnablePass('bufA');
    const p = state.mp.passes.bufA;
    const initialRt = p.rt;

    renderMultiPass(0.016);
    renderMultiPass(0.016);

    expect(p.rt).toBe(initialRt);
  });

  it('renderer.setRenderTarget is called with rtBack during pass render', () => {
    mpEnablePass('bufA');
    const p = state.mp.passes.bufA;
    const expectedTarget = p.rtBack; // feedbackDelay=true: renders into rtBack

    renderMultiPass(0.016);

    const calls = state.renderer3.setRenderTarget.mock.calls;
    const targetCall = calls.find(c => c[0] === expectedTarget || c[0] === p.rt);
    expect(targetCall).toBeTruthy();
  });

  it('renderer.setRenderTarget(null) is called to restore default at end', () => {
    mpEnablePass('bufA');
    renderMultiPass(0.016);
    const lastCall = state.renderer3.setRenderTarget.mock.calls.at(-1);
    expect(lastCall[0]).toBeNull();
  });

  it('renderer.render is called once per enabled buffer pass', () => {
    mpEnablePass('bufA');
    mpEnablePass('bufB');
    state.renderer3.render.mockClear();
    renderMultiPass(0.016);
    // 2 buffer passes + 0 cube passes = at least 2 render calls
    expect(state.renderer3.render.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('mesh3.material is restored to mat3 after renderMultiPass', () => {
    mpEnablePass('bufA');
    renderMultiPass(0.016);
    expect(state.mesh3.material).toBe(state.mat3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3  Uniform propagation
// ─────────────────────────────────────────────────────────────────────────────

describe('multipass / uniform propagation', () => {
  it('mpSyncPassUniforms copies iTime to buffer pass uniforms', () => {
    mpEnablePass('bufA');
    state.simTime = 42.5;
    mpSyncPassUniforms('bufA', 0.016);
    expect(state.mp.passes.bufA.mat.uniforms.iTime.value).toBe(42.5);
  });

  it('mpSyncPassUniforms copies iTimeDelta to buffer pass uniforms', () => {
    mpEnablePass('bufA');
    mpSyncPassUniforms('bufA', 0.033);
    expect(state.mp.passes.bufA.mat.uniforms.iTimeDelta.value).toBe(0.033);
  });

  it('mpSyncPassUniforms copies iFrame to buffer pass uniforms', () => {
    mpEnablePass('bufA');
    state.fidx = 99;
    mpSyncPassUniforms('bufA', 0.016);
    expect(state.mp.passes.bufA.mat.uniforms.iFrame.value).toBe(99);
  });

  it('mpSyncPassUniforms sets iResolution from the rt dimensions for buffer passes', () => {
    mpEnablePass('bufA');
    const p = state.mp.passes.bufA;
    mpSyncPassUniforms('bufA', 0.016);
    const res = p.mat.uniforms.iResolution.value;
    expect(res.set).toHaveBeenCalledWith(p.rt.width, p.rt.height, 1);
  });

  it('mpSyncPassUniforms does nothing when the pass has no material', () => {
    // bufA not yet enabled — no mat
    expect(() => mpSyncPassUniforms('bufA', 0.016)).not.toThrow();
  });

  it('renderMultiPass propagates current simTime to all enabled passes', () => {
    mpEnablePass('bufA');
    mpEnablePass('bufB');
    state.simTime = 7.0;
    renderMultiPass(0.016);
    expect(state.mp.passes.bufA.mat.uniforms.iTime.value).toBe(7.0);
    expect(state.mp.passes.bufB.mat.uniforms.iTime.value).toBe(7.0);
  });

  it('uniform propagation does not throw when iChannelResolution is absent', () => {
    mpEnablePass('bufA');
    const mat = state.mp.passes.bufA.mat;
    delete mat.uniforms.iChannelResolution;
    expect(() => mpSyncPassUniforms('bufA', 0.016)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §4  Channel wiring & iChannel uniform binding
// ─────────────────────────────────────────────────────────────────────────────

describe('multipass / channel wiring', () => {
  it('mpSetChannel wires a source pass into a channel slot', () => {
    mpEnablePass('bufA');
    mpSetChannel('image', 0, 'bufA');
    expect(state.mp.passes.image.ch[0]).toBe('bufA');
  });

  it('mpSetChannel can clear a channel by passing null', () => {
    mpEnablePass('bufA');
    mpSetChannel('image', 0, 'bufA');
    mpSetChannel('image', 0, null);
    expect(state.mp.passes.image.ch[0]).toBeNull();
  });

  it('mpSyncPassUniforms binds the source rt.texture into iChannelN', () => {
    mpEnablePass('bufA');
    mpEnablePass('bufB');
    // Wire bufA output into bufB channel 0
    state.mp.passes.bufB.ch[0] = 'bufA';
    mpSyncPassUniforms('bufB', 0.016);
    const expected = state.mp.passes.bufA.rt.texture;
    expect(state.mp.passes.bufB.mat.uniforms.iChannel0.value).toBe(expected);
  });

  it('an unwired channel remains null after sync', () => {
    mpEnablePass('bufA');
    // ch[1] is not wired
    mpSyncPassUniforms('bufA', 0.016);
    expect(state.mp.passes.bufA.mat.uniforms.iChannel1.value).toBeNull();
  });

  it('mpSyncPassUniforms skips a channel whose source pass has no rt', () => {
    mpEnablePass('bufA');
    mpEnablePass('bufB');
    // Wire bufB → bufA ch0, then manually null the rt to simulate not-ready
    state.mp.passes.bufA.ch[0] = 'bufB';
    state.mp.passes.bufB.rt = null;
    expect(() => mpSyncPassUniforms('bufA', 0.016)).not.toThrow();
    // iChannel0 should stay null since srcPass.rt is null
    expect(state.mp.passes.bufA.mat.uniforms.iChannel0.value).toBeNull();
  });

  it('all four channel slots are independently wireable', () => {
    mpEnablePass('bufA');
    mpEnablePass('bufB');
    mpEnablePass('bufC');
    mpEnablePass('bufD');
    for (let i = 0; i < 4; i++) {
      mpSetChannel('image', i, MP_PASS_IDS[i]);
    }
    for (let i = 0; i < 4; i++) {
      expect(state.mp.passes.image.ch[i]).toBe(MP_PASS_IDS[i]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §5  Per-pass resolution scaling
// ─────────────────────────────────────────────────────────────────────────────

describe('multipass / per-pass resolution scaling', () => {
  it('mpSetPassResScale stores the clamped scale on the pass', () => {
    mpEnablePass('bufA');
    mpSetPassResScale('bufA', 0.5);
    expect(state.mp.passes.bufA.resolutionScale).toBe(0.5);
  });

  it('mpSetPassResScale clamps the scale to [0.125, 2]', () => {
    mpEnablePass('bufA');
    mpSetPassResScale('bufA', 999);
    expect(state.mp.passes.bufA.resolutionScale).toBe(2);
    mpSetPassResScale('bufA', 0);
    expect(state.mp.passes.bufA.resolutionScale).toBe(0.125);
  });

  it('mpSetPassResScale resizes the rt when the pass is enabled', () => {
    mpEnablePass('bufA');
    const p = state.mp.passes.bufA;
    mpSetPassResScale('bufA', 0.5);
    const renderer = state.renderer3.domElement;
    const expectedW = Math.round(renderer.width  * 0.5);
    const expectedH = Math.round(renderer.height * 0.5);
    expect(p.rt.setSize).toHaveBeenCalledWith(expectedW, expectedH);
  });

  it('mpSetPassResScale does nothing for cube passes', () => {
    mpEnablePass('cubeA');
    expect(() => mpSetPassResScale('cubeA', 0.5)).not.toThrow();
    expect(state.mp.passes.cubeA.resolutionScale).toBeUndefined();
  });

  it('mpSetPassResScale does nothing for the image pass', () => {
    expect(() => mpSetPassResScale('image', 0.5)).not.toThrow();
  });

  it('mpInitRT sizes the rt according to the current resolutionScale', () => {
    const p = state.mp.passes.bufB;
    p.resolutionScale = 0.25;
    mpEnablePass('bufB');
    const renderer = state.renderer3.domElement;
    const expectedW = Math.round(renderer.width  * 0.25);
    const expectedH = Math.round(renderer.height * 0.25);
    // The rt should have been created at the scaled size
    expect(p.rt.width).toBe(expectedW);
    expect(p.rt.height).toBe(expectedH);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §6  Feedback-delay toggle
// ─────────────────────────────────────────────────────────────────────────────

describe('multipass / feedback-delay toggle', () => {
  it('feedbackDelay defaults to true for new buffer passes', () => {
    mpEnablePass('bufA');
    expect(state.mp.passes.bufA.feedbackDelay).toBe(true);
  });

  it('mpToggleFeedbackDelay flips feedbackDelay to false', () => {
    mpEnablePass('bufA');
    mpToggleFeedbackDelay('bufA');
    expect(state.mp.passes.bufA.feedbackDelay).toBe(false);
  });

  it('mpToggleFeedbackDelay flips feedbackDelay back to true', () => {
    mpEnablePass('bufA');
    mpToggleFeedbackDelay('bufA');
    mpToggleFeedbackDelay('bufA');
    expect(state.mp.passes.bufA.feedbackDelay).toBe(true);
  });

  it('mpToggleFeedbackDelay does not affect cube passes', () => {
    mpEnablePass('cubeA');
    const before = state.mp.passes.cubeA.feedbackDelay;
    mpToggleFeedbackDelay('cubeA');
    expect(state.mp.passes.cubeA.feedbackDelay).toBe(before);
  });

  it('with feedbackDelay=false renderMultiPass swaps before rendering', () => {
    mpEnablePass('bufA');
    mpToggleFeedbackDelay('bufA'); // now false
    const p = state.mp.passes.bufA;
    const initialRt = p.rt;
    renderMultiPass(0.016);
    // With feedbackDelay=false swap happens before the render call
    // so after one frame the rt references should still be swapped
    expect(p.rt).not.toBe(initialRt);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §7  mpResizeRTs — resize propagation
// ─────────────────────────────────────────────────────────────────────────────

describe('multipass / mpResizeRTs', () => {
  it('resizes enabled buffer pass rt and rtBack', () => {
    mpEnablePass('bufA');
    const p = state.mp.passes.bufA;
    mpResizeRTs(1920, 1080);
    expect(p.rt.setSize).toHaveBeenCalledWith(1920, 1080);
    expect(p.rtBack.setSize).toHaveBeenCalledWith(1920, 1080);
  });

  it('applies resolutionScale when resizing', () => {
    mpEnablePass('bufA');
    state.mp.passes.bufA.resolutionScale = 0.5;
    const p = state.mp.passes.bufA;
    mpResizeRTs(1920, 1080);
    expect(p.rt.setSize).toHaveBeenCalledWith(960, 540);
  });

  it('does not resize disabled buffer passes', () => {
    // bufB is not enabled
    const p = state.mp.passes.bufB;
    mpResizeRTs(1920, 1080);
    expect(p.rt).toBeNull();
  });

  it('ensures rt dimensions are at least 1×1', () => {
    mpEnablePass('bufA');
    const p = state.mp.passes.bufA;
    mpResizeRTs(0, 0);
    // setSize should have been called with at least 1
    const [w, h] = p.rt.setSize.mock.calls.at(-1);
    expect(w).toBeGreaterThanOrEqual(1);
    expect(h).toBeGreaterThanOrEqual(1);
  });

  it('resizes multiple enabled passes independently', () => {
    mpEnablePass('bufA');
    mpEnablePass('bufB');
    state.mp.passes.bufA.resolutionScale = 1;
    state.mp.passes.bufB.resolutionScale = 0.5;
    mpResizeRTs(800, 600);
    const pA = state.mp.passes.bufA;
    const pB = state.mp.passes.bufB;
    expect(pA.rt.setSize).toHaveBeenCalledWith(800, 600);
    expect(pB.rt.setSize).toHaveBeenCalledWith(400, 300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §8  stImportMultipass — wiring from ShaderToy import descriptor
// ─────────────────────────────────────────────────────────────────────────────

describe('multipass / stImportMultipass', () => {
  function makeDescriptor(overrides = {}) {
    return {
      imagCode: 'void mainImage(out vec4 O, vec2 C) { O = vec4(1.0); }',
      imageChannelMap: new Map([[0, 'bufA']]),
      buffers: [
        {
          appId: 'bufA',
          code: 'void mainImage(out vec4 O, vec2 C) { O = vec4(0.5); }',
          channelMap: new Map(),
        },
      ],
      ...overrides,
    };
  }

  it('enables the referenced buffer passes', () => {
    stImportMultipass(makeDescriptor());
    expect(state.mp.passes.bufA.enabled).toBe(true);
  });

  it('stores the buffer shader code on the pass', () => {
    const d = makeDescriptor();
    stImportMultipass(d);
    expect(state.mp.passes.bufA.code).toBe(d.buffers[0].code);
  });

  it('wires imageChannelMap into image pass channels', () => {
    stImportMultipass(makeDescriptor());
    expect(state.mp.passes.image.ch[0]).toBe('bufA');
  });

  it('unwired image channels remain null', () => {
    stImportMultipass(makeDescriptor());
    expect(state.mp.passes.image.ch[1]).toBeNull();
    expect(state.mp.passes.image.ch[2]).toBeNull();
    expect(state.mp.passes.image.ch[3]).toBeNull();
  });

  it('disables previously enabled passes not in the descriptor', () => {
    mpEnablePass('bufB');
    stImportMultipass(makeDescriptor()); // only bufA
    expect(state.mp.passes.bufB.enabled).toBe(false);
  });

  it('wires inter-buffer channels from channelMap', () => {
    const d = makeDescriptor({
      buffers: [
        {
          appId: 'bufA',
          code: 'void mainImage(out vec4 O, vec2 C) {}',
          channelMap: new Map(),
        },
        {
          appId: 'bufB',
          code: 'void mainImage(out vec4 O, vec2 C) {}',
          channelMap: new Map([[0, 'bufA']]),
        },
      ],
      imageChannelMap: new Map([[0, 'bufB']]),
    });
    stImportMultipass(d);
    expect(state.mp.passes.bufB.ch[0]).toBe('bufA');
  });

  it('ignores imageChannelMap entries pointing to a disabled pass', () => {
    const d = makeDescriptor({
      imageChannelMap: new Map([[0, 'bufC']]), // bufC not in buffers
    });
    stImportMultipass(d);
    // bufC is not enabled so image ch[0] must be null
    expect(state.mp.passes.image.ch[0]).toBeNull();
  });
});
