import { describe, expect, it } from 'vitest';
import sample from '../model/harbor-club-badge.tatami.json';
import type { Project, StitchObject } from '../model/types';
import { generateObject } from './objects';
import { generatePlan } from './plan';
import { checkWarnings, lacePieces } from './warnings';

const fixture = () => ({ ...(JSON.parse(JSON.stringify(sample)) as Project), fabricPreset: 'lace' });
const square = (id: string, x: number): StitchObject => ({
  id,
  name: id,
  type: 'tatami',
  thread: 't1',
  visible: true,
  locked: false,
  geometry: { kind: 'polygon', points: [[x, 0], [x + 100, 0], [x + 100, 100], [x, 100]] },
  params: {},
  advanced: {},
});

describe('free-standing lace', () => {
  it('fills on lace get a crossing lattice underlay', () => {
    const pieces = generateObject(square('a', 0), 'lace', null);
    const under = pieces.filter((p) => 'pts' in p && p.underlay);
    const cotton = generateObject(square('a', 0), 'cotton', null).filter((p) => 'pts' in p && p.underlay);
    const n = (ps: typeof under) => ps.reduce((s, p) => s + ('pts' in p ? p.pts.length : 0), 0);
    expect(n(under)).toBeGreaterThan(n(cotton) * 2);
  });

  it('finds parts that touch nothing else', () => {
    const p = fixture();
    expect(lacePieces(p)).toHaveLength(1);
    const loose = { ...p, objects: [...p.objects, square('island', 500)] };
    const groups = lacePieces(loose);
    expect(groups).toHaveLength(2);
    const w = checkWarnings(loose, generatePlan(loose)).find((x) => x.kind === 'lace-islands');
    expect(w?.objectIds).toEqual(['island']);
    // Not a concern on normal fabric.
    expect(checkWarnings({ ...loose, fabricPreset: 'cotton' }, generatePlan(loose)).some((x) => x.kind === 'lace-islands')).toBe(false);
  });
});
