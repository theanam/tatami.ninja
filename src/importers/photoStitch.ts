/**
 * Photo stitch: shading a photo with rows of zigzag. Each thread color gets its own layer of
 * rows (at its own angle); the zigzag widens where the photo is closer to that color, so
 * layers mix on the fabric like a print. Mono uses one thread and the photo's darkness.
 */
import { CMD, type StitchObject, type Thread } from '../model/types';
import { colorName, ensureThread, newId, rgbToHex } from '../model/project';
import type { RasterImage, RGB } from './autoDigitize';

export interface PhotoOptions {
  /** Final size: longest side in 0.1 mm. */
  size: number;
  /** Row spacing (0.1 mm). */
  rowGap?: number;
  /** Palette to shade with (light colors are sewn first). */
  palette: RGB[];
  /** Mono: shade by darkness with the single palette color. */
  mono?: boolean;
  /** Palette index left unstitched (background), if any. */
  background?: number | null;
  threads: Thread[];
}

const lum = (c: RGB) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

export function photoStitch(img: RasterImage, o: PhotoOptions): { objects: StitchObject[]; threads: Thread[]; preview: Uint8ClampedArray } {
  const { width: w, height: h, data } = img;
  const scale = o.size / Math.max(w, h);
  const rowGap = Math.max(6, o.rowGap ?? 12);
  const step = Math.max(5, rowGap * 0.7);
  const colors = o.palette.map((c, i) => ({ c, i })).filter(({ i }) => i !== o.background);
  // Light layers first, dark detail on top.
  colors.sort((a, b) => lum(b.c) - lum(a.c));

  const sample = (wx: number, wy: number): RGB | null => {
    const px = Math.floor(wx / scale + w / 2);
    const py = Math.floor(wy / scale + h / 2);
    if (px < 0 || py < 0 || px >= w || py >= h) return null;
    const k = (py * w + px) * 4;
    if (data[k + 3] < 128) return null;
    return [data[k], data[k + 1], data[k + 2]];
  };
  /** How much of palette color `ci` this pixel needs (0–1). */
  const weight = (p: RGB, ci: number): number => {
    if (o.mono) return Math.max(0, Math.min(1, (235 - lum(p)) / 215));
    // Soft assignment: closer palette colors get more coverage.
    let total = 0;
    let mine = 0;
    for (const { c, i } of colors) {
      const d = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
      const v = Math.exp(-d / 38);
      total += v;
      if (i === ci) mine = v;
    }
    if (o.background != null) {
      const b = o.palette[o.background];
      total += Math.exp(-Math.hypot(p[0] - b[0], p[1] - b[1], p[2] - b[2]) / 38);
    }
    return total > 0 ? mine / total : 0;
  };

  const half = (Math.max(w, h) * scale) / 2;
  const R = Math.hypot(w * scale, h * scale) / 2;
  let threads = o.threads;
  const objects: StitchObject[] = [];
  colors.forEach(({ c, i }, layer) => {
    const angle = o.mono ? 0 : (layer * 180) / Math.max(1, colors.length) + 15;
    const t = (angle * Math.PI) / 180;
    const ca = Math.cos(t);
    const sa = Math.sin(t);
    const out: number[] = [];
    let last: [number, number] | null = null;
    let rowIdx = 0;
    for (let y = -R; y <= R; y += rowGap, rowIdx++) {
      const forward = rowIdx % 2 === 0;
      let run: [number, number][] = [];
      const flush = () => {
        if (run.length >= 3) {
          const [fx, fy] = run[0];
          if (last && Math.hypot(fx - last[0], fy - last[1]) > 30) out.push(last[0], last[1], CMD.TRIM);
          out.push(Math.round(fx), Math.round(fy), CMD.JUMP);
          for (const [x, yy] of run) out.push(Math.round(x), Math.round(yy), CMD.STITCH);
          last = run[run.length - 1];
        }
        run = [];
      };
      let k = 0;
      for (let xi = 0; xi <= (2 * R) / step; xi++, k++) {
        const x = forward ? -R + xi * step : R - xi * step;
        // Row point in world space (rotated).
        const bx = x * ca - y * sa;
        const by = x * sa + y * ca;
        if (Math.abs(bx) > half + 1 || Math.abs(by) > half + 1) {
          flush();
          continue;
        }
        const p = sample(bx, by);
        const wgt = p ? weight(p, i) : 0;
        if (wgt < 0.12) {
          flush();
          continue;
        }
        const amp = (rowGap / 2) * Math.min(1, wgt * 1.15) * (k % 2 ? 1 : -1);
        run.push([bx - sa * amp, by + ca * amp]);
      }
      flush();
    }
    if (!out.length) return;
    const hex = rgbToHex(...c);
    const res = ensureThread(threads, hex);
    threads = res.threads;
    objects.push({
      id: newId('o'),
      name: `Photo · ${colorName(hex)}`,
      type: 'stitches',
      thread: res.id,
      visible: true,
      locked: false,
      geometry: { kind: 'stitches', data: out },
      params: {},
      advanced: {},
    });
  });

  // Preview: the photo as the threads will mix it (palette blend by weight, or gray).
  const preview = new Uint8ClampedArray(w * h * 4);
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const k = (py * w + px) * 4;
      if (data[k + 3] < 128) {
        preview.set([44, 44, 44, 255], k);
        continue;
      }
      const p: RGB = [data[k], data[k + 1], data[k + 2]];
      let r = 232;
      let g = 226;
      let b = 214; // fabric
      for (const { c, i } of colors) {
        const a = Math.min(1, weight(p, i) * 1.15);
        r = r * (1 - a) + c[0] * a;
        g = g * (1 - a) + c[1] * a;
        b = b * (1 - a) + c[2] * a;
      }
      preview.set([r, g, b, 255], k);
    }
  return { objects, threads, preview };
}
