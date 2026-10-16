import { describe, expect, it } from 'vitest';
import { clipLines } from './clip';
import { circlePoints, pointInArea, type Area, type P } from './geom';
import { patternFill, type FillPattern } from './patterns';
import { rowStitches } from './fill';

const square: Area = { outer: [[0, 0], [400, 0], [400, 400], [0, 400]], holes: [] };
const ring: Area = { outer: circlePoints(0, 0, 300), holes: [circlePoints(0, 0, 100)] };
const all = (g: P[][]) => g.flat();

describe('fill patterns', () => {
  it('clips open lines to areas, holes included', () => {
    const out = clipLines([[[-500, 0], [500, 0]]], [ring]);
    expect(out).toHaveLength(2);
    const xs = out.flat().map((p) => Math.round(Math.abs(p[0])));
    expect(xs.sort((a, b) => a - b)).toEqual([100, 100, 300, 300]);
  });

  for (const pattern of ['radial', 'spiral', 'circles', 'net', 'zigzag-net', 'cross'] as const) {
    it(`${pattern} stays inside the shape and covers it`, () => {
      const spacing = pattern === 'net' || pattern === 'zigzag-net' || pattern === 'cross' ? 30 : 6;
      const pts = all(patternFill([ring], { pattern, spacing, stitchLen: 30, angleDeg: 0 }));
      expect(pts.length).toBeGreaterThan(50);
      // Every needle point inside (with a little tolerance at the edges).
      const outside = pts.filter((p) => !pointInArea(p, ring) && !pointInArea(p, { outer: circlePoints(0, 0, 302), holes: [circlePoints(0, 0, 98)] }));
      expect(outside).toHaveLength(0);
      // Reaches all four sides of the ring.
      expect(Math.max(...pts.map((p) => p[0]))).toBeGreaterThan(250);
      expect(Math.min(...pts.map((p) => p[0]))).toBeLessThan(-250);
      expect(Math.max(...pts.map((p) => p[1]))).toBeGreaterThan(250);
      expect(Math.min(...pts.map((p) => p[1]))).toBeLessThan(-250);
    });
  }

  it('radial rays do not pile up in the middle', () => {
    const pts = all(patternFill([square], { pattern: 'radial' as FillPattern as 'radial', spacing: 6, stitchLen: 30, angleDeg: 0 }));
    const near = pts.filter((p) => Math.hypot(p[0] - 200, p[1] - 200) < 20).length;
    expect(near).toBeLessThan(60);
  });

  it('random shift varies stitch positions between rows, repeatably', () => {
    const a = rowStitches(0, 400, 0, 1, 40, true).map((p) => p[0]);
    const b = rowStitches(0, 400, 4, 2, 40, true).map((p) => p[0]);
    expect(a).not.toEqual(b);
    expect(rowStitches(0, 400, 0, 1, 40, true).map((p) => p[0])).toEqual(a);
  });
});
