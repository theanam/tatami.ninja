import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultTextSpec, layoutText, loadFont, makeTextObject } from '../importers/lettering';
import { offsetAreas } from './clip';
import { areasOf, circlePoints, pointInArea, type Area } from './geom';
import { generateObject } from './objects';
import { strokeColumns } from './skeleton';

const diskFetch = async (url: string) => {
  const buf = readFileSync(resolve(__dirname, '../../public/lettering', url.split('/').pop()!));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

describe('satin along strokes', () => {
  it('a bar becomes one column along its length, as wide as the bar', () => {
    const bar: Area = { outer: [[0, 0], [300, 0], [300, 20], [0, 20]], holes: [] };
    const cols = strokeColumns([bar]);
    expect(cols).toHaveLength(1);
    const c = cols[0];
    const w = Math.hypot(c.a[10][0] - c.b[10][0], c.a[10][1] - c.b[10][1]);
    expect(w).toBeGreaterThan(14);
    expect(w).toBeLessThan(26);
    const xs = [...c.a, ...c.b].map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(250);
  });

  it('a ring becomes one column that goes all the way round', () => {
    const ring: Area = { outer: circlePoints(0, 0, 100), holes: [circlePoints(0, 0, 80)] };
    const cols = strokeColumns([ring]);
    expect(cols).toHaveLength(1);
    const a = cols[0].a;
    expect(Math.hypot(a[0][0] - a[a.length - 1][0], a[0][1] - a[a.length - 1][1])).toBeLessThan(5);
    for (const p of [...cols[0].a, ...cols[0].b]) expect(Math.abs(Math.hypot(p[0], p[1]) - 90)).toBeLessThan(15);
  });

  it('small lettering: stitches stay on the letters', async () => {
    const font = await loadFont('geist', diskFetch);
    const spec = { ...defaultTextSpec(0, 0, 'HOW'), height: 60 };
    const obj = { ...makeTextObject(spec, layoutText(font, spec), 't'), params: { strokeSatin: true } };
    const pieces = generateObject(obj, 'cotton', null);
    const pts = pieces.flatMap((p) => ('pts' in p ? p.pts : []));
    expect(pts.length).toBeGreaterThan(150);
    const grown = offsetAreas(areasOf(obj.geometry), 6);
    const off = pts.filter((p) => !grown.some((a) => pointInArea(p, a)));
    expect(off.length).toBeLessThan(pts.length * 0.02);
  });
});
