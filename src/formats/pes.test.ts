import { describe, expect, it } from 'vitest';
import { CMD } from '../model/types';
import { blankPecGraphic, pecColorIndices, pecEncode } from './pec';
import { PEC_PALETTE } from './pecPalette';
import { readPes, writePes } from './pes';
import { ByteWriter, hexToRgb } from './util';
import type { Rec } from './util';
import { makePattern, sampleDesign } from './testFixtures';

const enc = (recs: [number, number, number][]): number[] => {
  const w = new ByteWriter();
  pecEncode(recs.map(([x, y, c]): Rec => ({ x, y, c })), w);
  return Array.from(w.toBytes());
};
const u32 = (b: Uint8Array, at: number): number => new DataView(b.buffer, b.byteOffset).getUint32(at, true);

describe('PEC stitch encoding', () => {
  it('uses 7-bit short form for small deltas', () => {
    expect(enc([[0, 0, CMD.STITCH], [10, -5, CMD.STITCH], [10, -5, CMD.END]])).toEqual([0, 0, 0x0a, 0x7b, 0xff]);
  });
  it('uses 12-bit long form beyond -64..62', () => {
    // 100 -> 0x8064, -200 -> 0x8F38; 63 is already long (pyembroidery: -64 < v < 63)
    expect(enc([[0, 0, CMD.STITCH], [100, -200, CMD.STITCH], [163, -200, CMD.STITCH]])).toEqual([
      0, 0, 0x80, 0x64, 0x8f, 0x38, 0x80, 0x3f, 0x00, 0xff,
    ]);
  });
  it('flags jumps (0x10) and trimmed jumps (0x20), color change FE B0 02/01, end FF', () => {
    const bytes = enc([
      [5, 5, CMD.JUMP],
      [5, 5, CMD.STITCH],
      [6, 5, CMD.STITCH],
      [6, 5, CMD.TRIM],
      [16, 5, CMD.JUMP],
      [16, 5, CMD.STITCH],
      [16, 5, CMD.COLOR_CHANGE],
      [16, 6, CMD.STITCH],
      [16, 6, CMD.COLOR_CHANGE],
      [16, 7, CMD.STITCH],
      [16, 7, CMD.END],
    ]);
    expect(bytes).toEqual([
      0x90, 0x05, 0x90, 0x05, // jump
      0x00, 0x00, // stitch at landing
      0x01, 0x00,
      0xa0, 0x0a, 0xa0, 0x00, // trim-jump
      0x00, 0x00,
      0xfe, 0xb0, 0x02,
      0x00, 0x01,
      0xfe, 0xb0, 0x01,
      0x00, 0x01,
      0xff,
    ]);
  });
});

describe('PEC palette', () => {
  it('has 64 threads plus placeholder', () => {
    expect(PEC_PALETTE.length).toBe(65);
    expect(PEC_PALETTE[20]).toMatchObject({ name: 'Black', hex: '#000000' });
  });
  it('gives distinct threads distinct indices', () => {
    const idx = pecColorIndices([{ rgb: 0x000000 }, { rgb: 0x010101 }, { rgb: 0x000000 }]);
    expect(idx[0]).toBe(20);
    expect(idx[1]).not.toBe(20);
    expect(idx[2]).toBe(20);
  });
  it('blank thumbnail is 48x38 with a frame', () => {
    const g = blankPecGraphic();
    expect(g.length).toBe(228);
    expect(g.slice(6, 12)).toEqual([0xf0, 0xff, 0xff, 0xff, 0xff, 0x0f]);
  });
});

describe('writePes', () => {
  const p = sampleDesign(true);
  const bytes = writePes(p);

  it('starts with #PES0001 and a correct PEC offset pointer', () => {
    expect(String.fromCharCode(...bytes.slice(0, 8))).toBe('#PES0001');
    const pec = u32(bytes, 8);
    expect(String.fromCharCode(...bytes.slice(pec, pec + 3))).toBe('LA:');
    expect(String.fromCharCode(...bytes.slice(pec + 3, pec + 19))).toBe('Test            ');
    // CEmbOne / CSewSeg objects
    expect(String.fromCharCode(...bytes.slice(0x18, 0x1f))).toBe('CEmbOne');
    expect(String.fromCharCode(...bytes).includes('CSewSeg')).toBe(true);
  });

  it('PEC header lists one palette index per block (stop = duplicate color)', () => {
    const pec = u32(bytes, 8);
    expect(bytes[pec + 34]).toBe(6); // thumbnail stride
    expect(bytes[pec + 35]).toBe(38);
    const count = bytes[pec + 48] + 1;
    expect(count).toBe(4);
    const idx = Array.from(bytes.slice(pec + 49, pec + 49 + count));
    expect(idx[1]).toBe(idx[2]); // stop duplicates block 1's color
    expect(idx[0]).toBe(1); // navy -> Prussian Blue
  });

  it('stitch block length and graphics sizes are consistent', () => {
    const pec = u32(bytes, 8);
    const len = bytes[pec + 514] | (bytes[pec + 515] << 8) | (bytes[pec + 516] << 16);
    const graphicsStart = pec + 512 + len;
    expect(bytes[graphicsStart - 1]).toBe(0xff); // end marker
    expect(bytes.length - graphicsStart).toBe(228 * (1 + 4));
  });

  it('reads back with STOP and colors', () => {
    const r = readPes(bytes);
    expect(Array.from(r.cmds).filter((c) => c === CMD.COLOR_CHANGE).length).toBe(2);
    expect(Array.from(r.cmds).filter((c) => c === CMD.STOP).length).toBe(1);
    expect(r.threads.length).toBe(3);
    expect(r.threads[0].name).toBe('Prussian Blue');
  });

  it('handles an empty pattern', () => {
    const e = writePes(makePattern([]));
    expect(String.fromCharCode(...e.slice(0, 8))).toBe('#PES0001');
    expect(readPes(e).cmds.length).toBe(1);
  });

  it('nearest PEC color is used for exact palette colors', () => {
    expect(pecColorIndices([{ rgb: hexToRgb('#ED171F') }])).toEqual([5]);
  });
});
