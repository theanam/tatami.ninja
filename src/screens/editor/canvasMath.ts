import { areasOf, distToSegment, geometryBounds, pathsOf, pointInArea, railPoints, type P } from '../../engine/geom';
import type { Bounds, Geometry, Project, StitchObject } from '../../model/types';

export interface View {
  /** Pixels per 0.1 mm. */
  s: number;
  /** Screen position of the hoop center. */
  cx: number;
  cy: number;
}

export function makeView(width: number, height: number, zoom: number, pan: { x: number; y: number }): View {
  return { s: zoom / 10, cx: width / 2 + pan.x, cy: height / 2 + pan.y };
}

export const toScreen = (v: View, p: P): P => [v.cx + p[0] * v.s, v.cy + p[1] * v.s];
export const toWorld = (v: View, p: P): P => [(p[0] - v.cx) / v.s, (p[1] - v.cy) / v.s];

/** Zoom (px per mm) that fits the hoop frame into the viewport. */
export function fitZoom(width: number, height: number, hoop: { width: number; height: number }, padding = 40): number {
  const fw = hoop.width / 10 + 20;
  const fh = hoop.height / 10 + 20;
  return Math.max(0.25, Math.min((width - padding * 2) / fw, (height - padding * 2) / fh));
}

/** Zoom keeping the world point under the cursor fixed. */
export function zoomAt(
  width: number,
  height: number,
  zoom: number,
  pan: { x: number; y: number },
  next: number,
  at: P,
): { zoom: number; pan: { x: number; y: number } } {
  const z = Math.min(40, Math.max(0.25, next));
  const v = makeView(width, height, zoom, pan);
  const w = toWorld(v, at);
  // After zoom, keep w at `at`: at = width/2 + pan' + w * z/10
  return { zoom: z, pan: { x: at[0] - width / 2 - (w[0] * z) / 10, y: at[1] - height / 2 - (w[1] * z) / 10 } };
}

/** SVG path data for a geometry, in world units. */
export function geometryPath(g: Geometry): string {
  if (g.kind === 'stitches') {
    let d = '';
    for (let i = 0; i + 2 < g.data.length; i += 3) {
      const c = g.data[i + 2];
      d += `${c === 0 && d ? 'L' : 'M'}${g.data[i]} ${g.data[i + 1]}`;
    }
    return d;
  }
  if (g.kind === 'circle') {
    const { cx, cy, r } = g;
    return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  }
  if (g.kind === 'satin') {
    // Area between the rails (even-odd for concentric rings).
    const a = railPoints(g.railA);
    const b = railPoints(g.railB);
    if (a.closed && b.closed) return ring(a.points, true) + ring(b.points, true);
    return ring([...a.points, ...[...b.points].reverse()], true);
  }
  return pathsOf(g)
    .map((p) => ring(p.points, p.closed))
    .join('');
}

function ring(pts: P[], closed: boolean): string {
  if (!pts.length) return '';
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `L${r1(pts[i][0])} ${r1(pts[i][1])}`;
  return closed ? `${d}Z` : d;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function railPath(g: Extract<Geometry, { kind: 'satin' }>, which: 'A' | 'B'): string {
  const r = railPoints(which === 'A' ? g.railA : g.railB);
  return ring(r.points, r.closed);
}

/** Topmost object under a world point (`tol` in world units). */
export function hitTest(project: Project, p: P, tol: number, opts: { includeLocked?: boolean } = {}): StitchObject | null {
  for (let i = project.objects.length - 1; i >= 0; i--) {
    const o = project.objects[i];
    if (!o.visible) continue;
    if (o.locked && !opts.includeLocked) continue;
    if (hitsObject(o, p, tol)) return o;
  }
  return null;
}

export function hitsObject(o: StitchObject, p: P, tol: number): boolean {
  const g = o.geometry;
  const b = geometryBounds(g);
  if (!b || p[0] < b.minX - tol || p[0] > b.maxX + tol || p[1] < b.minY - tol || p[1] > b.maxY + tol) return false;
  // Lettering: the whole text box is grabbable, not just the glyph outlines.
  if (o.text) return true;
  if (g.kind === 'stitches') {
    for (let i = 3; i + 2 < g.data.length; i += 3) {
      if (distToSegment(p, [g.data[i - 3], g.data[i - 2]], [g.data[i], g.data[i + 1]]) <= tol) return true;
    }
    return false;
  }
  const filled = o.type !== 'run' || g.kind === 'satin';
  if (filled) for (const a of areasOf(g)) if (pointInArea(p, a)) return true;
  for (const path of pathsOf(g)) {
    const pts = path.points;
    const n = path.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) if (distToSegment(p, pts[i], pts[(i + 1) % pts.length]) <= tol) return true;
  }
  if (g.kind === 'satin') {
    for (const r of [railPoints(g.railA), railPoints(g.railB)]) {
      for (let i = 1; i < r.points.length; i++) if (distToSegment(p, r.points[i - 1], r.points[i]) <= tol) return true;
    }
  }
  return false;
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function normRect(a: P, b: P): Bounds {
  return { minX: Math.min(a[0], b[0]), minY: Math.min(a[1], b[1]), maxX: Math.max(a[0], b[0]), maxY: Math.max(a[1], b[1]) };
}

/** Center of an object's geometry bounds. */
export function objectCenter(o: StitchObject): P | null {
  const b = geometryBounds(o.geometry);
  return b ? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] : null;
}

/** Fill angle (degrees, counter-clockwise on screen) from center → pointer. */
export function angleFromDrag(center: P, pointer: P): number {
  const deg = (Math.atan2(-(pointer[1] - center[1]), pointer[0] - center[0]) * 180) / Math.PI;
  let a = Math.round(deg) % 180;
  if (a < 0) a += 180;
  return a;
}

/** Ellipse approximated as a polygon (world units). */
export function ellipsePolygon(cx: number, cy: number, rx: number, ry: number): [number, number][] {
  const n = Math.max(24, Math.ceil((Math.PI * (rx + ry)) / 8));
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push([Math.round(cx + rx * Math.cos(t)), Math.round(cy + ry * Math.sin(t))]);
  }
  return out;
}
