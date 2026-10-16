import { describe, expect, it } from 'vitest';
import { circlePoints, type Area, type P } from './geom';
import { stippleLines } from './stipple';

const square: Area = { outer: [[0, 0], [300, 0], [300, 300], [0, 300]], holes: [] };

function segmentsCross(a: P, b: P, c: P, d: P) {
  const o = (p: P, q: P, r: P) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

describe('stipple', () => {
  it('makes one closed, non-crossing loop per region', () => {
    const loops = stippleLines([square], 30, 7);
    expect(loops).toHaveLength(1);
    const l = loops[0];
    expect(l[0]).toEqual(l[l.length - 1]);
    let crossings = 0;
    for (let i = 0; i + 1 < l.length; i++)
      for (let j = i + 2; j + 1 < l.length; j++) {
        if (i === 0 && j + 2 === l.length) continue;
        if (segmentsCross(l[i], l[i + 1], l[j], l[j + 1])) crossings++;
      }
    expect(crossings).toBe(0);
  });

  it('is repeatable for a seed and different for another', () => {
    expect(stippleLines([square], 30, 3)).toEqual(stippleLines([square], 30, 3));
    expect(stippleLines([square], 30, 3)).not.toEqual(stippleLines([square], 30, 4));
  });

  it('covers the shape evenly and makes separate loops for separate parts', () => {
    const two: Area[] = [
      { outer: circlePoints(0, 0, 150), holes: [] },
      { outer: circlePoints(600, 0, 150), holes: [] },
    ];
    const loops = stippleLines(two, 20, 1);
    expect(loops).toHaveLength(2);
    const pts = loops.flat();
    expect(Math.min(...pts.map((p) => p[0]))).toBeLessThan(-120);
    expect(Math.max(...pts.map((p) => p[0]))).toBeGreaterThan(720);
  });
});
