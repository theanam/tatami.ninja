/**
 * Auto-digitize: raster image → stitch objects.
 * Color-reduce (median cut + k-means), trace each color's regions, then pick
 * satin for narrow regions and tatami for wide ones. Pure functions, no DOM.
 */
import { normalizeAreas } from '../engine/clip';
import type { Area, P } from '../engine/geom';
import { colorName, ensureThread, newId, rgbToHex } from '../model/project';
import type { Pt, StitchObject, Thread } from '../model/types';
import { simplifyRing } from './svgPath';

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, row-major. */
  data: Uint8ClampedArray | Uint8Array;
}

export type RGB = [number, number, number];

export interface Quantized {
  palette: RGB[];
  /** Palette index per pixel, -1 for transparent. */
  labels: Int16Array;
  width: number;
  height: number;
}

/** Reduce an image to `k` colors. Deterministic. */
export function quantize(img: RasterImage, k: number): Quantized {
  const n = img.width * img.height;
  const labels = new Int16Array(n).fill(-1);
  // Histogram of 5-bit-per-channel bins.
  const bins = new Map<number, { count: number; sum: RGB }>();
  const binOf = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (img.data[i * 4 + 3] < 128) continue;
    const r = img.data[i * 4];
    const g = img.data[i * 4 + 1];
    const b = img.data[i * 4 + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    binOf[i] = key;
    const bin = bins.get(key);
    if (bin) {
      bin.count++;
      bin.sum[0] += r;
      bin.sum[1] += g;
      bin.sum[2] += b;
    } else bins.set(key, { count: 1, sum: [r, g, b] });
  }
  if (!bins.size) return { palette: [], labels, width: img.width, height: img.height };
  const entries = [...bins.entries()].map(([key, b]) => ({
    key,
    count: b.count,
    color: [b.sum[0] / b.count, b.sum[1] / b.count, b.sum[2] / b.count] as RGB,
  }));
  entries.sort((a, b) => b.count - a.count || a.key - b.key);
  // Weighted farthest-point initialization: distinct colors with real coverage win.
  let palette: RGB[] = [entries[0].color];
  while (palette.length < k) {
    let best = -1;
    let bestScore = 0;
    entries.forEach((e, i) => {
      const d = Math.sqrt(colorDist(palette[nearest(palette, e.color)], e.color));
      const score = d * Math.sqrt(e.count);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best < 0 || bestScore < 1e-6) break;
    palette.push(entries[best].color);
  }
  // Weighted k-means on the histogram.
  const assign = new Int16Array(entries.length);
  for (let iter = 0; iter < 8; iter++) {
    const sums = palette.map(() => [0, 0, 0, 0]);
    entries.forEach((e, i) => {
      const c = nearest(palette, e.color);
      assign[i] = c;
      const s = sums[c];
      s[0] += e.color[0] * e.count;
      s[1] += e.color[1] * e.count;
      s[2] += e.color[2] * e.count;
      s[3] += e.count;
    });
    palette = palette.map((p, c) => (sums[c][3] ? ([sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]] as RGB) : p));
  }
  const binLabel = new Map<number, number>();
  entries.forEach((e) => binLabel.set(e.key, nearest(palette, e.color)));
  for (let i = 0; i < n; i++) if (binOf[i] >= 0) labels[i] = binLabel.get(binOf[i])!;
  // Drop unused palette entries and renumber.
  const used = new Map<number, number>();
  for (const l of labels) if (l >= 0 && !used.has(l)) used.set(l, used.size);
  const finalPalette: RGB[] = [];
  for (const [old, nw] of used) finalPalette[nw] = palette[old].map(Math.round) as RGB;
  for (let i = 0; i < n; i++) if (labels[i] >= 0) labels[i] = used.get(labels[i])!;
  return { palette: finalPalette, labels: majorityFilter(labels, img.width, img.height), width: img.width, height: img.height };
}

function colorDist(c: RGB, p: RGB): number {
  return 2 * (c[0] - p[0]) ** 2 + 4 * (c[1] - p[1]) ** 2 + 3 * (c[2] - p[2]) ** 2;
}

function nearest(palette: RGB[], p: RGB): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = colorDist(palette[i], p);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** One pass of a 3×3 majority filter to remove anti-aliasing specks. */
function majorityFilter(labels: Int16Array, w: number, h: number): Int16Array {
  const out = labels.slice();
  const counts = new Map<number, number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      counts.clear();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const l = labels[yy * w + xx];
          counts.set(l, (counts.get(l) ?? 0) + 1);
        }
      }
      let best = labels[y * w + x];
      let bc = counts.get(best) ?? 0;
      for (const [l, c] of counts) {
        if (c > bc) {
          bc = c;
          best = l;
        }
      }
      if (bc >= 5) out[y * w + x] = best;
    }
  }
  return out;
}

/**
 * Trace the boundary of a binary mask into closed loops on the pixel grid
 * (pixel corners as vertices), then assemble outer rings and holes.
 */
export function traceMask(mask: Uint8Array, w: number, h: number): Area[] {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  // Directed boundary edges with the filled pixel on the right (screen coords, +y down).
  const W1 = w + 1;
  const next = new Map<number, number[]>();
  const addEdge = (x0: number, y0: number, x1: number, y1: number) => {
    const k = y0 * W1 + x0;
    const v = y1 * W1 + x1;
    const list = next.get(k);
    if (list) list.push(v);
    else next.set(k, [v]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) addEdge(x, y, x + 1, y); // top edge, left→right
      if (!at(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1); // right edge, down
      if (!at(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1); // bottom, right→left
      if (!at(x - 1, y)) addEdge(x, y + 1, x, y); // left, up
    }
  }
  const loops: P[][] = [];
  for (const [startKey] of next) {
    while ((next.get(startKey)?.length ?? 0) > 0) {
      const loop: P[] = [];
      let k = startKey;
      let prevDir: [number, number] | null = null;
      for (let guard = 0; guard < 4 * (w + 1) * (h + 1); guard++) {
        const x = k % W1;
        const y = Math.floor(k / W1);
        loop.push([x, y]);
        const outs = next.get(k);
        if (!outs || !outs.length) break;
        // At saddle vertices prefer turning right to keep diagonal pixels separate.
        let pick = 0;
        if (outs.length > 1 && prevDir) {
          let bestScore = -Infinity;
          outs.forEach((v, i) => {
            const dx = (v % W1) - x;
            const dy = Math.floor(v / W1) - y;
            const cross = prevDir![0] * dy - prevDir![1] * dx;
            const score = cross; // right turn in +y-down coords is positive cross
            if (score > bestScore) {
              bestScore = score;
              pick = i;
            }
          });
        }
        const v = outs.splice(pick, 1)[0];
        prevDir = [(v % W1) - x, Math.floor(v / W1) - y];
        k = v;
        if (k === startKey) break;
      }
      if (loop.length >= 4) loops.push(removeCollinear(loop));
    }
  }
  return normalizeAreas(loops.map((l) => ({ outer: l, holes: [] })), 'evenodd');
}

function removeCollinear(loop: P[]): P[] {
  const out: P[] = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[(i - 1 + n) % n];
    const b = loop[i];
    const c = loop[(i + 1) % n];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b);
  }
  return out;
}

export interface AutoDigitizeOptions {
  colors: number;
  /** Drop the most common border color (the fabric). */
  removeBackground: boolean;
  /** Final size: longest side in 0.1 mm. */
  size: number;
  /** Regions narrower than this (0.1 mm) become satin. */
  satinBelow?: number;
  /** Regions smaller than this (mm²) are dropped. */
  minAreaMm2?: number;
  threads: Thread[];
}

export interface AutoDigitizeResult {
  objects: StitchObject[];
  threads: Thread[];
  palette: RGB[];
  background: number | null;
  dropped: number;
}

export function backgroundLabel(q: Quantized): number | null {
  const counts = new Map<number, number>();
  const { width: w, height: h, labels } = q;
  const add = (x: number, y: number) => {
    const l = labels[y * w + x];
    counts.set(l, (counts.get(l) ?? 0) + 1);
  };
  for (let x = 0; x < w; x++) {
    add(x, 0);
    add(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    add(0, y);
    add(w - 1, y);
  }
  let best: number | null = null;
  let bc = 0;
  for (const [l, c] of counts) {
    if (c > bc) {
      bc = c;
      best = l;
    }
  }
  return best === null || best < 0 ? null : best;
}

export function autoDigitize(img: RasterImage, o: AutoDigitizeOptions): AutoDigitizeResult {
  const q = quantize(img, Math.max(2, Math.min(12, o.colors)));
  const bg = o.removeBackground ? backgroundLabel(q) : null;
  const scale = o.size / Math.max(img.width, img.height); // 0.1 mm per pixel
  const cx = img.width / 2;
  const cy = img.height / 2;
  const minArea = (o.minAreaMm2 ?? 2) * 100; // in 0.1 mm²
  const satinBelow = o.satinBelow ?? 60;
  let threads = o.threads;
  let dropped = 0;
  const regions: { label: number; area: Area; size: number }[] = [];
  q.palette.forEach((_, label) => {
    if (label === bg) return;
    const mask = new Uint8Array(img.width * img.height);
    let any = false;
    for (let i = 0; i < mask.length; i++) {
      if (q.labels[i] === label) {
        mask[i] = 1;
        any = true;
      }
    }
    if (!any) return;
    for (const a of traceMask(mask, img.width, img.height)) {
      const area: Area = {
        outer: simplifyRing(a.outer, 0.7).map(([x, y]) => [(x - cx) * scale, (y - cy) * scale] as P),
        holes: a.holes.map((hl) => simplifyRing(hl, 0.7).map(([x, y]) => [(x - cx) * scale, (y - cy) * scale] as P)),
      };
      const size = ringArea(area.outer) - area.holes.reduce((s, hl) => s + ringArea(hl), 0);
      if (size < minArea || area.outer.length < 3) {
        dropped++;
        continue;
      }
      regions.push({ label, area, size });
    }
  });
  // Big areas first (backgrounds), details on top; group by color.
  const colorArea = new Map<number, number>();
  for (const r of regions) colorArea.set(r.label, (colorArea.get(r.label) ?? 0) + r.size);
  regions.sort((a, b) => (colorArea.get(b.label)! - colorArea.get(a.label)!) || b.size - a.size);
  const round = (pts: P[]): Pt[] => pts.map(([x, y]) => [Math.round(x), Math.round(y)]);
  const counters = new Map<number, number>();
  const objects: StitchObject[] = regions.map((r) => {
    const hex = rgbToHex(...q.palette[r.label]);
    const res = ensureThread(threads, hex);
    threads = res.threads;
    const perimeter = ringLength(r.area.outer) + r.area.holes.reduce((s, hl) => s + ringLength(hl), 0);
    const width = (2 * r.size) / perimeter;
    const type = width < satinBelow ? 'satin' : 'tatami';
    const n = (counters.get(r.label) ?? 0) + 1;
    counters.set(r.label, n);
    return {
      id: newId('o'),
      name: `${colorName(hex)} ${type === 'satin' ? 'satin' : 'fill'} ${n}`,
      type,
      thread: res.id,
      visible: true,
      locked: false,
      geometry:
        r.area.holes.length === 0
          ? { kind: 'polygon', points: round(r.area.outer) }
          : { kind: 'compound', parts: [{ points: round(r.area.outer), holes: r.area.holes.map(round) }] },
      params: type === 'tatami' ? { angleDeg: 45 } : {},
      advanced: { underlay: 'inherit', pullComp: 'inherit', tieIn: true, tieOff: true, trimBefore: false, trimAfter: false },
    } satisfies StitchObject;
  });
  return { objects, threads, palette: q.palette, background: bg, dropped };
}

function ringArea(pts: P[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return Math.abs(a / 2);
}

function ringLength(pts: P[]): number {
  let l = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) l += Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
  return l;
}
