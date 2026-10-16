import { describe, expect, it } from 'vitest';
import type { P } from './geom';
import { candlewickStitches, chainStitches, prongStitches, stemStitches } from './runStyles';

const line: P[] = [
  [0, 0],
  [400, 0],
];
const maxY = (pts: P[]) => Math.max(...pts.map((p) => p[1]));
const minY = (pts: P[]) => Math.min(...pts.map((p) => p[1]));

describe('run styles', () => {
  it('stem stitches slant to both sides of the line within the width', () => {
    const st = stemStitches(line, false, 30, 10, null);
    expect(st[0]).toEqual([0, 0]);
    expect(st[st.length - 1]).toEqual([400, 0]);
    expect(maxY(st)).toBeCloseTo(5);
    expect(minY(st)).toBeCloseTo(-5);
  });

  it('chain stitches make loops on both sides and reach the end', () => {
    const st = chainStitches(line, false, 40, 16, null);
    expect(st[st.length - 1]).toEqual([400, 0]);
    expect(maxY(st)).toBeCloseTo(8);
    expect(minY(st)).toBeCloseTo(-8);
    expect(st.length).toBeGreaterThan(40);
  });

  it('candlewicking adds a knot at every spacing', () => {
    const st = candlewickStitches(line, false, 25, 24, 100, null);
    const knots = st.filter((p) => Math.abs(p[1]) > 4).length;
    // 5 knots (0, 100, 200, 300, 400 mm), 8 star points each, of which 6 leave the line.
    expect(knots).toBe(5 * 6);
    expect(maxY(st)).toBeCloseTo(12);
  });

  it('E prongs stand square to one side; V prongs lean', () => {
    const e = prongStitches(line, false, 40, 30, 'e', null);
    const prongs = e.filter((p) => Math.abs(p[1]) > 1);
    expect(prongs.length).toBe(11);
    expect(prongs.every((p) => Math.abs(Math.abs(p[1]) - 30) < 0.01 && p[0] % 40 === 0)).toBe(true);
    const v = prongStitches(line, false, 40, 30, 'v', null);
    const vp = v.filter((p) => Math.abs(p[1]) > 1);
    expect(vp.length).toBe(10);
    expect(vp.every((p) => p[0] % 40 === 20)).toBe(true);
    expect(v[v.length - 1]).toEqual([400, 0]);
  });
});

describe('run styles in the engine', () => {
  it('uses the object run style, and treats repeats = 3 as triple', async () => {
    const { generateObject } = await import('./objects');
    const base = {
      id: 'r',
      name: 'r',
      type: 'run' as const,
      thread: 't',
      visible: true,
      locked: false,
      geometry: { kind: 'polyline' as const, points: [[0, 0], [400, 0]] as [number, number][] },
      advanced: {},
    };
    const count = (params: object) =>
      generateObject({ ...base, params }, 'cotton', null).reduce((n, p) => n + ('pts' in p ? p.pts.length : 0), 0);
    const single = count({});
    expect(count({ repeats: 3 })).toBeGreaterThan(single * 2);
    expect(count({ runStyle: 'chain' })).toBeGreaterThan(single);
    expect(count({ runStyle: 'candlewick' })).toBeGreaterThan(single);
    expect(count({ runStyle: 'stem' })).toBeGreaterThan(single);
  });
});
