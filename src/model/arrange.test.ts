import { describe, expect, it } from 'vitest';
import { alignObjects, circleCopies, distributeObjects, flipObject, gridCopies, withGroups } from './arrange';
import { objectsBounds } from './transform';
import type { StitchObject } from './types';

function box(id: string, x: number, y: number, w = 100, h = 100, group?: string): StitchObject {
  return {
    id,
    name: id,
    type: 'tatami',
    thread: 't1',
    visible: true,
    locked: false,
    geometry: { kind: 'polygon', points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] },
    params: { angleDeg: 30 },
    advanced: {},
    group,
  };
}
const hoop = { width: 1000, height: 1000 };
const b = (o: StitchObject) => objectsBounds([o])!;

describe('arrange', () => {
  it('flips geometry and mirrors the fill angle', () => {
    const tri: StitchObject = { ...box('a', 0, 0), geometry: { kind: 'polygon', points: [[0, 0], [100, 0], [0, 50]] } };
    const f = flipObject(tri, 'horizontal', 50, 25);
    expect(f.geometry).toEqual({ kind: 'polygon', points: [[100, 0], [0, 0], [100, 50]], holes: undefined });
    expect(f.params.angleDeg).toBe(150);
    const v = flipObject(tri, 'vertical', 50, 25);
    expect(v.geometry).toMatchObject({ points: [[0, 50], [100, 50], [0, 0]] });
  });

  it('aligns several objects to their combined bounds', () => {
    const out = alignObjects([box('a', 0, 0), box('b', 300, 200, 50, 50)], 'left', hoop);
    expect(out.map((o) => b(o).minX)).toEqual([0, 0]);
    const mid = alignObjects([box('a', 0, 0), box('b', 300, 200, 50, 50)], 'middle', hoop);
    expect(mid.map((o) => (b(o).minY + b(o).maxY) / 2)).toEqual([125, 125]);
  });

  it('aligns a single object (or one group) to the hoop', () => {
    expect(b(alignObjects([box('a', 0, 0)], 'right', hoop)[0]).maxX).toBe(500);
    const grp = alignObjects([box('a', 0, 0, 100, 100, 'g'), box('b', 200, 0, 100, 100, 'g')], 'center', hoop);
    expect(objectsBounds(grp)).toMatchObject({ minX: -150, maxX: 150 });
  });

  it('distributes with equal gaps', () => {
    const out = distributeObjects([box('a', 0, 0), box('c', 900, 0), box('b', 150, 0, 300)], 'horizontal');
    const xs = out.map(b).sort((p, q) => p.minX - q.minX);
    expect(xs[1].minX - xs[0].maxX).toBe(xs[2].minX - xs[1].maxX);
    expect(xs[0].minX).toBe(0);
    expect(xs[2].maxX).toBe(1000);
  });

  it('expands a selection to whole groups', () => {
    const objs = [box('a', 0, 0, 10, 10, 'g'), box('b', 0, 0), box('c', 0, 0, 10, 10, 'g')];
    expect(withGroups(objs, ['a'])).toEqual(['a', 'c']);
    expect(withGroups(objs, ['b'])).toEqual(['b']);
  });

  it('copies around a circle, turning each copy', () => {
    const copies = circleCopies([box('a', -50, -350)], 4, 300);
    expect(copies).toHaveLength(3);
    const centers = copies.map((o) => {
      const q = b(o);
      return [Math.round((q.minX + q.maxX) / 2), Math.round((q.minY + q.maxY) / 2)];
    });
    expect(centers).toEqual([
      [300, 0],
      [0, 300],
      [-300, 0],
    ]);
    expect(new Set(copies.map((o) => o.id)).size).toBe(3);
  });

  it('copies in a grid with gaps, keeping groups per copy', () => {
    const copies = gridCopies([box('a', 0, 0, 100, 100, 'g'), box('b', 100, 0, 100, 100, 'g')], 2, 2, 10, 20);
    expect(copies).toHaveLength(6);
    expect(objectsBounds(copies)).toEqual({ minX: 0, minY: 0, maxX: 410, maxY: 220 });
    const groups = new Set(copies.map((o) => o.group));
    expect(groups.size).toBe(3);
    expect(groups.has('g')).toBe(false);
  });
});
