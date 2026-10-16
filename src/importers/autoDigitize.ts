/**
 * Auto-digitize (trace): raster image → stitch objects. Pure, worker-safe.
 *
 * - Colors mode: the palette is made of colors that really occur in the image (the most
 *   common color of each cluster), so blends from anti-aliased edges never become threads.
 * - Threshold mode: one-color line art from a luminance cut-off (Otsu by default).
 * Each color region is traced with sub-pixel marching squares at high resolution, then
 * scaled to the design size. With "fill under", colors are not cut out under details, so
 * no fabric shows between neighbouring colors.
 */
import { normalizeAreas } from '../engine/clip';
import type { Area, P } from '../engine/geom';
import { colorName, ensureThread, newId, normalizeHex, rgbToHex } from '../model/project';
import type { Pt, StitchObject, Thread } from '../model/types';
import { blur3, luminance, otsu, ringArea, ringLength, traceField } from './trace';

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

const colorDist = (c: RGB, p: RGB) => 2 * (c[0] - p[0]) ** 2 + 4 * (c[1] - p[1]) ** 2 + 3 * (c[2] - p[2]) ** 2;

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

/** How far (weighted squared distance) a color is from the nearest blend line between two palette colors. */
export function blendResidual(palette: RGB[], p: RGB): number {
  let best = Infinity;
  for (let a = 0; a < palette.length; a++) {
    for (let b = a + 1; b < palette.length; b++) {
      const A = palette[a];
      const B = palette[b];
      const d: RGB = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const len2 = 2 * d[0] * d[0] + 4 * d[1] * d[1] + 3 * d[2] * d[2];
      if (!len2) continue;
      const t = (2 * (p[0] - A[0]) * d[0] + 4 * (p[1] - A[1]) * d[1] + 3 * (p[2] - A[2]) * d[2]) / len2;
      if (t <= 0.04 || t >= 0.96) continue; // near an end: that is the color itself, not a blend
      best = Math.min(best, colorDist([A[0] + d[0] * t, A[1] + d[1] * t, A[2] + d[2] * t], p));
    }
  }
  return best;
}

/** Below this residual a color counts as a blend (≈ 12 RGB units off the line). */
const BLEND_TOLERANCE = 9 * 12 * 12;

/** Palette index for a (possibly blended) color: nearest end of the best-fitting pair. */
export function unmix(palette: RGB[], p: RGB): number {
  const direct = nearest(palette, p);
  if (palette.length < 2) return direct;
  let best = direct;
  let bestResidual = colorDist(palette[direct], p);
  for (let a = 0; a < palette.length; a++) {
    for (let b = a + 1; b < palette.length; b++) {
      const A = palette[a];
      const B = palette[b];
      const d: RGB = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const len2 = 2 * d[0] * d[0] + 4 * d[1] * d[1] + 3 * d[2] * d[2];
      if (!len2) continue;
      const t = Math.max(0, Math.min(1, (2 * (p[0] - A[0]) * d[0] + 4 * (p[1] - A[1]) * d[1] + 3 * (p[2] - A[2]) * d[2]) / len2));
      const q: RGB = [A[0] + d[0] * t, A[1] + d[1] * t, A[2] + d[2] * t];
      const residual = colorDist(q, p);
      if (residual < bestResidual * 0.5) {
        bestResidual = residual;
        best = t < 0.5 ? a : b;
      }
    }
  }
  return best;
}

/** Reduce to at most `k` colors, each one a color that actually appears in the image. */
export function quantize(img: RasterImage, k: number): Quantized {
  const n = img.width * img.height;
  const labels = new Int16Array(n).fill(-1);
  const bins = new Map<number, { count: number; sum: [number, number, number] }>();
  const binOf = new Int32Array(n).fill(-1);
  let opaque = 0;
  for (let i = 0; i < n; i++) {
    if (img.data[i * 4 + 3] < 128) continue;
    opaque++;
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
  const entries = [...bins.entries()]
    .map(([key, b]) => ({ key, count: b.count, color: [b.sum[0] / b.count, b.sum[1] / b.count, b.sum[2] / b.count] as RGB }))
    .sort((a, b) => b.count - a.count || a.key - b.key);
  // Only colors with real coverage may seed or own a cluster; thin blends cannot.
  const minCount = Math.max(1, opaque * 0.002);
  const major = entries.filter((e) => e.count >= minCount);
  const pool = major.length ? major : entries.slice(0, 1);
  const seeds: RGB[] = [pool[0].color];
  while (seeds.length < k) {
    let best = -1;
    let bestScore = 0;
    pool.forEach((e, i) => {
      // A blend of two colors already chosen (an edge, or a smooth upscale) is not a color.
      if (seeds.length >= 2 && blendResidual(seeds, e.color) < BLEND_TOLERANCE) return;
      const d = Math.sqrt(colorDist(seeds[nearest(seeds, e.color)], e.color));
      const score = d * Math.sqrt(e.count);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best < 0 || bestScore < 1e-6) break;
    seeds.push(pool[best].color);
  }
  // Weighted k-means over the significant colors.
  let centers = seeds.map((c) => [...c] as RGB);
  for (let iter = 0; iter < 10; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const e of pool) {
      const c = nearest(centers, e.color);
      sums[c][0] += e.color[0] * e.count;
      sums[c][1] += e.color[1] * e.count;
      sums[c][2] += e.color[2] * e.count;
      sums[c][3] += e.count;
    }
    centers = centers.map((p, c) => (sums[c][3] ? ([sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]] as RGB) : p));
  }
  // Each cluster is represented by its most common real color, not an average.
  const mode: ({ count: number; color: RGB } | null)[] = centers.map(() => null);
  for (const e of pool) {
    const c = nearest(centers, e.color);
    if (!mode[c] || e.count > mode[c]!.count) mode[c] = { count: e.count, color: e.color };
  }
  const real = mode.filter((m): m is { count: number; color: RGB } => !!m).map((m) => m.color.map(Math.round) as RGB);
  const palette: RGB[] = [];
  for (const c of real) if (!palette.some((p) => colorDist(p, c) < 1)) palette.push(c);
  // Anti-aliased edge pixels are blends of two neighbouring colors. Assign each color to
  // the nearer end of the palette pair it best lies between, so a pink rim between red and
  // white becomes red or white, never some third color that happens to be closer.
  const binLabel = new Map<number, number>();
  for (const e of entries) binLabel.set(e.key, unmix(palette, e.color));
  for (let i = 0; i < n; i++) if (binOf[i] >= 0) labels[i] = binLabel.get(binOf[i])!;
  // Drop palette entries no pixel ended up using.
  const used = new Map<number, number>();
  for (const l of labels) if (l >= 0 && !used.has(l)) used.set(l, used.size);
  const finalPalette: RGB[] = [];
  for (const [old, nw] of used) finalPalette[nw] = palette[old];
  for (let i = 0; i < n; i++) if (labels[i] >= 0) labels[i] = used.get(labels[i])!;
  return { palette: finalPalette, labels, width: img.width, height: img.height };
}

/** The most common label along the image border (usually the fabric/background). */
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

/** True when a meaningful part of the image (or its border) is transparent. */
export function hasTransparency(img: RasterImage): boolean {
  const { width: w, height: h, data } = img;
  let border = 0;
  let borderClear = 0;
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      border++;
      if (data[(y * w + x) * 4 + 3] < 128) borderClear++;
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) {
      border++;
      if (data[(y * w + x) * 4 + 3] < 128) borderClear++;
    }
  }
  if (borderClear > 0) return true;
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 128) clear++;
  return clear > (w * h) * 0.01;
}

/** Trace one binary mask with sub-pixel edges (kept for callers and tests). */
export function traceMask(mask: Uint8Array, w: number, h: number): Area[] {
  const f = new Float32Array(w * h);
  for (let i = 0; i < mask.length; i++) f[i] = mask[i] ? 1 : 0;
  const soft = blur3(f, w, h);
  for (let i = 0; i < soft.length; i++) soft[i] -= 0.5;
  return traceField(soft, w, h);
}

export interface AutoDigitizeOptions {
  mode?: 'colors' | 'threshold' | 'cross';
  /** Cross stitch mode: cell size (0.1 mm). */
  cellSize?: number;
  colors: number;
  /** Threshold mode: 0–255 gray level; omit for automatic (Otsu). */
  threshold?: number | null;
  /** Threshold mode: trace the light parts instead of the dark ones. */
  invert?: boolean;
  /** Threshold mode: thread color. */
  lineColor?: string;
  /** Colors mode: leave the most common border color unstitched. */
  removeBackground: boolean;
  /** Colors mode: don't cut colors out under details (avoids gaps). Default on. */
  fillUnder?: boolean;
  /** Final size: longest side in 0.1 mm. */
  size: number;
  /** Regions narrower than this (0.1 mm) become satin. */
  satinBelow?: number;
  /** Regions (and holes) smaller than this (mm²) are dropped. */
  minAreaMm2?: number;
  threads: Thread[];
}

export interface AutoDigitizeResult {
  objects: StitchObject[];
  threads: Thread[];
  palette: RGB[];
  background: number | null;
  dropped: number;
  /** Threshold used (threshold mode). */
  threshold?: number;
  /** The image has transparency: that is the background, and nothing opaque is removed. */
  transparent: boolean;
  /** What will be stitched, as an image at trace resolution (checker = unstitched). */
  preview: RasterImage;
  /** Traced outlines in image pixels, for drawing over the preview. */
  outlines: P[][];
}

/**
 * Does the background show through this hole? Samples the hole's interior on a grid of
 * scanlines, ignoring islands of the region's own color (e.g. the counter of an "A").
 */
function holeShowsBackground(hole: P[], labels: Int16Array, w: number, h: number, self: number, bg: number | null): boolean {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of hole) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  let bgCount = 0;
  let other = 0;
  const rows = 9;
  for (let r = 1; r <= rows; r++) {
    const y = minY + ((maxY - minY) * r) / (rows + 1);
    const xs: number[] = [];
    for (let i = 0, j = hole.length - 1; i < hole.length; j = i++) {
      const [x1, y1] = hole[j];
      const [x2, y2] = hole[i];
      if ((y1 > y) !== (y2 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const samples = Math.max(3, Math.min(30, Math.round(xs[k + 1] - xs[k])));
      for (let s = 0; s < samples; s++) {
        const x = xs[k] + ((xs[k + 1] - xs[k]) * (s + 0.5)) / samples;
        const l = labels[Math.max(0, Math.min(h - 1, Math.floor(y))) * w + Math.max(0, Math.min(w - 1, Math.floor(x)))];
        if (l === self) continue;
        if (l < 0 || l === bg) bgCount++;
        else other++;
      }
    }
  }
  return bgCount >= other;
}

interface Region {
  hex: string;
  area: Area;
  size: number;
}

export function autoDigitize(img: RasterImage, o: AutoDigitizeOptions): AutoDigitizeResult {
  if (o.mode === 'cross') return crossStitchImage(img, o);
  const { width: w, height: h } = img;
  const preview = new Uint8ClampedArray(w * h * 4);
  const checker = (i: number) => {
    const x = i % w;
    const y = (i / w) | 0;
    return ((x >> 4) + (y >> 4)) % 2 ? 58 : 44;
  };
  const regions: Region[] = [];
  let palette: RGB[] = [];
  let bg: number | null = null;
  let thresholdUsed: number | undefined;

  if (o.mode === 'threshold') {
    const lum = luminance(img.data, w, h);
    const T = o.threshold ?? otsu(lum);
    thresholdUsed = Math.round(T);
    const smooth = blur3(lum, w, h);
    // Transparent pixels are never stitched, whatever their luminance (white included).
    const alpha = new Float32Array(w * h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = img.data[i * 4 + 3] >= 128 ? 1 : 0;
    const alphaSoft = blur3(alpha, w, h);
    const field = new Float32Array(w * h);
    // Inside needs both: the right side of the cut-off AND opaque (min of the two fields).
    for (let i = 0; i < field.length; i++) {
      const tone = o.invert ? smooth[i] - T : T - smooth[i];
      field[i] = Math.min(tone, (alphaSoft[i] - 0.5) * 510);
    }
    const hex = normalizeHex(o.lineColor ?? '#1A1A1A');
    const rgb = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    for (let i = 0; i < w * h; i++) {
      const inside = alpha[i] > 0 && (o.invert ? lum[i] > T : lum[i] < T);
      const v = checker(i);
      preview.set(inside ? [rgb[0], rgb[1], rgb[2], 255] : [v, v, v, 255], i * 4);
    }
    palette = [rgb as RGB];
    for (const area of traceField(field, w, h)) regions.push({ hex, area, size: 0 });
  } else {
    const q = quantize(img, Math.max(2, Math.min(12, o.colors)));
    palette = q.palette;
    // With transparency, the transparent area IS the background: white (or any color) inside
    // the artwork is a real color to stitch, never auto-removed.
    bg = o.removeBackground && !hasTransparency(img) ? backgroundLabel(q) : null;
    for (let i = 0; i < w * h; i++) {
      const l = q.labels[i];
      if (l < 0 || l === bg) {
        const v = checker(i);
        preview.set([v, v, v, 255], i * 4);
      } else preview.set([...q.palette[l], 255], i * 4);
    }
    const fillUnder = o.fillUnder !== false;
    q.palette.forEach((c, label) => {
      if (label === bg) return;
      const f = new Float32Array(w * h);
      let any = false;
      for (let i = 0; i < f.length; i++) {
        if (q.labels[i] === label) {
          f[i] = 1;
          any = true;
        }
      }
      if (!any) return;
      const soft = blur3(f, w, h);
      for (let i = 0; i < soft.length; i++) soft[i] -= 0.5;
      for (const area of traceField(soft, w, h)) {
        let holes = area.holes;
        if (fillUnder) {
          // Keep a hole only where the background shows through; other colors sew on top.
          holes = holes.filter((hole) => holeShowsBackground(hole, q.labels, w, h, label, bg));
        }
        regions.push({ hex: rgbToHex(...c), area: { outer: area.outer, holes }, size: 0 });
      }
    });
  }

  // Scale to the design (0.1 mm), centered.
  const scale = o.size / Math.max(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const toWorld = (pts: P[]) => pts.map(([x, y]) => [(x - cx) * scale, (y - cy) * scale] as P);
  const minArea = (o.minAreaMm2 ?? 2) * 100;
  const satinBelow = o.satinBelow ?? 60;
  let dropped = 0;
  const kept: Region[] = [];
  const outlines: P[][] = [];
  for (const r of regions) {
    const outer = toWorld(r.area.outer);
    const holes = r.area.holes.map(toWorld).filter((hl) => ringArea(hl) >= minArea);
    const size = ringArea(outer) - holes.reduce((s, hl) => s + ringArea(hl), 0);
    if (size < minArea) {
      dropped++;
      continue;
    }
    kept.push({ hex: r.hex, area: { outer, holes }, size });
    outlines.push(r.area.outer, ...r.area.holes);
  }
  // Containers before what they contain: larger first. (With fill-under, details sew on top.)
  kept.sort((a, b) => b.size - a.size);

  let threads = o.threads;
  const counters = new Map<string, number>();
  const round = (pts: P[]): Pt[] => {
    const out: Pt[] = [];
    for (const [x, y] of pts) {
      const p: Pt = [Math.round(x), Math.round(y)];
      const last = out[out.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
    }
    return out;
  };
  const objects: StitchObject[] = kept.map((r) => {
    const res = ensureThread(threads, r.hex);
    threads = res.threads;
    const perimeter = ringLength(r.area.outer) + r.area.holes.reduce((s, hl) => s + ringLength(hl), 0);
    const width = (2 * r.size) / perimeter;
    const type = width < satinBelow ? 'satin' : 'tatami';
    const n = (counters.get(r.hex) ?? 0) + 1;
    counters.set(r.hex, n);
    return {
      id: newId('o'),
      name: `${colorName(r.hex)} ${type === 'satin' ? 'satin' : 'fill'} ${n}`,
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
  return {
    objects,
    threads,
    palette,
    background: bg,
    dropped,
    threshold: thresholdUsed,
    transparent: hasTransparency(img),
    preview: { width: w, height: h, data: preview },
    outlines,
  };
}

/**
 * Cross stitch: the image on a grid of cells (cellSize), each cell taking the most common
 * palette color in it. Every color becomes one object filled with cross stitches, all on
 * the same grid.
 */
function crossStitchImage(img: RasterImage, o: AutoDigitizeOptions): AutoDigitizeResult {
  const { width: w, height: h } = img;
  const q = quantize(img, Math.max(2, Math.min(12, o.colors)));
  const transparent = hasTransparency(img);
  const bg = o.removeBackground && !transparent ? backgroundLabel(q) : null;
  const cell = Math.max(10, o.cellSize ?? 25);
  const scale = o.size / Math.max(w, h);
  const cx = w / 2;
  const cy = h / 2;
  // World (0.1 mm) ↔ image pixels, centered like the other modes.
  const toPx = (wx: number, wy: number): [number, number] => [wx / scale + cx, wy / scale + cy];
  const i0 = Math.floor((-cx * scale) / cell);
  const i1 = Math.ceil(((w - cx) * scale) / cell);
  const j0 = Math.floor((-cy * scale) / cell);
  const j1 = Math.ceil(((h - cy) * scale) / cell);
  const cellsByLabel = new Map<number, Area[]>();
  const preview = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = ((i % w >> 4) + (((i / w) | 0) >> 4)) % 2 ? 58 : 44;
    preview.set([v, v, v, 255], i * 4);
  }
  const counts = new Map<number, number>();
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) {
      const [x0, y0] = toPx(i * cell, j * cell);
      const [x1, y1] = toPx((i + 1) * cell, (j + 1) * cell);
      counts.clear();
      let total = 0;
      // Vote on a 5×5 sample of the cell.
      for (let sy = 0; sy < 5; sy++)
        for (let sx = 0; sx < 5; sx++) {
          const px = Math.floor(x0 + ((x1 - x0) * (sx + 0.5)) / 5);
          const py = Math.floor(y0 + ((y1 - y0) * (sy + 0.5)) / 5);
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          total++;
          const l = q.labels[py * w + px];
          counts.set(l, (counts.get(l) ?? 0) + 1);
        }
      if (!total) continue;
      let best = -1;
      let bc = 0;
      for (const [l, c] of counts) if (c > bc) [best, bc] = [l, c];
      if (best < 0 || best === bg) continue;
      const list = cellsByLabel.get(best) ?? [];
      list.push({ outer: [[i * cell, j * cell], [(i + 1) * cell, j * cell], [(i + 1) * cell, (j + 1) * cell], [i * cell, (j + 1) * cell]], holes: [] });
      cellsByLabel.set(best, list);
      const col = q.palette[best];
      for (let py = Math.max(0, Math.floor(y0)); py < Math.min(h, Math.ceil(y1)); py++)
        for (let px = Math.max(0, Math.floor(x0)); px < Math.min(w, Math.ceil(x1)); px++) preview.set([...col, 255], (py * w + px) * 4);
    }
  }
  let threads = o.threads;
  const objects: StitchObject[] = [];
  const outlines: P[][] = [];
  const round = (pts: P[]): Pt[] => pts.map(([x, y]) => [Math.round(x), Math.round(y)]);
  // Larger colors first.
  const order = [...cellsByLabel.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [label, cells] of order) {
    const hex = rgbToHex(...q.palette[label]);
    const res = ensureThread(threads, hex);
    threads = res.threads;
    const merged = normalizeAreas(cells, 'nonzero');
    objects.push({
      id: newId('o'),
      name: `${colorName(hex)} cross stitch`,
      type: 'tatami',
      thread: res.id,
      visible: true,
      locked: false,
      geometry: { kind: 'compound', parts: merged.map((a) => ({ points: round(a.outer), holes: a.holes.map(round) })) },
      params: { fillPattern: 'x-stitch', patternSpacing: cell },
      advanced: { underlay: 'none', tieIn: true, tieOff: true },
    });
    for (const a of merged) for (const r of [a.outer, ...a.holes]) outlines.push(r.map(([x, y]) => toPx(x, y)));
  }
  return { objects, threads, palette: q.palette, background: bg, dropped: 0, transparent, preview: { width: w, height: h, data: preview }, outlines };
}
