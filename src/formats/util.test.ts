import { describe, expect, it } from 'vitest';
import { CMD } from '../model/types';
import { ByteWriter, colorDistance, nearestColorIndex, normalize, hexToRgb, rgbToHex } from './util';
import { makePattern } from './testFixtures';

describe('ByteWriter', () => {
  it('writes little and big endian integers and patches', () => {
    const w = new ByteWriter(2);
    w.u16le(0x1234).u16be(0x1234).u24le(0x010203).u32le(0xdeadbeef).i8(-1);
    w.setU16le(0, 0xabcd);
    expect(Array.from(w.toBytes())).toEqual([0xcd, 0xab, 0x12, 0x34, 3, 2, 1, 0xef, 0xbe, 0xad, 0xde, 0xff]);
  });
});

describe('colors', () => {
  it('parses and formats hex', () => {
    expect(hexToRgb('#24357a')).toBe(0x24357a);
    expect(rgbToHex(0x0a0b0c)).toBe('#0A0B0C');
  });
  it('finds the nearest color, skipping null entries', () => {
    const pal = [null, 0xff0000, 0x00ff00, 0x0000ff];
    expect(nearestColorIndex(0xee1111, pal)).toBe(1);
    expect(nearestColorIndex(0x1010f0, pal)).toBe(3);
    expect(colorDistance(0x123456, 0x123456)).toBe(0);
  });
});

describe('normalize', () => {
  const opts = { maxJump: 121, maxStitch: 121, fullJump: false };

  it('splits long jumps evenly within the limit', () => {
    const n = normalize(makePattern([[0, 0, CMD.STITCH], [1000, -300, CMD.JUMP], [1000, -300, CMD.STITCH]]), opts);
    const jumps = n.recs.filter((r) => r.c === CMD.JUMP);
    expect(jumps.length).toBe(9); // ceil(1000/121) = 9
    let px = 0, py = 0;
    for (const r of n.recs) {
      expect(Math.abs(r.x - px)).toBeLessThanOrEqual(121);
      expect(Math.abs(r.y - py)).toBeLessThanOrEqual(121);
      px = r.x;
      py = r.y;
    }
    expect(jumps[jumps.length - 1]).toMatchObject({ x: 1000, y: -300 });
  });

  it('splits long stitches into evenly spaced stitches (no jumps)', () => {
    const n = normalize(makePattern([[0, 0, CMD.STITCH], [300, 0, CMD.STITCH]]), opts);
    expect(n.recs.map((r) => [r.x, r.y, r.c])).toEqual([
      [0, 0, CMD.STITCH],
      [100, 0, CMD.STITCH],
      [200, 0, CMD.STITCH],
      [300, 0, CMD.STITCH],
      [300, 0, CMD.END],
    ]);
  });

  it('full-jump mode lands the needle with a zero-length stitch', () => {
    const n = normalize(makePattern([[50, 60, CMD.STITCH], [55, 60, CMD.STITCH]]), { ...opts, fullJump: true });
    expect(n.recs.map((r) => r.c)).toEqual([CMD.JUMP, CMD.STITCH, CMD.STITCH, CMD.END]);
  });

  it('drops leading/trailing color changes, redundant trims and empty blocks', () => {
    const p = makePattern(
      [
        [0, 0, CMD.COLOR_CHANGE],
        [0, 0, CMD.TRIM],
        [10, 10, CMD.STITCH],
        [20, 10, CMD.STITCH],
        [0, 0, CMD.TRIM],
        [0, 0, CMD.TRIM],
        [0, 0, CMD.COLOR_CHANGE],
        [0, 0, CMD.COLOR_CHANGE],
        [30, 10, CMD.STITCH],
        [0, 0, CMD.COLOR_CHANGE],
      ],
      [
        { hex: '#000001', name: 'a' },
        { hex: '#000002', name: 'b' },
        { hex: '#000003', name: 'c' },
        { hex: '#000004', name: 'd' },
        { hex: '#000005', name: 'e' },
      ],
    );
    const n = normalize(p, opts);
    expect(n.recs.map((r) => r.c)).toEqual([
      CMD.STITCH, CMD.STITCH, CMD.TRIM, CMD.COLOR_CHANGE, CMD.STITCH, CMD.END,
    ]);
    expect(n.threads.map((t) => t.name)).toEqual(['b', 'd']);
  });

  it('can encode STOP as a color change with a repeated thread', () => {
    const p = makePattern([[0, 0, CMD.STITCH], [0, 0, CMD.STOP], [5, 0, CMD.STITCH]]);
    const a = normalize(p, opts);
    expect(a.recs.map((r) => r.c)).toEqual([CMD.STITCH, CMD.STOP, CMD.STITCH, CMD.END]);
    expect(a.threads.length).toBe(1);
    const b = normalize(p, { ...opts, stopAsColorChange: true });
    expect(b.recs.map((r) => r.c)).toEqual([CMD.STITCH, CMD.COLOR_CHANGE, CMD.STITCH, CMD.END]);
    expect(b.threads.map((t) => t.hex)).toEqual(['#24357A', '#24357A']);
  });
});
