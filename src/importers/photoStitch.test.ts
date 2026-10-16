import { describe, expect, it } from 'vitest';
import { CMD } from '../model/types';
import type { RasterImage } from './autoDigitize';
import { autoDigitize } from './autoDigitize';
import { photoStitch } from './photoStitch';

/** Left-to-right gradient: white → black. */
function gradient(w = 100, h = 60): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = 255 - Math.round((x / (w - 1)) * 255);
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  return { width: w, height: h, data };
}

const stitches = (data: number[]) => {
  const out: [number, number][] = [];
  for (let i = 0; i + 2 < data.length; i += 3) if (data[i + 2] === CMD.STITCH) out.push([data[i], data[i + 1]]);
  return out;
};

describe('photo stitch', () => {
  it('mono: darker areas get more stitching, white gets none', () => {
    const res = photoStitch(gradient(), { size: 500, palette: [[20, 20, 20]], mono: true, threads: [] });
    expect(res.objects).toHaveLength(1);
    const o = res.objects[0];
    expect(o.type).toBe('stitches');
    if (o.geometry.kind !== 'stitches') throw new Error('raw');
    const pts = stitches(o.geometry.data);
    const left = pts.filter((p) => p[0] < -150).length;
    const right = pts.filter((p) => p[0] > 150).length;
    expect(right).toBeGreaterThan(left * 3);
    expect(pts.every((p) => Math.abs(p[0]) <= 257 && Math.abs(p[1]) <= 157)).toBe(true);
  });

  it('color: one layer per thread color, through the tracer', () => {
    const w = 80;
    const h = 40;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(x < 40 ? [200, 30, 40, 255] : [30, 50, 160, 255], (y * w + x) * 4);
    const res = autoDigitize({ width: w, height: h, data }, { mode: 'photo', colors: 2, removeBackground: false, size: 400, threads: [] });
    expect(res.objects).toHaveLength(2);
    expect(res.objects.every((o) => o.geometry.kind === 'stitches')).toBe(true);
    expect(res.threads).toHaveLength(2);
  });
});
