/**
 * High-quality raster tracing. Pure functions, worker-safe.
 *
 * Contours come from marching squares on a continuous field with linear interpolation,
 * so edges are placed with sub-pixel accuracy instead of following the pixel staircase.
 * Images are traced at high resolution and only then scaled to the design size.
 */
import { normalizeAreas } from '../engine/clip';
import type { Area, P } from '../engine/geom';
import { simplifyRing } from './svgPath';

/** Rec. 601 luminance (0–255). Transparent pixels count as white (background). */
export function luminance(data: Uint8ClampedArray | Uint8Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3] / 255;
    const l = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    out[i] = l * a + 255 * (1 - a);
  }
  return out;
}

/** Otsu's threshold: the gray level that best separates dark from light. */
export function otsu(lum: Float32Array): number {
  const hist = new Float64Array(256);
  for (const v of lum) hist[Math.max(0, Math.min(255, Math.round(v)))]++;
  const total = lum.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  const between = new Float64Array(256);
  let best = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    between[t] = wB * wF * (mB - mF) ** 2;
    if (between[t] > best) best = between[t];
  }
  if (!best) return 127.5;
  // With clean two-tone art every level in the gap scores the same: take the middle of
  // the best plateau so edges sit halfway between the tones (where anti-aliasing puts them).
  let lo = -1;
  let hi = -1;
  for (let t = 0; t < 256; t++) {
    if (between[t] >= best * (1 - 1e-9)) {
      if (lo < 0) lo = t;
      hi = t;
    }
  }
  return (lo + hi) / 2 + 0.5;
}

/** 3×3 box blur (edges clamp). */
export function blur3(f: Float32Array, w: number, h: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) {
      const a = f[r + Math.max(0, x - 1)];
      const b = f[r + x];
      const c = f[r + Math.min(w - 1, x + 1)];
      tmp[r + x] = (a + b + c) / 3;
    }
  }
  for (let y = 0; y < h; y++) {
    const up = Math.max(0, y - 1) * w;
    const r = y * w;
    const dn = Math.min(h - 1, y + 1) * w;
    for (let x = 0; x < w; x++) out[r + x] = (tmp[up + x] + tmp[r + x] + tmp[dn + x]) / 3;
  }
  return out;
}

/**
 * Closed contours where `f` crosses 0 (inside: f > 0). Samples sit at pixel centers;
 * the field is padded with "outside" so every contour closes. Coordinates are in pixels.
 */
export function marchingSquares(f: Float32Array, w: number, h: number): P[][] {
  const val = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : f[y * w + x]);
  const W = w + 2;
  // Edge ids: horizontal edge from (x,y) to (x+1,y) and vertical from (x,y) to (x,y+1), x,y ∈ [-1, w].
  const hId = (x: number, y: number) => ((y + 1) * W + (x + 1)) * 2;
  const vId = (x: number, y: number) => ((y + 1) * W + (x + 1)) * 2 + 1;
  const pos = new Map<number, P>();
  const at = (id: number, ax: number, ay: number, bx: number, by: number) => {
    let p = pos.get(id);
    if (!p) {
      const fa = val(ax, ay);
      const fb = val(bx, by);
      const t = fa === fb ? 0.5 : Math.max(0, Math.min(1, fa / (fa - fb)));
      p = [ax + 0.5 + (bx - ax) * t, ay + 0.5 + (by - ay) * t];
      pos.set(id, p);
    }
    return id;
  };
  const segA: number[] = [];
  const segB: number[] = [];
  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      const tl = val(x, y) > 0 ? 1 : 0;
      const tr = val(x + 1, y) > 0 ? 1 : 0;
      const br = val(x + 1, y + 1) > 0 ? 1 : 0;
      const bl = val(x, y + 1) > 0 ? 1 : 0;
      const c = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (c === 0 || c === 15) continue;
      const T = () => at(hId(x, y), x, y, x + 1, y);
      const B = () => at(hId(x, y + 1), x, y + 1, x + 1, y + 1);
      const L = () => at(vId(x, y), x, y, x, y + 1);
      const R = () => at(vId(x + 1, y), x + 1, y, x + 1, y + 1);
      const seg = (a: number, b: number) => {
        segA.push(a);
        segB.push(b);
      };
      const center = (val(x, y) + val(x + 1, y) + val(x + 1, y + 1) + val(x, y + 1)) / 4 > 0;
      switch (c) {
        case 1: seg(L(), B()); break;
        case 2: seg(B(), R()); break;
        case 3: seg(L(), R()); break;
        case 4: seg(T(), R()); break;
        case 5: if (center) { seg(T(), L()); seg(B(), R()); } else { seg(T(), R()); seg(L(), B()); } break;
        case 6: seg(T(), B()); break;
        case 7: seg(T(), L()); break;
        case 8: seg(T(), L()); break;
        case 9: seg(T(), B()); break;
        case 10: if (center) { seg(T(), R()); seg(L(), B()); } else { seg(T(), L()); seg(B(), R()); } break;
        case 11: seg(T(), R()); break;
        case 12: seg(L(), R()); break;
        case 13: seg(B(), R()); break;
        case 14: seg(L(), B()); break;
      }
    }
  }
  // Chain segments into loops: every edge belongs to exactly two segments.
  const byEdge = new Map<number, number[]>();
  for (let i = 0; i < segA.length; i++) {
    for (const e of [segA[i], segB[i]]) {
      const l = byEdge.get(e);
      if (l) l.push(i);
      else byEdge.set(e, [i]);
    }
  }
  const used = new Uint8Array(segA.length);
  const loops: P[][] = [];
  for (let s0 = 0; s0 < segA.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const start = segA[s0];
    const ring: P[] = [pos.get(start)!];
    let cur = segB[s0];
    for (let guard = 0; guard < segA.length + 2 && cur !== start; guard++) {
      ring.push(pos.get(cur)!);
      const next = byEdge.get(cur)!.find((si) => !used[si]);
      if (next === undefined) break;
      used[next] = 1;
      cur = segA[next] === cur ? segB[next] : segA[next];
    }
    if (ring.length >= 3) loops.push(ring);
  }
  return loops;
}

/** Trace a field into clean areas (outer rings with holes), simplified to `eps` pixels. */
export function traceField(f: Float32Array, w: number, h: number, eps = 0.35): Area[] {
  const loops = marchingSquares(f, w, h)
    .map((l) => simplifyRing(l, eps))
    .filter((l) => l.length >= 3);
  return normalizeAreas(loops.map((outer) => ({ outer, holes: [] })), 'evenodd');
}

export function ringArea(pts: P[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return Math.abs(a / 2);
}

export function ringLength(pts: P[]): number {
  let l = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) l += Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
  return l;
}

/** A point strictly inside a ring (for sampling what fills a hole). */
export function interiorPoint(ring: P[]): P {
  // Scan the horizontal line through the vertical middle for the widest inside span.
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const y = (minY + maxY) / 2 + 1e-3;
  const xs: number[] = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    if ((y1 > y) !== (y2 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
  }
  xs.sort((a, b) => a - b);
  let best: P = ring[0];
  let bw = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > bw) {
      bw = xs[i + 1] - xs[i];
      best = [(xs[i] + xs[i + 1]) / 2, y];
    }
  }
  return best;
}
