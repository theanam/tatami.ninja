import { describe, expect, it } from 'vitest';
import { geometryBounds } from '../engine/geom';
import { generatePlan } from '../engine/plan';
import sample from '../model/harbor-club-badge.tatami.json';
import type { Project } from '../model/types';
import { autoDigitize, backgroundLabel, hasTransparency, quantize, traceMask, unmix, type RasterImage } from './autoDigitize';
import { luminance, marchingSquares, otsu, ringArea, traceField } from './trace';

type RGB = [number, number, number];

/** Render shapes with 4×4 supersampled anti-aliasing, like real exported artwork. */
function render(w: number, h: number, bg: RGB, shapes: { color: RGB; inside: (x: number, y: number) => boolean }[]): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const px = x + (sx + 0.5) / 4;
          const py = y + (sy + 0.5) / 4;
          let c = bg;
          for (const s of shapes) if (s.inside(px, py)) c = s.color;
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
        }
      }
      const i = (y * w + x) * 4;
      data[i] = acc[0] / 16;
      data[i + 1] = acc[1] / 16;
      data[i + 2] = acc[2] / 16;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

const WHITE: RGB = [255, 255, 255];
const RED: RGB = [200, 30, 40];
const BLUE: RGB = [30, 50, 160];
const disk = (cx: number, cy: number, r: number) => (x: number, y: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const rect = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

function darkField(img: RasterImage): Float32Array {
  const lum = luminance(img.data, img.width, img.height);
  const field = new Float32Array(lum.length);
  for (let i = 0; i < field.length; i++) field[i] = 127.5 - lum[i];
  return field;
}

describe('tracing accuracy', () => {
  it('traces an anti-aliased circle to within half a pixel', () => {
    const img = render(400, 400, WHITE, [{ color: [0, 0, 0], inside: disk(200, 200, 150) }]);
    const areas = traceField(darkField(img), 400, 400);
    expect(areas).toHaveLength(1);
    const ring = areas[0].outer;
    expect(Math.abs(ringArea(ring) - Math.PI * 150 * 150) / (Math.PI * 150 * 150)).toBeLessThan(0.005);
    for (const [x, y] of ring) expect(Math.abs(Math.hypot(x - 200, y - 200) - 150)).toBeLessThan(0.5);
  });

  it('keeps square corners sharp with few vertices', () => {
    const img = render(300, 300, WHITE, [{ color: [0, 0, 0], inside: rect(50, 60, 250, 240) }]);
    const ring = traceField(darkField(img), 300, 300)[0].outer;
    expect(ring.length).toBeLessThanOrEqual(8);
    for (const corner of [[50, 60], [250, 60], [250, 240], [50, 240]]) {
      const d = Math.min(...ring.map((p) => Math.hypot(p[0] - corner[0], p[1] - corner[1])));
      expect(d).toBeLessThan(1);
    }
  });

  it('closes contours that touch the image border', () => {
    const f = new Float32Array(10 * 10).fill(1);
    const loops = marchingSquares(f, 10, 10);
    expect(loops).toHaveLength(1);
    expect(ringArea(loops[0])).toBeGreaterThan(90);
  });

  it('traces masks with holes', () => {
    const mask = new Uint8Array(40 * 40);
    for (let y = 5; y < 35; y++) for (let x = 5; x < 35; x++) mask[y * 40 + x] = 1;
    for (let y = 15; y < 25; y++) for (let x = 15; x < 25; x++) mask[y * 40 + x] = 0;
    const areas = traceMask(mask, 40, 40);
    expect(areas).toHaveLength(1);
    expect(areas[0].holes).toHaveLength(1);
  });
});

describe('palette', () => {
  it('uses only colors that really occur, even with anti-aliased edges', () => {
    const img = render(200, 200, WHITE, [
      { color: RED, inside: disk(80, 80, 50) },
      { color: BLUE, inside: disk(140, 140, 40) },
    ]);
    const q = quantize(img, 6);
    const real = [WHITE, RED, BLUE];
    for (const c of q.palette) {
      expect(real.some((r) => Math.abs(r[0] - c[0]) + Math.abs(r[1] - c[1]) + Math.abs(r[2] - c[2]) <= 6)).toBe(true);
    }
    expect(q.palette).toHaveLength(3);
  });

  it('finds the background from the border and is deterministic', () => {
    const img = render(100, 100, WHITE, [{ color: RED, inside: rect(20, 20, 80, 80) }]);
    const q = quantize(img, 3);
    expect(q.palette[backgroundLabel(q)!]).toEqual(WHITE);
    expect(quantize(img, 3).palette).toEqual(q.palette);
  });
});

describe('edge colors', () => {
  it('assigns anti-aliased edge blends to one of the two colors they sit between', () => {
    const palette: RGB[] = [WHITE, [31, 59, 140], [232, 178, 58], [200, 40, 46]];
    // Pink: halfway between red and white. Nearest-color alone would pick gold.
    expect(unmix(palette, [227, 147, 151])).toBe(3);
    expect(unmix(palette, [240, 200, 200])).toBe(0);
    expect(unmix(palette, [200, 40, 46])).toBe(3);
  });

  it('never turns smooth blends into extra colors, even when asked for more colors', () => {
    // A hard-edged 3-color image scaled up 8× with smoothing has wide blended bands.
    const small = render(40, 40, WHITE, [{ color: RED, inside: rect(8, 8, 30, 30) }, { color: BLUE, inside: rect(5, 34, 35, 37) }]);
    const big = new Uint8ClampedArray(320 * 320 * 4);
    for (let y = 0; y < 320; y++) {
      for (let x = 0; x < 320; x++) {
        // Bilinear upscale.
        const sx = Math.min(38.999, Math.max(0, (x + 0.5) / 8 - 0.5));
        const sy = Math.min(38.999, Math.max(0, (y + 0.5) / 8 - 0.5));
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const fx = sx - x0;
        const fy = sy - y0;
        for (let c = 0; c < 3; c++) {
          const v = (xx: number, yy: number) => small.data[(yy * 40 + xx) * 4 + c];
          big[(y * 320 + x) * 4 + c] = v(x0, y0) * (1 - fx) * (1 - fy) + v(x0 + 1, y0) * fx * (1 - fy) + v(x0, y0 + 1) * (1 - fx) * fy + v(x0 + 1, y0 + 1) * fx * fy;
        }
        big[(y * 320 + x) * 4 + 3] = 255;
      }
    }
    const q = quantize({ width: 320, height: 320, data: big }, 8);
    expect(q.palette).toHaveLength(3);
  });

  it('does not invent slivers of a third color around shapes', () => {
    const img = render(300, 300, WHITE, [
      { color: [232, 178, 58], inside: disk(80, 80, 50) },
      { color: [200, 40, 46], inside: rect(40, 200, 260, 230) },
    ]);
    const res = autoDigitize(img, { colors: 3, removeBackground: true, size: 1000, threads: [] });
    expect(res.objects).toHaveLength(2); // the disk and the bar, nothing else
  });

  it('keeps letter holes even when the letter has an island (like "A")', () => {
    const NAVY: RGB = [31, 59, 140];
    const img = render(300, 300, WHITE, [
      { color: NAVY, inside: rect(20, 20, 280, 280) },
      { color: WHITE, inside: rect(100, 100, 200, 200) }, // the letter (background shows)
      { color: NAVY, inside: rect(130, 130, 170, 170) }, // its counter
    ]);
    const res = autoDigitize(img, { colors: 2, removeBackground: true, size: 1000, threads: [] });
    const outer = res.objects.find((o) => o.geometry.kind === 'compound');
    expect(outer).toBeTruthy();
  });
});

describe('transparency', () => {
  /** Transparent canvas with a black disk and a white square (white is artwork, not background). */
  function transparentArt(): RasterImage {
    const w = 200;
    const h = 200;
    const data = new Uint8ClampedArray(w * h * 4); // all transparent
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if ((x - 60) ** 2 + (y - 100) ** 2 <= 40 * 40) data.set([10, 10, 10, 255], i);
        else if (x >= 120 && x <= 180 && y >= 70 && y <= 130) data.set([255, 255, 255, 255], i);
      }
    }
    return { width: w, height: h, data };
  }

  it('detects transparency', () => {
    expect(hasTransparency(transparentArt())).toBe(true);
    expect(hasTransparency(render(20, 20, WHITE, []))).toBe(false);
  });

  it('colors mode: transparent is background, white is a real stitched color', () => {
    const res = autoDigitize(transparentArt(), { colors: 4, removeBackground: true, size: 1000, threads: [] });
    expect(res.background).toBeNull();
    expect(res.transparent).toBe(true);
    expect(res.threads.map((t) => t.hex).sort()).toEqual(['#0A0A0A', '#FFFFFF']);
    expect(res.objects).toHaveLength(2);
    // The preview shows transparency as checker, and white as white.
    const px = (x: number, y: number) => Array.from(res.preview.data.slice((y * 200 + x) * 4, (y * 200 + x) * 4 + 3));
    expect(px(150, 100)).toEqual([255, 255, 255]);
    expect(px(5, 5)).not.toEqual([255, 255, 255]);
  });

  it('colors mode: a white square touching the edges is still not mistaken for background', () => {
    const img = transparentArt();
    // Widen the white square to the right and bottom edges.
    for (let y = 70; y < 200; y++) for (let x = 120; x < 200; x++) img.data.set([255, 255, 255, 255], (y * 200 + x) * 4);
    const res = autoDigitize(img, { colors: 4, removeBackground: true, size: 1000, threads: [] });
    expect(res.threads.map((t) => t.hex)).toContain('#FFFFFF');
  });

  it('threshold mode: inverted (light parts) traces the white square but never the transparent area', () => {
    const res = autoDigitize(transparentArt(), { mode: 'threshold', colors: 2, removeBackground: true, invert: true, size: 1000, threads: [] });
    expect(res.objects).toHaveLength(1);
    const b = geometryBounds(res.objects[0].geometry)!;
    // The white square spans x 120–180 of 200 px → about 300 units wide at 1000 units per 200 px.
    expect(b.maxX - b.minX).toBeGreaterThan(290);
    expect(b.maxX - b.minX).toBeLessThan(315);
  });

  it('threshold mode: normal (dark parts) traces only the black disk', () => {
    const res = autoDigitize(transparentArt(), { mode: 'threshold', colors: 2, removeBackground: true, size: 1000, threads: [] });
    expect(res.objects).toHaveLength(1);
    const b = geometryBounds(res.objects[0].geometry)!;
    expect(b.maxX - b.minX).toBeGreaterThan(390);
    expect(b.maxX - b.minX).toBeLessThan(410);
  });
});

describe('threshold', () => {
  it('picks a threshold between the two tones (Otsu)', () => {
    const lum = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) lum[i] = i < 600 ? 40 + (i % 10) : 210 + (i % 10);
    const t = otsu(lum);
    // Halfway across the gap between the tones (49 … 210).
    expect(t).toBeGreaterThan(110);
    expect(t).toBeLessThan(150);
  });

  it('traces dark line art in one thread color, and inverts', () => {
    const img = render(200, 120, WHITE, [{ color: [20, 20, 20], inside: rect(20, 20, 180, 100) }]);
    const r = autoDigitize(img, { mode: 'threshold', colors: 2, removeBackground: true, lineColor: '#123456', size: 1000, threads: [] });
    expect(r.objects).toHaveLength(1);
    expect(r.threads.map((t) => t.hex)).toEqual(['#123456']);
    expect(r.threshold).toBeGreaterThan(20);
    const b = geometryBounds(r.objects[0].geometry)!;
    expect(b.maxX - b.minX).toBeGreaterThan(790);
    expect(b.maxX - b.minX).toBeLessThan(810);
    const inv = autoDigitize(img, { mode: 'threshold', colors: 2, removeBackground: true, invert: true, size: 1000, threads: [] });
    const g = inv.objects[0].geometry;
    expect(g.kind === 'compound' && g.parts[0].holes?.length).toBe(1); // white frame around the dark box
  });
});

describe('auto-digitize', () => {
  const img = () =>
    render(200, 200, WHITE, [
      { color: RED, inside: rect(20, 20, 140, 140) },
      { color: BLUE, inside: rect(60, 60, 100, 100) }, // detail inside the red square
      { color: BLUE, inside: rect(20, 165, 180, 173) }, // thin bar
    ]);

  it('proposes fill for wide regions and satin for narrow ones, without the background', () => {
    const res = autoDigitize(img(), { colors: 3, removeBackground: true, size: 1000, threads: [] });
    const types = res.objects.map((o) => o.type).sort();
    expect(types).toEqual(['satin', 'tatami', 'tatami']);
    expect(res.threads.map((t) => t.name).sort()).toEqual(['Navy', 'Red']);
    expect(res.preview.width).toBe(200);
  });

  it('fills under details (no hole under the blue square), largest first', () => {
    const res = autoDigitize(img(), { colors: 3, removeBackground: true, size: 1000, threads: [] });
    const red = res.objects[0];
    expect(red.name).toMatch(/^Red/);
    expect(red.geometry.kind).toBe('polygon'); // no hole
    const cut = autoDigitize(img(), { colors: 3, removeBackground: true, fillUnder: false, size: 1000, threads: [] });
    const redCut = cut.objects.find((o) => o.name.startsWith('Red'))!;
    expect(redCut.geometry.kind).toBe('compound');
  });

  it('drops specks smaller than the minimum area', () => {
    const base = img();
    const i = (190 * 200 + 190) * 4;
    base.data.set([0, 0, 0, 255], i);
    const res = autoDigitize(base, { colors: 4, removeBackground: true, size: 1000, threads: [], minAreaMm2: 2 });
    expect(res.objects.every((o) => !o.name.startsWith('Black'))).toBe(true);
  });

  it('produces objects the engine can sew, with outlines for the preview', () => {
    const res = autoDigitize(img(), { colors: 3, removeBackground: true, size: 800, threads: [] });
    expect(res.outlines.length).toBeGreaterThanOrEqual(3);
    const plan = generatePlan({ ...(sample as unknown as Project), threads: res.threads, objects: res.objects });
    expect(plan.stitchCount).toBeGreaterThan(500);
  });
});

describe('cross stitch from an image', () => {
  it('makes one cross-stitch object per color on a shared grid', () => {
    const img = render(200, 200, WHITE, [
      { color: RED, inside: rect(20, 20, 100, 180) },
      { color: BLUE, inside: rect(100, 20, 180, 180) },
    ]);
    const res = autoDigitize(img, { mode: 'cross', colors: 3, removeBackground: true, size: 400, cellSize: 20, threads: [] });
    expect(res.objects).toHaveLength(2);
    for (const o of res.objects) {
      expect(o.params.fillPattern).toBe('x-stitch');
      expect(o.params.patternSpacing).toBe(20);
      const b = geometryBounds(o.geometry)!;
      // Cell-aligned: every edge on the 2 mm grid.
      for (const v of [b.minX, b.maxX, b.minY, b.maxY]) expect(Math.abs(v % 20)).toBe(0);
    }
    const plan = generatePlan({ ...(sample as unknown as Project), objects: res.objects, threads: res.threads });
    expect(plan.stitchCount).toBeGreaterThan(100);
  });
});
