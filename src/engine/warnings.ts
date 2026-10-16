import { CMD, type Project, type StitchPlan } from '../model/types';
import { getFabric } from '../presets';
import { offsetAreas } from './clip';
import { areasOf, distToSegment, geometryBounds, type Area, type P } from './geom';

export interface Warning {
  id: string;
  kind: 'out-of-hoop' | 'density' | 'short-stitches' | 'small-text' | 'gap' | 'too-large';
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
    if (count >= SHORT_STITCH_MIN_COUNT) {
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
        message: `${o.name} is ${fmt(o.text.height)} mm tall. Letters under 5 mm lose detail when sewn.`,
        objectIds: [o.id],
      });
    }
  }
  return out;
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
