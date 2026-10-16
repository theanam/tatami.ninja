import { pointInArea, type Area, type P } from './geom';

/** Small seeded PRNG (mulberry32) so a stipple stays the same between renders. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stipple (meander) lines: a random spanning tree over a grid of cells inside the shape,
 * traced around as one closed loop per connected region, so the line never crosses itself.
 * `spacing` is the distance between neighboring lines. Loops are smoothed into curves.
 */
export function stippleLines(areas: Area[], spacing: number, seed = 1): P[][] {
  const cell = Math.max(4, spacing) * 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const a of areas)
    for (const p of a.outer) {
      minX = Math.min(minX, p[0]);
      minY = Math.min(minY, p[1]);
      maxX = Math.max(maxX, p[0]);
      maxY = Math.max(maxY, p[1]);
    }
  if (!isFinite(minX)) return [];
  const W = Math.max(2, Math.ceil((maxX - minX) / cell));
  const H = Math.ceil((maxY - minY) / cell);
  if (W * H > 200_000) return [];
  const center = (i: number, j: number): P => [minX + (i + 0.5) * cell, minY + (j + 0.5) * cell];
  const inside = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) inside[j * W + i] = areas.some((a) => pointInArea(center(i, j), a)) ? 1 : 0;

  // Random spanning forest (randomized DFS) over inside cells. edge bits: 1 right, 2 down.
  const edges = new Uint8Array(W * H);
  const seen = new Uint8Array(W * H);
  const rand = rng(seed);
  const loops: P[][] = [];
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const connect = (a: number, b: number) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    edges[lo] |= hi - lo === 1 ? 1 : 2;
  };
  for (let start = 0; start < W * H; start++) {
    if (!inside[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    const comp: number[] = [start];
    while (stack.length) {
      // Growing from a random active cell (not always the newest) gives short, branching
      // turns like hand stippling instead of long maze corridors.
      const si = rand() < 0.5 ? stack.length - 1 : Math.floor(rand() * stack.length);
      const c = stack[si];
      const ci = c % W;
      const cj = (c / W) | 0;
      const opts: number[] = [];
      for (const [dx, dy] of dirs) {
        const ni = ci + dx;
        const nj = cj + dy;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const n = nj * W + ni;
        if (inside[n] && !seen[n]) opts.push(n);
      }
      if (!opts.length) {
        stack[si] = stack[stack.length - 1];
        stack.pop();
        continue;
      }
      const n = opts[Math.floor(rand() * opts.length)];
      seen[n] = 1;
      connect(c, n);
      comp.push(n);
      stack.push(n);
    }
    // Jitter each loop corner a little (same corner, same jitter) so curves wobble naturally.
    const jitter = (fx: number, fy: number) => {
      const h = Math.sin(fx * 127.1 + fy * 311.7 + seed * 74.7) * 43758.5453;
      const k = Math.sin(fx * 269.5 + fy * 183.3 + seed * 19.3) * 43758.5453;
      return [(h - Math.floor(h) - 0.5) * cell * 0.18, (k - Math.floor(k) - 0.5) * cell * 0.18];
    };
    const loop = traceTree(comp, edges, W, (fx, fy) => {
      const [jx, jy] = jitter(fx, fy);
      return [minX + (fx + 0.5) * (cell / 2) + jx, minY + (fy + 0.5) * (cell / 2) + jy];
    });
    if (loop.length >= 4) loops.push(chaikin(chaikin(chaikin(chaikin(loop)))));
  }
  return loops;
}

/**
 * Walk the loop around a spanning tree on the half-cell grid: every coarse cell becomes 2×2
 * fine cells, linked in a ring except where a tree edge cuts through, and linked to the
 * neighboring block along both sides of each tree edge.
 */
function traceTree(comp: number[], edges: Uint8Array, W: number, toWorld: (fx: number, fy: number) => P): P[] {
  const has = (a: number, b: number) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return (edges[lo] & (hi - lo === 1 ? 1 : 2)) !== 0;
  };
  const inComp = new Set(comp);
  const links = new Map<string, string[]>();
  const key = (x: number, y: number) => `${x},${y}`;
  const link = (a: string, b: string) => {
    if (!links.has(a)) links.set(a, []);
    if (!links.has(b)) links.set(b, []);
    links.get(a)!.push(b);
    links.get(b)!.push(a);
  };
  for (const c of comp) {
    const i = c % W;
    const j = (c / W) | 0;
    const right = inComp.has(c + 1) && i + 1 < W && has(c, c + 1);
    const left = i > 0 && inComp.has(c - 1) && has(c, c - 1);
    const down = inComp.has(c + W) && has(c, c + W);
    const up = inComp.has(c - W) && has(c, c - W);
    const x = 2 * i;
    const y = 2 * j;
    if (!up) link(key(x, y), key(x + 1, y));
    if (!down) link(key(x, y + 1), key(x + 1, y + 1));
    if (!left) link(key(x, y), key(x, y + 1));
    if (!right) link(key(x + 1, y), key(x + 1, y + 1));
    if (right) {
      link(key(x + 1, y), key(x + 2, y));
      link(key(x + 1, y + 1), key(x + 2, y + 1));
    }
    if (down) {
      link(key(x, y + 1), key(x, y + 2));
      link(key(x + 1, y + 1), key(x + 1, y + 2));
    }
  }
  const startKey = links.keys().next().value as string | undefined;
  if (!startKey) return [];
  const out: P[] = [];
  let prev = '';
  let cur = startKey;
  for (let guard = 0; guard <= links.size; guard++) {
    const [fx, fy] = cur.split(',').map(Number);
    out.push(toWorld(fx, fy));
    const nb = links.get(cur)!;
    const next = nb[0] !== prev ? nb[0] : nb[1];
    prev = cur;
    cur = next;
    if (cur === startKey) break;
  }
  out.push(out[0]);
  return out;
}

/** Corner-cutting smoothing of a closed loop (last point repeats the first). */
function chaikin(pts: P[]): P[] {
  const out: P[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  out.push(out[0]);
  return out;
}
