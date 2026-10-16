import type { Bounds, Geometry, Pt, RailGeometry, Ring } from '../model/types';

/** Floating-point point used inside the engine; rounded to 0.1 mm on output. */
export type P = [number, number];

export const dist = (a: P, b: P): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
export const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
export const scale = (a: P, s: number): P => [a[0] * s, a[1] * s];
export const len = (a: P): number => Math.hypot(a[0], a[1]);
export const norm = (a: P): P => {
  const l = len(a);
  return l === 0 ? [0, 0] : [a[0] / l, a[1] / l];
};
export const rotate = (p: P, rad: number): P => {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};

/** Signed area; positive = clockwise in screen coords (+y down). */
export function signedArea(pts: P[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]);
  }
  return a / 2;
}

export function polylineLength(pts: P[], closed = false): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 1) l += dist(pts[pts.length - 1], pts[0]);
  return l;
}

export function circlePoints(cx: number, cy: number, r: number, startAngle = 0): P[] {
  // Chords of at most ~0.5 mm, at least 24 segments; deterministic.
  const n = Math.max(24, Math.ceil((2 * Math.PI * Math.abs(r)) / 5));
  const pts: P[] = [];
  for (let i = 0; i < n; i++) {
    const t = startAngle + (i / n) * Math.PI * 2;
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return pts;
}

/** Drop consecutive duplicates (and a duplicated closing point for rings). */
export function dedupe(pts: P[], closed: boolean, eps = 0.01): P[] {
  const out: P[] = [];
  for (const p of pts) {
    if (out.length === 0 || dist(out[out.length - 1], p) > eps) out.push(p);
  }
  if (closed && out.length > 1 && dist(out[0], out[out.length - 1]) <= eps) out.pop();
  return out;
}

export interface Area {
  outer: P[];
  holes: P[][];
}

export interface PathSpec {
  points: P[];
  closed: boolean;
}

const toP = (pts: Pt[]): P[] => pts.map((p) => [p[0], p[1]] as P);

export function railPoints(r: RailGeometry): { points: P[]; closed: boolean } {
  if (r.kind === 'circle') return { points: circlePoints(r.cx, r.cy, r.r), closed: true };
  return { points: dedupe(toP(r.points), false), closed: false };
}

/** Closed areas of a geometry (empty for open paths). */
export function areasOf(g: Geometry): Area[] {
  switch (g.kind) {
    case 'circle':
      return [{ outer: circlePoints(g.cx, g.cy, g.r), holes: [] }];
    case 'polygon':
      return [{ outer: dedupe(toP(g.points), true), holes: (g.holes ?? []).map((h) => dedupe(toP(h), true)) }];
    case 'compound':
      return g.parts.map((r: Ring) => ({
        outer: dedupe(toP(r.points), true),
        holes: (r.holes ?? []).map((h) => dedupe(toP(h), true)),
      }));
    case 'satin': {
      const a = railPoints(g.railA);
      const b = railPoints(g.railB);
      if (a.closed && b.closed) {
        const [outer, inner] = Math.abs(signedArea(a.points)) >= Math.abs(signedArea(b.points)) ? [a, b] : [b, a];
        return [{ outer: outer.points, holes: [inner.points] }];
      }
      return [{ outer: [...a.points, ...[...b.points].reverse()], holes: [] }];
    }
    default:
      return [];
  }
}

/** Paths to follow for run stitches. */
export function pathsOf(g: Geometry): PathSpec[] {
  switch (g.kind) {
    case 'polyline':
      return [{ points: dedupe(toP(g.points), false), closed: false }];
    case 'satin': {
      const a = railPoints(g.railA);
      const b = railPoints(g.railB);
      // Center line between the rails.
      const n = Math.max(a.points.length, b.points.length, 2);
      const ra = resampleByParam(a.points, a.closed, n);
      const rb = resampleByParam(b.points, b.closed, n);
      return [{ points: ra.map((p, i) => lerp(p, rb[i], 0.5)), closed: a.closed && b.closed }];
    }
    default: {
      const out: PathSpec[] = [];
      for (const ar of areasOf(g)) {
        out.push({ points: ar.outer, closed: true });
        for (const h of ar.holes) out.push({ points: h, closed: true });
      }
      return out;
    }
  }
}

export function isClosedGeometry(g: Geometry): boolean {
  return g.kind === 'circle' || g.kind === 'polygon' || g.kind === 'compound';
}

/** n points evenly spaced by arc length along a path (closed: n samples around, no repeat). */
export function resampleByParam(pts: P[], closed: boolean, n: number): P[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => pts[0]);
  const path = closed ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + dist(path[i - 1], path[i]));
  const total = cum[cum.length - 1];
  const out: P[] = [];
  const steps = closed ? n : n - 1;
  let seg = 1;
  for (let k = 0; k < n; k++) {
    const target = steps === 0 ? 0 : (total * k) / steps;
    while (seg < path.length - 1 && cum[seg] < target) seg++;
    const l0 = cum[seg - 1];
    const l1 = cum[seg];
    const t = l1 === l0 ? 0 : (target - l0) / (l1 - l0);
    out.push(lerp(path[seg - 1], path[seg], Math.min(1, Math.max(0, t))));
  }
  return out;
}

/** Point at arc length s along a polyline (with cumulative lengths precomputed). */
export function pointAt(path: P[], cum: number[], s: number): P {
  if (s <= 0) return path[0];
  const total = cum[cum.length - 1];
  if (s >= total) return path[path.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return lerp(path[lo], path[hi], t);
}

export function cumulative(path: P[]): number[] {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + dist(path[i - 1], path[i]));
  return cum;
}

export function pointInRing(p: P, ring: P[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInArea(p: P, a: Area): boolean {
  if (!pointInRing(p, a.outer)) return false;
  for (const h of a.holes) if (pointInRing(p, h)) return false;
  return true;
}

/** Distance from p to segment ab. */
export function distToSegment(p: P, a: P, b: P): number {
  const ab = sub(b, a);
  const l2 = ab[0] * ab[0] + ab[1] * ab[1];
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2));
  return dist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t]);
}

export function boundsOf(pts: Iterable<P | Pt>): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

export function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Bounds of an object's geometry (outline, not stitches). */
export function geometryBounds(g: Geometry): Bounds | null {
  if (g.kind === 'stitches') {
    const pts: P[] = [];
    for (let i = 0; i + 2 < g.data.length; i += 3) pts.push([g.data[i], g.data[i + 1]]);
    return boundsOf(pts);
  }
  if (g.kind === 'satin') {
    return unionBounds(boundsOf(railPoints(g.railA).points), boundsOf(railPoints(g.railB).points));
  }
  if (g.kind === 'circle') return { minX: g.cx - g.r, minY: g.cy - g.r, maxX: g.cx + g.r, maxY: g.cy + g.r };
  const all: P[] = [];
  for (const p of pathsOf(g)) all.push(...p.points);
  return boundsOf(all);
}

/** Principal axis angle (radians) of a point cloud. */
export function principalAngle(pts: P[]): number {
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p[0];
    my += p[1];
  }
  mx /= pts.length || 1;
  my /= pts.length || 1;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    const dx = p[0] - mx;
    const dy = p[1] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}

/** Offset an open or closed polyline sideways by d (positive = left of travel in screen coords). */
export function offsetPolyline(pts: P[], d: number, closed: boolean): P[] {
  const n = pts.length;
  if (n < 2) return pts.slice();
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const prev = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
    const next = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
    const cur = pts[i];
    const d1 = norm(sub(cur, prev));
    const d2 = norm(sub(next, cur));
    const n1: P = i === 0 && !closed ? [d2[1], -d2[0]] : [d1[1], -d1[0]];
    const n2: P = i === n - 1 && !closed ? n1 : [d2[1], -d2[0]];
    let m = norm(add(n1, n2));
    if (len(m) === 0) m = n1;
    const cos = m[0] * n1[0] + m[1] * n1[1];
    const miter = Math.min(1 / Math.max(cos, 0.25), 4);
    out.push([cur[0] + m[0] * d * miter, cur[1] + m[1] * d * miter]);
  }
  return out;
}

export const roundPt = (p: P): Pt => [Math.round(p[0]), Math.round(p[1])];
