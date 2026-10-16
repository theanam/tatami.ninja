import { describe, expect, it } from 'vitest';
import { generatePlan } from '../engine/plan';
import { encodeFormat } from '../export/export';
import sample from '../model/harbor-club-badge.tatami.json';
import type { Project } from '../model/types';
import { artworkKind, hoopFor, projectFromStitchFile } from './files';

const project = sample as unknown as Project;

describe('files', () => {
  it('detects artwork kinds', () => {
    expect(artworkKind('logo.SVG')).toBe('svg');
    expect(artworkKind('photo.jpeg')).toBe('raster');
    expect(artworkKind('a.tatami.json')).toBe('project');
    expect(artworkKind('rose.dst')).toBe('stitch');
    expect(artworkKind('x.doc')).toBe('unknown');
  });

  it('picks the smallest hoop that fits', () => {
    expect(hoopFor(800, 800).id).toBe('100x100');
    expect(hoopFor(1200, 900).id).toBe('130x180');
    expect(hoopFor(2500, 1500).id).toBe('160x260');
  });

  it('opens a stitch file as a recolor-only project with one object per color', () => {
    const plan = generatePlan(project);
    const bytes = encodeFormat('PES', project, plan);
    const p = projectFromStitchFile('badge.pes', bytes);
    expect(p.source).toBe('stitch-file');
    expect(p.objects).toHaveLength(2);
    expect(p.objects.every((o) => o.type === 'stitches')).toBe(true);
    expect(p.threads).toHaveLength(2);
    const again = generatePlan(p);
    expect(again.stitchCount).toBe(plan.stitchCount);
    expect(again.colorChanges).toBe(1);
  });

  it('opens DST files (no colors) with a default palette', () => {
    const plan = generatePlan(project);
    const p = projectFromStitchFile('badge.dst', encodeFormat('DST', project, plan));
    expect(p.threads.length).toBeGreaterThanOrEqual(2);
    expect(generatePlan(p).stitchCount).toBe(plan.stitchCount);
  });

  it('rejects unsupported files', () => {
    expect(() => projectFromStitchFile('x.abc', new Uint8Array(10))).toThrow(/Unsupported/);
  });
});
