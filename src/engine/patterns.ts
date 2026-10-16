import { clipLines } from './clip';
import { dist, lerp, pointInArea, rotate, type Area, type P } from './geom';
import { getMotif, motifRows } from './motifs';
import { runStitches } from './run';

import type { FillPattern } from '../model/types';

export type { FillPattern };
/** Open patterns are lattices; the others cover the shape densely. */
export const OPEN_PATTERNS: FillPattern[] = ['net', 'zigzag-net', 'cross', 'motif'];

export interface PatternOptions {
  pattern: Exclude<FillPattern, 'rows'>;
  /** Line spacing (0.1 mm): dense for radial/spiral/circles, open for net and cross. */
  spacing: number;
  stitchLen: number;
  angleDeg: number;
  startNear?: P | null;
  motif?: string;
  /** Motif cell width (0.1 mm). */
  motifSize?: number;
}

function bboxOf(areas: Area[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const a of areas) {
    for (const p of a.outer) {
      minX = Math.min(minX, p[0]);
      minY = Math.min(minY, p[1]);
      maxX = Math.max(maxX, p[0]);
      maxY = Math.max(maxY, p[1]);
    }
  }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, r: Math.hypot(maxX - minX, maxY - minY) / 2 };
}

/** Parallel straight lines at an angle, covering a circle of radius r around (cx, cy). */
function parallel(cx: number, cy: number, r: number, spacing: number, angleDeg: number, zig = 0): P[][] {
  const t = (angleDeg * Math.PI) / 180;
  const out: P[][] = [];
  const n = Math.ceil(r / spacing);
  for (let k = -n; k <= n; k++) {
    const y = k * spacing;
    const line: P[] = [];
    if (zig) {
      // Zigzag line: teeth of width `zig` along the row, half a spacing tall.
      for (let x = -r, i = 0; x <= r + zig; x += zig, i++) line.push([x, y + (i % 2 ? spacing / 2 : 0)]);
    } else {
      line.push([-r, y], [r, y]);
    }
    out.push(line.map((p) => {
      const q = rotate(p, -t);
      return [q[0] + cx, q[1] + cy] as P;
    }));
  }
  return out;
}

/** The pattern's lines over the shape's bounding circle (unclipped). */
export function patternLines(areas: Area[], o: Pick<PatternOptions, 'pattern' | 'spacing' | 'angleDeg' | 'motif' | 'motifSize'>): P[][] {
  const b = bboxOf(areas);
  const s = o.pattern === 'motif' ? Math.max(0, o.spacing) : Math.max(2, o.spacing);
  switch (o.pattern) {
    case 'circles': {
      const out: P[][] = [];
      for (let r = s / 2; r <= b.r + s; r += s) {
        const n = Math.max(16, Math.ceil((2 * Math.PI * r) / 5));
        const ring: P[] = [];
        for (let i = 0; i <= n; i++) ring.push([b.cx + r * Math.cos((2 * Math.PI * i) / n), b.cy + r * Math.sin((2 * Math.PI * i) / n)]);
        out.push(ring);
      }
      return out;
    }
    case 'spiral': {
      const line: P[] = [];
      const turns = b.r / s + 1;
      const tMax = turns * 2 * Math.PI;
      for (let t = 0; t <= tMax; ) {
        const r = (s * t) / (2 * Math.PI);
        line.push([b.cx + r * Math.cos(t), b.cy + r * Math.sin(t)]);
        t += Math.min(0.3, 5 / Math.max(r, 1));
      }
      return [line];
    }
    case 'radial': {
      // 2^m rays; ray k starts where its neighbors are at least `s` apart, so the middle is not a knot.
      const m = Math.max(3, Math.ceil(Math.log2((2 * Math.PI * b.r) / s)));
      const N = 2 ** m;
      const out: P[][] = [];
      for (let k = 0; k < N; k++) {
        let tz = 0;
        while (k > 0 && ((k >> tz) & 1) === 0) tz++;
        const level = k === 0 ? m : tz;
        const r0 = k === 0 ? 0 : (s * N) / (2 * Math.PI) / 2 ** level / 2;
        const a = (2 * Math.PI * k) / N;
        out.push([
          [b.cx + r0 * Math.cos(a), b.cy + r0 * Math.sin(a)],
          [b.cx + (b.r + s) * Math.cos(a), b.cy + (b.r + s) * Math.sin(a)],
        ]);
      }
      return out;
    }
    case 'net':
      return [...parallel(b.cx, b.cy, b.r, s, o.angleDeg + 30), ...parallel(b.cx, b.cy, b.r, s, o.angleDeg - 30)];
    case 'zigzag-net':
      return [...parallel(b.cx, b.cy, b.r, s, o.angleDeg + 30, s / 2), ...parallel(b.cx, b.cy, b.r, s, o.angleDeg - 30, s / 2)];
    case 'cross':
      return [...parallel(b.cx, b.cy, b.r, s, o.angleDeg + 45), ...parallel(b.cx, b.cy, b.r, s, o.angleDeg - 45)];
    case 'motif':
      // Here `spacing` is the gap between motif rows (may be 0).
      return motifRows(getMotif(o.motif), b.cx, b.cy, b.r, Math.max(20, o.motifSize ?? 60), o.spacing, o.angleDeg);
  }
}

/**
 * Pattern fill: the pattern's lines, clipped to the shape, sewn as runs in nearest-next order.
 * Travel between lines is stitched when it stays inside the shape; otherwise a new group starts
 * (the caller jumps/trims between groups).
 */
export function patternFill(areas: Area[], o: PatternOptions): P[][] {
  const pieces = clipLines(patternLines(areas, o), areas).filter((l) => lineLength(l) >= 5);
  const used = new Array(pieces.length).fill(false);
  const groups: P[][] = [];
  let group: P[] = [];
  let cur: P | null = o.startNear ?? null;
  for (let n = 0; n < pieces.length; n++) {
    let best = -1;
    let rev = false;
    let bd = Infinity;
    for (let i = 0; i < pieces.length; i++) {
      if (used[i]) continue;
      if (!cur) {
        best = i;
        break;
      }
      const l = pieces[i];
      const d0 = dist(cur, l[0]);
      const d1 = dist(cur, l[l.length - 1]);
      if (d0 < bd) [bd, best, rev] = [d0, i, false];
      if (d1 < bd) [bd, best, rev] = [d1, i, true];
    }
    used[best] = true;
    const line = rev ? [...pieces[best]].reverse() : pieces[best];
    const st = runStitches(line, false, o.pattern === 'motif' ? Math.min(o.stitchLen, 25) : o.stitchLen, null);
    // Long travel across an open pattern would show, so only short hops are stitched.
    const maxTravel = OPEN_PATTERNS.includes(o.pattern) ? 25 : Math.max(30, o.spacing * 3);
    if (cur && group.length && (dist(cur, st[0]) > maxTravel || !inside(cur, st[0], areas))) {
      groups.push(group);
      group = [];
    }
    group.push(...st);
    cur = st[st.length - 1];
  }
  if (group.length) groups.push(group);
  return groups;
}

function lineLength(l: P[]) {
  let s = 0;
  for (let i = 1; i < l.length; i++) s += dist(l[i - 1], l[i]);
  return s;
}

function inside(a: P, b: P, areas: Area[]): boolean {
  const d = dist(a, b);
  if (d < 15) return true;
  const n = Math.ceil(d / 5);
  for (let i = 1; i < n; i++) {
    const p = lerp(a, b, i / n);
    if (!areas.some((ar) => pointInArea(p, ar))) return false;
  }
  return true;
}
