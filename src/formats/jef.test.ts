import { describe, expect, it } from 'vitest';
import { CMD } from '../model/types';
import { JEF_HOOP, jefHoopCode, readJef, writeJef } from './jef';
import { makePattern } from './testFixtures';

const i32 = (b: Uint8Array, at: number): number => new DataView(b.buffer, b.byteOffset).getInt32(at, true);

describe('JEF', () => {
  const p = makePattern(
    [
      [-100, -50, CMD.JUMP],
      [-100, -50, CMD.STITCH],
      [100, 50, CMD.STITCH],
      [100, 50, CMD.COLOR_CHANGE],
      [100, 40, CMD.STITCH],
      [100, 40, CMD.STOP],
      [90, 40, CMD.STITCH],
    ],
    [
      { hex: '#000000', name: 'Black' },
      { hex: '#FF0000', name: 'Red' },
    ],
  );
  const bytes = writeJef(p);

  it('writes the header fields', () => {
    const colors = 3; // two blocks + one stop
    expect(i32(bytes, 0)).toBe(0x74 + colors * 8); // stitch offset
    expect(i32(bytes, 4)).toBe(0x14);
    expect(String.fromCharCode(...bytes.slice(8, 22))).toBe('20240101000000');
    expect(i32(bytes, 24)).toBe(colors);
    // END 1; jumps 2 each (initial + after color change); color change and stop 2 each;
    // stitches 1 each (the 200-unit stitch is split in two).
    expect(i32(bytes, 28)).toBe(1 + 2 * 2 + 2 * 2 + 5);
    expect(i32(bytes, 32)).toBe(JEF_HOOP.HOOP_50X50);
    expect([i32(bytes, 36), i32(bytes, 40), i32(bytes, 44), i32(bytes, 48)]).toEqual([100, 50, 100, 50]);
    expect([i32(bytes, 52), i32(bytes, 56)]).toEqual([450, 500]); // 110x110 hoop edge distances
    // Palette: black(1), red(10), stop marker(0); then 0x0D per color
    expect([i32(bytes, 0x74), i32(bytes, 0x78), i32(bytes, 0x7c)]).toEqual([1, 10, 0]);
    expect(i32(bytes, 0x80)).toBe(0x0d);
  });

  it('encodes stitches with y inverted and ends with 80 10', () => {
    const s = i32(bytes, 0);
    expect(Array.from(bytes.slice(s, s + 6))).toEqual([0x80, 0x02, 0x9c, 0x32, 0x00, 0x00]);
    expect(Array.from(bytes.slice(-2))).toEqual([0x80, 0x10]);
  });

  it('chooses the hoop by design extents', () => {
    expect(jefHoopCode(400, 400)).toBe(JEF_HOOP.HOOP_50X50);
    expect(jefHoopCode(1200, 1000)).toBe(JEF_HOOP.HOOP_126X110);
    expect(jefHoopCode(1300, 1900)).toBe(JEF_HOOP.HOOP_140X200);
    expect(jefHoopCode(1900, 1900)).toBe(JEF_HOOP.HOOP_200X200);
    expect(jefHoopCode(2500, 1900)).toBe(JEF_HOOP.HOOP_110X110);
  });

  it('reads colors and stops back', () => {
    const r = readJef(bytes);
    expect(Array.from(r.cmds).filter((c) => c === CMD.STOP).length).toBe(1);
    expect(Array.from(r.cmds).filter((c) => c === CMD.COLOR_CHANGE).length).toBe(1);
    expect(r.threads.map((t) => t.name)).toEqual(['Black', 'Red']);
  });

  it('splits long stitches within +-127', () => {
    const b = writeJef(makePattern([[0, 0, CMD.STITCH], [500, 0, CMD.STITCH]]));
    const r = readJef(b);
    expect(Array.from(r.cmds).filter((c) => c === CMD.STITCH).length).toBe(1 + 4); // ceil(500/127)=4
  });
});
