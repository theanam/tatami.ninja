import { hexToRgb, rgbToHex } from '../model/project';
import { CMD, type Project, type StitchPlan } from '../model/types';
import { getFabric, type FabricPreset } from '../presets';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A canvas that works on the main thread and in workers. */
export function makeCanvas(width: number, height: number): AnyCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

/** World (0.1 mm) → screen: x' = x * scale + ox. */
export interface ViewTransform {
  scale: number;
  ox: number;
  oy: number;
}

const BUCKETS = 8;
const LIGHT = -Math.PI / 4; // light from the top-left

function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (f >= 1) {
    const t = Math.min(1, f - 1);
    return rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
  }
  return rgbToHex(r * f, g * f, b * f);
}

interface BlockPaths {
  hex: string;
  /** Per sheen bucket. */
  buckets: Path2D[];
  all: Path2D;
  jumps: Path2D;
  points: Path2D;
  start: number;
  end: number;
}

export interface PathCache {
  plan: StitchPlan;
  blocks: BlockPaths[];
}

/** Thread color of each color block. */
export function blockColors(project: Project, plan: StitchPlan): string[] {
  return plan.colorBlocks.map((id) => project.threads.find((t) => t.id === id)?.hex ?? '#888888');
}

/** Command index where each color block starts. */
export function blockStarts(plan: StitchPlan): number[] {
  const starts = [0];
  for (let i = 0; i < plan.cmds.length; i++) if (plan.cmds[i] === CMD.COLOR_CHANGE) starts.push(i + 1);
  return starts;
}

function buildRange(plan: StitchPlan, start: number, end: number, hex: string, hidden?: Set<number>, only?: Set<number>): BlockPaths {
  const buckets = Array.from({ length: BUCKETS }, () => new Path2D());
  const all = new Path2D();
  const jumps = new Path2D();
  const points = new Path2D();
  const { xs, ys, cmds, obj } = plan;
  for (let i = Math.max(1, start); i < end; i++) {
    const c = cmds[i];
    if (hidden && obj[i] >= 0 && hidden.has(obj[i])) continue;
    if (only && !only.has(obj[i])) continue;
    const x0 = xs[i - 1];
    const y0 = ys[i - 1];
    const x1 = xs[i];
    const y1 = ys[i];
    if (c === CMD.STITCH) {
      if (x0 === x1 && y0 === y1) continue;
      const a = Math.atan2(y1 - y0, x1 - x0);
      // Sheen: stitches facing the light read brighter.
      const k = Math.min(BUCKETS - 1, Math.floor((Math.abs(Math.cos(a - LIGHT)) * BUCKETS)));
      buckets[k].moveTo(x0, y0);
      buckets[k].lineTo(x1, y1);
      all.moveTo(x0, y0);
      all.lineTo(x1, y1);
      points.rect(x1 - 1.5, y1 - 1.5, 3, 3);
    } else if (c === CMD.JUMP) {
      jumps.moveTo(x0, y0);
      jumps.lineTo(x1, y1);
    }
  }
  return { hex, buckets, all, jumps, points, start, end };
}

/**
 * `hidden` holds object indexes to leave out (e.g. text being edited in place);
 * `only` keeps just those objects (e.g. the ones being dragged).
 */
export function buildPathCache(project: Project, plan: StitchPlan, hidden?: Set<number>, only?: Set<number>): PathCache {
  const colors = blockColors(project, plan);
  const starts = blockStarts(plan);
  const blocks = starts.map((s, i) => buildRange(plan, s, i + 1 < starts.length ? starts[i + 1] : plan.cmds.length, colors[i] ?? '#888888', hidden, only));
  return { plan, blocks };
}

export type StitchStyle = 'realistic' | 'stitches';

/** Draw cached blocks in sewing order. Context must already have the world transform applied. */
export function drawBlocks(ctx: Ctx2D, blocks: BlockPaths[], style: StitchStyle, pxPerUnit: number) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (style === 'stitches') {
    const lw = 1 / pxPerUnit;
    for (const b of blocks) {
      ctx.strokeStyle = b.hex;
      ctx.lineWidth = Math.max(lw, 1.2);
      ctx.globalAlpha = 1;
      ctx.stroke(b.all);
      if (pxPerUnit > 0.6) {
        ctx.fillStyle = shade(b.hex, 1.4);
        ctx.fill(b.points);
      }
      ctx.setLineDash([4 / pxPerUnit, 3 / pxPerUnit]);
      ctx.strokeStyle = 'rgba(160,161,168,.55)';
      ctx.lineWidth = lw;
      ctx.stroke(b.jumps);
      ctx.setLineDash([]);
    }
    return;
  }
  // Realistic: ~0.4 mm thread with a soft shadow, sheen and a highlight core.
  const w = 4.2;
  for (const b of blocks) {
    ctx.save();
    ctx.translate(0.6, 1);
    ctx.strokeStyle = 'rgba(0,0,0,.28)';
    ctx.lineWidth = w * 1.25;
    ctx.stroke(b.all);
    ctx.restore();
    for (let k = 0; k < BUCKETS; k++) {
      ctx.strokeStyle = shade(b.hex, 0.78 + (k / (BUCKETS - 1)) * 0.42);
      ctx.lineWidth = w;
      ctx.stroke(b.buckets[k]);
    }
    ctx.save();
    ctx.translate(-0.4, -0.5);
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = shade(b.hex, 1.55);
    ctx.lineWidth = w * 0.3;
    for (let k = BUCKETS / 2; k < BUCKETS; k++) ctx.stroke(b.buckets[k]);
    ctx.restore();
  }
}

/** Blocks needed to show the first `n` commands (for the simulator). */
export function partialBlocks(project: Project, cache: PathCache, n: number): BlockPaths[] {
  const out: BlockPaths[] = [];
  for (const b of cache.blocks) {
    if (b.end <= n) out.push(b);
    else if (b.start < n) {
      out.push(buildRange(cache.plan, b.start, n, b.hex));
      break;
    } else break;
  }
  void project;
  return out;
}

/* ---------- Fabric textures ---------- */

const patternCache = new Map<string, AnyCanvas>();

/** A small tile in canvas pixels representing ~4 mm of fabric. */
export function fabricTile(f: FabricPreset): AnyCanvas | null {
  const hit = patternCache.get(f.id);
  if (hit) return hit;
  const s = 40; // 40 px tile = 4 mm at 1 px per 0.1 mm
  const c = makeCanvas(s, s);
  if (!c) return null;
  const g = c.getContext('2d') as Ctx2D | null;
  if (!g) return null;
  g.fillStyle = f.color;
  g.fillRect(0, 0, s, s);
  g.strokeStyle = f.weave;
  g.fillStyle = f.weave;
  g.lineWidth = 2;
  switch (f.texture) {
    case 'twill':
    case 'denim':
      g.lineWidth = f.texture === 'denim' ? 3 : 2.5;
      for (let i = -s; i < s * 2; i += 8) {
        g.beginPath();
        g.moveTo(i, s);
        g.lineTo(i + s, 0);
        g.stroke();
      }
      if (f.texture === 'denim') {
        g.strokeStyle = 'rgba(255,255,255,.12)';
        g.lineWidth = 1;
        for (let i = -s; i < s * 2; i += 8) {
          g.beginPath();
          g.moveTo(i + 3, s);
          g.lineTo(i + 3 + s, 0);
          g.stroke();
        }
      }
      break;
    case 'plain':
    case 'canvas':
      g.globalAlpha = f.texture === 'canvas' ? 0.7 : 0.5;
      for (let i = 0; i < s; i += f.texture === 'canvas' ? 8 : 5) {
        g.fillRect(0, i, s, f.texture === 'canvas' ? 3 : 1.5);
        g.fillRect(i, 0, f.texture === 'canvas' ? 3 : 1.5, s);
      }
      break;
    case 'knit':
      g.globalAlpha = 0.7;
      for (let i = 0; i < s; i += 6) g.fillRect(i, 0, 3, s);
      break;
    case 'fleece':
    case 'terry':
      g.fillStyle = f.texture === 'fleece' ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.1)';
      for (let y = 2; y < s; y += 5) for (let x = (y % 10 === 2 ? 2 : 4.5); x < s; x += 5) g.fillRect(x, y, 2, 2);
      break;
    case 'felt':
      break;
  }
  patternCache.set(f.id, c);
  return c;
}

/** Fill a path with the fabric texture in world space (scale = px per 0.1 mm). */
export function fillFabric(ctx: Ctx2D, fabricId: string, shape: Path2D | null, scale: number) {
  const f = getFabric(fabricId);
  const tile = fabricTile(f);
  ctx.fillStyle = f.color;
  if (shape) ctx.fill(shape);
  else ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
  if (!tile) return;
  const pat = ctx.createPattern(tile, 'repeat');
  if (!pat) return;
  // Tiles are authored at 1 px per world unit; keep weave readable when zoomed out.
  const k = scale < 0.5 ? 0.5 / scale : 1;
  pat.setTransform?.(new DOMMatrix([k, 0, 0, k, 0, 0]));
  ctx.fillStyle = pat;
  if (shape) ctx.fill(shape);
  else ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
}

/* ---------- Thumbnails ---------- */

/** Draw a realistic thumbnail of the design on its fabric (4:3) into a new canvas. */
export function drawThumbnail(project: Project, plan: StitchPlan, width = 400, height = 300): AnyCanvas | null {
  const c = makeCanvas(width, height);
  const ctx = c?.getContext('2d') as Ctx2D | null | undefined;
  if (!c || !ctx) return null;
  const b = plan.bounds ?? { minX: -300, minY: -300, maxX: 300, maxY: 300 };
  const w = Math.max(b.maxX - b.minX, 100);
  const h = Math.max(b.maxY - b.minY, 100);
  const scale = Math.min((width * 0.7) / w, (height * 0.7) / h);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  ctx.setTransform(scale, 0, 0, scale, width / 2 - cx * scale, height / 2 - cy * scale);
  fillFabric(ctx, project.fabricPreset, null, scale);
  drawBlocks(ctx, buildPathCache(project, plan).blocks, scale < 0.6 && project.source === 'stitch-file' ? 'stitches' : 'realistic', scale);
  return c;
}

/** Thumbnail as a PNG data URL; works in workers (OffscreenCanvas) and on the main thread. */
export async function renderThumbnail(project: Project, plan: StitchPlan, width = 400, height = 300): Promise<string | undefined> {
  try {
    const c = drawThumbnail(project, plan, width, height);
    if (!c) return undefined;
    if ('convertToBlob' in c) {
      const blob = await c.convertToBlob({ type: 'image/png' });
      return await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
      });
    }
    return c.toDataURL('image/png');
  } catch {
    return undefined;
  }
}
