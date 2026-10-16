import { newId } from '../../model/project';
import type { Pt, StitchObject, StitchType } from '../../model/types';
import { ellipsePolygon } from './canvasMath';

const ADV = { underlay: 'inherit' as const, pullComp: 'inherit' as const, tieIn: true, tieOff: true, trimBefore: false, trimAfter: false };

function base(name: string, type: StitchType, thread: string, geometry: StitchObject['geometry']): StitchObject {
  return {
    id: newId('o'),
    name,
    type,
    thread,
    visible: true,
    locked: false,
    geometry,
    params: type === 'tatami' ? { angleDeg: 45 } : type === 'run' ? { stitchLength: 25, repeats: 1 } : {},
    advanced: { ...ADV },
  };
}

export type PathTool = 'pen' | 'run' | 'fill' | 'applique';

/** Finish a clicked path. Closed paths fill (pen/fill/appliqué); open paths become run lines. */
export function objectFromPath(tool: PathTool, pts: Pt[], closed: boolean, thread: string, n: number): StitchObject | null {
  const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 2);
  if (tool === 'fill' || tool === 'applique') closed = true;
  if (closed && clean.length < 3) return null;
  if (!closed && clean.length < 2) return null;
  if (tool === 'applique') return { ...base(`Appliqué ${n}`, 'applique', thread, { kind: 'polygon', points: clean }), params: { width: 30 } };
  if (closed) {
    if (tool === 'run') return base(`Run ${n}`, 'run', thread, { kind: 'polygon', points: clean });
    return base(`Fill ${n}`, 'tatami', thread, { kind: 'polygon', points: clean });
  }
  return base(`Run ${n}`, 'run', thread, { kind: 'polyline', points: clean });
}

/** Satin tool: clicks alternate left rail, right rail. Needs at least two rungs. */
export function objectFromSatinClicks(clicks: Pt[], thread: string, n: number): StitchObject | null {
  const pairs = Math.floor(clicks.length / 2);
  if (pairs < 2) return null;
  const a: Pt[] = [];
  const b: Pt[] = [];
  for (let i = 0; i < pairs; i++) {
    a.push(clicks[2 * i]);
    b.push(clicks[2 * i + 1]);
  }
  return {
    ...base(`Satin ${n}`, 'satin', thread, { kind: 'satin', railA: { kind: 'polyline', points: a }, railB: { kind: 'polyline', points: b }, rungs: 'auto' }),
    params: { shortStitches: true, splitAbove: 80 },
  };
}

export type ShapeKind = 'rect' | 'ellipse';

export function objectFromShape(kind: ShapeKind, a: Pt, b: Pt, thread: string, n: number): StitchObject | null {
  const minX = Math.min(a[0], b[0]);
  const maxX = Math.max(a[0], b[0]);
  const minY = Math.min(a[1], b[1]);
  const maxY = Math.max(a[1], b[1]);
  if (maxX - minX < 10 || maxY - minY < 10) return null;
  if (kind === 'ellipse') {
    const rx = (maxX - minX) / 2;
    const ry = (maxY - minY) / 2;
    const cx = Math.round(minX + rx);
    const cy = Math.round(minY + ry);
    if (Math.abs(rx - ry) < 1) return base(`Circle ${n}`, 'tatami', thread, { kind: 'circle', cx, cy, r: Math.round(rx) });
    return base(`Ellipse ${n}`, 'tatami', thread, { kind: 'polygon', points: ellipsePolygon(cx, cy, rx, ry) });
  }
  const r = (v: number) => Math.round(v);
  return base(`Rectangle ${n}`, 'tatami', thread, {
    kind: 'polygon',
    points: [[r(minX), r(minY)], [r(maxX), r(minY)], [r(maxX), r(maxY)], [r(minX), r(maxY)]],
  });
}

/** Snap to 45° increments relative to the previous point (Shift while drawing). */
export function snap45(prev: Pt, p: Pt): Pt {
  const dx = p[0] - prev[0];
  const dy = p[1] - prev[1];
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const d = Math.hypot(dx, dy);
  return [Math.round(prev[0] + Math.cos(a) * d), Math.round(prev[1] + Math.sin(a) * d)];
}

/** Square/circle constraint for shapes (Shift). */
export function constrainSquare(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const m = Math.max(Math.abs(dx), Math.abs(dy));
  return [a[0] + Math.sign(dx || 1) * m, a[1] + Math.sign(dy || 1) * m];
}
