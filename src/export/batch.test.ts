import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readStitchFile } from '../formats';
import { defaultTextSpec, layoutText, loadFont, makeTextObject } from '../importers/lettering';
import sample from '../model/harbor-club-badge.tatami.json';
import type { Project } from '../model/types';
import { batchFiles, parseNames } from './batch';

const diskFetch = async (url: string) => {
  const buf = readFileSync(resolve(__dirname, '../../public/lettering', url.split('/').pop()!));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

describe('batch names', () => {
  it('reads a list: trims, drops blanks and repeats', () => {
    expect(parseNames(' Ava \n\nNoah\r\nAva\nMia ')).toEqual(['Ava', 'Noah', 'Mia']);
  });

  it('makes one file per name with that name stitched', async () => {
    const font = await loadFont('geist', diskFetch);
    const spec = defaultTextSpec(0, 0, 'NAME');
    const text = makeTextObject(spec, layoutText(font, spec), 't1');
    const p = { ...(JSON.parse(JSON.stringify(sample)) as Project), objects: [text] };
    const files = await batchFiles(p, text.id, ['Al', 'Maximilian', 'Al!'], 'DST', 'shirt', diskFetch);
    expect(files.map((f) => f.name)).toEqual(['shirt-al.dst', 'shirt-maximilian.dst', 'shirt-al-2.dst']);
    const count = (d: Uint8Array) => readStitchFile('x.dst', d).cmds.length;
    expect(count(files[1].data)).toBeGreaterThan(count(files[0].data) * 2);
  });
});
