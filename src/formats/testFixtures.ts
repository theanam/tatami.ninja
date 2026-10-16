/** Shared sample patterns for the format tests. */
import type { StitchPattern } from '../model/types';
import { CMD } from '../model/types';

export function makePattern(
  recs: [number, number, number][],
  threads: { hex: string; name: string }[] = [{ hex: '#24357A', name: 'Navy' }],
  name = 'Test',
): StitchPattern {
  return {
    name,
    xs: recs.map((r) => r[0]),
    ys: recs.map((r) => r[1]),
    cmds: recs.map((r) => r[2]),
    threads,
  };
}

/** Three color blocks, trims, a long jump; no long stitches (positions survive every format). */
export function sampleDesign(withStop = false): StitchPattern {
  const r: [number, number, number][] = [];
  r.push([-400, -300, CMD.JUMP]);
  for (let i = 0; i <= 40; i++) r.push([-400 + i * 10, -300 + (i % 2) * 30, CMD.STITCH]);
  r.push([0, 0, CMD.TRIM]);
  r.push([350, 250, CMD.JUMP]);
  for (let i = 0; i <= 20; i++) r.push([350 - i * 12, 250 - (i % 3) * 7, CMD.STITCH]);
  r.push([0, 0, CMD.TRIM]);
  r.push([0, 0, CMD.COLOR_CHANGE]);
  r.push([-200, 200, CMD.JUMP]);
  for (let i = 0; i <= 30; i++) {
    r.push([-200 + Math.round(60 * Math.cos(i / 5)), 200 + Math.round(60 * Math.sin(i / 5)), CMD.STITCH]);
  }
  if (withStop) {
    r.push([0, 0, CMD.STOP]);
    for (let i = 1; i <= 10; i++) r.push([-140 + i * 5, 200 + i * 3, CMD.STITCH]);
  }
  r.push([0, 0, CMD.TRIM]);
  r.push([0, 0, CMD.COLOR_CHANGE]);
  r.push([500, -500, CMD.JUMP]);
  for (let i = 0; i <= 25; i++) r.push([500 - i * 20, -500 + i * 15, CMD.STITCH]);
  r.push([0, 0, CMD.TRIM]);
  r.push([0, 0, CMD.END]);
  return makePattern(r, [
    { hex: '#24357A', name: 'Navy' },
    { hex: '#ED171F', name: 'Red' },
    { hex: '#1E8A3C', name: 'Green' },
  ]);
}

/** Stitch positions re-centered on their bounding-box center (same rule as the readers). */
export function centeredStitches(p: StitchPattern): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < p.cmds.length; i++) if (p.cmds[i] === CMD.STITCH) pts.push([p.xs[i], p.ys[i]]);
  if (!pts.length) return pts;
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
  const cy = Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
  return pts.map(([x, y]) => [x - cx, y - cy]);
}

export function countCmd(p: StitchPattern, c: number): number {
  let n = 0;
  for (let i = 0; i < p.cmds.length; i++) if (p.cmds[i] === c) n++;
  return n;
}
