import { getMachine, HOOPS } from '../presets';
import type { MachineBrand, Project, StitchObject, Thread } from './types';

export function newId(prefix = 'id'): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rnd}`;
}

export interface NewProjectOptions {
  name?: string;
  machine: MachineBrand;
  hoop: { id: string; width: number; height: number };
  fabric: string;
  units?: 'mm' | 'in';
}

export function createProject(o: NewProjectOptions): Project {
  return {
    format: 'tatami-project',
    version: 1,
    id: newId('p'),
    name: o.name?.trim() || 'Untitled design',
    units: o.units ?? 'mm',
    machine: { brand: o.machine, defaultFormat: getMachine(o.machine).format },
    hoop: { ...o.hoop },
    fabricPreset: o.fabric,
    threadChart: 'madeira',
    threads: [],
    objects: [],
    backdrop: null,
    spm: 800,
    source: 'design',
  };
}

export const DEFAULT_HOOP = HOOPS[1];

/** Projects saved before the rename to tatami.ninja still open. */
const LEGACY_FORMAT = 'stitchbuddy-project';

/** Parse and validate a .tatami.json file. Throws a readable Error. */
export function parseProjectJson(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const p = data as Partial<Project>;
  if (!p || typeof p !== 'object' || p.format !== 'tatami-project' && p.format !== LEGACY_FORMAT) {
    throw new Error('This is not a tatami.ninja project file.');
  }
  if (p.version !== 1) throw new Error(`Unsupported project version: ${String(p.version)}.`);
  if (!Array.isArray(p.objects) || !Array.isArray(p.threads) || !p.hoop) {
    throw new Error('The project file is missing objects, threads or hoop.');
  }
  const threadIds = new Set(p.threads.map((t) => t.id));
  const objects: StitchObject[] = p.objects.map((o, i) => ({
    ...o,
    id: o.id || `o${i + 1}`,
    name: o.name || `Object ${i + 1}`,
    visible: o.visible !== false,
    locked: !!o.locked,
    params: o.params ?? {},
    advanced: o.advanced ?? {},
    thread: threadIds.has(o.thread) ? o.thread : p.threads![0]?.id ?? 't1',
  }));
  return {
    format: 'tatami-project',
    version: 1,
    id: p.id,
    name: p.name || 'Untitled design',
    units: p.units === 'in' ? 'in' : 'mm',
    machine: p.machine ?? { brand: 'other', defaultFormat: null },
    hoop: p.hoop,
    fabricPreset: p.fabricPreset || 'cotton-twill',
    threadChart: p.threadChart || 'madeira',
    threads: p.threads,
    objects,
    backdrop: p.backdrop ?? null,
    spm: p.spm ?? 800,
    source: p.source ?? 'design',
    sourceFileName: p.sourceFileName,
  };
}

/** JSON for download: strips the local id. */
export function serializeProject(p: Project): string {
  const { id: _id, ...rest } = p;
  void _id;
  return JSON.stringify(rest, null, 2);
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-') || 'design'
  );
}

/** Find a thread with this color or add a new one. Returns the thread id. */
export function ensureThread(threads: Thread[], hex: string, name?: string): { threads: Thread[]; id: string } {
  const h = normalizeHex(hex);
  const existing = threads.find((t) => t.hex.toLowerCase() === h.toLowerCase());
  if (existing) return { threads, id: existing.id };
  let n = threads.length + 1;
  while (threads.some((t) => t.id === `t${n}`)) n++;
  const t: Thread = { id: `t${n}`, name: name ?? colorName(h), hex: h, chartCode: null };
  return { threads: [...threads, t], id: t.id };
}

export function normalizeHex(hex: string): string {
  let h = hex.trim();
  if (!h.startsWith('#')) h = `#${h}`;
  if (h.length === 4) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return h.slice(0, 7).toUpperCase();
}

const NAMED: [string, string][] = [
  ['Black', '#111111'], ['White', '#FFFFFF'], ['Ivory', '#F3EBD3'], ['Silver', '#B8B9BD'], ['Gray', '#7C7D82'],
  ['Charcoal', '#3A3B40'], ['Navy', '#24357A'], ['Royal blue', '#2E55C4'], ['Sky blue', '#7DB7E8'], ['Teal', '#1F8A8A'],
  ['Turquoise', '#3CC4C0'], ['Forest green', '#2C6B3A'], ['Green', '#3FA34D'], ['Lime', '#9ACD32'], ['Olive', '#6B6B2A'],
  ['Gold', '#D4A43A'], ['Yellow', '#F2D23C'], ['Orange', '#EE7D2B'], ['Rust', '#A4482A'], ['Brown', '#6B4426'],
  ['Tan', '#C9A77C'], ['Red', '#C8282E'], ['Crimson', '#9B1B30'], ['Pink', '#F08CB4'], ['Magenta', '#C2307A'],
  ['Purple', '#6A3A9A'], ['Lavender', '#B49BD8'], ['Peach', '#F5B48C'], ['Maroon', '#5E1A22'], ['Beige', '#E3D3B0'],
];

/** Friendly name of the closest named thread color. */
export function colorName(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  let best = NAMED[0][0];
  let bd = Infinity;
  for (const [name, h] of NAMED) {
    const [r2, g2, b2] = hexToRgb(h);
    // Weighted RGB distance (approximate perceptual).
    const d = 2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2;
    if (d < bd) {
      bd = d;
      best = name;
    }
  }
  return best;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex);
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Thread blocks in sewing order (consecutive visible objects with the same thread). */
export function colorBlocks(p: Project): { thread: Thread; objects: StitchObject[] }[] {
  const out: { thread: Thread; objects: StitchObject[] }[] = [];
  for (const o of p.objects) {
    const t = p.threads.find((x) => x.id === o.thread) ?? { id: o.thread, name: 'Unknown', hex: '#888888', chartCode: null };
    const last = out[out.length - 1];
    if (last && last.thread.id === t.id) last.objects.push(o);
    else out.push({ thread: t, objects: [o] });
  }
  return out;
}
