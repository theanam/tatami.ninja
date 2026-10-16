import { offsetAreas } from './clip';
import { dist, lerp, pointInArea, type Area, type P } from './geom';
import { runStitches } from './run';

/** Concentric contour fill: inward offsets of the outline, sewn from the outside in. */
export function contourFill(areas: Area[], spacing: number, stitchLen: number, startNear?: P | null): P[][] {
  const rings: P[][] = [];
  let current = offsetAreas(areas, -spacing / 2);
  for (let guard = 0; current.length > 0 && guard < 400; guard++) {
    for (const a of current) {
      if (a.outer.length >= 3) rings.push(a.outer);
      for (const h of a.holes) if (h.length >= 3) rings.push(h);
    }
    current = offsetAreas(current, -spacing);
  }
  const groups: P[][] = [];
  let group: P[] = [];
  let cur: P | null = startNear ?? null;
  const used = new Array(rings.length).fill(false);
  for (let count = 0; count < rings.length; count++) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < rings.length; i++) {
      if (used[i]) continue;
      if (!cur) {
        best = i;
        break;
      }
      for (const p of rings[i]) {
        const d = dist(p, cur);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    used[best] = true;
    const st = runStitches(rings[best], true, stitchLen, cur);
    if (cur && group.length && !segmentInside(cur, st[0], areas)) {
      groups.push(group);
      group = [];
    }
    group.push(...st);
    cur = st[st.length - 1];
  }
  if (group.length) groups.push(group);
  return groups;
}

function segmentInside(a: P, b: P, areas: Area[]): boolean {
  const d = dist(a, b);
  if (d < 15) return true;
  const n = Math.ceil(d / 5);
  for (let i = 1; i < n; i++) {
    const p = lerp(a, b, i / n);
    if (!areas.some((ar) => pointInArea(p, ar))) return false;
  }
  return true;
}
