import { describe, expect, it } from 'vitest';
import { generatePlan } from '../../engine/plan';
import sample from '../../model/harbor-club-badge.tatami.json';
import type { Project } from '../../model/types';
import { constrainSquare, objectFromPath, objectFromSatinClicks, objectFromShape, snap45 } from './drawTools';

const project = sample as unknown as Project;
const sews = (o: ReturnType<typeof objectFromPath>) => generatePlan({ ...project, objects: [o!] }).stitchCount;

describe('drawing tools', () => {
  it('pen: closed paths become tatami, open paths become runs', () => {
    const closed = objectFromPath('pen', [[0, 0], [100, 0], [50, 80]], true, 't1', 1)!;
    expect(closed.type).toBe('tatami');
    expect(closed.geometry.kind).toBe('polygon');
    const open = objectFromPath('pen', [[0, 0], [100, 0]], false, 't1', 2)!;
    expect(open.type).toBe('run');
    expect(open.geometry.kind).toBe('polyline');
    expect(sews(closed)).toBeGreaterThan(50);
  });

  it('fill and appliqué tools always close the shape', () => {
    expect(objectFromPath('fill', [[0, 0], [100, 0], [50, 80]], false, 't1', 1)?.type).toBe('tatami');
    expect(objectFromPath('applique', [[0, 0], [100, 0], [50, 80]], false, 't1', 1)?.type).toBe('applique');
  });

  it('run tool keeps closed paths as run outlines', () => {
    expect(objectFromPath('run', [[0, 0], [100, 0], [50, 80]], true, 't1', 1)?.type).toBe('run');
  });

  it('rejects too few points and drops duplicate clicks', () => {
    expect(objectFromPath('pen', [[0, 0], [1, 1]], false, 't1', 1)).toBeNull();
    expect(objectFromPath('fill', [[0, 0], [100, 0]], true, 't1', 1)).toBeNull();
  });

  it('satin tool pairs alternating clicks into rails', () => {
    expect(objectFromSatinClicks([[0, 0], [0, 40], [100, 0]], 't1', 1)).toBeNull();
    const o = objectFromSatinClicks([[0, 0], [0, 40], [100, 0], [100, 40], [200, 10]], 't1', 1)!;
    expect(o.type).toBe('satin');
    if (o.geometry.kind !== 'satin' || o.geometry.railA.kind !== 'polyline') throw new Error();
    expect(o.geometry.railA.points).toEqual([[0, 0], [100, 0]]);
    expect(sews(o)).toBeGreaterThan(50); // 10 mm long at 0.4 mm density
  });

  it('shapes tool makes rectangles, circles and ellipses', () => {
    expect(objectFromShape('rect', [0, 0], [100, 50], 't1', 1)?.geometry).toEqual({ kind: 'polygon', points: [[0, 0], [100, 0], [100, 50], [0, 50]] });
    expect(objectFromShape('ellipse', [0, 0], [100, 100], 't1', 1)?.geometry).toEqual({ kind: 'circle', cx: 50, cy: 50, r: 50 });
    expect(objectFromShape('ellipse', [0, 0], [100, 50], 't1', 1)?.geometry.kind).toBe('polygon');
    expect(objectFromShape('rect', [0, 0], [5, 5], 't1', 1)).toBeNull();
  });

  it('constrains angles and squares', () => {
    expect(snap45([0, 0], [100, 10])).toEqual([100, 0]);
    expect(constrainSquare([0, 0], [50, -20])).toEqual([50, -50]);
  });
});
