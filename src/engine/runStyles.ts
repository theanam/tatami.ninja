import { add, dist, lerp, norm, scale, sub, type P } from './geom';
import type { RunStyle } from '../model/types';
import { getMotif, motifAlong } from './motifs';
import { beanStitches, runStitches } from './run';

export type { RunStyle } from '../model/types';

const perp = (a: P, b: P): P => {
  const d = norm(sub(b, a));
  return [-d[1], d[0]];
};

/** Points every `step` along a path (the run stitch positions). */
function samples(points: P[], closed: boolean, step: number, startNear: P | null): P[] {
  return runStitches(points, closed, step, startNear);
}

/**
 * Stem stitch: overlapping slanted stitches. Each stitch reaches forward two steps on one side
 * of the line and comes back one step on the other, like a rope.
 */
export function stemStitches(points: P[], closed: boolean, len: number, width: number, startNear: P | null): P[] {
  const s = samples(points, closed, Math.max(5, len / 2), startNear);
  if (s.length < 3) return s;
  const w = width / 2;
  const out: P[] = [s[0]];
  for (let i = 0; i + 2 < s.length; i++) {
    const n = perp(s[i], s[i + 2]);
    out.push(add(s[i + 2], scale(n, w)));
    out.push(add(s[i + 1], scale(n, -w)));
  }
  out.push(s[s.length - 1]);
  return out;
}

/** Chain stitch: a row of linked loops along the line. */
export function chainStitches(points: P[], closed: boolean, len: number, width: number, startNear: P | null): P[] {
  const s = samples(points, closed, Math.max(10, len), startNear);
  if (s.length < 2) return s;
  const w = width / 2;
  const out: P[] = [s[0]];
  for (let i = 0; i + 1 < s.length; i++) {
    const a = s[i];
    const b = s[i + 1];
    const n = perp(a, b);
    const mid = lerp(a, b, 0.55);
    out.push(add(mid, scale(n, w)), b, add(mid, scale(n, -w)), lerp(a, b, 0.15), b);
  }
  return out;
}

/** Candlewicking: a run with a small knot every `spacing`. */
export function candlewickStitches(points: P[], closed: boolean, len: number, size: number, spacing: number, startNear: P | null): P[] {
  const run = samples(points, closed, Math.max(5, len), startNear);
  if (run.length < 2) return run;
  const out: P[] = [run[0]];
  // Knot stitches stay at least 1 mm long so they do not trip short-stitch problems.
  const r = Math.max(10, size / 2);
  let since = spacing; // knot at the start
  for (let i = 0; i < run.length; i++) {
    const p = run[i];
    if (i > 0) {
      since += dist(run[i - 1], p);
      out.push(p);
    }
    if (since >= spacing) {
      since = 0;
      // Two passes of a four-point star, ending back on the line.
      for (let k = 0; k < 2; k++) {
        for (let j = 0; j < 4; j++) {
          const t = ((j * 2 + k) * Math.PI) / 4;
          out.push([p[0] + r * Math.cos(t), p[1] + r * Math.sin(t)], p);
        }
      }
    }
  }
  return out;
}

/**
 * E stitch (blanket / buttonhole edge) and V stitch: prongs to one side of the line, used to
 * edge appliqué. E prongs stand square to the line; V prongs lean forward and back in turn.
 */
export function prongStitches(points: P[], closed: boolean, len: number, width: number, kind: 'e' | 'v', startNear: P | null): P[] {
  const s = samples(points, closed, Math.max(10, len), startNear);
  if (s.length < 2) return s;
  const out: P[] = [s[0]];
  for (let i = 0; i < s.length; i++) {
    const p = s[i];
    const a = s[Math.max(0, i - 1)];
    const b = s[Math.min(s.length - 1, i + 1)];
    const n = perp(a, b);
    if (i > 0) out.push(p);
    if (kind === 'e') {
      out.push(add(p, scale(n, width)), p);
    } else if (i + 1 < s.length) {
      // V: out to the side halfway to the next point, then down to it.
      out.push(add(lerp(p, s[i + 1], 0.5), scale(n, width)));
    }
  }
  return out;
}

export interface RunStyleOptions {
  style: RunStyle;
  stitchLength: number;
  width: number;
  knotSpacing: number;
  motif?: string;
  motifSize?: number;
}

/** Stitch one path in the given run style. */
export function styledRun(points: P[], closed: boolean, o: RunStyleOptions, startNear: P | null): P[] {
  switch (o.style) {
    case 'stem':
      return stemStitches(points, closed, o.stitchLength, o.width, startNear);
    case 'chain':
      return chainStitches(points, closed, o.stitchLength, o.width, startNear);
    case 'candlewick':
      return candlewickStitches(points, closed, o.stitchLength, o.width, o.knotSpacing, startNear);
    case 'e':
    case 'v':
      return prongStitches(points, closed, o.stitchLength, o.width, o.style, startNear);
    case 'motif': {
      const m = getMotif(o.motif);
      const w = Math.max(20, o.motifSize ?? 60);
      return runStitches(motifAlong(points, closed, m, w, w * m.aspect), false, Math.min(o.stitchLength, 20), startNear);
    }
    case 'triple':
      return beanStitches(runStitches(points, closed, o.stitchLength, startNear), 3);
    default:
      return runStitches(points, closed, o.stitchLength, startNear);
  }
}
