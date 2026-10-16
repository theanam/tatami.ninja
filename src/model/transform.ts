import { columnFromPath, columnFromRails, columnWidth } from '../engine/satin';
import { geometryBounds, pathsOf, unionBounds, type P } from '../engine/geom';
import type { Bounds, Geometry, Pt, RailGeometry, StitchObject } from './types';

type Map2 = (p: Pt) => Pt;

const r = (v: number) => Math.round(v);

function mapRail(g: RailGeometry, f: Map2, s: number): RailGeometry {
  if (g.kind === 'circle') {
    const [cx, cy] = f([g.cx, g.cy]);
    return { kind: 'circle', cx, cy, r: r(g.r * s) };
  }
  return { kind: 'polyline', points: g.points.map(f) };
}

/** Apply a point map to a geometry. `s` is the uniform scale (for circle radii). */
export function mapGeometry(g: Geometry, f: Map2, s = 1): Geometry {
  switch (g.kind) {
    case 'circle': {
      const [cx, cy] = f([g.cx, g.cy]);
      return { kind: 'circle', cx, cy, r: r(g.r * s) };
    }
    case 'polygon':
      return { kind: 'polygon', points: g.points.map(f), holes: g.holes?.map((h) => h.map(f)) };
    case 'polyline':
      return { kind: 'polyline', points: g.points.map(f) };
    case 'compound':
      return { kind: 'compound', parts: g.parts.map((p) => ({ points: p.points.map(f), holes: p.holes?.map((h) => h.map(f)) })) };
    case 'satin':
      return {
        kind: 'satin',
        railA: mapRail(g.railA, f, s),
        railB: mapRail(g.railB, f, s),
        rungs: g.rungs === 'auto' ? 'auto' : g.rungs.map(([a, b]) => [f(a), f(b)] as [Pt, Pt]),
      };
    case 'stitches': {
      const data = g.data.slice();
      for (let i = 0; i + 2 < data.length; i += 3) {
        const [x, y] = f([data[i], data[i + 1]]);
        data[i] = x;
        data[i + 1] = y;
      }
      return { kind: 'stitches', data };
    }
  }
}

export function translateObject(o: StitchObject, dx: number, dy: number): StitchObject {
  const f: Map2 = ([x, y]) => [r(x + dx), r(y + dy)];
  return {
    ...o,
    geometry: mapGeometry(o.geometry, f),
    entry: o.entry ? f(o.entry) : o.entry,
    exit: o.exit ? f(o.exit) : o.exit,
    text: o.text ? { ...o.text, x: r(o.text.x + dx), y: r(o.text.y + dy) } : undefined,
  };
}

/** Scale an object around (cx, cy). Non-uniform scaling turns circles into polygons. */
export function scaleObject(o: StitchObject, sx: number, sy: number, cx: number, cy: number): StitchObject {
  const f: Map2 = ([x, y]) => [r(cx + (x - cx) * sx), r(cy + (y - cy) * sy)];
  let g = o.geometry;
  if (Math.abs(sx - sy) > 1e-6) g = circlesToPolygons(g);
  return {
    ...o,
    geometry: mapGeometry(g, f, (sx + sy) / 2),
    entry: o.entry ? f(o.entry) : o.entry,
    exit: o.exit ? f(o.exit) : o.exit,
    text: o.text
      ? { ...o.text, x: f([o.text.x, o.text.y])[0], y: f([o.text.x, o.text.y])[1], height: r(o.text.height * sy), arc: r(o.text.arc * sy), spacing: r(o.text.spacing * sx) }
      : undefined,
  };
}

export function rotateObject(o: StitchObject, deg: number, cx: number, cy: number): StitchObject {
  const a = (-deg * Math.PI) / 180; // counter-clockwise on screen
  const c = Math.cos(a);
  const s = Math.sin(a);
  const f: Map2 = ([x, y]) => [r(cx + (x - cx) * c - (y - cy) * s), r(cy + (x - cx) * s + (y - cy) * c)];
  const params = o.params.angleDeg !== undefined ? { ...o.params, angleDeg: normAngle(o.params.angleDeg + deg) } : o.params;
  return { ...o, params, geometry: mapGeometry(o.geometry, f), text: undefined };
}

export function normAngle(a: number): number {
  let x = a % 180;
  if (x < 0) x += 180;
  return Math.round(x);
}

function circlesToPolygons(g: Geometry): Geometry {
  if (g.kind === 'circle') {
    const pts = pathsOf(g)[0].points.map(([x, y]) => [r(x), r(y)] as Pt);
    return { kind: 'polygon', points: pts };
  }
  if (g.kind === 'satin') {
    const toLine = (rail: RailGeometry): RailGeometry => {
      if (rail.kind !== 'circle') return rail;
      const pts = pathsOf(rail)[0].points;
      return { kind: 'polyline', points: [...pts, pts[0]].map(([x, y]) => [r(x), r(y)] as Pt) };
    };
    return { ...g, railA: toLine(g.railA), railB: toLine(g.railB) };
  }
  return g;
}

export function objectsBounds(objs: StitchObject[]): Bounds | null {
  let b: Bounds | null = null;
  for (const o of objs) b = unionBounds(b, geometryBounds(o.geometry));
  return b;
}

/** Average satin width of an object (0.1 mm), or null. */
export function satinWidth(o: StitchObject): number | null {
  const g = o.geometry;
  if (g.kind === 'satin') {
    if (g.railA.kind === 'circle' && g.railB.kind === 'circle') return Math.abs(g.railB.r - g.railA.r);
    return columnWidth(columnFromRails(g.railA, g.railB));
  }
  if (g.kind === 'polyline') return o.params.width ?? 30;
  return null;
}

/** Rebuild satin rails at a new width around their center line. */
export function setSatinWidth(o: StitchObject, width: number): StitchObject {
  const g = o.geometry;
  if (g.kind !== 'satin') return { ...o, params: { ...o.params, width } };
  if (g.railA.kind === 'circle' && g.railB.kind === 'circle') {
    const mid = (g.railA.r + g.railB.r) / 2;
    const inner = g.railA.r <= g.railB.r;
    const a = r(mid + (inner ? -width / 2 : width / 2));
    const b = r(mid + (inner ? width / 2 : -width / 2));
    return { ...o, geometry: { ...g, railA: { ...g.railA, r: a }, railB: { ...g.railB, r: b } } };
  }
  const col = columnFromRails(g.railA, g.railB);
  const center: P[] = col.a.map((p, i) => [(p[0] + col.b[i][0]) / 2, (p[1] + col.b[i][1]) / 2]);
  // Column samples are 0.2 mm apart; thin them back down to ~1 mm.
  const step = 5;
  const thin = center.filter((_, i) => i % step === 0 || i === center.length - 1);
  const closed = col.closed;
  const ring = closed ? thin.slice(0, -1) : thin;
  const next = columnFromPath(ring, closed, width);
  const toPts = (pts: P[]) => pts.map(([x, y]) => [r(x), r(y)] as Pt);
  return {
    ...o,
    geometry: { kind: 'satin', railA: { kind: 'polyline', points: toPts(next.a) }, railB: { kind: 'polyline', points: toPts(next.b) }, rungs: 'auto' },
  };
}

/** Convert a run path into a satin column of the given width. */
export function runToSatin(o: StitchObject, width: number): StitchObject | null {
  const paths = pathsOf(o.geometry);
  if (!paths.length || o.geometry.kind === 'stitches') return null;
  const path = paths[0];
  const col = columnFromPath(path.points, path.closed, width);
  const toPts = (pts: P[]) => pts.map(([x, y]) => [r(x), r(y)] as Pt);
  return {
    ...o,
    type: 'satin',
    geometry: { kind: 'satin', railA: { kind: 'polyline', points: toPts(col.a) }, railB: { kind: 'polyline', points: toPts(col.b) }, rungs: 'auto' },
    params: { ...o.params, width },
  };
}
