/// <reference types="vite/client" />

// Vite ?worker imports
declare module '*?worker' {
  const WorkerConstructor: new () => Worker;
  export default WorkerConstructor;
}

// ── External modules without type declarations ─────────────────────────────────
declare module '@tauri-apps/plugin-fs' { const v: any; export = v; export default v; }
declare module '@tauri-apps/api/window' {
  export const appWindow: any;
  export class WebviewWindow { constructor(...args: any[]); [key: string]: any; }
  export default appWindow;
}
declare module '@tauri-apps/api/tauri' {
  export function invoke(cmd: string, args?: any): Promise<any>;
  export default invoke;
}
declare module '/wasm/openvdb.js' { const v: any; export = v; export default v; }

// ── ImportMeta augmentation ────────────────────────────────────────────────────
interface ImportMeta {
  _actionsCache?: any;
}

// ── Monaco Editor (UMD global + window property) ───────────────────────────────
declare const monaco: any;

// ── Three.js global (some files reference THREE without import) ────────────────
declare const THREE: any;

// ── WebGPU global constants (older TS lib versions don't include them) ────────
declare const GPUBufferUsage: { [key: string]: number };
declare const GPUShaderStage: { [key: string]: number };
declare const GPUTextureUsage: { [key: string]: number };
declare const GPUMapMode: { [key: string]: number };
declare const GPUColorWrite: { [key: string]: number };
declare const GPUVertexStepMode: { [key: string]: string };
declare const GPUPrimitiveTopology: { [key: string]: string };
declare const GPUCompareFunction: { [key: string]: string };
declare const GPULoadOp: { [key: string]: string };
declare const GPUStoreOp: { [key: string]: string };
declare const GPUIndexFormat: { [key: string]: string };
declare const GPUTextureFormat: { [key: string]: string };
declare const GPUSamplerBindingType: { [key: string]: string };

// ── Cross-module names referenced without explicit imports ─────────────────────
declare function glslToWGSLReport(src: string, opts?: any): any;
declare const populateBatchPresetList: (...args: any[]) => void;
declare const closePanel: (...args: any[]) => void;
declare const _renderList: any[];
declare const _lutDefs: any[];
declare const _initFrameDelayBuffer: (...args: any[]) => void;
declare const state: any;

// ── JSDoc type aliases referenced across multiple files ────────────────────────
interface GraphInstance { [key: string]: any }
interface NodeInstance { [key: string]: any }
interface ConnInstance { [key: string]: any }
interface UVHeatmapResult { [key: string]: any }
interface InstructionHeatmapResult { [key: string]: any }
interface BranchHeatmapResult { [key: string]: any }
interface GLCaps { [key: string]: any }
interface ISFInput { [key: string]: any }
interface SliderDef { [key: string]: any }
interface ParsedEntry { [key: string]: any }
interface ExportValue { [key: string]: any }

// ── Window / global augmentation ──────────────────────────────────────────────
interface Window {
  // Tauri v2 bridge
  __TAURI__?: {
    event?: {
      listen(event: string, cb: (e: any) => void): Promise<() => void>;
      emit(event: string, payload?: any): Promise<void>;
    };
    invoke?(cmd: string, args?: any): Promise<any>;
    convertFileSrc?(path: string, protocol?: string): string;
    [key: string]: any;
  };
  // Browser vendor / non-standard APIs
  webkitAudioContext?: typeof AudioContext;
  GazeCloudAPI?: any;
  midiOutputAddMap?: any;
  midiOutputDeleteMap?: any;
  _motionHandlerRef?: ((e: any) => void) | null;
  // Internal Sliders GL state attached to window
  _zglSensors?: any;
  _zglHwCbs?: any;
  // Open index signature — many Sliders GL subsystems attach named callbacks to window
  [key: string]: any;
}

// ── Navigator augmentation ────────────────────────────────────────────────────
interface Navigator {
  serial?: any;
  bluetooth?: any;
  hid?: any;
  getGamepads?(): (Gamepad | null)[];
}

// ── DeviceMotionEvent augmentation (iOS requestPermission) ────────────────────
interface DeviceMotionEventStatic {
  requestPermission?(): Promise<string>;
}
declare const DeviceMotionEvent: { new(...args: any[]): DeviceMotionEvent } & DeviceMotionEventStatic;

// ── HTMLElement augmentation ───────────────────────────────────────────────────
interface HTMLElement {
  // Input / form element properties
  value?: string;
  disabled?: boolean;
  placeholder?: string;
  checked?: boolean;
  indeterminate?: boolean;
  files?: FileList | null;
  readOnly?: boolean;
  multiple?: boolean;
  accept?: string;
  type?: string;
  min?: string;
  max?: string;
  step?: string;
  selectedIndex?: number;
  options?: HTMLOptionsCollection;
  name?: string;
  // Link / image
  src?: string;
  href?: string;
  // Media element
  srcObject?: MediaStream | null;
  muted?: boolean;
  playsInline?: boolean;
  play?(): Promise<void>;
  pause?(): void;
  // Canvas / dimensions
  width?: number;
  height?: number;
  getContext?(contextId: string, options?: any): any;
  captureStream?(frameRate?: number): MediaStream;
  // Custom Sliders GL properties attached at runtime
  _monacoEditor?: any;
  _zglSensors?: any;
  _toastTimer?: ReturnType<typeof setTimeout>;
  _built?: boolean;
  _to?: any;
  _slBound?: boolean;
  _showWord?: any;
  _focusSearch?: any;
}

// ── Element augmentation ───────────────────────────────────────────────────────
interface Element {
  style?: CSSStyleDeclaration;
  onclick?: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
  oninput?: ((this: GlobalEventHandlers, ev: Event) => any) | null;
  onchange?: ((this: GlobalEventHandlers, ev: Event) => any) | null;
  focus?(): void;
  blur?(): void;
  click?(): void;
  disabled?: boolean;
  checked?: boolean;
  value?: string;
  readOnly?: boolean;
  min?: string;
  max?: string;
  title?: string;
  type?: string;
  files?: FileList | null;
  dataset?: DOMStringMap;
  getContext?(contextId: string, options?: any): any;
  requestVideoFrameCallback?(callback: (now: number, metadata: any) => void): number;
  offsetWidth?: number;
  offsetHeight?: number;
}

// ── EventTarget augmentation ───────────────────────────────────────────────────
interface EventTarget {
  // FileReader / IDBRequest results
  result?: any;
  error?: DOMException | null;
  value?: any;
  // DOM element shortcuts often accessed via event.target
  id?: string;
  checked?: boolean;
  textContent?: string | null;
  tagName?: string;
  blur?(): void;
  files?: FileList | null;
  closest?(selector: string): Element | null;
  matches?(selector: string): boolean;
  name?: string;
  type?: string;
}

// ── WebGL2 augmentation ───────────────────────────────────────────────────────
interface WebGL2RenderingContext {
  TEXTURE_3D: number;
  MAX_SAMPLES: number;
}
interface WebGLRenderingContext {
  MAX_SAMPLES?: number;
}

// ── OffscreenCanvas / HTMLCanvasElement union helpers ─────────────────────────
interface OffscreenCanvas {
  parentNode?: Node | null;
  toBlob?(callback: BlobCallback, type?: string, quality?: any): void;
}

// ── Build-time constants (see vite.config.js define block) ───────────────────
declare const __APP_VERSION__: string;
