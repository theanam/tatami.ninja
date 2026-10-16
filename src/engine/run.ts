import { dist, lerp, norm, sub, type P } from './geom';

/**
 * Resample a path into run stitches of at most `stitchLen`, keeping sharp corners.
 * For closed paths the result ends back at the start point.
 */
export function runStitches(points: P[], closed: boolean, stitchLen: number, startNear?: P | null): P[] {
  if (points.length === 0) return [];
  // Offset rings (clipper) carry clusters of near-duplicate vertices that read as corners.
  let pts = thinPath(points, 3, closed);
  if (closed && startNear) pts = rotateRingToNearest(pts, startNear);
  if (!closed && startNear && dist(pts[pts.length - 1], startNear) < dist(pts[0], startNear)) {
    pts = [...pts].reverse();
  }
  const path = closed ? [...pts, pts[0]] : pts;
  if (path.length === 1) return [path[0]];
  const L = Math.max(5, stitchLen);
  const out: P[] = [path[0]];
  // Split the path at corners sharper than ~30°, then subdivide each run evenly.
  const corners: number[] = [0];
  for (let i = 1; i < path.length - 1; i++) {
    const a = norm(sub(path[i], path[i - 1]));
    const b = norm(sub(path[i + 1], path[i]));
    if (a[0] * b[0] + a[1] * b[1] < Math.cos(Math.PI / 6)) corners.push(i);
  }
  corners.push(path.length - 1);
  for (let c = 1; c < corners.length; c++) {
    const seg = path.slice(corners[c - 1], corners[c] + 1);
    let segLen = 0;
    for (let i = 1; i < seg.length; i++) segLen += dist(seg[i - 1], seg[i]);
    if (segLen < 0.5) continue;
    const n = Math.max(1, Math.round(segLen / L + 0.49));
    const step = segLen / n;
    let i = 1;
    let acc = 0;
    for (let k = 1; k < n; k++) {
      const target = k * step;
      while (i < seg.length && acc + dist(seg[i - 1], seg[i]) < target) {
        acc += dist(seg[i - 1], seg[i]);
        i++;
      }
      if (i >= seg.length) break;
      const d = dist(seg[i - 1], seg[i]);
      out.push(lerp(seg[i - 1], seg[i], d === 0 ? 0 : (target - acc) / d));
    }
    out.push(seg[seg.length - 1]);
  }
  return out;
}

/** Bean / triple stitch: every stitch is sewn forward, back, forward. */
export function beanStitches(stitches: P[], repeats: number): P[] {
  if (repeats <= 1 || stitches.length < 2) return stitches;
  const out: P[] = [stitches[0]];
  const extra = repeats % 2 === 1 ? repeats : repeats + 1;
  for (let i = 1; i < stitches.length; i++) {
    for (let r = 0; r < extra; r++) out.push(r % 2 === 0 ? stitches[i] : stitches[i - 1]);
  }
  return out;
}

/** Drop points closer than `minDist` to the previous kept point. */
export function thinPath(points: P[], minDist: number, closed: boolean): P[] {
  if (points.length < 3) return points;
  const out: P[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = i === points.length - 1 && !closed;
    if (last || dist(out[out.length - 1], points[i]) >= minDist) out.push(points[i]);
  }
  if (closed && out.length > 3 && dist(out[out.length - 1], out[0]) < minDist) out.pop();
  return out.length >= (closed ? 3 : 2) ? out : points;
}

export function rotateRingToNearest(ring: P[], p: P): P[] {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const d = dist(ring[i], p);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return [...ring.slice(best), ...ring.slice(0, best)];
}
