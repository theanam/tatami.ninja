import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { geometryBounds } from '../engine/geom';
import { defaultTextSpec, layoutText, loadFont } from './lettering';
import { addUserFont, userFontEntries } from './userFonts';

const fontFile = (name: string, as = name) => {
  const buf = readFileSync(resolve(__dirname, '../../public/lettering', name));
  return new File([buf], as, { type: 'font/ttf' });
};

describe('user fonts', () => {
  it('adds a font file, lists it, and letters with it', async () => {
    const entry = await addUserFont(fontFile('pacifico.ttf', 'MyScript.ttf'));
    expect(entry.id).toBe('user:pacifico');
    expect(entry.family).toBe('Pacifico');
    expect((await userFontEntries()).map((e) => e.id)).toContain('user:pacifico');
    const font = await loadFont('user:pacifico');
    const g = layoutText(font, { ...defaultTextSpec(0, 0, 'Hi'), font: 'user:pacifico' });
    expect(geometryBounds(g)).not.toBeNull();
  });

  it('rejects files that are not fonts', async () => {
    await expect(addUserFont(new File([new Uint8Array([1, 2, 3, 4])], 'nope.ttf'))).rejects.toThrow(/not a font/);
  });
});
