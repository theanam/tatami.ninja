import { describe, expect, it } from 'vitest';
import { CMD } from '../model/types';
import { decodeDstRecord, encodeDstRecord, readDst, writeDst } from './dst';
import { makePattern } from './testFixtures';

const hex = (b: ArrayLike<number>): string => Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
const headerText = (bytes: Uint8Array): string => String.fromCharCode(...bytes.slice(0, 512));

describe('DST record encoding (golden values from pyembroidery)', () => {
  it.each([
    [1, -1, 'stitch', '410003'],
    [-121, -121, 'stitch', '5a5a1b'],
    [121, 121, 'stitch', 'a5a527'],
    [40, 41, 'stitch', '555523'],
    [0, 0, 'jump', '000083'],
    [5, 3, 'jump', '068283'],
    [0, 0, 'color', '0000c3'],
    [0, 0, 'end', '0000f3'],
  ] as const)('(%i,%i) %s -> %s', (dx, dy, kind, want) => {
    expect(hex(encodeDstRecord(dx, dy, kind))).toBe(want);
  });

  it('decodes every delta in range back to itself', () => {
    for (let x = -121; x <= 121; x += 7) {
      for (let y = -121; y <= 121; y += 11) {
        const [b0, b1, b2] = encodeDstRecord(x, y, 'stitch');
        expect(decodeDstRecord(b0, b1, b2)).toEqual([x, y]);
      }
    }
  });

  it('rejects out-of-range deltas', () => {
    expect(() => encodeDstRecord(122, 0, 'stitch')).toThrow();
  });
});

describe('writeDst', () => {
  const p = makePattern(
    [
      [1, 1, CMD.STITCH],
      [11, 1, CMD.STITCH],
      [11, 1, CMD.TRIM],
      [11, 1, CMD.COLOR_CHANGE],
      [-20, 30, CMD.JUMP],
      [-20, 30, CMD.STITCH],
      [-20, 40, CMD.STITCH],
    ],
    [
      { hex: '#000000', name: 'a' },
      { hex: '#ffffff', name: 'b' },
    ],
    'Golden',
  );
  const bytes = writeDst(p);

  it('writes a 512-byte header with the standard fields', () => {
    const h = headerText(bytes);
    expect(h.startsWith('LA:Golden          \r')).toBe(true);
    expect(h).toContain('ST:     10\r');
    expect(h).toContain('CO:  1\r');
    expect(h).toContain('+X:   11\r');
    expect(h).toContain('-X:   20\r');
    expect(h).toContain('+Y:    1\r'); // magnitude of the up-extent (screen minY)
    expect(h).toContain('-Y:   40\r');
    expect(h).toContain('AX:-   20\r');
    expect(h).toContain('AY:-   40\r');
    expect(h).toContain('MX:+    0\rMY:+    0\rPD:******\r\x1a');
    expect(bytes[511]).toBe(0x20);
  });

  it('encodes records with y inverted, trims as 3 jumps, color change and end', () => {
    const recs = hex(bytes.slice(512));
    expect(recs).toBe(
      [
        hex(encodeDstRecord(1, -1, 'stitch')),
        hex(encodeDstRecord(10, 0, 'stitch')),
        hex(encodeDstRecord(2, 2, 'jump')),
        hex(encodeDstRecord(-4, -4, 'jump')),
        hex(encodeDstRecord(2, 2, 'jump')),
        '0000c3',
        hex(encodeDstRecord(-31, -29, 'jump')),
        hex(encodeDstRecord(0, 0, 'stitch')),
        hex(encodeDstRecord(0, -10, 'stitch')),
        '0000f3',
      ].join(''),
    );
  });

  it('reads back trims, color changes and positions', () => {
    const r = readDst(bytes);
    expect(Array.from(r.cmds)).toEqual([
      CMD.STITCH, CMD.STITCH, CMD.TRIM, CMD.COLOR_CHANGE, CMD.JUMP, CMD.STITCH, CMD.STITCH, CMD.END,
    ]);
    expect(r.name).toBe('Golden');
    expect(r.threads.length).toBe(2);
    expect(r.threads[0].hex).not.toBe(r.threads[1].hex);
  });

  it('splits long moves into jump records within +-121', () => {
    const big = writeDst(makePattern([[0, 0, CMD.STITCH], [1000, 1000, CMD.JUMP], [1000, 1000, CMD.STITCH]]));
    const jumps = (big.length - 512) / 3 - 3; // minus 2 stitches + end
    expect(jumps).toBe(9);
    const r = readDst(big);
    const last = r.cmds.length - 2;
    expect([r.xs[last] - r.xs[0], r.ys[last] - r.ys[0]]).toEqual([1000, 1000]);
  });
});
