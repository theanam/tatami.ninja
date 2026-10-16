import { describe, expect, it } from 'vitest';
import { geometryBounds } from '../engine/geom';
import { generatePlan } from '../engine/plan';
import sample from '../model/harbor-club-badge.tatami.json';
import type { Project } from '../model/types';
import { autoDigitize, backgroundLabel, quantize, traceMask, type RasterImage } from './autoDigitize';

/** White 100×100 image with a red 60×60 square and a thin blue bar. */
function testImage(): RasterImage {
  const w = 100;
  const h = 100;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let c = [255, 255, 255];
      if (x >= 10 && x < 70 && y >= 10 && y < 70) c = [200, 30, 40];
      if (x >= 10 && x < 90 && y >= 80 && y < 84) c = [30, 50, 160];
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

describe('auto-digitize', () => {
  it('reduces colors deterministically', () => {
    const q = quantize(testImage(), 3);
    expect(q.palette).toHaveLength(3);
    expect(quantize(testImage(), 3).palette).toEqual(q.palette);
  });

  it('finds the background from the border', () => {
    const q = quantize(testImage(), 3);
    const bg = backgroundLabel(q)!;
    expect(q.palette[bg]).toEqual([255, 255, 255]);
  });

  it('traces a square mask into one ring', () => {
    const mask = new Uint8Array(10 * 10);
    for (let y = 2; y < 6; y++) for (let x = 2; x < 7; x++) mask[y * 10 + x] = 1;
    const areas = traceMask(mask, 10, 10);
    expect(areas).toHaveLength(1);
    expect(areas[0].outer).toHaveLength(4);
    expect(areas[0].holes).toHaveLength(0);
  });

  it('traces holes', () => {
    const mask = new Uint8Array(10 * 10);
    for (let y = 1; y < 9; y++) for (let x = 1; x < 9; x++) mask[y * 10 + x] = 1;
    for (let y = 4; y < 6; y++) for (let x = 4; x < 6; x++) mask[y * 10 + x] = 0;
    const areas = traceMask(mask, 10, 10);
    expect(areas).toHaveLength(1);
    expect(areas[0].holes).toHaveLength(1);
  });

  it('proposes fill for wide regions and satin for narrow ones, dropping the background', () => {
    const res = autoDigitize(testImage(), { colors: 3, removeBackground: true, size: 1000, threads: [] });
    expect(res.objects).toHaveLength(2);
    const [fill, bar] = res.objects;
    expect(fill.type).toBe('tatami');
    expect(bar.type).toBe('satin');
    expect(res.threads.map((t) => t.name)).toEqual(['Red', 'Navy']);
    const b = geometryBounds(fill.geometry)!;
    expect(b.maxX - b.minX).toBe(600);
  });

  it('drops specks smaller than the minimum area', () => {
    const img = testImage();
    // 1-pixel speck.
    const i = (95 * 100 + 95) * 4;
    img.data[i] = 0;
    img.data[i + 1] = 0;
    img.data[i + 2] = 0;
    const res = autoDigitize(img, { colors: 4, removeBackground: true, size: 1000, threads: [] });
    expect(res.objects.every((o) => !o.name.startsWith('Black'))).toBe(true);
  });

  it('produces objects the engine can sew', () => {
    const res = autoDigitize(testImage(), { colors: 3, removeBackground: true, size: 800, threads: [] });
    const plan = generatePlan({ ...(sample as unknown as Project), threads: res.threads, objects: res.objects });
    expect(plan.stitchCount).toBeGreaterThan(500);
  });
});
