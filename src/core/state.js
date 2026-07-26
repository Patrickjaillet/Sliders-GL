
import { safeLocalGet } from './utils.js';

// Legacy multipass state shape, reduced to the single surviving "Image" pass
// (bufA–D, cubeA/B, sound, compA/B were removed with the multi-pass system —
// roadmap sections 1–10). `passes.image` / `active` are still read by
// shader-summary.js, editor.js, hover-inspector.js and inspector-context.js,
// so the shape is kept rather than flattened.
function createInitialMultipassState() {
  return {
    passes: {
      image: { code: '', enabled: true, rt: null, mat: null, ch: [null, null, null, null], chBlend: ['normal','normal','normal','normal'] },
    },
    active: 'image',
  };
}

export const state = {

  currentCode: '',
  editor: null,

  renderer3: null,
  scene3: null,
  cam3: null,
  mat3: null,

  fidx: 0,
  fcount: 0,
  ftimer: 0,
  simTime: 0,
  paused: false,
  lastTs: (typeof performance !== 'undefined') ? performance.now() : 0,

  mesh3: null,

  changeDebounce: null,

  varMap: {},
  vars: [],
  defaultValues: {},
  parseWarnings: [],
  pinnedIds: new Set(),

  callbacks: {
    onBuildUI: null,
  },

  mp: createInitialMultipassState(),

  ai: {
    modelId:      null,
    ready:        false,
    loading:      false,
    loadProgress: 0,
    panelOpen:    false,
  },

  hlslEditMode: false,

  viewportFullscreen: false,

  // Phase 20.1 — Workspace multi-projets (données partagées par workspace-manager.js
  // et shader-library-panel.js)
  activeProjectId:   null,
  activeProjectName: null,

  activePresetId: null,

  // Fix 1.5 — timeline was set dynamically by init.js setTimeline() callback but
  // never declared here, causing JSON.stringify to silently drop it on first export.
  timeline: {},

  modalsOpen: {
    st: false,
    save: false,
    confirm: false,
    wizard: false,
    export: false,
  },
};

if (import.meta.env.DEV) {
  state.callbacks = new Proxy(state.callbacks, {
    set(target, key, value) {
      if (value !== null && typeof value !== 'function') {
        console.error(`[state.callbacks] "${String(key)}" must be a function or null, got ${typeof value}`);
        return false;
      }
      target[key] = value;
      return true;
    },
    get(target, key) {
      if (key === Symbol.toStringTag || key === 'constructor') return target[key];
      // onBuildUI is intentionally optional (future MIDI hook) — skip warning for it.
      const OPTIONAL_CALLBACKS = new Set(['onBuildUI']);
      if (key in target && target[key] === null && typeof key === 'string' && !OPTIONAL_CALLBACKS.has(key)) {
        console.warn(`[state.callbacks.${key}] accessed before registration — callback is null`);
      }
      return target[key];
    }
  });
}

const subscribers = {};

export function subscribe(key, callback) {
  if (!subscribers[key]) subscribers[key] = [];
  subscribers[key].push(callback);
  return () => {
    if (subscribers[key]) {
      subscribers[key] = subscribers[key].filter(cb => cb !== callback);
    }
  };
}

export function notify(key, value) {
  if (!subscribers[key] || subscribers[key].length === 0) return;
  const snapshot = subscribers[key].slice();
  for (const cb of snapshot) {
    try {
      cb(value);
    } catch (err) {
      console.error(`[notify] callback error for key "${key}":`, err);
    }
  }
}

const _pending = new Map();

/**
 * Set a state value and schedule a batched notification on the next microtask.
 *
 * INTENTIONAL BEHAVIOUR (item 3.14 — documented, not a bug):
 * If `setStateBatched('foo', A)` and `setStateBatched('foo', B)` are called
 * within the same microtask, only the LAST value (B) is notified.
 * Intermediate values are silently dropped. This is the debouncing contract:
 * - The state field is updated immediately (synchronously) on every call.
 * - The *notification* (subscriber callbacks) fires once per microtask per path,
 *   using the latest value at flush time.
 * Do NOT use this if you need every intermediate value delivered to subscribers.
 * Use `setState()` instead for immediate per-call notifications.
 *
 * @param {string} path  Dot-separated state path, e.g. 'perf.fps'
 * @param {*}      value New value
 */
export function setStateBatched(path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  let obj = state;
  for (const key of keys) {
    obj = obj[key];
  }
  obj[lastKey] = value;

  if (!_pending.has(path)) {
    _pending.set(path, value);
    queueMicrotask(() => {
      for (const [k, v] of _pending) {
        notify(k, v);
      }
      _pending.clear();
    });
  } else {
    // Overwrite — the microtask already queued will use this latest value.
    _pending.set(path, value);
  }
}

export function getState(path) {
  return path.split('.').reduce((obj, key) => obj?.[key], state);
}

export function setState(path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const obj = keys.reduce((acc, key) => acc[key], state);
  obj[lastKey] = value;
  notify(path, value);
}
