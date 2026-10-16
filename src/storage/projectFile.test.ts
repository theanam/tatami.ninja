import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { artworkKind } from '../importers/files';
import sample from '../model/harbor-club-badge.tatami.json';
import { parseProjectJson } from '../model/project';
import type { Project } from '../model/types';
import { designFileName, isDesignFile, openDesignFile, rememberHandle, saveDesign } from './projectFile';

const project = (id: string): Project => ({ ...(sample as unknown as Project), id });

function fakeHandle(name: string) {
  const writes: string[] = [];
  return {
    writes,
    handle: {
      name,
      getFile: async () => new File([writes.at(-1) ?? ''], name),
      createWritable: async () => ({
        write: async (d: Blob | string) => void writes.push(typeof d === 'string' ? d : await d.text()),
        close: async () => {},
      }),
    },
  };
}

const w = window as unknown as Record<string, unknown>;

describe('.xtatami files', () => {
  let clicked: string[];
  beforeEach(() => {
    clicked = [];
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
  });
  afterEach(() => {
    delete w.showSaveFilePicker;
    delete w.showOpenFilePicker;
    vi.restoreAllMocks();
  });

  it('names and recognises design files', () => {
    expect(designFileName({ ...project('a'), name: 'Harbor Club Badge' })).toBe('harbor-club-badge.xtatami');
    expect(isDesignFile('X.XTATAMI')).toBe(true);
    expect(artworkKind('badge.xtatami')).toBe('project');
  });

  it('saves through the save picker, then writes back to the same file without asking', async () => {
    const f = fakeHandle('badge.xtatami');
    const picker = vi.fn(async () => f.handle);
    w.showSaveFilePicker = picker;
    expect(await saveDesign(project('p-save'))).toEqual({ via: 'file', name: 'badge.xtatami' });
    expect(await saveDesign({ ...project('p-save'), name: 'Changed' })).toEqual({ via: 'file', name: 'badge.xtatami' });
    expect(picker).toHaveBeenCalledTimes(1);
    expect(parseProjectJson(f.writes[1]).name).toBe('Changed');
    await saveDesign(project('p-save'), { saveAs: true });
    expect(picker).toHaveBeenCalledTimes(2);
    expect(clicked).toEqual([]);
  });

  it('writes to a remembered handle (from an opened file)', async () => {
    const f = fakeHandle('opened.xtatami');
    await rememberHandle('p-open', f.handle);
    w.showSaveFilePicker = vi.fn();
    expect(await saveDesign(project('p-open'))).toEqual({ via: 'file', name: 'opened.xtatami' });
    expect(f.writes).toHaveLength(1);
  });

  it('returns null when the picker is cancelled', async () => {
    w.showSaveFilePicker = vi.fn(async () => {
      throw new DOMException('no', 'AbortError');
    });
    expect(await saveDesign(project('p-cancel'))).toBeNull();
    expect(clicked).toEqual([]);
  });

  it('downloads when the picker API is missing or refused', async () => {
    expect(await saveDesign(project('p-dl'))).toEqual({ via: 'download', name: 'harbor-club-badge.xtatami' });
    w.showSaveFilePicker = vi.fn(async () => {
      throw new DOMException('no gesture', 'SecurityError');
    });
    expect((await saveDesign(project('p-dl2')))?.via).toBe('download');
    expect(clicked).toEqual(['harbor-club-badge.xtatami', 'harbor-club-badge.xtatami']);
  });

  it('opens through the open picker and returns the handle', async () => {
    const f = fakeHandle('mine.xtatami');
    f.writes.push('{"x":1}');
    w.showOpenFilePicker = vi.fn(async () => [f.handle]);
    const res = await openDesignFile();
    expect(res?.handle).toBe(f.handle);
    expect(await res?.file.text()).toBe('{"x":1}');
  });

  it('returns null when opening is cancelled', async () => {
    w.showOpenFilePicker = vi.fn(async () => {
      throw new DOMException('no', 'AbortError');
    });
    expect(await openDesignFile()).toBeNull();
  });
});
