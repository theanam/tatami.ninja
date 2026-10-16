import { geometryBounds } from '../../engine/geom';
import type { Bounds, Project } from '../../model/types';

export interface SnapLines {
  x: number[];
  y: number[];
}

export interface SnapOptions {
  /** Grid size in 0.1 mm, or null when snap-to-grid is off. */
  grid: number | null;
  /** Lines to align with (smart snap), or null when smart snap is off. */
  lines: SnapLines | null;
  /** Smart-snap distance in world units (a few screen pixels). */
  tol: number;
}

export interface Guides {
  x: number | null;
  y: number | null;
}

/** Edges and centers of the hoop and of every other visible object. */
export function snapLines(project: Project, exclude: Set<string>): SnapLines {
  const hw = project.hoop.width / 2;
  const hh = project.hoop.height / 2;
  const x = [-hw, 0, hw];
  const y = [-hh, 0, hh];
  for (const o of project.objects) {
    if (!o.visible || exclude.has(o.id)) continue;
    const b = geometryBounds(o.geometry);
    if (!b) continue;
    x.push(b.minX, (b.minX + b.maxX) / 2, b.maxX);
    y.push(b.minY, (b.minY + b.maxY) / 2, b.maxY);
  }
  return { x, y };
}

/**
 * Snap one axis. `values` are the moving feature's positions (e.g. left, center, right);
 * the first one is the grid anchor. Returns the correction and the guide line hit, if any.
 */
export function snapAxis(values: number[], lines: number[] | null, grid: number | null, tol: number): { delta: number; guide: number | null } {
  if (lines) {
    let best: { delta: number; guide: number } | null = null;
    for (const v of values) {
      for (const l of lines) {
        const d = l - v;
        if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, guide: l };
      }
    }
    if (best) return best;
  }
  if (grid && grid > 0) {
    const v = values[0];
    return { delta: Math.round(v / grid) * grid - v, guide: null };
  }
  return { delta: 0, guide: null };
}

/** Snap a moved bounding box (by dx, dy). */
export function snapMove(b: Bounds, dx: number, dy: number, o: SnapOptions): { dx: number; dy: number; guides: Guides } {
  const xs = [b.minX + dx, (b.minX + b.maxX) / 2 + dx, b.maxX + dx];
  const ys = [b.minY + dy, (b.minY + b.maxY) / 2 + dy, b.maxY + dy];
  const sx = snapAxis(xs, o.lines?.x ?? null, o.grid, o.tol);
  const sy = snapAxis(ys, o.lines?.y ?? null, o.grid, o.tol);
  return { dx: dx + sx.delta, dy: dy + sy.delta, guides: { x: sx.guide, y: sy.guide } };
}

/** Snap a single point (drawing clicks, node handles, resize corners). */
export function snapPoint(p: [number, number], o: SnapOptions): { p: [number, number]; guides: Guides } {
  const sx = snapAxis([p[0]], o.lines?.x ?? null, o.grid, o.tol);
  const sy = snapAxis([p[1]], o.lines?.y ?? null, o.grid, o.tol);
  return { p: [p[0] + sx.delta, p[1] + sy.delta], guides: { x: sx.guide, y: sy.guide } };
}

/** Grid sizes offered in the UI (0.1 mm). */
export function gridSizes(units: 'mm' | 'in'): { value: number; label: string }[] {
  if (units === 'in') {
    return [
      { value: 15.875, label: '1/16 in' },
      { value: 31.75, label: '1/8 in' },
      { value: 63.5, label: '1/4 in' },
      { value: 127, label: '1/2 in' },
    ];
  }
  return [
    { value: 10, label: '1 mm' },
    { value: 20, label: '2 mm' },
    { value: 50, label: '5 mm' },
    { value: 100, label: '10 mm' },
  ];
}
