import { readStitchFile } from '../formats';
import { colorName, createProject, newId, normalizeHex } from '../model/project';
import { CMD, type Project, type StitchObject, type Thread } from '../model/types';
import { FLAT_HOOPS } from '../presets';
import type { RasterImage } from './autoDigitize';

export const STITCH_FILE_ACCEPT = '.dst,.pes,.pec,.jef,.exp';
export const ARTWORK_ACCEPT = '.svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,.json';

export function readAsText(f: Blob): Promise<string> {
  return f.text();
}

export async function readAsBytes(f: Blob): Promise<Uint8Array> {
  return new Uint8Array(await f.arrayBuffer());
}

export function readAsDataUrl(f: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Could not read file'));
    r.readAsDataURL(f);
  });
}

export type ArtworkKind = 'svg' | 'raster' | 'project' | 'stitch' | 'unknown';

export function artworkKind(name: string, type = ''): ArtworkKind {
  const n = name.toLowerCase();
  if (n.endsWith('.svg') || type === 'image/svg+xml') return 'svg';
  if (n.endsWith('.json')) return 'project';
  if (/\.(png|jpe?g|webp)$/.test(n) || /^image\/(png|jpeg|webp)$/.test(type)) return 'raster';
  if (/\.(dst|pes|pec|jef|exp)$/.test(n)) return 'stitch';
  return 'unknown';
}

/** Smallest standard hoop that holds a design of this size (0.1 mm). */
export function hoopFor(w: number, h: number) {
  return FLAT_HOOPS.find((hp) => (w <= hp.width && h <= hp.height) || (w <= hp.height && h <= hp.width)) ?? FLAT_HOOPS[FLAT_HOOPS.length - 1];
}

/** Open a DST/PES/JEF/EXP as a recolor-only project: one raw-stitch object per color block. */
export function projectFromStitchFile(fileName: string, bytes: Uint8Array): Project {
  const pattern = readStitchFile(fileName, bytes);
  const blocks: number[][] = [[]];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pattern.cmds.length; i++) {
    const c = pattern.cmds[i];
    const x = pattern.xs[i];
    const y = pattern.ys[i];
    if (c === CMD.COLOR_CHANGE) {
      blocks.push([]);
      continue;
    }
    if (c === CMD.END) break;
    blocks[blocks.length - 1].push(x, y, c);
    if (c === CMD.STITCH) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) throw new Error(`${fileName} has no stitches.`);
  const hoop = hoopFor(maxX - minX, maxY - minY);
  const base = createProject({ name: fileName, machine: 'other', hoop, fabric: 'cotton' });
  const threads: Thread[] = [];
  const objects: StitchObject[] = [];
  blocks.forEach((data, i) => {
    if (!data.some((_, k) => k % 3 === 2 && data[k] === CMD.STITCH)) return;
    const src = pattern.threads[i] ?? pattern.threads[pattern.threads.length - 1] ?? { hex: '#333333', name: 'Thread' };
    const hex = normalizeHex(src.hex);
    const t: Thread = { id: `t${threads.length + 1}`, name: src.name || colorName(hex), hex, chartCode: src.chartCode ?? null };
    threads.push(t);
    objects.push({
      id: newId('o'),
      name: `Color ${threads.length}`,
      type: 'stitches',
      thread: t.id,
      visible: true,
      locked: false,
      geometry: { kind: 'stitches', data },
      params: {},
      advanced: { tieIn: false, tieOff: false },
    });
  });
  return { ...base, threads, objects, source: 'stitch-file', sourceFileName: fileName };
}

/** Decode an image to RGBA pixels, scaled so the longest side is at most `maxSide`. Browser only. */
export async function imageToRaster(dataUrl: string, maxSide = 360): Promise<RasterImage> {
  const img = await loadImage(dataUrl);
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s));
  const h = Math.max(1, Math.round(img.naturalHeight * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available');
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: data.data };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode this image.'));
    img.src = src;
  });
}

/** Open the native file picker. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    };
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}
