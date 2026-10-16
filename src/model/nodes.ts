import type { Geometry, Pt } from './types';

/** An editable point of a geometry. `key` addresses it for updates. */
export interface Vertex {
  key: string;
  pt: Pt;
}

/** Every editable vertex. Circles expose a center and a radius handle. */
export function listVertices(g: Geometry): Vertex[] {
  const out: Vertex[] = [];
  const add = (prefix: string, pts: Pt[]) => pts.forEach((pt, i) => out.push({ key: `${prefix}${i}`, pt }));
  switch (g.kind) {
    case 'circle':
      out.push({ key: 'center', pt: [g.cx, g.cy] }, { key: 'radius', pt: [g.cx + g.r, g.cy] });
      break;
    case 'polygon':
      add('p:', g.points);
      g.holes?.forEach((h, hi) => add(`h:${hi}:`, h));
      break;
    case 'polyline':
      add('p:', g.points);
      break;
    case 'compound':
      g.parts.forEach((part, ci) => {
        add(`c:${ci}:p:`, part.points);
        part.holes?.forEach((h, hi) => add(`c:${ci}:h:${hi}:`, h));
      });
      break;
    case 'satin':
      if (g.railA.kind === 'polyline') add('a:', g.railA.points);
      else out.push({ key: 'a:radius', pt: [g.railA.cx + g.railA.r, g.railA.cy] });
      if (g.railB.kind === 'polyline') add('b:', g.railB.points);
      else out.push({ key: 'b:radius', pt: [g.railB.cx + g.railB.r, g.railB.cy] });
      break;
    case 'stitches':
      break;
  }
  return out;
}

/** Resolve a key to [array, index] inside a (cloned) geometry. */
function locate(g: Geometry, key: string): [Pt[], number] | null {
  const parts = key.split(':');
  const idx = Number(parts[parts.length - 1]);
  if (!Number.isInteger(idx)) return null;
  if (g.kind === 'polygon' || g.kind === 'polyline') {
    if (parts[0] === 'p') return [g.points, idx];
    if (parts[0] === 'h' && g.kind === 'polygon' && g.holes) return [g.holes[Number(parts[1])], idx];
  }
  if (g.kind === 'compound' && parts[0] === 'c') {
    const part = g.parts[Number(parts[1])];
    if (!part) return null;
    if (parts[2] === 'p') return [part.points, idx];
    if (parts[2] === 'h' && part.holes) return [part.holes[Number(parts[3])], idx];
  }
  if (g.kind === 'satin') {
    const rail = parts[0] === 'a' ? g.railA : parts[0] === 'b' ? g.railB : null;
    if (rail?.kind === 'polyline') return [rail.points, idx];
  }
  return null;
}

const clone = (g: Geometry): Geometry => JSON.parse(JSON.stringify(g)) as Geometry;

export function moveVertex(g: Geometry, key: string, pt: Pt): Geometry {
  const p: Pt = [Math.round(pt[0]), Math.round(pt[1])];
  if (g.kind === 'circle') {
    if (key === 'center') return { ...g, cx: p[0], cy: p[1] };
    if (key === 'radius') return { ...g, r: Math.max(5, Math.round(Math.hypot(p[0] - g.cx, p[1] - g.cy))) };
    return g;
  }
  if (g.kind === 'satin' && key.endsWith('radius')) {
    const which = key.startsWith('a') ? 'railA' : 'railB';
    const rail = g[which];
    if (rail.kind !== 'circle') return g;
    return { ...g, [which]: { ...rail, r: Math.max(5, Math.round(Math.hypot(p[0] - rail.cx, p[1] - rail.cy))) } };
  }
  const c = clone(g);
  const loc = locate(c, key);
  if (!loc) return g;
  loc[0][loc[1]] = p;
  return c;
}

/** Remove a vertex, keeping at least 3 points on rings and 2 on lines. */
export function deleteVertex(g: Geometry, key: string): Geometry {
  const c = clone(g);
  const loc = locate(c, key);
  if (!loc) return g;
  const [arr, i] = loc;
  const min = c.kind === 'polyline' || c.kind === 'satin' ? 2 : 3;
  if (arr.length <= min) return g;
  if (c.kind === 'satin') {
    // Keep rails paired: drop the matching rung point on the other rail too.
    const other = key.startsWith('a') ? c.railB : c.railA;
    if (other.kind === 'polyline' && other.points.length === arr.length && other.points.length > 2) other.points.splice(i, 1);
  }
  arr.splice(i, 1);
  return c;
}

/** Insert a point after vertex `key` (on the segment to the next point). */
export function insertVertexAfter(g: Geometry, key: string, pt: Pt): Geometry {
  const c = clone(g);
  const loc = locate(c, key);
  if (!loc) return g;
  loc[0].splice(loc[1] + 1, 0, [Math.round(pt[0]), Math.round(pt[1])]);
  return c;
}

/** Index of the segment nearest to p, as the key of its first vertex. */
export function nearestSegment(g: Geometry, p: Pt, closedRings = true): { key: string; dist: number } | null {
  let best: { key: string; dist: number } | null = null;
  const consider = (prefix: string, pts: Pt[], closed: boolean) => {
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const d = segDist(p, a, b);
      if (!best || d < best.dist) best = { key: `${prefix}${i}`, dist: d };
    }
  };
  switch (g.kind) {
    case 'polygon':
      consider('p:', g.points, closedRings);
      g.holes?.forEach((h, hi) => consider(`h:${hi}:`, h, closedRings));
      break;
    case 'polyline':
      consider('p:', g.points, false);
      break;
    case 'compound':
      g.parts.forEach((part, ci) => {
        consider(`c:${ci}:p:`, part.points, closedRings);
        part.holes?.forEach((h, hi) => consider(`c:${ci}:h:${hi}:`, h, closedRings));
      });
      break;
    default:
      return null;
  }
  return best;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}
