/**
 * src/import/local-file-import.test.js  — Phase 18.2
 *
 * Tests unitaires Vitest pour le module d'import de fichiers locaux.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyShaderFile } from './local-file-import.js';

vi.mock('../core/state.js', () => ({
  state: { editor: null, mat3: { uniforms: {} } },
}));

vi.mock('../io/actions.js', () => ({
  toast: vi.fn(),
  applyAndParse: vi.fn(),
}));

vi.mock('../gl/renderer.js', () => ({
  applyGLShader: vi.fn(),
}));

vi.mock('../io/library.js', () => ({
  applyImportedPreset: vi.fn(),
}));

import { toast } from '../io/actions.js';
import { applyGLShader } from '../gl/renderer.js';
import { state } from '../core/state.js';
import { applyImportedPreset } from '../io/library.js';

function _mockEditor(value = '') {
  return {
    getValue: vi.fn(() => value),
    setValue: vi.fn(),
  };
}

describe('applyShaderFile — extensions shader', () => {
  beforeEach(() => {
    state.editor = _mockEditor();
    vi.clearAllMocks();
  });

  const SHADER_EXTENSIONS = ['glsl', 'frag', 'vert'];

  for (const ext of SHADER_EXTENSIONS) {
    it(`charge un fichier .${ext} dans l'éditeur`, () => {
      const src = `void mainImage(out vec4 f, vec2 u){}`;
      applyShaderFile(src, `shader.${ext}`);
      expect(state.editor.setValue).toHaveBeenCalledWith(src);
      expect(toast).toHaveBeenCalledWith(expect.stringContaining(`shader.${ext}`), 'ok');
    });
  }

  it('affiche un toast d\'erreur pour une extension inconnue', () => {
    applyShaderFile('code', 'shader.xyz');
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('.xyz'), 'warn');
  });

  it('utilise applyGLShader si pas d\'éditeur', async () => {
    state.editor = null;
    applyShaderFile('void mainImage(out vec4 f, vec2 u){}', 'test.glsl');
    await new Promise(r => setTimeout(r, 20));
    expect(applyGLShader).toHaveBeenCalled();
  });
});

describe('applyShaderFile — JSON Z-GL preset', () => {
  beforeEach(() => {
    state.editor = _mockEditor();
    vi.clearAllMocks();
  });

  it('reconnaît un preset Z-GL (a id + code)', async () => {
    const preset = { id: 'user-123', code: 'void mainImage(){}', name: 'Test' };
    applyShaderFile(JSON.stringify(preset), 'preset.json');
    await new Promise(r => setTimeout(r, 20));
    expect(applyImportedPreset).toHaveBeenCalledWith(preset);
  });

  it('affiche un toast si le JSON est invalide', () => {
    applyShaderFile('{not json', 'bad.json');
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('invalide'), 'err');
  });

  it('affiche un toast si le JSON n\'est ni Shadertoy ni Z-GL', () => {
    applyShaderFile(JSON.stringify({ foo: 'bar' }), 'unknown.json');
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('non reconnu'), 'warn');
  });
});

describe('applyShaderFile — JSON Shadertoy', () => {
  beforeEach(() => {
    state.editor = _mockEditor();
    vi.clearAllMocks();
  });

  it('applique la passe image d\'un JSON Shadertoy', () => {
    const shaderJson = {
      Shader: {
        info: { name: 'My Shader' },
        renderpass: [
          { type: 'image', code: 'void mainImage(out vec4 f, vec2 u){ f=vec4(1); }' },
        ],
      },
    };
    applyShaderFile(JSON.stringify(shaderJson), 'shader.json');
    expect(state.editor.setValue).toHaveBeenCalledWith(
      expect.stringContaining('mainImage')
    );
  });

  it('reconnaît le format sans propriété Shader (export direct)', () => {
    const shaderJson = {
      info: { name: 'Direct' },
      renderpass: [
        { type: 'image', code: 'void mainImage(out vec4 f, vec2 u){ f=vec4(0.5); }' },
      ],
    };
    applyShaderFile(JSON.stringify(shaderJson), 'direct.json');
    expect(state.editor.setValue).toHaveBeenCalled();
  });

  it('affiche un avertissement si aucune passe image trouvée', () => {
    const shaderJson = { Shader: { renderpass: [] } };
    applyShaderFile(JSON.stringify(shaderJson), 'empty.json');
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('image'), 'warn');
  });
});

describe('extensions drop navigateur', () => {
  it('reconnaît .glsl/.frag/.vert comme extensions shader', () => {
    const ext = (name) => name.split('.').pop()?.toLowerCase() ?? '';
    const SHADER_EXTS = new Set(['glsl','frag','vert']);
    expect(SHADER_EXTS.has(ext('my.glsl'))).toBe(true);
    expect(SHADER_EXTS.has(ext('my.frag'))).toBe(true);
    expect(SHADER_EXTS.has(ext('my.vert'))).toBe(true);
    expect(SHADER_EXTS.has(ext('my.py'))).toBe(false);
  });
});

describe('importZipFile — détection format', () => {
  it('retourne une erreur si l\'entrée n\'est pas un zip', async () => {
    const { importZipFile } = await import('./local-file-import.js');
    const fakeFile = new File(['content'], 'shader.glsl', { type: 'text/plain' });
    await importZipFile(fakeFile);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('ZIP'), 'err');
  });
});
