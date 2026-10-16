/**
 * Travel inside an object: moving between its parts (underlay passes, fill sections, columns)
 * with stitches that stay inside the shape — so they end up under the stitching — instead of
 * a jump and a trim. A straight hop is used when it stays inside; otherwise the path follows
 * the outline (just inside it), if that is not a long detour.
 */
import { offsetAreas } from './clip';
import { dist, lerp, pointInArea, type Area, type P } from './geom';
import { runStitches } from './run';

/** Longest straight hop stitched inside a shape (0.1 mm). */
export const TRAVEL_INSIDE_MAX = 120;
/** Longest route along the outline (0.1 mm). */
export const TRAVEL_EDGE_MAX = 400;
const STEP = 25;

export interface TravelContext {
  /** The shape, grown a little so points on its edge count as inside. */
  grown: Area[];
  /** Outline rings just inside the shape, for routing along the edge. */
  rings: P[][];
}

export function travelContext(areas: Area[]): TravelContext | null {
  if (!areas.length) return null;
  return {
    grown: offsetAreas(areas, 4),
    rings: offsetAreas(areas, -4).flatMap((a) => [a.outer, ...a.holes]).filter((r) => r.length >= 3),
  };
}

const inside = (ctx: TravelContext, p: P) => ctx.grown.some((a) => pointInArea(p, a));

function straightInside(ctx: TravelContext, a: P, b: P): boolean {
  const n = Math.max(1, Math.ceil(dist(a, b) / 5));
  for (let i = 1; i < n; i++) if (!inside(ctx, lerp(a, b, i / n))) return false;
  return true;
}

function split(a: P, b: P, max: number): P[] {
  const n = Math.max(1, Math.ceil(dist(a, b) / max));
  return Array.from({ length: n }, (_, i) => lerp(a, b, (i + 1) / n));
}

/** Points to stitch from `from` to `to` inside the shape (ending at `to`), or null to jump. */
export function travelPath(ctx: TravelContext | null, from: P, to: P): P[] | null {
  if (!ctx) return null;
  const d = dist(from, to);
  if (d <= TRAVEL_INSIDE_MAX && straightInside(ctx, from, to)) return split(from, to, STEP);
  if (d > TRAVEL_EDGE_MAX) return null;
  // Along the nearest outline ring that both ends are close to.
  let best: P[] | null = null;
  let bestLen = Infinity;
  for (const ring of ctx.rings) {
    const near = (p: P) => {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < ring.length; i++) {
        const dd = dist(ring[i], p);
        if (dd < bd) [bd, bi] = [dd, i];
      }
      return { i: bi, d: bd };
    };
    const s = near(from);
    const e = near(to);
    if (s.d > 30 || e.d > 30) continue;
    for (const dir of [1, -1]) {
      const path: P[] = [];
      let len = 0;
      let prev = from;
      for (let i = s.i, guard = 0; guard <= ring.length; guard++, i = (i + dir + ring.length) % ring.length) {
        len += dist(prev, ring[i]);
        prev = ring[i];
        path.push(ring[i]);
        if (i === e.i) break;
      }
      len += dist(prev, to);
      if (len < bestLen) [best, bestLen] = [path, len];
    }
  }
  if (!best || bestLen > Math.max(d * 3, d + 60) || bestLen > TRAVEL_EDGE_MAX) return null;
  // Even stitches along the route (the outline's own vertices are far too close together).
  const st = runStitches(rdp([from, ...best, to], 4), false, STEP);
  return st.length > 1 ? st.slice(1) : [to];
}

/** Ramer–Douglas–Peucker: drop points within `eps` of the line (keeps the route's real turns only). */
function rdp(pts: P[], eps: number): P[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const L = dist(a, b) || 1;
  let bi = 0;
  let bd = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / L;
    if (d > bd) [bd, bi] = [d, i];
  }
  if (bd <= eps) return [a, b];
  return [...rdp(pts.slice(0, bi + 1), eps).slice(0, -1), ...rdp(pts.slice(bi), eps)];
}
