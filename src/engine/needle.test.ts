import { describe, expect, it } from 'vitest';
import sample from '../model/harbor-club-badge.tatami.json';
import type { Project } from '../model/types';
import { generatePlan } from './plan';
import { checkWarnings } from './warnings';

const fixture = () => JSON.parse(JSON.stringify(sample)) as Project;
const needle = (p: Project) => checkWarnings(p, generatePlan(p)).filter((w) => w.kind === 'needle-break');

describe('needle break risk', () => {
  it('a normal design has none', () => {
    expect(needle(fixture())).toEqual([]);
  });

  it('flags knots that pile needle holes into one spot', () => {
    const p = fixture();
    p.objects = p.objects.map((o) => (o.name === 'Inner ring' ? { ...o, params: { ...o.params, runStyle: 'candlewick' } } : o));
    const w = needle(p);
    expect(w).toHaveLength(1);
    expect(w[0].id).toBe('needle-same-spot');
    expect(w[0].objectIds).toContain('o2');
    expect(w[0].message).toMatch(/Space knots/);
  });

  it('flags thick stacks of layered stitching', () => {
    const p = fixture();
    const copies = (s: string) => p.objects.map((o) => ({ ...o, id: o.id + s }));
    p.objects = [...p.objects, ...copies('b'), ...copies('c')];
    const w = needle(p);
    expect(w.some((x) => x.id === 'needle-stack' && /Remove hidden stitches/.test(x.message))).toBe(true);
  });
});
