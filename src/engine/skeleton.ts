/**
 * Satin along strokes: turn a filled shape (a glyph) into satin columns that follow its
 * strokes, the way hand-digitized small lettering is made. The shape is rasterized, thinned
 * to a one-pixel skeleton (Zhang–Suen), and each skeleton branch becomes a column whose width
 * follows the stroke (distance transform).
 */
import { areaOfAreas } from './clip';
import type { Area, P } from './geom';
import { columnFromRails, type Column } from './satin';

const SAMPLE = 2; // column sample spacing (0.1 mm)

interface Raster {
  w: number;
  h: number;
  x0: number;
  y0: number;
  cell: number;
  inside: Uint8Array;
}

function rasterize(areas: Area[], cell: number): Raster | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const a of areas)
    for (const [x, y] of a.outer) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  if (!isFinite(minX)) return null;
  const x0 = minX - 2 * cell;
  const y0 = minY - 2 * cell;
  const w = Math.ceil((maxX - minX) / cell) + 4;
  const h = Math.ceil((maxY - minY) / cell) + 4;
  if (w * h > 1_000_000) return null;
  const inside = new Uint8Array(w * h);
  const edges: [P, P][] = [];
  for (const a of areas) for (const r of [a.outer, ...a.holes]) for (let i = 0; i < r.length; i++) edges.push([r[i], r[(i + 1) % r.length]]);
  for (let j = 0; j < h; j++) {
    const y = y0 + (j + 0.5) * cell;
    const xs: number[] = [];
    for (const [p, q] of edges) if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) xs.push(p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - x0) / cell - 0.5));
      const i1 = Math.min(w - 1, Math.floor((xs[k + 1] - x0) / cell - 0.5));
      for (let i = i0; i <= i1; i++) inside[j * w + i] = 1;
    }
  }
  return { w, h, x0, y0, cell, inside };
}

/** Euclidean-ish distance (in cells) from each inside cell to the outside (chamfer 3-4). */
function distance(r: Raster): Float32Array {
  const { w, h, inside } = r;
  const d = new Float32Array(w * h);
  const INF = 1e9;
  for (let i = 0; i < d.length; i++) d[i] = inside[i] ? INF : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/** Zhang–Suen thinning (in place on a copy). */
function thin(r: Raster): Uint8Array {
  const { w, h } = r;
  const img = r.inside.slice();
  const nb = (x: number, y: number) => {
    const v = (dx: number, dy: number) => (x + dx < 0 || y + dy < 0 || x + dx >= w || y + dy >= h ? 0 : img[(y + dy) * w + x + dx]);
    return [v(0, -1), v(1, -1), v(1, 0), v(1, 1), v(0, 1), v(-1, 1), v(-1, 0), v(-1, -1)];
  };
  let changed = true;
  for (let guard = 0; changed && guard < 200; guard++) {
    changed = false;
    for (const step of [0, 1]) {
      const del: number[] = [];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (!img[y * w + x]) continue;
          const p = nb(x, y);
          const B = p.reduce((s, v) => s + v, 0);
          if (B < 2 || B > 6) continue;
          let A = 0;
          for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) A++;
          if (A !== 1) continue;
          if (step === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
          del.push(y * w + x);
        }
      for (const i of del) img[i] = 0;
      if (del.length) changed = true;
    }
  }
  return img;
}

/** Skeleton → branches (pixel paths between endpoints/junctions, plus pure loops). */
function branches(sk: Uint8Array, w: number, h: number): { pts: number[]; closed: boolean }[] {
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && sk[y * w + x] === 1;
  const RING: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  /** Crossing number: 1 = end, 2 = along a line, 3+ = junction (robust to diagonal steps). */
  const crossings = (i: number) => {
    const x = i % w;
    const y = (i / w) | 0;
    let t = 0;
    for (let k = 0; k < 8; k++) if (!on(x + RING[k][0], y + RING[k][1]) && on(x + RING[(k + 1) % 8][0], y + RING[(k + 1) % 8][1])) t++;
    return t;
  };
  const neighbors = (i: number) => {
    const x = i % w;
    const y = (i / w) | 0;
    const out: number[] = [];
    // 4-neighbors first so walks follow the line, not its diagonal shortcuts.
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]] as [number, number][])
      if (on(x + dx, y + dy)) out.push((y + dy) * w + x + dx);
    return out;
  };
  const pixels: number[] = [];
  for (let i = 0; i < sk.length; i++) if (sk[i]) pixels.push(i);
  const node = new Set(pixels.filter((i) => crossings(i) !== 2));
  const visited = new Uint8Array(sk.length);
  const out: { pts: number[]; closed: boolean }[] = [];
  const walk = (start: number, first: number): number[] => {
    const pts = [start, first];
    visited[first] = 1;
    let cur = first;
    for (let guard = 0; guard < sk.length && !node.has(cur); guard++) {
      const nx = neighbors(cur).filter((n) => !visited[n] || (n === start && pts.length > 3));
      if (!nx.length) break;
      // Coming back to the start closes a loop.
      const next = nx.includes(start) && pts.length > 3 ? start : nx[0];
      pts.push(next);
      if (next === start) break;
      visited[next] = 1;
      cur = next;
    }
    return pts;
  };
  for (const n of node) {
    visited[n] = 1;
    for (const m of neighbors(n)) {
      if (visited[m] && !node.has(m)) continue;
      if (node.has(m)) {
        if (n < m) out.push({ pts: [n, m], closed: false });
        continue;
      }
      out.push({ pts: walk(n, m), closed: false });
    }
  }
  // Loops with no nodes (like the letter O).
  for (const i of pixels) {
    if (visited[i]) continue;
    visited[i] = 1;
    const nb = neighbors(i);
    if (!nb.length) continue;
    const pts = walk(i, nb[0]);
    out.push({ pts, closed: pts[pts.length - 1] === i });
  }
  return out;
}

function circumradius(a: P, b: P, c: P): number {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return area2 < 1e-6 ? Infinity : (ab * bc * ca) / (2 * area2);
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

function smooth(pts: P[], closed: boolean, passes = 2): P[] {
  let cur = pts;
  for (let k = 0; k < passes; k++) {
    cur = cur.map((p, i) => {
      if (!closed && (i === 0 || i === cur.length - 1)) return p;
      const a = cur[(i - 1 + cur.length) % cur.length];
      const b = cur[(i + 1) % cur.length];
      return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
    });
  }
  return cur;
}

/** Satin columns along the strokes of filled areas. */
export function strokeColumns(areas: Area[], pullComp = 0): Column[] {
  // Estimate the stroke width to pick a raster cell: ~8 cells across a stroke.
  const area = areaOfAreas(areas);
  let perim = 0;
  for (const a of areas)
    for (const r of [a.outer, ...a.holes])
      for (let i = 0; i < r.length; i++) {
        const p = r[i];
        const q = r[(i + 1) % r.length];
        perim += Math.hypot(q[0] - p[0], q[1] - p[1]);
      }
  const stroke = perim > 0 ? (2 * Math.abs(area)) / perim : 10;
  const cell = Math.max(0.5, Math.min(3, stroke / 8));
  const r = rasterize(areas, cell);
  if (!r) return [];
  const dist = distance(r);
  const sk = thin(r);
  const toWorld = (i: number): P => [r.x0 + ((i % r.w) + 0.5) * cell, r.y0 + (((i / r.w) | 0) + 0.5) * cell];
  const widthAt = (i: number) => Math.max(2, 2 * dist[i] * cell);
  type Br = { pts: number[]; closed: boolean; alive: boolean };
  let brs: Br[] = branches(sk, r.w, r.h).map((b) => ({ ...b, alive: b.pts.length >= 2 }));
  const pathLen = (b: Br) => {
    let l = 0;
    for (let i = 1; i < b.pts.length; i++) {
      const p = toWorld(b.pts[i - 1]);
      const q = toWorld(b.pts[i]);
      l += Math.hypot(q[0] - p[0], q[1] - p[1]);
    }
    return l;
  };
  // Prune spurs: short branches with a free end are thinning artifacts at corners and stroke ends.
  for (let pass = 0; pass < 6; pass++) {
    const deg = new Map<number, number>();
    for (const b of brs) {
      if (!b.alive || b.closed) continue;
      for (const e of [b.pts[0], b.pts[b.pts.length - 1]]) deg.set(e, (deg.get(e) ?? 0) + 1);
    }
    let removed = false;
    for (const b of brs) {
      if (!b.alive || b.closed) continue;
      const a = b.pts[0];
      const z = b.pts[b.pts.length - 1];
      const free = (deg.get(a) ?? 0) === 1 || (deg.get(z) ?? 0) === 1;
      const bothFree = (deg.get(a) ?? 0) === 1 && (deg.get(z) ?? 0) === 1;
      const w = Math.max(widthAt(a), widthAt(z), median(b.pts.map(widthAt)));
      if (free && !bothFree && pathLen(b) < w * 1.2) {
        b.alive = false;
        removed = true;
      }
    }
    if (!removed) break;
  }
  // Join branches through nodes that now connect exactly two of them.
  for (let guard = 0; guard < 200; guard++) {
    const at = new Map<number, Br[]>();
    for (const b of brs) {
      if (!b.alive || b.closed) continue;
      for (const e of [b.pts[0], b.pts[b.pts.length - 1]]) at.set(e, [...(at.get(e) ?? []), b]);
    }
    const pair = [...at.entries()].find(([, list]) => list.length === 2 && list[0] !== list[1]);
    if (!pair) break;
    const [node, [p, q]] = pair;
    const pp = p.pts[p.pts.length - 1] === node ? p.pts : [...p.pts].reverse();
    const qq = q.pts[0] === node ? q.pts : [...q.pts].reverse();
    const joined = [...pp, ...qq.slice(1)];
    p.alive = false;
    q.alive = false;
    brs = [...brs, { pts: joined, closed: joined[0] === joined[joined.length - 1], alive: true }];
  }
  const endDeg = new Map<number, number>();
  for (const b of brs) if (b.alive && !b.closed) for (const e of [b.pts[0], b.pts[b.pts.length - 1]]) endDeg.set(e, (endDeg.get(e) ?? 0) + 1);
  const cols: Column[] = [];
  for (const b of brs) {
    if (!b.alive) continue;
    let pts: P[] = b.pts.map(toWorld);
    const raw = b.pts.map(widthAt);
    const med = median(raw);
    // Steady widths: junctions and corners read wider on the distance map than the stroke is.
    let widths = raw.map((v) => Math.min(med * 1.15, Math.max(med * 0.75, v)));
    let len = pathLen(b);
    if (len < med * 0.5) continue;
    pts = smooth(pts, b.closed, 4);
    // Free ends stop half a stroke short of the outline: extend them back out.
    if (!b.closed) {
      const ext = (from: P, toward: P) => {
        const d = Math.hypot(from[0] - toward[0], from[1] - toward[1]) || 1;
        return [from[0] + ((from[0] - toward[0]) / d) * med * 0.45, from[1] + ((from[1] - toward[1]) / d) * med * 0.45] as P;
      };
      const k = Math.min(3, pts.length - 1);
      if ((endDeg.get(b.pts[0]) ?? 0) === 1) {
        pts = [ext(pts[0], pts[k]), ...pts];
        widths = [widths[0] * 0.8, ...widths];
      }
      if ((endDeg.get(b.pts[b.pts.length - 1]) ?? 0) === 1) {
        pts = [...pts, ext(pts[pts.length - 1], pts[pts.length - 1 - k])];
        widths = [...widths, widths[widths.length - 1] * 0.8];
      }
      len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    // Resample the center line evenly, with a width per sample.
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const n = Math.max(2, Math.ceil(len / SAMPLE));
    const cpts: P[] = [];
    const cw: number[] = [];
    let k = 0;
    for (let s = 0; s <= n; s++) {
      const t = (len * s) / n;
      while (k + 1 < cum.length - 1 && cum[k + 1] < t) k++;
      const seg = cum[k + 1] - cum[k] || 1;
      const u = Math.min(1, Math.max(0, (t - cum[k]) / seg));
      cpts.push([pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u]);
      cw.push(widths[k] + (widths[k + 1] - widths[k]) * u + pullComp);
    }
    // Offset both rails; on the inside of a bend, never past the bend's center (rails would cross).
    const railA: [number, number][] = [];
    const railB: [number, number][] = [];
    const W = 4;
    for (let i = 0; i < cpts.length; i++) {
      const prev = cpts[b.closed ? (i - W + cpts.length) % cpts.length : Math.max(0, i - W)];
      const next = cpts[b.closed ? (i + W) % cpts.length : Math.min(cpts.length - 1, i + W)];
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l;
      const ny = dx / l;
      const R = circumradius(prev, cpts[i], next);
      // Which side is the inside of the bend?
      const cross = (cpts[i][0] - prev[0]) * (next[1] - cpts[i][1]) - (cpts[i][1] - prev[1]) * (next[0] - cpts[i][0]);
      const half = cw[i] / 2;
      const inner = Math.min(half, R * 0.8);
      const offA = cross > 0 ? inner : half; // +n side is inside when turning that way
      const offB = cross > 0 ? half : inner;
      railA.push([cpts[i][0] + nx * offA, cpts[i][1] + ny * offA]);
      railB.push([cpts[i][0] - nx * offB, cpts[i][1] - ny * offB]);
    }
    // A loop closes back on its start.
    if (b.closed) {
      railA.push(railA[0]);
      railB.push(railB[0]);
    }
    // Pair the rails by arc length, so the inner rail bunches up instead of crossing.
    const col = columnFromRails({ kind: 'polyline', points: railA }, { kind: 'polyline', points: railB });
    cols.push({ a: col.a, b: col.b, closed: false });
  }
  return cols;
}
