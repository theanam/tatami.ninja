import { describe, expect, it } from 'vitest';
import type { StitchObject } from '../model/types';
import { appliqueCutSvg } from '../export/cutFile';
import { circlePoints, pointInArea, type Area } from './geom';
import { generateObject, type Piece } from './objects';

const shape = (params: StitchObject['params']): StitchObject => ({
  id: 'a',
  name: 'Patch',
  type: 'applique',
  thread: 't',
  visible: true,
  locked: false,
  geometry: { kind: 'circle', cx: 0, cy: 0, r: 200 },
  params,
  advanced: {},
});
const stops = (p: Piece[]) => p.filter((x) => 'stop' in x).length;
const pts = (p: Piece[]) => p.flatMap((x) => ('pts' in x ? x.pts : []));

describe('appliqué', () => {
  it('sews placement, stop, tack-down, stop, cover', () => {
    const p = generateObject(shape({}), 'cotton', null);
    expect(stops(p)).toBe(2);
  });

  it('E prongs reach inward over the fabric from the edge', () => {
    const p = generateObject(shape({ coverStyle: 'e', width: 30 }), 'cotton', null);
    const last = p[p.length - 1];
    if (!('pts' in last)) throw new Error('pts');
    const inner: Area = { outer: circlePoints(0, 0, 190), holes: [] };
    const prongTips = last.pts.filter((q) => pointInArea(q, inner));
    expect(prongTips.length).toBeGreaterThan(20);
    expect(Math.max(...last.pts.map((q) => Math.hypot(q[0], q[1])))).toBeLessThan(203);
  });

  it('zigzag tack-down and no cover', () => {
    const plain = generateObject(shape({ coverStyle: 'none' }), 'cotton', null);
    expect(stops(plain)).toBe(2);
    expect('stop' in plain[plain.length - 1]).toBe(true);
    const zz = pts(generateObject(shape({ tackdown: 'zigzag', coverStyle: 'none' }), 'cotton', null));
    expect(zz.length).toBeGreaterThan(pts(plain).length);
  });

  it('exports the fabric piece at true size', () => {
    const svg = appliqueCutSvg([shape({})])!;
    expect(svg).toContain('width="44.00mm"');
    expect(svg).toContain('height="44.00mm"');
    expect(appliqueCutSvg([{ ...shape({}), type: 'tatami' }])).toBeNull();
  });
});
