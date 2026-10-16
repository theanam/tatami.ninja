import { describe, expect, it } from 'vitest';
import sample from '../../model/harbor-club-badge.tatami.json';
import type { Project } from '../../model/types';
import { angleFromDrag, ellipsePolygon, fitZoom, geometryPath, hitTest, makeView, toScreen, toWorld, zoomAt } from './canvasMath';

const project = sample as unknown as Project;

describe('canvas math', () => {
  it('maps world ↔ screen', () => {
    const v = makeView(800, 600, 3, { x: 10, y: 0 });
    expect(toScreen(v, [0, 0])).toEqual([410, 300]);
    expect(toScreen(v, [100, 0])).toEqual([440, 300]); // 10 mm at 3 px/mm
    const back = toWorld(v, toScreen(v, [123, -45]));
    expect(back[0]).toBeCloseTo(123);
    expect(back[1]).toBeCloseTo(-45);
  });

  it('fits the hoop frame into the viewport', () => {
    const z = fitZoom(1000, 800, { width: 1300, height: 1800 }, 40);
    expect(z).toBeCloseTo(720 / 200);
  });

  it('zooms around the cursor', () => {
    const before = makeView(800, 600, 2, { x: 0, y: 0 });
    const at: [number, number] = [600, 100];
    const w = toWorld(before, at);
    const { zoom, pan } = zoomAt(800, 600, 2, { x: 0, y: 0 }, 4, at);
    const after = makeView(800, 600, zoom, pan);
    const back = toScreen(after, w);
    expect(back[0]).toBeCloseTo(600);
    expect(back[1]).toBeCloseTo(100);
  });

  it('hit-tests the topmost object', () => {
    expect(hitTest(project, [0, 0], 5)?.id).toBe('o3'); // star on top of the fill
    expect(hitTest(project, [0, -330], 5)?.id).toBe('o1'); // inside badge fill, outside star
    expect(hitTest(project, [0, -380], 5)?.id).toBe('o4'); // satin border band
    expect(hitTest(project, [0, -600], 5)).toBeNull();
  });

  it('skips hidden and locked objects', () => {
    const p = { ...project, objects: project.objects.map((o) => (o.id === 'o3' ? { ...o, locked: true } : o)) };
    expect(hitTest(p, [0, 0], 5)?.id).toBe('o1');
    expect(hitTest(p, [0, 0], 5, { includeLocked: true })?.id).toBe('o3');
  });

  it('computes fill angles from a drag', () => {
    expect(angleFromDrag([0, 0], [10, -10])).toBe(45);
    expect(angleFromDrag([0, 0], [-10, -10])).toBe(135);
    expect(angleFromDrag([0, 0], [10, 10])).toBe(135);
  });

  it('builds SVG paths', () => {
    expect(geometryPath({ kind: 'polyline', points: [[0, 0], [10, 5]] })).toBe('M0 0L10 5');
    expect(geometryPath({ kind: 'circle', cx: 0, cy: 0, r: 10 })).toMatch(/^M-10 0a10 10/);
    expect(ellipsePolygon(0, 0, 100, 50).length).toBeGreaterThanOrEqual(24);
  });
});
