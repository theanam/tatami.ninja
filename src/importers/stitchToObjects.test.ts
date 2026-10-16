import { describe, expect, it } from 'vitest';
import { generatePlan } from '../engine/plan';
import { encodeFormat } from '../export/export';
import sample from '../model/harbor-club-badge.tatami.json';
import type { Project } from '../model/types';
import { projectFromStitchFile } from './files';
import { stitchesToObjects } from './stitchToObjects';

describe('stitch file → editable objects', () => {
  it('recovers runs, fills (with angle) and satin from a DST', () => {
    const p = JSON.parse(JSON.stringify(sample)) as Project;
    const dst = encodeFormat('DST', p, generatePlan(p));
    const opened = projectFromStitchFile('badge.dst', dst);
    const objs = opened.objects.flatMap(stitchesToObjects);
    const kinds = objs.map((o) => o.type);
    expect(kinds).toContain('run');
    expect(kinds).toContain('tatami');
    expect(kinds).toContain('satin');
    const fill = objs.find((o) => o.type === 'tatami')!;
    // The badge fill was sewn at 45°.
    expect(Math.abs((fill.params.angleDeg ?? 0) - 45)).toBeLessThan(8);
    // Editable again: the re-stitched design is about the same size and stitch count.
    const again = { ...opened, source: 'design' as const, objects: objs };
    const before = generatePlan(p);
    const after = generatePlan(again);
    expect(after.stitchCount).toBeGreaterThan(before.stitchCount * 0.6);
    expect(after.stitchCount).toBeLessThan(before.stitchCount * 1.6);
    const w = (b: { minX: number; maxX: number }) => b.maxX - b.minX;
    expect(Math.abs(w(after.bounds!) - w(before.bounds!))).toBeLessThan(30);
  });
});
