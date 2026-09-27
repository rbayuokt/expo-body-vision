/**
 * @jest-environment node
 */
import * as fs from 'fs';
import * as path from 'path';

import * as shaders from '../effects/shaders';

// Skia's web build compiles the same SkSL, so a broken shader fails here instead of on a phone.
// The Expo jest setup swaps in a TextDecoder without utf-16le, which CanvasKit needs.
globalThis.TextDecoder = require('util').TextDecoder;
const CanvasKitInit = require('canvaskit-wasm/bin/canvaskit.js');
const bin = path.dirname(require.resolve('canvaskit-wasm/bin/canvaskit.wasm'));

describe('effect shaders', () => {
  it('all compile', async () => {
    const CK = await CanvasKitInit({ locateFile: (f: string) => path.join(bin, f) });
    for (const [name, source] of Object.entries(shaders)) {
      let error = '';
      const effect = CK.RuntimeEffect.Make(source, (e: string) => (error = e));
      expect({ name, error, ok: !!effect }).toEqual({ name, error: '', ok: true });
    }
  });

  it('the README example compiles', async () => {
    const readme = fs.readFileSync(path.join(__dirname, '../../README.md'), 'utf8');
    const source = readme.match(/shader: `([\s\S]*?)`,/)?.[1] ?? '';
    const CK = await CanvasKitInit({ locateFile: (f: string) => path.join(bin, f) });
    expect(CK.RuntimeEffect.Make(source)).toBeTruthy();
  });
});
