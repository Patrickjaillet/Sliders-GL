// Media channels — image, cubemap, webcam, video loading

import * as THREE from 'three';
import { compressAndCacheTexture, getActiveFormat } from '../render/texture-compressor.js';
import { state } from '../core/state.js';
import { toast } from '../io/actions.js';
import { chClear, updateChannelUniform, applyWrap } from './channels-core.js';
import { drawCubemapPreview } from './channels-ui.js';

export function chLoadImageFile(i, input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';

  // Phase 22.3 — try native GPU compressed texture first
  if (getActiveFormat() !== 'none') {
    compressAndCacheTexture(file, file.name).then(result => {
      if (result.compressed) {
        _chLoadCompressedTexture(i, result, file.name);
      } else {
        chLoadImageURL(i, result.url, file.name);
      }
    }).catch(() => {
      chLoadImageURL(i, URL.createObjectURL(file), file.name);
    });
  } else {
    chLoadImageURL(i, URL.createObjectURL(file), file.name);
  }
}

/**
 * Charge une texture compressée GPU (BC7 / ASTC / ETC2) directement via WebGL.
 * Contourne le chemin de décodage CPU de Three.js.
 *
 * @param {number} i
 * @param {import('../render/texture-compressor.js').CompressResult} result
 * @param {string} name
 */
async function _chLoadCompressedTexture(i, result, name) {
  const { format, data, width, height } = result;
  const renderer = state.renderer3;
  if (!renderer) {
    chLoadImageURL(i, URL.createObjectURL(new Blob([data])), name);
    return;
  }
  const gl = renderer.getContext();

  const COMPRESSED_FORMATS = {
    bc7: () => {
      const ext = gl.getExtension('EXT_texture_compression_bptc');
      return ext ? ext.COMPRESSED_RGBA_BPTC_UNORM_EXT : null;
    },
    astc: () => {
      const ext = gl.getExtension('WEBGL_compressed_texture_astc');
      return ext ? ext.COMPRESSED_RGBA_ASTC_4x4_KHR : null;
    },
    etc2: () => {
      const ext = gl.getExtension('WEBGL_compressed_texture_etc');
      return ext ? ext.COMPRESSED_RGBA8_ETC2_EAC : null;
    },
  };

  const glFormat = COMPRESSED_FORMATS[format]?.();
  if (!glFormat) {
    chLoadImageURL(i, URL.createObjectURL(new Blob([data])), name);
    return;
  }

  const glTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, glTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.compressedTexImage2D(gl.TEXTURE_2D, 0, glFormat, width, height, 0, new Uint8Array(data));
  gl.bindTexture(gl.TEXTURE_2D, null);

  // Wrap the raw GL texture in a THREE.Texture shell
  const tex = new THREE.Texture();
  const props = renderer.properties.get(tex);
  props.__webglTexture = glTex;
  props.__webglInit = true;
  tex.image = { width, height };
  tex.format = THREE.RGBAFormat;
  tex.needsUpdate = false;

  if (state.channels[i].texture) state.channels[i].texture.dispose();
  state.channels[i].texture = tex;
  applyWrap(state.channels[i]);
  state.channels[i].status = 'ok';
  const label = (name.length > 28 ? name.slice(-25) + '\u2026' : name) + ` [${format.toUpperCase()}]`;
  state.channels[i].statusMsg = label;
  updateChannelUniform(i);
  state.callbacks.renderChannelUI?.(i);
  toast(`iChannel${i}: ${format.toUpperCase()} texture loaded`, 'ok');
}

export function chLoadURL(i) {
  const url = (document.getElementById('ch-url-' + i)?.value || '').trim();
  if (!url) return;
  chLoadImageURL(i, url, url);
}

export function chLoadImageURL(i, url, name) {
  const loader = new THREE.TextureLoader();
  loader.crossOrigin = 'anonymous';
  state.channels[i].statusMsg = 'Loading…';
  state.callbacks.renderChannelUI?.(i);
  loader.load(url, tex => {
    if (state.channels[i].texture) state.channels[i].texture.dispose();
    state.channels[i].texture = tex;
    applyWrap(state.channels[i]);
    state.channels[i].status = 'ok';
    state.channels[i].statusMsg = name.length > 30 ? name.slice(-27) + '…' : name;
    updateChannelUniform(i);
    state.callbacks.renderChannelUI?.(i);
    toast(`iChannel${i}: image loaded`, 'ok');
  }, undefined, () => {
    state.channels[i].status = 'err';
    state.channels[i].statusMsg = 'Failed to load';
    state.callbacks.renderChannelUI?.(i);
    toast(`iChannel${i}: load failed`, 'err');
  });
}

export function chLoadCubeFiles(i, input) {
  const files = Array.from(input.files || []);
  if (files.length < 6) {
    toast('Select 6 images for cubemap faces', 'warn');
    return;
  }
  chLoadCubemap(i, files.slice(0, 6));
  input.value = '';
}

function chLoadCubemap(i, files) {
  const urls = files.map(f => URL.createObjectURL(f));
  const loader = new THREE.CubeTextureLoader();
  state.channels[i].statusMsg = 'Loading cubemap…';
  state.channels[i].type = 'cubemap';
  state.callbacks.renderChannelUI?.(i);
  loader.load(urls, tex => {
    if (state.channels[i].cubeTexture) state.channels[i].cubeTexture.dispose();
    state.channels[i].cubeTexture = tex;
    state.channels[i].texture = tex;
    state.channels[i].cubeFaces = urls;
    state.channels[i].status = 'ok';
    state.channels[i].statusMsg = 'Cubemap active';
    updateChannelUniform(i);
    state.callbacks.renderChannelUI?.(i);
    drawCubemapPreview(i);
    toast(`iChannel${i}: cubemap loaded`, 'ok');
  }, undefined, err => {
    urls.forEach(u => {
      if (u.startsWith('blob:')) {
        try { URL.revokeObjectURL(u); } catch (e2) { }
      }
    });
    state.channels[i].status = 'err';
    state.channels[i].statusMsg = 'Cubemap failed: ' + (err?.message || 'load error');
    state.callbacks.renderChannelUI?.(i);
    toast(`iChannel${i}: cubemap failed`, 'err');
  });
}

export function chStartWebcam(i) {
  chClear(i, false);
  state.channels[i].type = 'webcam';
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.play();
      const tex = new THREE.VideoTexture(video);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      state.channels[i].videoEl = video;
      state.channels[i].videoTexture = tex;
      state.channels[i].texture = tex;
      state.channels[i].status = 'ok';
      state.channels[i].statusMsg = 'Webcam active';
      updateChannelUniform(i);
      state.callbacks.renderChannelUI?.(i);
      toast(`iChannel${i}: webcam active`, 'ok');
    })
    .catch(err => {
      state.channels[i].status = 'err';
      state.channels[i].statusMsg = 'Camera denied: ' + err.message;
      state.callbacks.renderChannelUI?.(i);
      toast('Camera access denied', 'err');
    });
}

export function chLoadVideoFile(i, input) {
  const file = input.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.loop = true;
  video.muted = true;
  video.autoplay = true;
  video.play();
  const tex = new THREE.VideoTexture(video);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (state.channels[i].flipY) tex.flipY = true;
  state.channels[i].videoEl = video;
  state.channels[i].videoTexture = tex;
  state.channels[i].texture = tex;
  state.channels[i].status = 'ok';
  state.channels[i].statusMsg = file.name.length > 28 ? file.name.slice(-25) + '…' : file.name;
  updateChannelUniform(i);
  state.callbacks.renderChannelUI?.(i);
  toast(`iChannel${i}: video loaded`, 'ok');
  input.value = '';
}

// F-9.4 — video playback controls: rate, in/out points, ping-pong, sync to iTime
let _videoPingPong = {}; // {chIdx: { dir: 1|-1 }}
export function chVideoSetPlayback(i, opts = {}) {
  const ch = state.channels[i];
  const video = ch?.videoEl;
  if (!video) return;

  if (opts.rate !== undefined) {
    video.playbackRate = Math.max(0.1, Math.min(16, Number(opts.rate) || 1));
    ch.videoRate = video.playbackRate;
  }
  if (opts.inPoint !== undefined)  ch.videoInPoint  = Math.max(0, Math.min(video.duration || 0, Number(opts.inPoint)));
  if (opts.outPoint !== undefined) ch.videoOutPoint = Math.max(0, Math.min(video.duration || 0, Number(opts.outPoint)));
  if (opts.mode !== undefined) {
    ch.videoMode = opts.mode;
    if (opts.mode === 'ping-pong') {
      _videoPingPong[i] = { dir: 1 };
    } else {
      delete _videoPingPong[i];
      video.loop = opts.mode !== 'once';
    }
  }
  if (opts.syncToTime) {
    // Seek to position in iTime-modulo-duration
    const dur = video.duration || 1;
    video.currentTime = (state.simTime ?? 0) % dur;
    video.pause();
    ch.videoSyncToTime = true;
  } else if (opts.syncToTime === false) {
    ch.videoSyncToTime = false;
    video.play();
  }
}

// Called from raf-loop per-frame to handle ping-pong and sync modes
export function _tickVideoChannels() {
  state.channels.forEach((ch, i) => {
    const video = ch?.videoEl;
    if (!video) return;

    // Ping-pong mode
    if (_videoPingPong[i]) {
      const inPt  = ch.videoInPoint  ?? 0;
      const outPt = ch.videoOutPoint ?? (video.duration || 1);
      if (video.currentTime >= outPt) {
        _videoPingPong[i].dir = -1;
        video.playbackRate = Math.abs(video.playbackRate);
      } else if (video.currentTime <= inPt) {
        _videoPingPong[i].dir = 1;
        video.playbackRate = Math.abs(video.playbackRate);
      }
      // playbackRate can't be negative in HTML5 video — use currentTime instead
      if (_videoPingPong[i].dir === -1) {
        video.currentTime = Math.max(inPt, video.currentTime - 0.033);
      }
    }

    // In/out point loop (non-ping-pong)
    if (!_videoPingPong[i] && ch.videoInPoint !== undefined && ch.videoOutPoint !== undefined) {
      if (video.currentTime >= ch.videoOutPoint) {
        video.currentTime = ch.videoInPoint;
      }
    }

    // Sync to iTime
    if (ch.videoSyncToTime) {
      const dur = video.duration || 1;
      video.currentTime = (state.simTime ?? 0) % dur;
    }
  });
}

export function chLoadKTX2CubeFile(i, input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const ch = state.channels[i];
  ch.statusMsg = 'Loading\u2026';
  ch.status = '';
  state.callbacks.renderChannelUI?.(i);

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const buf = /** @type {ArrayBuffer} */ (e.target.result);
      const view = new DataView(buf);

      const KTX2_MAGIC = [0xAB,0x4B,0x54,0x58,0x20,0x32,0x30,0xBB,0x0D,0x0A,0x1A,0x0A];
      for (let b = 0; b < 12; b++) {
        if (view.getUint8(b) !== KTX2_MAGIC[b]) throw new Error('Not a valid KTX2 file');
      }

      const vkFormat           = view.getUint32(12, true);
      const typeSize           = view.getUint32(16, true);
      const pixelWidth         = view.getUint32(20, true);
      const pixelHeight        = view.getUint32(24, true);
      const pixelDepth         = view.getUint32(28, true);
      const layerCount         = view.getUint32(32, true);
      const faceCount          = view.getUint32(36, true);
      const supercompression   = view.getUint32(44, true);

      if (faceCount !== 6) throw new Error('KTX2 file does not contain a cubemap (faceCount=' + faceCount + ')');
      if (pixelDepth > 1)  throw new Error('KTX2 3-D textures are not supported here; use the volume channel type');
      if (supercompression !== 0) throw new Error('KTX2 supercompression scheme ' + supercompression + ' is not supported. Export with --no_compress / supercompression=none');

      const SUPPORTED_FORMATS = {
        37: { threeFormat: THREE.RGBAFormat, channels: 4, label: 'RGBA8' },
        23: { threeFormat: THREE.RGBAFormat, channels: 4, label: 'RGBA8_SRGB' },
        9:  { threeFormat: THREE.RGBAFormat, channels: 4, label: 'RGBA8_UNORM' },
      };
      const VK_FORMAT_R8G8B8A8_UNORM  = 37;
      const VK_FORMAT_R8G8B8A8_SRGB   = 43;
      const VK_FORMAT_R8G8B8A8_SNORM  = 38;
      const VK_FORMAT_B8G8R8A8_UNORM  = 44;
      const VK_FORMAT_R8G8B8_UNORM    = 23;
      const VK_FORMAT_R8G8B8_SRGB     = 29;

      const RGBA8_FORMATS = new Set([VK_FORMAT_R8G8B8A8_UNORM, VK_FORMAT_R8G8B8A8_SRGB, VK_FORMAT_R8G8B8A8_SNORM]);
      const RGB8_FORMATS  = new Set([VK_FORMAT_R8G8B8_UNORM, VK_FORMAT_R8G8B8_SRGB]);
      const BGRA8_FORMATS = new Set([VK_FORMAT_B8G8R8A8_UNORM]);

      const isRGBA  = RGBA8_FORMATS.has(vkFormat);
      const isRGB   = RGB8_FORMATS.has(vkFormat);
      const isBGRA  = BGRA8_FORMATS.has(vkFormat);

      if (!isRGBA && !isRGB && !isBGRA) {
        throw new Error('Unsupported vkFormat ' + vkFormat + '. Supported: RGBA8, RGB8, BGRA8 uncompressed');
      }

      const dfdOffset    = view.getUint32(60, true);
      const kvdOffset    = view.getUint32(68, true);
      const sgdOffset    = view.getBigUint64(76, true);

      const levelIndexOffset = 80;
      const levelByteOffset  = view.getBigUint64(levelIndexOffset + 0,  true);
      const levelByteLength  = view.getBigUint64(levelIndexOffset + 8,  true);

      const faceByteLength = isRGB
        ? pixelWidth * pixelHeight * 3
        : pixelWidth * pixelHeight * 4;

      const numLayers = Math.max(1, layerCount);
      const raw = new Uint8Array(buf, Number(levelByteOffset), Number(levelByteLength));

      const faceBlobs = [];
      for (let face = 0; face < 6; face++) {
        const faceOffset = face * faceByteLength;
        const faceRaw = raw.subarray(faceOffset, faceOffset + faceByteLength);
        const rgba = new Uint8ClampedArray(pixelWidth * pixelHeight * 4);

        if (isRGB) {
          for (let p = 0; p < pixelWidth * pixelHeight; p++) {
            rgba[p * 4 + 0] = faceRaw[p * 3 + 0];
            rgba[p * 4 + 1] = faceRaw[p * 3 + 1];
            rgba[p * 4 + 2] = faceRaw[p * 3 + 2];
            rgba[p * 4 + 3] = 255;
          }
        } else if (isBGRA) {
          for (let p = 0; p < pixelWidth * pixelHeight; p++) {
            rgba[p * 4 + 0] = faceRaw[p * 4 + 2];
            rgba[p * 4 + 1] = faceRaw[p * 4 + 1];
            rgba[p * 4 + 2] = faceRaw[p * 4 + 0];
            rgba[p * 4 + 3] = faceRaw[p * 4 + 3];
          }
        } else {
          rgba.set(faceRaw);
        }

        const imgData = new ImageData(rgba, pixelWidth, pixelHeight);
        const canvas = new OffscreenCanvas(pixelWidth, pixelHeight);
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imgData, 0, 0);
        faceBlobs.push(canvas.convertToBlob({ type: 'image/png' }));
      }

      Promise.all(faceBlobs).then(blobs => {
        const urls = blobs.map(b => URL.createObjectURL(b));
        const loader = new THREE.CubeTextureLoader();
        loader.load(urls, tex => {
          if (ch.cubeTexture) ch.cubeTexture.dispose();
          ch.cubeTexture = tex;
          ch.texture = tex;
          ch.cubeFaces = urls;
          ch.status = 'ok';
          ch.statusMsg = file.name.length > 26 ? file.name.slice(-23) + '\u2026' : file.name;
          updateChannelUniform(i);
          state.callbacks.renderChannelUI?.(i);
          drawCubemapPreview(i);
          toast('iChannel' + i + ': KTX2 cubemap ' + pixelWidth + '\xd7' + pixelHeight, 'ok');
        }, undefined, err2 => {
          urls.forEach(u => { try { URL.revokeObjectURL(u); } catch(_) {} });
          ch.status = 'err';
          ch.statusMsg = 'CubeTexture load failed: ' + (err2?.message || '');
          state.callbacks.renderChannelUI?.(i);
          toast('iChannel' + i + ': cubemap build failed', 'err');
        });
      });

    } catch (err) {
      ch.status = 'err';
      ch.statusMsg = err.message || 'Parse error';
      state.callbacks.renderChannelUI?.(i);
      toast('iChannel' + i + ': KTX2 load failed', 'err');
    }
  };
  reader.onerror = () => {
    ch.status = 'err';
    ch.statusMsg = 'Read error';
    state.callbacks.renderChannelUI?.(i);
    toast('iChannel' + i + ': read error', 'err');
  };
  reader.readAsArrayBuffer(file);
}
