import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Project } from '../model/types';

export interface ProjectRecord {
  id: string;
  project: Project;
  updatedAt: number;
  /** Realistic thumbnail as a data URL. */
  thumbnail?: string;
  stitchCount?: number;
}

export type ProjectSummary = Omit<ProjectRecord, 'project'> & {
  name: string;
  hoop: { width: number; height: number };
  isStitchFile: boolean;
  fileName?: string;
};

interface Schema extends DBSchema {
  projects: { key: string; value: ProjectRecord; indexes: { updatedAt: number } };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<Schema>('tatami-ninja', 1, {
      upgrade(d) {
        const store = d.createObjectStore('projects', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      },
    });
  }
  return dbPromise;
}

/** For tests: forget the cached connection. */
export function resetDbConnection() {
  dbPromise = null;
}

export async function saveProject(project: Project, extra: { thumbnail?: string; stitchCount?: number } = {}) {
  if (!project.id) throw new Error('Project needs an id before saving');
  const d = await db();
  const prev = await d.get('projects', project.id);
  const rec: ProjectRecord = {
    id: project.id,
    project,
    updatedAt: Date.now(),
    thumbnail: extra.thumbnail ?? prev?.thumbnail,
    stitchCount: extra.stitchCount ?? prev?.stitchCount,
  };
  await d.put('projects', rec);
  return rec;
}

export async function loadProject(id: string): Promise<Project | null> {
  const d = await db();
  const rec = await d.get('projects', id);
  return rec?.project ?? null;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const d = await db();
  const all = await d.getAll('projects');
  return all
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((r) => ({
      id: r.id,
      updatedAt: r.updatedAt,
      thumbnail: r.thumbnail,
      stitchCount: r.stitchCount,
      name: r.project.name,
      hoop: r.project.hoop,
      isStitchFile: r.project.source === 'stitch-file',
      fileName: r.project.sourceFileName,
    }));
}

export async function deleteProject(id: string) {
  const d = await db();
  await d.delete('projects', id);
}
