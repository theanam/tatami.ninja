import { describe, expect, it } from 'vitest';
import { generatePlan } from '../engine/plan';
import { readStitchFile } from '../formats';
import sample from '../model/harbor-club-badge.tatami.json';
import type { FileFormat, Project } from '../model/types';
import { colorBlockStats, colorSheetPdf, encodeFormat, fileBaseName, planToPattern } from './export';

const project = sample as unknown as Project;
const plan = generatePlan(project);

describe('export', () => {
  it('maps color blocks to threads', () => {
    const p = planToPattern(project, plan);
    expect(p.threads.map((t) => t.name)).toEqual(['Navy', 'Gold']);
    expect(p.xs.length).toBe(plan.xs.length);
  });

  it('encodes every format', () => {
    for (const f of ['PES', 'DST', 'JEF', 'EXP', 'VP3', 'XXX', 'HUS'] as FileFormat[]) {
      const bytes = encodeFormat(f, project, plan);
      expect(bytes.length).toBeGreaterThan(100);
    }
  });

  it('round-trips PES with the same stitch count and colors', () => {
    const back = readStitchFile('x.pes', encodeFormat('PES', project, plan));
    const stitches = Array.from(back.cmds).filter((c) => c === 0).length;
    expect(stitches).toBe(plan.stitchCount);
    expect(back.threads).toHaveLength(2);
  });

  it('writes a DST header with the design name', () => {
    const bytes = encodeFormat('DST', project, plan);
    expect(new TextDecoder().decode(bytes.slice(0, 20))).toMatch(/^LA:Harbor Club Badg/) // 16-char label field;
  });

  it('counts stitches per color block', () => {
    const s = colorBlockStats(project, plan);
    expect(s.map((x) => x.name)).toEqual(['Navy', 'Gold']);
    expect(s[0].stitches + s[1].stitches).toBe(plan.stitchCount);
  });

  it('creates a PDF color sheet', async () => {
    const pdf = await colorSheetPdf(project, plan);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });

  it('makes file-safe names', () => {
    expect(fileBaseName(project)).toBe('harbor-club-badge');
    expect(fileBaseName({ ...project, name: 'rose_small.dst', source: 'stitch-file' })).toBe('rose-small');
  });
});
