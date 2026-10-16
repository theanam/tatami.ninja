import { describe, expect, it } from 'vitest';
import sample from '../../model/harbor-club-badge.tatami.json';
import type { Project } from '../../model/types';
import { gridSizes, snapAxis, snapLines, snapMove, snapPoint } from './snap';

const project = sample as unknown as Project;

describe('snapping', () => {
  it('collects hoop and object lines, excluding the moving objects', () => {
    const l = snapLines(project, new Set(['o2', 'o3', 'o4']));
    expect(l.x).toEqual(expect.arrayContaining([-650, 0, 650, -352, 352]));
    expect(l.y).toEqual(expect.arrayContaining([-900, 0, 900]));
    expect(snapLines(project, new Set(project.objects.map((o) => o.id))).x).toEqual([-650, 0, 650]);
  });

  it('prefers the nearest smart line within tolerance', () => {
    expect(snapAxis([96, 146, 197], [0, 100, 200], null, 5)).toEqual({ delta: 3, guide: 200 });
    expect(snapAxis([90], [100], null, 5)).toEqual({ delta: 0, guide: null });
  });

  it('falls back to the grid on the leading edge', () => {
    expect(snapAxis([123, 150], [1000], 50, 5)).toEqual({ delta: -23, guide: null });
    expect(snapAxis([123], null, null, 5)).toEqual({ delta: 0, guide: null });
  });

  it('snaps a moved box center onto the hoop center', () => {
    const b = { minX: -50, minY: -50, maxX: 50, maxY: 50 };
    const r = snapMove(b, 3, -2, { grid: null, lines: { x: [0], y: [0] }, tol: 5 });
    expect(r).toEqual({ dx: 0, dy: 0, guides: { x: 0, y: 0 } });
  });

  it('snaps a moved box to the grid when no line is close', () => {
    const b = { minX: 0, minY: 0, maxX: 100, maxY: 40 };
    const r = snapMove(b, 37, 12, { grid: 50, lines: null, tol: 5 });
    expect(r.dx).toBe(50);
    expect(r.dy).toBe(0);
  });

  it('snaps points', () => {
    expect(snapPoint([23, 77], { grid: 10, lines: null, tol: 3 }).p).toEqual([20, 80]);
    expect(snapPoint([651, 5], { grid: null, lines: { x: [650], y: [0] }, tol: 6 })).toEqual({ p: [650, 0], guides: { x: 650, y: 0 } });
  });

  it('offers grid sizes per unit', () => {
    expect(gridSizes('mm').map((g) => g.value)).toEqual([10, 20, 50, 100]);
    expect(gridSizes('in')[0].label).toBe('1/16 in');
  });
});
