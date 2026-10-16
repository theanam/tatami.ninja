/**
 * Saving and opening .xtatami design files.
 * Uses the File System Access API (save/open pickers, write back to the same file) when the
 * browser has it, and falls back to a normal file input and a download otherwise.
 */
import { downloadBytes } from '../export/export';
import { OPEN_ACCEPT, pickFile } from '../importers/files';
import { serializeProject, slugify } from '../model/project';
import type { Project } from '../model/types';
import { getFileHandle, putFileHandle } from './db';

export const DESIGN_EXT = '.xtatami';
export const DESIGN_MIME = 'application/vnd.tatami.design+json';

interface WritableLike {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}
export interface FileHandleLike {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableLike>;
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
}
type PickerType = { description: string; accept: Record<string, string[]> };
interface FsWindow {
  showSaveFilePicker?(o: { suggestedName?: string; types?: PickerType[] }): Promise<FileHandleLike>;
  showOpenFilePicker?(o: { types?: PickerType[]; multiple?: boolean; excludeAcceptAllOption?: boolean }): Promise<FileHandleLike[]>;
}

const DESIGN_TYPE: PickerType = { description: 'tatami.ninja design', accept: { [DESIGN_MIME]: [DESIGN_EXT] } };
const OPEN_TYPES: PickerType[] = [
  DESIGN_TYPE,
  { description: 'Stitch files', accept: { 'application/octet-stream': ['.dst', '.pes', '.pec', '.jef', '.exp'] } },
  { description: 'Older project files', accept: { 'application/json': ['.json'] } },
];

const fsWindow = () => (typeof window === 'undefined' ? {} : (window as unknown as FsWindow));
export const canSaveToFile = () => typeof fsWindow().showSaveFilePicker === 'function';
export const canOpenFromFile = () => typeof fsWindow().showOpenFilePicker === 'function';

// Handles also live in memory (some handles, e.g. in tests, cannot be stored in IndexedDB).
const memory = new Map<string, FileHandleLike>();

export async function rememberHandle(projectId: string, handle: FileHandleLike) {
  memory.set(projectId, handle);
  try {
    await putFileHandle(projectId, handle);
  } catch {
    /* kept for this session only */
  }
}

async function knownHandle(projectId: string): Promise<FileHandleLike | null> {
  const m = memory.get(projectId);
  if (m) return m;
  try {
    const h = (await getFileHandle(projectId)) as FileHandleLike | undefined;
    if (h && typeof h.createWritable === 'function') {
      memory.set(projectId, h);
      return h;
    }
  } catch {
    /* none */
  }
  return null;
}

async function writable(handle: FileHandleLike): Promise<boolean> {
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await handle.requestPermission?.({ mode: 'readwrite' })) === 'granted';
}

export function designFileName(project: Project) {
  return `${slugify(project.name)}${DESIGN_EXT}`;
}

export interface SaveResult {
  via: 'file' | 'download';
  name: string;
}

/**
 * Save the design. Writes back to the file it came from (or was last saved to) when possible;
 * `saveAs` always asks for a new location. Returns null if the user cancelled.
 */
export async function saveDesign(project: Project, opts: { saveAs?: boolean } = {}): Promise<SaveResult | null> {
  const body = serializeProject(project);
  if (canSaveToFile()) {
    let handle = opts.saveAs || !project.id ? null : await knownHandle(project.id);
    if (!handle) {
      try {
        handle = await fsWindow().showSaveFilePicker!({ suggestedName: designFileName(project), types: [DESIGN_TYPE] });
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return null;
        handle = null; // picker unavailable here (e.g. iframe): fall back to a download
      }
    }
    if (handle && (await writable(handle))) {
      const w = await handle.createWritable();
      await w.write(new Blob([body], { type: DESIGN_MIME }));
      await w.close();
      if (project.id) await rememberHandle(project.id, handle);
      return { via: 'file', name: handle.name };
    }
  }
  const name = designFileName(project);
  downloadBytes(body, name, DESIGN_MIME);
  return { via: 'download', name };
}

/** Pick a design or stitch file to open. The handle is returned when the picker API was used. */
export async function openDesignFile(): Promise<{ file: File; handle: FileHandleLike | null } | null> {
  if (canOpenFromFile()) {
    try {
      const [handle] = await fsWindow().showOpenFilePicker!({ types: OPEN_TYPES, multiple: false });
      if (!handle) return null;
      return { file: await handle.getFile(), handle };
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return null;
    }
  }
  const file = await pickFile(OPEN_ACCEPT);
  return file ? { file, handle: null } : null;
}

export const isDesignFile = (name: string) => name.toLowerCase().endsWith(DESIGN_EXT);
