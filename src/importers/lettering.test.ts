import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generatePlan } from '../engine/plan';
import { geometryBounds } from '../engine/geom';
import sample from '../model/harbor-club-badge.tatami.json';
import type { Project } from '../model/types';
import { bend, defaultTextSpec, LETTERING_FONTS, layoutText, loadFont, makeTextObject } from './lettering';

const diskFetch = async (url: string) => {
  const file = url.split('/').pop()!;
  const buf = readFileSync(resolve(__dirname, '../../public/lettering', file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

describe('lettering', () => {
  it('loads every bundled font', async () => {
    for (const f of LETTERING_FONTS) {
      const font = await loadFont(f.id, diskFetch);
      expect(font.unitsPerEm).toBeGreaterThan(0);
    }
  });

  it('lays out text at the requested cap height, centered on x', async () => {
    const font = await loadFont('geist', diskFetch);
    const g = layoutText(font, { ...defaultTextSpec(0, 0, 'HELLO'), height: 100 });
    const b = geometryBounds(g)!;
    expect(b.maxY - b.minY).toBeGreaterThan(95);
    expect(b.maxY - b.minY).toBeLessThan(105);
    expect(Math.abs(b.minX + b.maxX)).toBeLessThan(10);
    expect(b.maxY).toBeLessThanOrEqual(5); // sits on the baseline (round overshoot allowed)
  });

  it('keeps counters as holes (O has a hole)', async () => {
    const font = await loadFont('geist', diskFetch);
    const g = layoutText(font, defaultTextSpec(0, 0, 'O'));
    expect(g.kind).toBe('compound');
    if (g.kind === 'compound') expect(g.parts[0].holes?.length).toBe(1);
  });

  it('adds letter spacing', async () => {
    const font = await loadFont('oswald', diskFetch);
    const narrow = geometryBounds(layoutText(font, defaultTextSpec(0, 0, 'ABC')))!;
    const wide = geometryBounds(layoutText(font, { ...defaultTextSpec(0, 0, 'ABC'), spacing: 50 }))!;
    expect(wide.maxX - wide.minX).toBeCloseTo(narrow.maxX - narrow.minX + 100, -1);
  });

  it('bends text over an arc', () => {
    expect(bend([0, 0], 500)).toEqual([0, 0]);
    const [, y] = bend([200, 0], 500);
    expect(y).toBeGreaterThan(0); // ends drop for an upward arc
    const [, y2] = bend([200, 0], -500);
    expect(y2).toBeLessThan(0);
  });

  it('produces sewable satin lettering', async () => {
    const font = await loadFont('roboto-slab', diskFetch);
    const spec = defaultTextSpec(0, 0, 'Abc');
    const obj = makeTextObject(spec, layoutText(font, spec), 't1');
    const plan = generatePlan({ ...(sample as unknown as Project), objects: [obj] });
    expect(plan.stitchCount).toBeGreaterThan(200);
    expect(obj.name).toBe('“Abc”');
  });

  it('returns an empty geometry for blank text', async () => {
    const font = await loadFont('pacifico', diskFetch);
    expect(layoutText(font, defaultTextSpec(0, 0, '   '))).toEqual({ kind: 'compound', parts: [] });
  });
});
