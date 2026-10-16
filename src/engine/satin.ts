import {
  cumulative,
  dist,
  lerp,
  offsetPolyline,
  polylineLength,
  railPoints,
  resampleByParam,
  signedArea,
  type P,
} from './geom';
import type { RailGeometry } from '../model/types';
import { splitStitch } from './fill';
import { runStitches } from './run';

/** A satin column as densely paired rail samples: a[i] faces b[i]. */
export interface Column {
  a: P[];
  b: P[];
  closed: boolean;
}

const SAMPLE = 2; // 0.2 mm between samples

export function columnFromRails(railA: RailGeometry, railB: RailGeometry): Column {
  const A = railPoints(railA);
  const B = railPoints(railB);
  const closed = A.closed && B.closed;
  let ap = A.points;
  let bp = B.points;
  if (closed) {
    // Same orientation, then start B at the point nearest A's start.
    if (Math.sign(signedArea(ap)) !== Math.sign(signedArea(bp))) bp = [...bp].reverse();
    let best = 0;
    let bd = Infinity;
    bp.forEach((p, i) => {
      const d = dist(p, ap[0]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    bp = [...bp.slice(best), ...bp.slice(0, best)];
    const n = Math.ceil(Math.max(polylineLength(ap, true), polylineLength(bp, true)) / SAMPLE);
    const a = resampleByParam(ap, true, n);
    const b = resampleByParam(bp, true, n);
    return { a: [...a, a[0]], b: [...b, b[0]], closed: true };
  }
  // Open rails: same direction.
  if (
    dist(ap[0], bp[0]) + dist(ap[ap.length - 1], bp[bp.length - 1]) >
    dist(ap[0], bp[bp.length - 1]) + dist(ap[ap.length - 1], bp[0])
  ) {
    bp = [...bp].reverse();
  }
  if (ap.length === bp.length && ap.length > 2) {
    // Equal vertex counts: every vertex pair is a rung, interpolate piecewise.
    const a: P[] = [];
    const b: P[] = [];
    for (let i = 1; i < ap.length; i++) {
      const n = Math.max(1, Math.ceil(Math.max(dist(ap[i - 1], ap[i]), dist(bp[i - 1], bp[i])) / SAMPLE));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        a.push(lerp(ap[i - 1], ap[i], k / n));
        b.push(lerp(bp[i - 1], bp[i], k / n));
      }
    }
    return { a, b, closed: false };
  }
  const n = Math.max(2, Math.ceil(Math.max(polylineLength(ap), polylineLength(bp)) / SAMPLE) + 1);
  return { a: resampleByParam(ap, false, n), b: resampleByParam(bp, false, n), closed: false };
}

/** A column of `width` centered on a path. */
export function columnFromPath(points: P[], closed: boolean, width: number): Column {
  const total = polylineLength(points, closed);
  const n = Math.max(2, Math.ceil(total / 10) + (closed ? 0 : 1));
  const center = resampleByParam(points, closed, n);
  const a = offsetPolyline(center, width / 2, closed);
  const b = offsetPolyline(center, -width / 2, closed);
  if (closed) return { a: [...a, a[0]], b: [...b, b[0]], closed };
  return { a, b, closed };
}

export function reverseColumn(c: Column): Column {
  return { a: [...c.a].reverse(), b: [...c.b].reverse(), closed: c.closed };
}

export function columnWidth(c: Column): number {
  let s = 0;
  for (let i = 0; i < c.a.length; i++) s += dist(c.a[i], c.b[i]);
  return c.a.length ? s / c.a.length : 0;
}

interface Sampler {
  total: number;
  at(s: number): { a: P; b: P; ia: number; ib: number };
}

function sampler(c: Column): Sampler {
  const mid = c.a.map((p, i) => lerp(p, c.b[i], 0.5));
  const cum = cumulative(mid);
  const ca = cumulative(c.a);
  const cb = cumulative(c.b);
  const total = cum[cum.length - 1];
  return {
    total,
    at(s: number) {
      let lo = 0;
      let hi = cum.length - 1;
      if (s <= 0) hi = 1;
      else if (s >= total) lo = cum.length - 2;
      else {
        while (hi - lo > 1) {
          const m = (lo + hi) >> 1;
          if (cum[m] <= s) lo = m;
          else hi = m;
        }
      }
      lo = Math.max(0, lo);
      hi = Math.min(cum.length - 1, Math.max(hi, lo + 1));
      const t = Math.max(0, Math.min(1, (s - cum[lo]) / (cum[hi] - cum[lo] || 1)));
      return {
        a: lerp(c.a[lo], c.a[hi], t),
        b: lerp(c.b[lo], c.b[hi], t),
        ia: ca[lo] + (ca[hi] - ca[lo]) * t,
        ib: cb[lo] + (cb[hi] - cb[lo]) * t,
      };
    },
  };
}

export interface SatinOptions {
  /** Spacing between satin stitches on the same side, 0.1 mm. */
  density: number;
  pullComp: number;
  shortStitches: boolean;
  splitAbove: number;
}

/** Zigzag satin stitches across a column. */
export function satinStitches(c: Column, o: SatinOptions): P[] {
  if (c.a.length < 2) return [];
  const sm = sampler(c);
  if (sm.total < 1) return [];
  const step = Math.max(1, o.density) / 2;
  const n = Math.max(2, Math.round(sm.total / step));
  const pts: P[] = [];
  const samples = Array.from({ length: n + 1 }, (_, k) => sm.at((sm.total * k) / n));
  for (let k = 0; k <= n; k++) {
    const s = samples[k];
    const onA = k % 2 === 0;
    let p = onA ? s.a : s.b;
    const other = onA ? s.b : s.a;
    // Pull compensation: widen each stitch outward.
    const w = dist(p, other);
    if (w > 0 && o.pullComp) p = lerp(other, p, (w + o.pullComp / 2) / w);
    if (o.shortStitches && k >= 2 && k + 2 <= n && (k >> 1) % 2 === 1) {
      // Inner side of a curve: the rail advances much less than the center line.
      const prev = samples[k - 2];
      const railStep = onA ? s.ia - prev.ia : s.ib - prev.ib;
      const centerStep = (2 * sm.total) / n;
      if (railStep < centerStep * 0.6 && w > 15) p = lerp(other, p, 0.6);
    }
    pts.push(p);
  }
  const out: P[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) out.push(...splitStitch(pts[i - 1], pts[i], o.splitAbove, i));
  return out;
}

/** Inset copy of a column (for underlay). */
export function insetColumn(c: Column, inset: number): Column {
  const a: P[] = [];
  const b: P[] = [];
  for (let i = 0; i < c.a.length; i++) {
    const w = dist(c.a[i], c.b[i]);
    const f = w > 0 ? Math.min(0.45, inset / w) : 0;
    a.push(lerp(c.a[i], c.b[i], f));
    b.push(lerp(c.b[i], c.a[i], f));
  }
  return { a, b, closed: c.closed };
}

export function centerLine(c: Column): P[] {
  return c.a.map((p, i) => lerp(p, c.b[i], 0.5));
}

/** Zigzag between rails with wide spacing (underlay). */
export function zigzag(c: Column, spacing: number): P[] {
  const sm = sampler(c);
  const n = Math.max(2, Math.round(sm.total / (spacing / 2)));
  const out: P[] = [];
  for (let k = 0; k <= n; k++) {
    const s = sm.at((sm.total * k) / n);
    out.push(k % 2 === 0 ? s.a : s.b);
  }
  return out;
}

export function runAlong(pts: P[], stitchLen: number): P[] {
  return runStitches(pts, false, stitchLen);
}
