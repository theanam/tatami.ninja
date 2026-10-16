import { describe, expect, it } from 'vitest';
import type { Geometry } from './types';
import { deleteVertex, insertVertexAfter, listVertices, moveVertex, nearestSegment } from './nodes';

const square: Geometry = { kind: 'polygon', points: [[0, 0], [100, 0], [100, 100], [0, 100]], holes: [[[40, 40], [60, 40], [60, 60]]] };

describe('node editing', () => {
  it('lists vertices for every geometry kind', () => {
    expect(listVertices(square).map((v) => v.key)).toEqual(['p:0', 'p:1', 'p:2', 'p:3', 'h:0:0', 'h:0:1', 'h:0:2']);
    expect(listVertices({ kind: 'circle', cx: 0, cy: 0, r: 10 }).map((v) => v.key)).toEqual(['center', 'radius']);
    expect(listVertices({ kind: 'compound', parts: [{ points: [[0, 0], [1, 0], [1, 1]] }] })[0].key).toBe('c:0:p:0');
    const satin: Geometry = { kind: 'satin', railA: { kind: 'polyline', points: [[0, 0], [10, 0]] }, railB: { kind: 'circle', cx: 0, cy: 0, r: 5 }, rungs: 'auto' };
    expect(listVertices(satin).map((v) => v.key)).toEqual(['a:0', 'a:1', 'b:radius']);
  });

  it('moves vertices without mutating the input', () => {
    const moved = moveVertex(square, 'p:1', [120, -10]);
    expect(moved.kind === 'polygon' && moved.points[1]).toEqual([120, -10]);
    expect(square.kind === 'polygon' && square.points[1]).toEqual([100, 0]);
    const hole = moveVertex(square, 'h:0:2', [55, 70]);
    expect(hole.kind === 'polygon' && hole.holes![0][2]).toEqual([55, 70]);
  });

  it('moves circle center and radius', () => {
    const c: Geometry = { kind: 'circle', cx: 0, cy: 0, r: 10 };
    expect(moveVertex(c, 'center', [5, 5])).toEqual({ kind: 'circle', cx: 5, cy: 5, r: 10 });
    expect(moveVertex(c, 'radius', [0, 30])).toEqual({ kind: 'circle', cx: 0, cy: 0, r: 30 });
  });

  it('deletes vertices but keeps rings valid', () => {
    const d = deleteVertex(square, 'p:0');
    expect(d.kind === 'polygon' && d.points.length).toBe(3);
    expect(deleteVertex(d, 'p:0')).toBe(d); // a triangle stays a triangle
  });

  it('keeps satin rails paired when deleting', () => {
    const satin: Geometry = {
      kind: 'satin',
      railA: { kind: 'polyline', points: [[0, 0], [10, 0], [20, 0]] },
      railB: { kind: 'polyline', points: [[0, 5], [10, 5], [20, 5]] },
      rungs: 'auto',
    };
    const d = deleteVertex(satin, 'a:1');
    if (d.kind !== 'satin' || d.railA.kind !== 'polyline' || d.railB.kind !== 'polyline') throw new Error();
    expect(d.railA.points.length).toBe(2);
    expect(d.railB.points.length).toBe(2);
  });

  it('inserts points on the nearest segment', () => {
    const seg = nearestSegment(square, [50, -2])!;
    expect(seg.key).toBe('p:0');
    const g = insertVertexAfter(square, seg.key, [50, 0]);
    expect(g.kind === 'polygon' && g.points[1]).toEqual([50, 0]);
  });
});
