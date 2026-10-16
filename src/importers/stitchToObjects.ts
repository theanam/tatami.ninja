/**
 * Stitches → objects ("stitch to block"): turn raw stitches from an opened stitch file back
 * into editable objects. Each sewn stretch (between jumps and trims) is classified:
 * - run: a line that rarely overlaps itself → a run path;
 * - satin: stitches that reverse direction every time → a satin area;
 * - fill: everything dense → a tatami area with the stitches' row angle.
 */
import { normalizeAreas, offsetAreas, strokeAreas, areaOfAreas } from '../engine/clip';
import type { Area, P } from '../engine/geom';
import { newId } from '../model/project';
import { normAngle } from '../model/transform';
import { CMD, type Pt, type StitchObject } from '../model/types';
import { simplify, simplifyRing } from './svgPath';

/** Stroke width (0.1 mm) used to measure how much a stretch overlaps itself. */
const PROBE = 8;

export type StretchKind = 'run' | 'satin' | 'fill';

export function stretches(data: number[]): P[][] {
  const out: P[][] = [];
  let cur: P[] = [];
  for (let i = 0; i + 2 < data.length; i += 3) {
    const c = data[i + 2];
    if (c === CMD.STITCH) cur.push([data[i], data[i + 1]]);
    else if (c === CMD.JUMP || c === CMD.TRIM || c === CMD.STOP) {
      if (cur.length >= 2) out.push(cur);
      cur = c === CMD.JUMP ? [[data[i], data[i + 1]]] : [];
    }
  }
  if (cur.length >= 2) out.push(cur);
  return out;
}

const len = (a: P, b: P) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function classify(pts: P[]): { kind: StretchKind; area: Area[]; angleDeg: number } {
  let L = 0;
  let reversals = 0;
  let pairs = 0;
  // Doubled-angle average gives the dominant (undirected) stitch direction.
  let sx = 0;
  let sy = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = len(pts[i - 1], pts[i]);
    if (d < 0.5) continue;
    L += d;
    const a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    sx += d * Math.cos(2 * a);
    sy += d * Math.sin(2 * a);
    if (i >= 2 && len(pts[i - 2], pts[i - 1]) >= 0.5) {
      const ux = pts[i - 1][0] - pts[i - 2][0];
      const uy = pts[i - 1][1] - pts[i - 2][1];
      const vx = pts[i][0] - pts[i - 1][0];
      const vy = pts[i][1] - pts[i - 1][1];
      pairs++;
      if ((ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy)) < -0.8) reversals++;
    }
  }
  const stroke = strokeAreas([pts], PROBE);
  const coverage = L > 0 ? areaOfAreas(stroke) / (L * PROBE) : 1;
  const dir = Math.atan2(sy, sx) / 2;
  const angleDeg = normAngle((-dir * 180) / Math.PI);
  if (coverage > 0.7 || pts.length < 6) return { kind: 'run', area: [], angleDeg };
  // The covered area: the strokes, closed over small gaps, pulled back to the stitch ends.
  const area = offsetAreas(offsetAreas(stroke, 4), -(PROBE / 2 + 4)).filter((a) => a.outer.length >= 3);
  if (!area.length) return { kind: 'run', area: [], angleDeg };
  return { kind: pairs && reversals / pairs > 0.6 ? 'satin' : 'fill', area, angleDeg };
}

const roundPts = (pts: P[]): Pt[] => pts.map(([x, y]) => [Math.round(x), Math.round(y)]);

/** Editable objects for one raw stitch object (same thread). */
export function stitchesToObjects(o: StitchObject): StitchObject[] {
  if (o.geometry.kind !== 'stitches') return [o];
  const out: StitchObject[] = [];
  let n = 0;
  for (const pts of stretches(o.geometry.data)) {
    const c = classify(pts);
    n++;
    const base = { thread: o.thread, visible: true, locked: false, advanced: { tieIn: true, tieOff: true } };
    if (c.kind === 'run') {
      const line = simplify(pts, 2) as P[];
      out.push({ ...base, id: newId('o'), name: `${o.name} run ${n}`, type: 'run', geometry: { kind: 'polyline', points: roundPts(line) }, params: { stitchLength: 25 } });
      continue;
    }
    const areas = normalizeAreas(c.area, 'nonzero');
    out.push({
      ...base,
      id: newId('o'),
      name: `${o.name} ${c.kind} ${n}`,
      type: c.kind === 'satin' ? 'satin' : 'tatami',
      geometry: {
        kind: 'compound',
        parts: areas.map((a) => ({ points: roundPts(simplifyRing(a.outer, 1.5) as P[]), holes: a.holes.map((h) => roundPts(simplifyRing(h, 1.5) as P[])) })),
      },
      params: c.kind === 'fill' ? { angleDeg: c.angleDeg } : {},
    });
  }
  return out;
}
