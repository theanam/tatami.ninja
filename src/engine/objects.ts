import type { RunStyle, StitchObject, UnderlayType } from '../model/types';
import { getFabric, type FabricPreset } from '../presets';
import { offsetAreas } from './clip';
import { contourFill } from './contour';
import { fillAreas } from './fill';
import { areasOf, pathsOf, principalAngle, type Area, type P } from './geom';
import { runStitches } from './run';
import { styledRun } from './runStyles';
import {
  centerLine,
  columnFromPath,
  columnFromRails,
  insetColumn,
  reverseColumn,
  runAlong,
  satinStitches,
  zigzag,
  type Column,
} from './satin';

/** One continuous run of needle points, or a machine stop. */
export type Piece = { pts: P[]; underlay?: boolean } | { stop: true };

export interface ResolvedParams {
  angleDeg: number;
  rowSpacing: number;
  stitchLength: number;
  repeats: number;
  runStyle: RunStyle;
  styleWidth: number;
  knotSpacing: number;
  density: number;
  width: number;
  shortStitches: boolean;
  splitAbove: number;
  contourSpacing: number;
  underlay: UnderlayType;
  pullComp: number;
  tieIn: boolean;
  tieOff: boolean;
  trimBefore: boolean;
  trimAfter: boolean;
}

/** Fill in defaults from the fabric preset (per-object overrides win). */
export function resolveParams(obj: StitchObject, fabricId: string): ResolvedParams {
  const f: FabricPreset = getFabric(fabricId);
  const p = obj.params ?? {};
  const a = obj.advanced ?? {};
  const isSatin = obj.type === 'satin' || obj.type === 'applique';
  const defaultUnderlay: UnderlayType =
    obj.type === 'run' || obj.type === 'stitches' ? 'none' : isSatin ? f.satinUnderlay : f.fillUnderlay;
  return {
    angleDeg: p.angleDeg ?? 45,
    rowSpacing: p.rowSpacing ?? f.rowSpacing,
    stitchLength: p.stitchLength ?? (obj.type === 'run' ? 25 : obj.type === 'contour' ? 25 : 35),
    repeats: p.repeats ?? 1,
    runStyle: p.runStyle ?? ((p.repeats ?? 1) >= 3 ? 'triple' : 'single'),
    styleWidth: p.styleWidth ?? (p.runStyle === 'candlewick' ? 24 : 20),
    knotSpacing: p.knotSpacing ?? 50,
    density: p.density ?? f.satinDensity,
    width: p.width ?? 30,
    shortStitches: p.shortStitches ?? true,
    splitAbove: p.splitAbove ?? 80,
    contourSpacing: p.contourSpacing ?? p.rowSpacing ?? f.rowSpacing,
    underlay: a.underlay === undefined || a.underlay === 'inherit' ? defaultUnderlay : a.underlay,
    pullComp: a.pullComp === undefined || a.pullComp === 'inherit' ? (obj.type === 'run' ? 0 : f.pullComp) : a.pullComp,
    tieIn: a.tieIn ?? true,
    tieOff: a.tieOff ?? true,
    trimBefore: a.trimBefore ?? false,
    trimAfter: a.trimAfter ?? false,
  };
}

/** Generate the stitch pieces of one object. Deterministic, no DOM. */
export function generateObject(obj: StitchObject, fabricId: string, startNear: P | null): Piece[] {
  const r = resolveParams(obj, fabricId);
  const g = obj.geometry;
  if (g.kind === 'stitches') return [];
  const entry = resolveEntry(obj, startNear);

  switch (obj.type) {
    case 'run': {
      const out: Piece[] = [];
      let cur = entry;
      for (const path of pathsOf(g)) {
        const st = styledRun(path.points, path.closed, { style: r.runStyle, stitchLength: r.stitchLength, width: r.styleWidth, knotSpacing: r.knotSpacing }, cur);
        if (st.length) {
          out.push({ pts: st });
          cur = st[st.length - 1];
        }
      }
      return out;
    }
    case 'tatami':
    case 'contour': {
      const areas = areasOf(g);
      if (!areas.length) return generateObject({ ...obj, type: 'run' }, fabricId, startNear);
      const under = fillUnderlay(areas, r, entry);
      const last = lastPoint(under) ?? entry;
      const top =
        obj.type === 'tatami'
          ? fillAreas(areas, {
              angleDeg: r.angleDeg,
              spacing: r.rowSpacing,
              stitchLen: r.stitchLength,
              pullComp: r.pullComp,
              startNear: last,
            })
          : contourFill(areas, r.contourSpacing, r.stitchLength, last);
      return [...under, ...top.map((pts) => ({ pts }))];
    }
    case 'satin': {
      if (g.kind === 'satin') return satinColumnPieces(columnFromRails(g.railA, g.railB), r, entry);
      if (g.kind === 'polyline') {
        const path = pathsOf(g)[0];
        return satinColumnPieces(columnFromPath(path.points, false, r.width), r, entry);
      }
      const areas = areasOf(g);
      if (!areas.length) return [];
      // Satin on a closed shape: zigzag across each part's short direction (e.g. per glyph).
      const out: Piece[] = [];
      let cur = entry;
      for (const area of areas) {
        const axis = principalAngle(area.outer);
        const angleDeg = -((axis + Math.PI / 2) * 180) / Math.PI;
        const under = fillUnderlay([area], { ...r, angleDeg }, cur);
        const top = fillAreas([area], {
          angleDeg,
          spacing: r.density / 2,
          stitchLen: r.splitAbove,
          pullComp: r.pullComp,
          mode: 'satin',
          splitAbove: r.splitAbove,
          startNear: lastPoint(under) ?? cur,
        });
        out.push(...under, ...top.map((p) => ({ pts: p })));
        cur = lastPoint(out) ?? cur;
      }
      return out;
    }
    case 'applique': {
      const areas = areasOf(g);
      if (!areas.length) return [];
      const out: Piece[] = [];
      const rings = areas.flatMap((a) => [a.outer, ...a.holes]);
      // 1. Placement line, then stop to place the fabric.
      for (const ring of rings) out.push({ pts: runStitches(ring, true, 25, entry) });
      out.push({ stop: true });
      // 2. Tack-down just inside the outline, then stop to trim the fabric.
      for (const a of offsetAreas(areas, -5)) {
        for (const ring of [a.outer, ...a.holes]) out.push({ pts: runStitches(ring, true, 30, lastPoint(out)) });
      }
      out.push({ stop: true });
      // 3. Cover satin along the outline.
      for (const ring of rings) {
        const col = columnFromPath(ring, true, r.width);
        out.push(...satinColumnPieces(col, { ...r, underlay: 'center-run' }, lastPoint(out)));
      }
      return out;
    }
    default:
      return [];
  }
}

function satinColumnPieces(col: Column, r: ResolvedParams, entry: P | null): Piece[] {
  if (col.a.length < 2) return [];
  let c = col;
  // Start at the end nearest the entry point.
  if (!c.closed && entry) {
    const d0 = Math.hypot(c.a[0][0] - entry[0], c.a[0][1] - entry[1]);
    const d1 = Math.hypot(c.a[c.a.length - 1][0] - entry[0], c.a[c.a.length - 1][1] - entry[1]);
    if (d1 < d0) c = reverseColumn(c);
  }
  const pieces: Piece[] = [];
  let forward = true;
  const pass = (pts: P[]) => {
    pieces.push({ pts, underlay: true });
    forward = !forward;
  };
  const width = columnAvgWidth(c);
  const inset = Math.min(Math.max(4, width * 0.2), width * 0.35);
  const wants = (t: UnderlayType) => r.underlay === t;
  const dir = () => (forward ? c : reverseColumn(c));
  if (width > 15) {
    if (wants('center-run') || (width <= 25 && r.underlay !== 'none')) {
      pass(runAlong(centerLine(dir()), 25));
    } else if (wants('edge-run') || wants('edge-run+zigzag')) {
      const ins = insetColumn(dir(), inset);
      pass(runAlong(ins.a, 25));
      pass(runAlong([...ins.b].reverse(), 25));
      if (wants('edge-run+zigzag')) pass(zigzag(insetColumn(dir(), inset), 20));
    } else if (wants('zigzag') || wants('tatami') || wants('knock-down')) {
      pass(zigzag(insetColumn(dir(), inset), wants('knock-down') ? 30 : 20));
    }
  }
  pieces.push({
    pts: satinStitches(dir(), {
      density: r.density,
      pullComp: r.pullComp,
      shortStitches: r.shortStitches,
      splitAbove: r.splitAbove,
    }),
  });
  return pieces;
}

function columnAvgWidth(c: Column): number {
  let s = 0;
  for (let i = 0; i < c.a.length; i++) s += Math.hypot(c.a[i][0] - c.b[i][0], c.a[i][1] - c.b[i][1]);
  return c.a.length ? s / c.a.length : 0;
}

function fillUnderlay(areas: Area[], r: ResolvedParams, entry: P | null): Piece[] {
  const out: Piece[] = [];
  const t = r.underlay;
  if (t === 'none') return out;
  let cur = entry;
  const edge = (inset: number) => {
    for (const a of offsetAreas(areas, -inset)) {
      for (const ring of [a.outer, ...a.holes]) {
        if (ring.length < 3) continue;
        const st = runStitches(ring, true, 25, cur);
        out.push({ pts: st, underlay: true });
        cur = st[st.length - 1];
      }
    }
  };
  const rows = (inset: number, spacing: number, mode: 'tatami' | 'satin') => {
    // Negative inset grows the area (knock-down covers slightly past the outline).
    const inner = offsetAreas(areas, -inset);
    const groups = fillAreas(inner, {
      angleDeg: r.angleDeg + 90,
      spacing,
      stitchLen: 30,
      mode,
      splitAbove: 70,
      startNear: cur,
    });
    for (const g of groups) out.push({ pts: g, underlay: true });
    const lp = lastPoint(out);
    if (lp) cur = lp;
  };
  switch (t) {
    case 'center-run':
      edge(10);
      break;
    case 'edge-run':
      edge(5);
      break;
    case 'zigzag':
      rows(8, 30, 'satin');
      break;
    case 'edge-run+zigzag':
      edge(5);
      rows(8, 30, 'satin');
      break;
    case 'tatami':
      rows(8, 20, 'tatami');
      break;
    case 'knock-down':
      rows(-10, 25, 'tatami');
      break;
  }
  return out;
}

/**
 * Where the object should start sewing: its entry point if set; otherwise, if it has an
 * exit point, the outline point farthest from the exit (so sewing ends near it); else near
 * the previous object's end.
 */
export function resolveEntry(obj: StitchObject, startNear: P | null): P | null {
  if (obj.entry) return [obj.entry[0], obj.entry[1]];
  if (obj.exit && obj.geometry.kind !== 'stitches') {
    const ex: P = [obj.exit[0], obj.exit[1]];
    let best: P | null = null;
    let bd = -1;
    for (const path of pathsOf(obj.geometry)) {
      for (const p of path.points) {
        const d = Math.hypot(p[0] - ex[0], p[1] - ex[1]);
        if (d > bd) {
          bd = d;
          best = p;
        }
      }
    }
    return best ?? startNear;
  }
  return startNear;
}

export function lastPoint(pieces: Piece[]): P | null {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const p = pieces[i];
    if ('pts' in p && p.pts.length) return p.pts[p.pts.length - 1];
  }
  return null;
}
