import { describe, expect, it } from 'vitest';
import sample from './harbor-club-badge.tatami.json';
import { colorBlocks, colorName, createProject, ensureThread, parseProjectJson, serializeProject, slugify } from './project';
import type { Project } from './types';

describe('project model', () => {
  it('creates a project from wizard choices', () => {
    const p = createProject({ machine: 'janome', hoop: { id: '100x100', width: 1000, height: 1000 }, fabric: 'denim' });
    expect(p.name).toBe('Untitled design');
    expect(p.machine.defaultFormat).toBe('JEF');
    expect(p.id).toMatch(/^p-/);
  });

  it('round-trips through JSON', () => {
    const p = parseProjectJson(JSON.stringify(sample));
    const again = parseProjectJson(serializeProject(p));
    expect(again.objects).toEqual(p.objects);
    expect(again.name).toBe('Harbor Club Badge');
  });

  it('opens projects saved with the legacy StitchBuddy format name', () => {
    const legacy = { ...sample, format: 'stitchbuddy-project' };
    expect(parseProjectJson(JSON.stringify(legacy)).format).toBe('tatami-project');
  });

  it('rejects files that are not projects', () => {
    expect(() => parseProjectJson('nope')).toThrow(/not valid JSON/);
    expect(() => parseProjectJson('{"a":1}')).toThrow(/not a tatami.ninja project/);
    expect(() => parseProjectJson('{"format":"tatami-project","version":2}')).toThrow(/Unsupported/);
  });

  it('groups objects into color blocks', () => {
    const blocks = colorBlocks(sample as unknown as Project);
    expect(blocks.map((b) => [b.thread.name, b.objects.length])).toEqual([['Navy', 1], ['Gold', 3]]);
  });

  it('names colors and reuses threads', () => {
    expect(colorName('#24357A')).toBe('Navy');
    expect(colorName('#D4A43A')).toBe('Gold');
    const a = ensureThread([], '#123456');
    const b = ensureThread(a.threads, '#123456');
    expect(b.id).toBe(a.id);
  });

  it('slugifies names', () => {
    expect(slugify('Harbor Club Badge!')).toBe('harbor-club-badge');
    expect(slugify('   ')).toBe('design');
  });
});
