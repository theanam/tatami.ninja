import { newId } from './project';
import { mapGeometry, normAngle, objectsBounds, rotateObject, translateObject } from './transform';
import type { Bounds, Pt, StitchObject } from './types';

export type FlipAxis = 'horizontal' | 'vertical';
export type AlignTo = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

const r = Math.round;

/** Mirror an object across a vertical (horizontal flip) or horizontal line through (cx, cy). */
export function flipObject(o: StitchObject, axis: FlipAxis, cx: number, cy: number): StitchObject {
  const f = axis === 'horizontal' ? ([x, y]: Pt): Pt => [r(2 * cx - x), y] : ([x, y]: Pt): Pt => [x, r(2 * cy - y)];
  const params = o.params.angleDeg !== undefined ? { ...o.params, angleDeg: normAngle(180 - o.params.angleDeg) } : o.params;
  return {
    ...o,
    params,
    geometry: mapGeometry(o.geometry, f),
    entry: o.entry ? f(o.entry) : o.entry,
    exit: o.exit ? f(o.exit) : o.exit,
    // Mirrored lettering is no longer editable text, just its outlines.
    text: undefined,
  };
}

/** Group members move and select together. Expands ids to every member of their groups. */
export function withGroups(objects: StitchObject[], ids: string[]): string[] {
  const groups = new Set(objects.filter((o) => ids.includes(o.id) && o.group).map((o) => o.group));
  if (!groups.size) return ids;
  const out = new Set(ids);
  for (const o of objects) if (o.group && groups.has(o.group)) out.add(o.id);
  return objects.filter((o) => out.has(o.id)).map((o) => o.id);
}

/**
 * Align objects to each other's combined bounds; a single object (or one group) aligns to the
 * hoop, which is centered on the origin. Groups move as one.
 */
export function alignObjects(objs: StitchObject[], to: AlignTo, hoop: { width: number; height: number }): StitchObject[] {
  const units = groupUnits(objs);
  const ref: Bounds | null =
    units.length <= 1 ? { minX: -hoop.width / 2, minY: -hoop.height / 2, maxX: hoop.width / 2, maxY: hoop.height / 2 } : objectsBounds(objs);
  if (!ref) return objs;
  const moved = new Map<string, StitchObject>();
  for (const u of units) {
    const b = objectsBounds(u);
    if (!b) continue;
    let dx = 0;
    let dy = 0;
    if (to === 'left') dx = ref.minX - b.minX;
    else if (to === 'right') dx = ref.maxX - b.maxX;
    else if (to === 'center') dx = (ref.minX + ref.maxX) / 2 - (b.minX + b.maxX) / 2;
    else if (to === 'top') dy = ref.minY - b.minY;
    else if (to === 'bottom') dy = ref.maxY - b.maxY;
    else dy = (ref.minY + ref.maxY) / 2 - (b.minY + b.maxY) / 2;
    for (const o of u) moved.set(o.id, translateObject(o, r(dx), r(dy)));
  }
  return objs.map((o) => moved.get(o.id) ?? o);
}

/** Spread three or more objects (or groups) so the gaps between them are equal. */
export function distributeObjects(objs: StitchObject[], axis: 'horizontal' | 'vertical'): StitchObject[] {
  const units = groupUnits(objs)
    .map((u) => ({ u, b: objectsBounds(u)! }))
    .filter((x) => x.b);
  if (units.length < 3) return objs;
  const lo = axis === 'horizontal' ? (b: Bounds) => b.minX : (b: Bounds) => b.minY;
  const hi = axis === 'horizontal' ? (b: Bounds) => b.maxX : (b: Bounds) => b.maxY;
  units.sort((a, b) => lo(a.b) + hi(a.b) - (lo(b.b) + hi(b.b)));
  const start = lo(units[0].b);
  const end = Math.max(...units.map((x) => hi(x.b)));
  const total = units.reduce((s, x) => s + hi(x.b) - lo(x.b), 0);
  const gap = (end - start - total) / (units.length - 1);
  const moved = new Map<string, StitchObject>();
  let at = start;
  for (const { u, b } of units) {
    const d = r(at - lo(b));
    for (const o of u) moved.set(o.id, axis === 'horizontal' ? translateObject(o, d, 0) : translateObject(o, 0, d));
    at += hi(b) - lo(b) + gap;
  }
  return objs.map((o) => moved.get(o.id) ?? o);
}

/** Objects split into movable units: each group is one unit, ungrouped objects are their own. */
function groupUnits(objs: StitchObject[]): StitchObject[][] {
  const byGroup = new Map<string, StitchObject[]>();
  const out: StitchObject[][] = [];
  for (const o of objs) {
    if (!o.group) {
      out.push([o]);
      continue;
    }
    let g = byGroup.get(o.group);
    if (!g) {
      g = [];
      byGroup.set(o.group, g);
      out.push(g);
    }
    g.push(o);
  }
  return out;
}

function cloneSet(objs: StitchObject[], i: number): StitchObject[] {
  // A grouped original becomes a group of its own in every copy.
  const regroup = new Map<string, string>();
  return objs.map((o) => {
    let group: string | undefined;
    if (o.group) {
      if (!regroup.has(o.group)) regroup.set(o.group, newId('g'));
      group = regroup.get(o.group);
    }
    return { ...o, id: newId('o'), name: `${o.name} ${i + 1}`, locked: false, group };
  });
}

/**
 * Copies arranged around a circle. The originals stay where they are (at the top); the circle's
 * center sits `radius` below their center, and every copy is turned to face the center.
 */
export function circleCopies(objs: StitchObject[], count: number, radius: number): StitchObject[] {
  const b = objectsBounds(objs);
  if (!b || count < 2) return [];
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2 + radius;
  const out: StitchObject[] = [];
  for (let i = 1; i < count; i++) {
    const deg = (-360 * i) / count;
    out.push(...cloneSet(objs, i).map((o) => rotateObject(o, deg, cx, cy)));
  }
  return out;
}

/** Copies in a grid of `rows` × `cols` (the originals are the top-left cell). */
export function gridCopies(objs: StitchObject[], rows: number, cols: number, gapX: number, gapY: number): StitchObject[] {
  const b = objectsBounds(objs);
  if (!b || rows * cols < 2) return [];
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const out: StitchObject[] = [];
  let n = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (i === 0 && j === 0) continue;
      n++;
      out.push(...cloneSet(objs, n + 1).map((o) => translateObject(o, r(j * (w + gapX)), r(i * (h + gapY)))));
    }
  }
  return out;
}

