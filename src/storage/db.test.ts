import { describe, expect, it } from 'vitest';
import sample from '../model/harbor-club-badge.tatami.json';
import type { Project } from '../model/types';
import { deleteProject, listProjects, loadProject, saveProject } from './db';

describe('IndexedDB storage', () => {
  it('saves, lists, loads and deletes projects', async () => {
    const p = { ...(sample as unknown as Project), id: 'p-test' };
    await saveProject(p, { thumbnail: 'data:x', stitchCount: 42 });
    const list = await listProjects();
    expect(list.find((x) => x.id === 'p-test')).toMatchObject({ name: 'Harbor Club Badge', stitchCount: 42, thumbnail: 'data:x' });
    expect((await loadProject('p-test'))?.objects).toHaveLength(4);
    // A later save without a thumbnail keeps the old one.
    await saveProject({ ...p, name: 'Renamed' });
    expect((await listProjects()).find((x) => x.id === 'p-test')).toMatchObject({ name: 'Renamed', thumbnail: 'data:x' });
    await deleteProject('p-test');
    expect(await loadProject('p-test')).toBeNull();
  });

  it('requires an id', async () => {
    await expect(saveProject(sample as unknown as Project)).rejects.toThrow(/id/);
  });
});
