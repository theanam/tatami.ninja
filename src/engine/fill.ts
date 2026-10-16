import { dist, lerp, pointInArea, rotate, type Area, type P } from './geom';

export interface FillOptions {
  /** Row direction in degrees, counter-clockwise as seen on screen. */
  angleDeg: number;
  /** Row spacing, 0.1 mm. */
  spacing: number;
  /** Max stitch length along a row, 0.1 mm. */
  stitchLen: number;
  /** Pull compensation added across each row (total, 0.1 mm). */
  pullComp?: number;
  /** 'tatami' = rows split into staggered stitches; 'satin' = zigzag across rows. */
  mode?: 'tatami' | 'satin';
  /** Satin mode: split stitches wider than this. */
  splitAbove?: number;
  startNear?: P | null;
  /** Random (but repeatable) stitch offsets per row instead of the regular brick pattern. */
  randomShift?: boolean;
}

interface Seg {
  row: number;
  y: number;
  x0: number;
  x1: number;
  used: boolean;
}

/** Scanline row segments of the (rotated) areas. */
export function rowSegments(areas: Area[], spacing: number, pullComp = 0, minRow = 1): Seg[][] {
  let ymin = Infinity;
  let ymax = -Infinity;
  const edges: [P, P][] = [];
  for (const a of areas) {
    for (const ring of [a.outer, ...a.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i];
        const q = ring[(i + 1) % ring.length];
        edges.push([p, q]);
        ymin = Math.min(ymin, p[1]);
        ymax = Math.max(ymax, p[1]);
      }
    }
  }
  const rows: Seg[][] = [];
  if (!isFinite(ymin) || spacing <= 0) return rows;
  const k0 = Math.ceil(ymin / spacing - 0.5);
  const k1 = Math.floor(ymax / spacing - 0.5);
  for (let k = k0; k <= k1; k++) {
    const y = (k + 0.5) * spacing;
    const xs: number[] = [];
    for (const [p, q] of edges) {
      if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) {
        xs.push(p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
      }
    }
    xs.sort((a, b) => a - b);
    const row: Seg[] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = xs[i] - pullComp / 2;
      const x1 = xs[i + 1] + pullComp / 2;
      if (x1 - x0 >= minRow) row.push({ row: k - k0, y, x0, x1, used: false });
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Fill closed areas with rows. Returns groups of points; each group is sewn continuously,
 * and the caller inserts jumps (and trims) between groups.
 */
export function fillAreas(areas: Area[], opts: FillOptions): P[][] {
  if (areas.length === 0) return [];
  const theta = (opts.angleDeg * Math.PI) / 180;
  const mode = opts.mode ?? 'tatami';
  const L = Math.max(5, opts.stitchLen);
  // Rotate so that rows are horizontal.
  const rot: Area[] = areas.map((a) => ({
    outer: a.outer.map((p) => rotate(p, theta)),
    holes: a.holes.map((h) => h.map((p) => rotate(p, theta))),
  }));
  // Rows shorter than ~1 mm (sharp tips, glyph serifs) would only add tiny stitches.
  const rows = rowSegments(rot, opts.spacing, opts.pullComp ?? 0, 10);
  const all: Seg[] = rows.flat();
  if (all.length === 0) return [];

  let cur: P = opts.startNear ? rotate(opts.startNear, theta) : [all[0].x0, all[0].y];
  const groups: P[][] = [];
  let group: P[] = [];
  let remaining = all.length;

  const nearestUnused = (): Seg => {
    let best = all[0];
    let bd = Infinity;
    for (const s of all) {
      if (s.used) continue;
      const d = Math.min(dist(cur, [s.x0, s.y]), dist(cur, [s.x1, s.y]));
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  };

  const overlapping = (s: Seg, rowIdx: number): Seg | null => {
    const row = rows[rowIdx];
    if (!row) return null;
    let best: Seg | null = null;
    let bd = Infinity;
    for (const c of row) {
      if (c.used || c.x1 < s.x0 || c.x0 > s.x1) continue;
      const d = Math.min(Math.abs(c.x0 - cur[0]), Math.abs(c.x1 - cur[0]));
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  };

  while (remaining > 0) {
    let seg = nearestUnused();
    // Travel to the new chain: stitch along the way if the path stays inside, else jump.
    const start: P = dist(cur, [seg.x0, seg.y]) <= dist(cur, [seg.x1, seg.y]) ? [seg.x0, seg.y] : [seg.x1, seg.y];
    if (group.length > 0) {
      if (travelInside(cur, start, rot)) {
        group.push(...travelPoints(cur, start, Math.min(L, 30)));
      } else {
        groups.push(group);
        group = [];
      }
    }
    const dir = overlapping(seg, seg.row + 1) ? 1 : -1;
    const chain: { seg: Seg; from: number; to: number }[] = [];
    let atX = start[0];
    for (;;) {
      seg.used = true;
      remaining--;
      const fromLeft = Math.abs(atX - seg.x0) <= Math.abs(atX - seg.x1);
      const from = fromLeft ? seg.x0 : seg.x1;
      const to = fromLeft ? seg.x1 : seg.x0;
      chain.push({ seg, from, to });
      cur = [to, seg.y];
      atX = to;
      const next = overlapping(seg, seg.row + dir);
      if (!next) break;
      seg = next;
    }
    if (mode === 'satin') {
      const pts: P[] = chain.map((c) => [c.from, c.seg.y] as P);
      const last = chain[chain.length - 1];
      pts.push([last.to, last.seg.y]);
      const split = opts.splitAbove ?? Infinity;
      for (let i = 0; i < pts.length; i++) {
        if (i > 0) group.push(...splitStitch(pts[i - 1], pts[i], split, i));
        else if (group.length === 0 || dist(group[group.length - 1], pts[0]) > 0.5) group.push(pts[0]);
      }
    } else {
      for (const c of chain) group.push(...rowStitches(c.from, c.to, c.seg.y, c.seg.row, L, opts.randomShift));
    }
  }
  if (group.length) groups.push(group);
  return groups.map((g) => g.map((p) => rotate(p, -theta)));
}

/** Stitch points across one tatami row with a brick offset between rows. */
export function rowStitches(from: number, to: number, y: number, row: number, L: number, random = false): P[] {
  const out: P[] = [[from, y]];
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const off = random ? rowNoise(row) * L : (((row % 2) + 2) % 2) * (L / 2);
  const minGap = L * 0.3;
  const xs: number[] = [];
  let k = Math.ceil((lo + minGap - off) / L);
  for (let x = k * L + off; x < hi - minGap; k++, x = k * L + off) xs.push(x);
  if (from > to) xs.reverse();
  for (const x of xs) out.push([x, y]);
  out.push([to, y]);
  return out;
}

/** Repeatable pseudo-random 0–1 per row. */
function rowNoise(row: number): number {
  const x = Math.sin(row * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Split a long stitch into equal parts; odd stitches get a staggered split point. */
export function splitStitch(a: P, b: P, maxLen: number, index: number): P[] {
  const d = dist(a, b);
  if (!(d > maxLen)) return [b];
  const n = Math.ceil(d / maxLen);
  const out: P[] = [];
  if (index % 2 === 1) for (let j = 1; j <= n; j++) out.push(lerp(a, b, (j - 0.5) / n));
  else for (let j = 1; j < n; j++) out.push(lerp(a, b, j / n));
  out.push(b);
  return out;
}

function travelInside(a: P, b: P, areas: Area[]): boolean {
  const d = dist(a, b);
  if (d < 15) return true;
  const n = Math.ceil(d / 5);
  for (let i = 1; i < n; i++) {
    const p = lerp(a, b, i / n);
    if (!areas.some((ar) => pointInArea(p, ar))) return false;
  }
  return true;
}

function travelPoints(a: P, b: P, maxLen: number): P[] {
  const d = dist(a, b);
  const n = Math.max(1, Math.ceil(d / maxLen));
  const out: P[] = [];
  for (let i = 1; i <= n; i++) out.push(lerp(a, b, i / n));
  return out;
}
