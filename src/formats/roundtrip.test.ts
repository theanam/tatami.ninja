import { describe, expect, it } from 'vitest';
import { CMD } from '../model/types';
import type { StitchPattern } from '../model/types';
import { readDst, writeDst } from './dst';
import { readExp, writeExp } from './exp';
import { readJef, writeJef } from './jef';
import { readPes, writePes } from './pes';
import { centeredStitches, countCmd, makePattern, sampleDesign } from './testFixtures';

type RW = [string, (p: StitchPattern) => Uint8Array, (b: Uint8Array) => StitchPattern];
const formats: RW[] = [
  ['DST', writeDst, readDst],
  ['PES', writePes, readPes],
  ['JEF', (p) => writeJef(p), readJef],
  ['EXP', writeExp, readExp],
];

describe.each(formats)('%s round trip', (_name, write, read) => {
  it('preserves stitch positions (re-centered) and color blocks', () => {
    const src = sampleDesign();
    const back = read(write(src));
    expect(centeredStitches(back)).toEqual(centeredStitches(src));
    expect(countCmd(back, CMD.COLOR_CHANGE)).toBe(2);
    expect(back.threads.length).toBe(3);
    expect(back.cmds[back.cmds.length - 1]).toBe(CMD.END);
  });

  it('re-centers the design on its bounding box', () => {
    const back = read(write(sampleDesign()));
    const pts = centeredStitches(back);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    expect(Math.abs(Math.min(...xs) + Math.max(...xs))).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.min(...ys) + Math.max(...ys))).toBeLessThanOrEqual(1);
    // readers already return centered coordinates
    const raw: number[] = [];
    for (let i = 0; i < back.cmds.length; i++) if (back.cmds[i] === CMD.STITCH) raw.push(back.xs[i]);
    expect(raw[0]).toBe(xs[0]);
  });

  it('is deterministic', () => {
    expect(write(sampleDesign())).toEqual(write(sampleDesign()));
  });

  it('splits very long jumps and keeps the destination', () => {
    const p = makePattern([
      [-1500, -900, CMD.JUMP],
      [-1500, -900, CMD.STITCH],
      [-1490, -900, CMD.STITCH],
      [-1490, -900, CMD.TRIM],
      [1600, 1000, CMD.JUMP],
      [1600, 1000, CMD.STITCH],
      [1610, 1000, CMD.STITCH],
    ]);
    const back = read(write(p));
    expect(centeredStitches(back)).toEqual(centeredStitches(p));
  });
});

describe('trims survive where the format has them', () => {
  it.each([
    ['DST', writeDst, readDst],
    ['PES', writePes, readPes],
    ['EXP', writeExp, readExp],
  ] as RW[])('%s', (_n, write, read) => {
    const back = read(write(sampleDesign()));
    expect(countCmd(back, CMD.TRIM)).toBeGreaterThanOrEqual(1);
  });
});
