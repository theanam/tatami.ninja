import ClipperLib from 'clipper-lib';
import type { Area, P } from './geom';

// Clipper works on integers; scale 0.1 mm units by 100 for sub-micron precision.
const S = 100;

type CPath = { X: number; Y: number }[];

const toPath = (pts: P[]): CPath => pts.map((p) => ({ X: Math.round(p[0] * S), Y: Math.round(p[1] * S) }));
const fromPath = (p: CPath): P[] => p.map((q) => [q.X / S, q.Y / S] as P);

function areasToPaths(areas: Area[]): CPath[] {
  const out: CPath[] = [];
  for (const a of areas) {
    if (a.outer.length >= 3) out.push(toPath(a.outer));
    for (const h of a.holes) if (h.length >= 3) out.push(toPath(h));
  }
  return out;
}

function treeToAreas(tree: InstanceType<typeof ClipperLib.PolyTree>): Area[] {
  const out: Area[] = [];
  const walk = (node: InstanceType<typeof ClipperLib.PolyTree>) => {
    for (const child of node.Childs()) {
      if (!child.IsHole()) {
        const area: Area = { outer: fromPath(child.Contour()), holes: [] };
        for (const hole of child.Childs()) {
          area.holes.push(fromPath(hole.Contour()));
          walk(hole); // islands inside holes
        }
        out.push(area);
      }
    }
  };
  walk(tree);
  return out;
}

/** Grow (delta > 0) or shrink (delta < 0) areas. Uses even-odd semantics on input rings. */
export function offsetAreas(areas: Area[], delta: number, round = true): Area[] {
  const normalized = normalizeAreas(areas);
  const co = new ClipperLib.ClipperOffset(2, 0.25 * S);
  co.AddPaths(
    areasToPaths(normalized),
    round ? ClipperLib.JoinType.jtRound : ClipperLib.JoinType.jtMiter,
    ClipperLib.EndType.etClosedPolygon,
  );
  const tree = new ClipperLib.PolyTree();
  co.Execute(tree, delta * S);
  return treeToAreas(tree);
}

/** Resolve orientation/self-overlap into clean outer+holes areas. */
export function normalizeAreas(areas: Area[], rule: 'evenodd' | 'nonzero' = 'evenodd'): Area[] {
  const c = new ClipperLib.Clipper();
  c.AddPaths(areasToPaths(areas), ClipperLib.PolyType.ptSubject, true);
  const tree = new ClipperLib.PolyTree();
  const fill = rule === 'evenodd' ? ClipperLib.PolyFillType.pftEvenOdd : ClipperLib.PolyFillType.pftNonZero;
  c.Execute(ClipperLib.ClipType.ctUnion, tree, fill, fill);
  return treeToAreas(tree);
}

export type BoolOp = 'union' | 'difference' | 'intersection' | 'xor';

export function booleanAreas(subject: Area[], clip: Area[], op: BoolOp): Area[] {
  const c = new ClipperLib.Clipper();
  c.AddPaths(areasToPaths(normalizeAreas(subject)), ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(areasToPaths(normalizeAreas(clip)), ClipperLib.PolyType.ptClip, true);
  const type = {
    union: ClipperLib.ClipType.ctUnion,
    difference: ClipperLib.ClipType.ctDifference,
    intersection: ClipperLib.ClipType.ctIntersection,
    xor: ClipperLib.ClipType.ctXor,
  }[op];
  const tree = new ClipperLib.PolyTree();
  c.Execute(type, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return treeToAreas(tree);
}

export function areaOfAreas(areas: Area[]): number {
  let total = 0;
  for (const a of areas) {
    total += Math.abs(ringArea(a.outer));
    for (const h of a.holes) total -= Math.abs(ringArea(h));
  }
  return total;
}

function ringArea(pts: P[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
}

/** Clip open polylines to areas; returns the pieces that lie inside. */
export function clipLines(lines: P[][], areas: Area[]): P[][] {
  if (!lines.length || !areas.length) return [];
  // AddPath / OpenPathsFromPolyTree exist in clipper-lib but are missing from its typings.
  const c = new ClipperLib.Clipper() as InstanceType<typeof ClipperLib.Clipper> & { AddPath(p: CPath, t: number, closed: boolean): boolean };
  for (const l of lines) if (l.length >= 2) c.AddPath(toPath(l), ClipperLib.PolyType.ptSubject, false);
  c.AddPaths(areasToPaths(normalizeAreas(areas)), ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(ClipperLib.ClipType.ctIntersection, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  const open = (ClipperLib.Clipper as unknown as { OpenPathsFromPolyTree(t: unknown): CPath[] }).OpenPathsFromPolyTree(tree);
  return open.map(fromPath).filter((l) => l.length >= 2);
}
