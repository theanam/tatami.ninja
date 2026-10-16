import { describe, expect, it } from 'vitest';
import { circlePoints, pointInArea, type Area } from './geom';
import { getMotif, motifAlong, MOTIFS } from './motifs';
import { patternFill } from './patterns';
import { styledRun } from './runStyles';

describe('motifs', () => {
  it('every motif chains: starts at the left middle and ends at the right middle', () => {
    for (const m of MOTIFS) {
      expect(m.pts[0][0]).toBeCloseTo(0);
      expect(m.pts[0][1]).toBeCloseTo(0.5);
      expect(m.pts[m.pts.length - 1][0]).toBeCloseTo(1);
      expect(m.pts[m.pts.length - 1][1]).toBeCloseTo(0.5);
      for (const [u, v] of m.pts) {
        expect(u).toBeGreaterThanOrEqual(-0.01);
        expect(u).toBeLessThanOrEqual(1.01);
        expect(v).toBeGreaterThanOrEqual(-0.01);
        expect(v).toBeLessThanOrEqual(1.01);
      }
    }
    expect(new Set(MOTIFS.map((m) => m.id)).size).toBe(MOTIFS.length);
    expect(getMotif('nope').id).toBe('wave');
  });

  it('motif fills cover the shape and stay inside', () => {
    const area: Area = { outer: circlePoints(0, 0, 300), holes: [] };
    for (const m of MOTIFS) {
      const pts = patternFill([area], { pattern: 'motif', motif: m.id, motifSize: 60, spacing: 10, stitchLen: 30, angleDeg: 0 }).flat();
      expect(pts.length).toBeGreaterThan(100);
      expect(pts.every((p) => pointInArea(p, { outer: circlePoints(0, 0, 302), holes: [] }))).toBe(true);
      expect(Math.max(...pts.map((p) => p[1]))).toBeGreaterThan(220);
      expect(Math.min(...pts.map((p) => p[1]))).toBeLessThan(-220);
    }
  });

  it('repeats a motif along a path, within its height', () => {
    const path = [
      [0, 0],
      [600, 0],
    ] as [number, number][];
    const along = motifAlong(path, false, getMotif('zigzag'), 60, 36);
    expect(along[0][0]).toBeCloseTo(0);
    expect(along[along.length - 1][0]).toBeCloseTo(600);
    expect(Math.max(...along.map((p) => Math.abs(p[1])))).toBeLessThanOrEqual(18.01);
    const run = styledRun(path, false, { style: 'motif', motif: 'heart', motifSize: 60, stitchLength: 25, width: 20, knotSpacing: 50 }, null);
    expect(run.length).toBeGreaterThan(100);
  });
});
