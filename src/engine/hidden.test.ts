import { describe, expect, it } from 'vitest';
import sample from '../model/harbor-club-badge.tatami.json';
import type { Project, StitchObject } from '../model/types';
import { areaOfAreas } from './clip';
import { areasOf } from './geom';
import { removeHiddenStitches } from './hidden';
import { generatePlan } from './plan';

const fixture = () => JSON.parse(JSON.stringify(sample)) as Project;

describe('hidden stitch removal', () => {
  it('cuts fills under later objects, keeping a small overlap', () => {
    const objs = fixture().objects;
    const out = removeHiddenStitches(objs);
    const fill = (o: StitchObject) => areaOfAreas(areasOf(o.geometry));
    // Badge fill sits under the star: it loses (roughly) the star's area.
    const lost = fill(objs[0]) - fill(out[0]);
    expect(lost).toBeGreaterThan(fill(objs[2]) * 0.6);
    expect(lost).toBeLessThan(fill(objs[2]) * 1.1 + fill(objs[3]));
    // The top objects and runs are untouched.
    expect(out[2]).toBe(objs[2]);
    expect(out[1]).toBe(objs[1]);
  });

  it('lowers the stitch count when a big fill is mostly covered', () => {
    const p = fixture();
    const sq = (id: string, x: number, w: number): StitchObject => ({
      ...p.objects[0],
      id,
      geometry: { kind: 'polygon', points: [[x, -300], [x + w, -300], [x + w, 300], [x, 300]] },
    });
    const two = { ...p, objects: [sq('under', -300, 600), sq('over', -250, 500)] };
    const before = generatePlan(two).stitchCount;
    const after = generatePlan({ ...two, removeHidden: true }).stitchCount;
    expect(after).toBeLessThan(before * 0.8);
  });
});
