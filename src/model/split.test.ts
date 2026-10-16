import { describe, expect, it } from 'vitest';
import { generatePlan } from '../engine/plan';
import { unzipStored, zip } from '../export/zip';
import sample from './harbor-club-badge.tatami.json';
import { sectionProject, splitDesign } from './split';
import { objectsBounds } from './transform';
import type { Project, StitchObject } from './types';

const base = () => JSON.parse(JSON.stringify(sample)) as Project;
const rect = (id: string, x0: number, y0: number, x1: number, y1: number, type: StitchObject['type'] = 'tatami'): StitchObject => ({
  id,
  name: id,
  type,
  thread: 't1',
  visible: true,
  locked: false,
  geometry: { kind: 'polygon', points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] },
  params: {},
  advanced: {},
});
const hoop = { id: '100x100', width: 1000, height: 1000 };

describe('splitting a large design into hoopings', () => {
  it('cuts a wide fill into pieces that each fit the hoop, keeping order', () => {
    const p = { ...base(), hoop: { id: 'custom', width: 3000, height: 1000 }, objects: [rect('band', -1200, -300, 1200, 300), rect('dot', 900, -50, 1000, 50)] };
    const split = splitDesign(p, hoop)!;
    expect(split.rows).toBe(1);
    expect(split.cols).toBe(3);
    expect(split.oversize).toEqual([]);
    const last = split.sections[2];
    // The band piece sews before the dot that sits on top of it.
    expect(last.objects.map((o) => o.name)).toEqual(['band (3)', 'dot']);
    for (const s of split.sections) {
      const sp = sectionProject(p, split, s, hoop);
      const b = objectsBounds(sp.objects)!;
      expect(b.minX).toBeGreaterThanOrEqual(-500);
      expect(b.maxX).toBeLessThanOrEqual(500);
      // Four alignment crosses first.
      expect(sp.objects.slice(0, 4).every((o) => o.name === 'Alignment mark')).toBe(true);
      expect(generatePlan(sp).stitchCount).toBeGreaterThan(100);
    }
  });

  it('a design that already fits is one hooping without marks', () => {
    const p = base();
    const split = splitDesign(p, { width: 1300, height: 1800 })!;
    expect(split.sections).toHaveLength(1);
    expect(sectionProject(p, split, split.sections[0], { id: '130x180', width: 1300, height: 1800 }).objects).toHaveLength(4);
  });

  it('flags objects that cannot be cut and do not fit', () => {
    const p = { ...base(), objects: [rect('long satin', -1200, -20, 1200, 20, 'satin')] };
    expect(splitDesign(p, hoop)!.oversize).toEqual(['long satin']);
  });

  it('zips files that read back intact', () => {
    const files = [
      { name: 'a-1-of-2.pes', data: new Uint8Array([1, 2, 3]) },
      { name: 'b.txt', data: 'hello' },
    ];
    const back = unzipStored(zip(files));
    expect(back.map((f) => f.name)).toEqual(['a-1-of-2.pes', 'b.txt']);
    expect([...back[0].data]).toEqual([1, 2, 3]);
    expect(new TextDecoder().decode(back[1].data)).toBe('hello');
  });
});
