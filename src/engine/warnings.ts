import { CMD, type Project, type StitchPlan } from '../model/types';
import { getFabric } from '../presets';
import { booleanAreas, offsetAreas, strokeAreas } from './clip';
import { areasOf, distToSegment, geometryBounds, pathsOf, type Area, type P } from './geom';

export interface Warning {
  id: string;
  kind: 'out-of-hoop' | 'density' | 'short-stitches' | 'small-text' | 'gap' | 'too-large' | 'lace-islands' | 'needle-break';
  severity: 'error' | 'warning';
  title: string;
  message: string;
  objectIds: string[];
}

/**
 * Thread length (mm) per mm² above which stitching is flagged as a hotspot.
 * Tatami at 0.4 mm ≈ 2.5, satin at 0.4 mm ≈ 5, plus underlay: satin over a fill (normal) stays below.
 */
export const DENSITY_LIMIT = 13;
/** Hot cells (1 mm²) an object needs before it is reported. */
export const DENSITY_MIN_CELLS = 10;
/** Stitches shorter than this (0.1 mm) are "short". */
export const SHORT_STITCH = 10;
/** Objects with at least this many short stitches get a warning. */
export const SHORT_STITCH_MIN_COUNT = 10;
/** …and at least this share of the object's stitches. */
export const SHORT_STITCH_MIN_SHARE = 0.015;
/** Neighbouring areas closer than this (but not overlapping) leave visible fabric (0.1 mm). */
export const GAP_MAX = 10;
/** Lettering below this cap height (0.1 mm) is hard to sew. */
export const MIN_TEXT_HEIGHT = 50;

const fmt = (units: number) => (units / 10).toFixed(1).replace(/\.0$/, '');

export function checkWarnings(project: Project, plan: StitchPlan): Warning[] {
  const out: Warning[] = [];
  const names = new Map(project.objects.map((o) => [o.id, o.name]));
  const listNames = (ids: string[]) => {
    const n = ids.map((id) => names.get(id) ?? 'An object');
    if (n.length <= 1) return n[0] ?? '';
    return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
  };

  // 0. Objects the engine refused to stitch (too large or too dense), and a truncated plan.
  for (const id of plan.skipped ?? []) {
    out.push({
      id: `too-large-${id}`,
      kind: 'too-large',
      severity: 'error',
      title: 'Too large to stitch',
      message: `${names.get(id) ?? 'An object'} is too large or too dense to stitch, so it is skipped. Scale it down to fit the hoop.`,
      objectIds: [id],
    });
  }
  if (plan.truncated) {
    out.push({
      id: 'truncated',
      kind: 'too-large',
      severity: 'error',
      title: 'Stitch limit reached',
      message: 'This design has more than 300,000 stitches, so the rest was not generated. Scale it down or remove objects.',
      objectIds: [],
    });
  }

  // 1. Out of hoop.
  const hw = project.hoop.width / 2;
  const hh = project.hoop.height / 2;
  if (plan.bounds) {
    const b = plan.bounds;
    const outside = plan.objectStats
      .filter((s) => s.bounds && (s.bounds.minX < -hw || s.bounds.maxX > hw || s.bounds.minY < -hh || s.bounds.maxY > hh))
      .map((s) => s.id);
    if (outside.length) {
      const over = Math.max(-hw - b.minX, b.maxX - hw, -hh - b.minY, b.maxY - hh, 0);
      const horiz = -hw - b.minX > 0 || b.maxX - hw > 0;
      const vert = -hh - b.minY > 0 || b.maxY - hh > 0;
      const edges = horiz && vert ? 'edges of the hoop' : horiz ? 'left and right edges' : 'top and bottom edges';
      out.push({
        id: 'out-of-hoop',
        kind: 'out-of-hoop',
        severity: 'error',
        title: 'Outside the hoop',
        message: `${listNames(outside)} ${outside.length > 1 ? 'run' : 'runs'} ${fmt(Math.ceil(over))} mm past the ${edges}. The machine will refuse the file.`,
        objectIds: outside,
      });
    }
  }

  // 2. Density hotspots: thread length per 1 mm cell.
  const cells = new Map<number, number>();
  const contributors = new Map<number, Set<number>>();
  const key = (cx: number, cy: number) => cx * 100003 + cy;
  for (let i = 1; i < plan.cmds.length; i++) {
    if (plan.cmds[i] !== CMD.STITCH || plan.cmds[i - 1] !== CMD.STITCH) continue;
    const x0 = plan.xs[i - 1];
    const y0 = plan.ys[i - 1];
    const x1 = plan.xs[i];
    const y1 = plan.ys[i];
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(d / 2.5));
    const step = d / 10 / n; // mm per sample
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const cx = Math.floor((x0 + (x1 - x0) * t) / 10);
      const cy = Math.floor((y0 + (y1 - y0) * t) / 10);
      const kk = key(cx, cy);
      cells.set(kk, (cells.get(kk) ?? 0) + step);
      if (plan.obj[i] >= 0) {
        let s = contributors.get(kk);
        if (!s) contributors.set(kk, (s = new Set()));
        s.add(plan.obj[i]);
      }
    }
  }
  const hotCount = new Map<number, number>();
  for (const [k, v] of cells) {
    if (v <= DENSITY_LIMIT) continue;
    const s = contributors.get(k);
    if (!s || s.size < 2) continue; // a single object's own edges are not a layering problem
    const top = Math.max(...s);
    hotCount.set(top, (hotCount.get(top) ?? 0) + 1);
  }
  for (const [objIndex, count] of hotCount) {
    if (count < DENSITY_MIN_CELLS) continue;
    const top = project.objects[objIndex];
    const below = new Set<string>();
    for (const [k, s] of contributors) {
      if (s.has(objIndex) && (cells.get(k) ?? 0) > DENSITY_LIMIT) {
        for (const o of s) if (o < objIndex) below.add(project.objects[o].id);
      }
    }
    const fabric = getFabric(project.fabricPreset).name.toLowerCase();
    out.push({
      id: `density-${top.id}`,
      kind: 'density',
      severity: 'warning',
      title: 'Density hotspot',
      message: `${top.name} sews on top of ${listNames([...below]) || 'other stitches'}. Layered fills this dense can pucker ${fabric}.`,
      objectIds: [top.id],
    });
  }

  // 3. Short stitches (ignoring the first and last few stitches: ties).
  project.objects.forEach((o, index) => {
    const st = plan.objectStats[index];
    if (!st || !o.visible || o.geometry.kind === 'stitches') return;
    let count = 0;
    let run = 0;
    for (let i = st.start + 1; i < st.end; i++) {
      if (plan.cmds[i] !== CMD.STITCH || plan.obj[i] !== index) {
        run = 0;
        continue;
      }
      run++;
      if (plan.cmds[i - 1] !== CMD.STITCH || run <= 3) continue;
      const remaining = countAhead(plan, i, st.end, index);
      if (remaining < 3) continue;
      // A lone short stitch is a fill row turn; two in a row is a problem area.
      const d = Math.hypot(plan.xs[i] - plan.xs[i - 1], plan.ys[i] - plan.ys[i - 1]);
      const prevD = Math.hypot(plan.xs[i - 1] - plan.xs[i - 2], plan.ys[i - 1] - plan.ys[i - 2]);
      if (d > 0.5 && d < SHORT_STITCH && prevD < SHORT_STITCH) count++;
    }
    // A handful in a large object is harmless; warn when they are a real share of it.
    if (count >= SHORT_STITCH_MIN_COUNT && count >= st.stitches * SHORT_STITCH_MIN_SHARE) {
      out.push({
        id: `short-${o.id}`,
        kind: 'short-stitches',
        severity: 'warning',
        title: 'Short stitches',
        message: `${count} stitches under 1 mm in ${o.name} can cause thread breaks.`,
        objectIds: [o.id],
      });
    }
  });

  // 4. Gaps between neighbouring filled areas of different colors.
  out.push(...gapWarnings(project));

  // 5. Small lettering.
  for (const o of project.objects) {
    if (o.text && o.visible && o.text.height < MIN_TEXT_HEIGHT) {
      out.push({
        id: `small-text-${o.id}`,
        kind: 'small-text',
        severity: 'warning',
        title: 'Lettering too small',
        message: `${o.name} is ${fmt(o.text.height)} mm tall. Letters under 5 mm lose detail when sewn; Follow strokes helps.`,
        objectIds: [o.id],
      });
    }
  }

  // 6. Needle break risk: the needle hitting the same spot again and again, or going
  //    through a thick stack of stitching.
  out.push(...needleWarnings(project, plan, listNames));

  // 7. Free-standing lace: parts that touch nothing fall off when the stabilizer dissolves.
  if (getFabric(project.fabricPreset).lace) {
    const pieces = lacePieces(project);
    if (pieces.length > 1) {
      // Name the objects outside the largest piece.
      pieces.sort((a, b) => b.length - a.length);
      const loose = pieces.slice(1).flat();
      out.push({
        id: 'lace-islands',
        kind: 'lace-islands',
        severity: 'warning',
        title: 'Lace not connected',
        message: `${listNames(loose)} ${loose.length === 1 ? 'does' : 'do'} not touch the rest of the lace and will fall away when the stabilizer washes out.`,
        objectIds: loose,
      });
    }
  }
  return out;
}

/** Needle holes in the same 0.2 mm spot above this count risk deflecting or breaking the needle. */
export const SAME_SPOT_MAX = 8;
/** Needle holes in a 0.5 mm cell above this count (normal designs stay at about 6). */
export const CELL_MAX = 10;
/** Layers of fill/satin in one 1 mm cell, with at least STACK_MIN_HOLES holes, count as a thick stack. */
export const STACK_LAYERS = 4;
export const STACK_MIN_HOLES = 16;

function needleWarnings(project: Project, plan: StitchPlan, listNames: (ids: string[]) => string): Warning[] {
  const spot = new Map<number, number>();
  const cell = new Map<number, number>();
  const mm = new Map<number, number>();
  const layers = new Map<number, Set<number>>();
  const key = (x: number, y: number, s: number) => Math.floor(x / s) * 100003 + Math.floor(y / s);
  const add = (m: Map<number, number>, k: number) => m.set(k, (m.get(k) ?? 0) + 1);
  for (let i = 0; i < plan.cmds.length; i++) {
    if (plan.cmds[i] !== CMD.STITCH || plan.obj[i] < 0) continue;
    const x = plan.xs[i];
    const y = plan.ys[i];
    const o = plan.obj[i];
    const ks = key(x, y, 2);
    add(spot, ks);
    add(cell, key(x, y, 5));
    const km = key(x, y, 10);
    add(mm, km);
    const t = project.objects[o]?.type;
    if (t && t !== 'run' && t !== 'stitches') {
      if (!layers.has(km)) layers.set(km, new Set());
      layers.get(km)!.add(o);
    }
  }
  // Objects with holes piled into one spot (0.2 mm) or a tiny area (0.5 mm), and the worst count.
  const sameSpot = new Map<number, number>();
  for (let i = 0; i < plan.cmds.length; i++) {
    if (plan.cmds[i] !== CMD.STITCH || plan.obj[i] < 0) continue;
    const x = plan.xs[i];
    const y = plan.ys[i];
    const inSpot = spot.get(key(x, y, 2)) ?? 0;
    const inCell = cell.get(key(x, y, 5)) ?? 0;
    if (inSpot >= SAME_SPOT_MAX || inCell >= CELL_MAX) sameSpot.set(plan.obj[i], Math.max(sameSpot.get(plan.obj[i]) ?? 0, inSpot, inCell));
  }
  const stacked = new Set<number>();
  let worstLayers = 0;
  for (const [k, set] of layers) {
    if (set.size >= STACK_LAYERS && (mm.get(k) ?? 0) >= STACK_MIN_HOLES) {
      worstLayers = Math.max(worstLayers, set.size);
      for (const o of set) stacked.add(o);
    }
  }
  const out: Warning[] = [];
  const ids = (s: Iterable<number>) => [...s].map((i) => project.objects[i]?.id).filter((x): x is string => !!x);
  if (sameSpot.size) {
    const hit = ids(sameSpot.keys());
    const most = Math.max(...sameSpot.values());
    out.push({
      id: 'needle-same-spot',
      kind: 'needle-break',
      severity: 'warning',
      title: 'Needle break risk',
      message: `In ${listNames(hit)} up to ${most} needle holes land within half a millimetre. Space knots or ties further apart, use fewer repeats, or move the start and end points.`,
      objectIds: hit,
    });
  }
  if (stacked.size) {
    const hit = ids(stacked);
    out.push({
      id: 'needle-stack',
      kind: 'needle-break',
      severity: 'warning',
      title: 'Needle break risk',
      message: `${worstLayers} layers of stitching overlap where ${listNames(hit)} meet. Turn on Remove hidden stitches, lower the density, or use a larger sharp needle (80/12–90/14) and sew slower.`,
      objectIds: hit,
    });
  }
  return out;
}

/** Groups of object ids whose stitched footprints touch (or overlap). */
export function lacePieces(project: Project): string[][] {
  const objs = project.objects.filter((o) => o.visible && o.geometry.kind !== 'stitches');
  const prints = objs.map((o) => {
    const a = areasOf(o.geometry);
    if (a.length) return offsetAreas(a, 2);
    const lines = pathsOf(o.geometry).map((p) => (p.closed ? [...p.points, p.points[0]] : p.points));
    return strokeAreas(lines, 12);
  });
  const parent = objs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < objs.length; i++)
    for (let j = i + 1; j < objs.length; j++) {
      if (find(i) === find(j)) continue;
      if (booleanAreas(prints[i], prints[j], 'intersection').length) parent[find(i)] = find(j);
    }
  const groups = new Map<number, string[]>();
  objs.forEach((o, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), o.id]);
  });
  return [...groups.values()];
}

function gapWarnings(project: Project): Warning[] {
  const out: Warning[] = [];
  const filled = project.objects
    .filter((o) => o.visible && o.type !== 'run' && o.type !== 'stitches' && !o.text)
    .slice(0, 60)
    .map((o) => ({ o, areas: areasOf(o.geometry), b: geometryBounds(o.geometry) }))
    .filter((x) => x.areas.length > 0 && x.b);
  const reported = new Set<string>();
  for (let i = 0; i < filled.length; i++) {
    for (let j = i + 1; j < filled.length; j++) {
      const A = filled[i];
      const B = filled[j];
      if (A.o.thread === B.o.thread) continue;
      const a = A.b!;
      const b = B.b!;
      if (a.minX - GAP_MAX > b.maxX || b.minX - GAP_MAX > a.maxX || a.minY - GAP_MAX > b.maxY || b.minY - GAP_MAX > a.maxY) continue;
      // Overlapping shapes cannot leave a gap; touching within GAP_MAX means they almost meet.
      if (offsetAreas(A.areas, -1).length && overlaps(A.areas, B.areas)) continue;
      const d = minBoundaryDistance(A.areas, B.areas);
      if (d > 0.5 && d < GAP_MAX && !reported.has(B.o.id)) {
        reported.add(B.o.id);
        out.push({
          id: `gap-${A.o.id}-${B.o.id}`,
          kind: 'gap',
          severity: 'warning',
          title: 'Gap between colors',
          message: `${A.o.name} and ${B.o.name} are ${fmt(Math.round(d))} mm apart. Fabric may show through; overlap them slightly.`,
          objectIds: [A.o.id, B.o.id],
        });
      }
    }
  }
  return out;
}

function overlaps(a: Area[], b: Area[]): boolean {
  // Grow one side by a hair: if the union area is smaller than the sum, they overlap.
  const grown = offsetAreas(a, 0.5);
  for (const ar of b) for (const p of ar.outer) if (grown.some((g) => pointInside(p, g))) return true;
  for (const ar of a) for (const p of ar.outer) if (b.some((g) => pointInside(p, g))) return true;
  return false;
}

function pointInside(p: P, a: Area): boolean {
  const inRing = (ring: P[]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return inRing(a.outer) && !a.holes.some(inRing);
}

function minBoundaryDistance(a: Area[], b: Area[]): number {
  const ringsA = a.flatMap((x) => [x.outer, ...x.holes]);
  const ringsB = b.flatMap((x) => [x.outer, ...x.holes]);
  let best = Infinity;
  for (const ra of ringsA) {
    for (const p of ra) {
      for (const rb of ringsB) {
        for (let k = 0; k < rb.length; k++) {
          const d = distToSegment(p, rb[k], rb[(k + 1) % rb.length]);
          if (d < best) best = d;
        }
      }
    }
  }
  return best;
}

function countAhead(plan: StitchPlan, i: number, end: number, index: number): number {
  let n = 0;
  for (let j = i + 1; j < end && n < 3; j++) {
    if (plan.cmds[j] !== CMD.STITCH || plan.obj[j] !== index) break;
    n++;
  }
  return n;
}
