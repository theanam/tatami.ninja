import { CMD, type Bounds, type ObjectStat, type Project, type StitchObject, type StitchPlan } from '../model/types';
import { dist, geometryBounds, norm, sub, type P } from './geom';
import { generateObject, resolveParams, type Piece } from './objects';

/** Moves up to this length are sewn as a stitch instead of a jump (0.1 mm). */
export const TRAVEL_STITCH_MAX = 20;
/** Jumps longer than this get a trim first (0.1 mm). */
export const TRIM_ABOVE = 30;
/** Longest single stitch or jump most formats accept (DST: 12.1 mm). */
export const MAX_STEP = 121;
const TIE = 6;
/** Objects wider or taller than this (0.1 mm) are not stitched: no hoop is that big. */
export const MAX_OBJECT_SIZE = 6000;
/** Rough penetration estimate above which an object is skipped. */
export const MAX_OBJECT_STITCHES = 400_000;
/** The whole plan stops here; real designs are far smaller, and this keeps the tab alive. */
export const MAX_PLAN_STITCHES = 300_000;

/** Cheap upper-bound guess of an object's stitch count from its bounds and spacing. */
export function estimateStitches(obj: StitchObject, fabricId: string): number {
  const b = geometryBounds(obj.geometry);
  if (!b) return 0;
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const r = resolveParams(obj, fabricId);
  const spacing = obj.type === 'satin' ? r.density / 2 : obj.type === 'contour' ? r.contourSpacing : r.rowSpacing;
  if (obj.type === 'run') return (2 * (w + h)) / Math.max(5, r.stitchLength);
  return (w * h) / (Math.max(1, spacing) * 30);
}

/** Reason an object cannot be stitched, or null. */
export function tooLarge(obj: StitchObject, fabricId: string): 'size' | 'density' | null {
  if (obj.geometry.kind === 'stitches') return null;
  const b = geometryBounds(obj.geometry);
  if (b && (b.maxX - b.minX > MAX_OBJECT_SIZE || b.maxY - b.minY > MAX_OBJECT_SIZE)) return 'size';
  return estimateStitches(obj, fabricId) > MAX_OBJECT_STITCHES ? 'density' : null;
}

class Builder {
  xs: number[] = [];
  ys: number[] = [];
  cmds: number[] = [];
  obj: number[] = [];
  pos: P | null = null;

  push(cmd: number, p: P, obj: number) {
    this.xs.push(Math.round(p[0]));
    this.ys.push(Math.round(p[1]));
    this.cmds.push(cmd);
    this.obj.push(obj);
    if (cmd === CMD.STITCH || cmd === CMD.JUMP) this.pos = [Math.round(p[0]), Math.round(p[1])];
  }

  /** Stitch or jump to p, splitting steps longer than MAX_STEP. */
  moveTo(cmd: number, p: P, obj: number) {
    const from = this.pos;
    if (from) {
      const d = dist(from, p);
      if (d > MAX_STEP) {
        const n = Math.ceil(d / MAX_STEP);
        for (let i = 1; i < n; i++) {
          this.push(cmd, [from[0] + ((p[0] - from[0]) * i) / n, from[1] + ((p[1] - from[1]) * i) / n], obj);
        }
      }
    }
    this.push(cmd, p, obj);
  }

  marker(cmd: number, obj: number) {
    const p = this.pos ?? [0, 0];
    this.push(cmd, p, obj);
  }
}

function tieIn(pts: P[]): P[] {
  if (pts.length < 2) return pts;
  const u = norm(sub(pts[1], pts[0]));
  const a: P = [pts[0][0] + u[0] * TIE, pts[0][1] + u[1] * TIE];
  return [pts[0], a, pts[0], ...pts.slice(1)];
}

function tieOff(pts: P[]): P[] {
  const n = pts.length;
  if (n < 2) return pts;
  const v = norm(sub(pts[n - 2], pts[n - 1]));
  const a: P = [pts[n - 1][0] + v[0] * TIE, pts[n - 1][1] + v[1] * TIE];
  return [...pts, a, pts[n - 1]];
}

/**
 * Turn a project into machine commands. Pure and deterministic.
 * Hidden objects are skipped. Color changes happen between objects whose thread differs.
 */
export function generatePlan(project: Project): StitchPlan {
  const b = new Builder();
  const colorBlocks: string[] = [];
  const objectStats: ObjectStat[] = [];
  const skipped: string[] = [];
  let truncated = false;
  let currentThread: string | null = null;
  let pendingTrim = false;

  project.objects.forEach((obj, index) => {
    const startCmd = b.cmds.length;
    if (obj.visible && (truncated || tooLarge(obj, project.fabricPreset))) {
      if (!truncated) skipped.push(obj.id);
      objectStats.push({ id: obj.id, stitches: 0, start: startCmd, end: startCmd, bounds: null });
      return;
    }
    if (!obj.visible) {
      objectStats.push({ id: obj.id, stitches: 0, start: startCmd, end: startCmd, bounds: null });
      return;
    }
    const r = resolveParams(obj, project.fabricPreset);
    let pieces: Piece[];
    if (obj.geometry.kind === 'stitches') {
      pieces = rawPieces(obj.geometry.data);
    } else {
      pieces = generateObject(obj, project.fabricPreset, b.pos);
    }
    pieces = pieces.filter((p) => !('pts' in p) || p.pts.length > 0);
    if (!pieces.some((p) => 'pts' in p)) {
      objectStats.push({ id: obj.id, stitches: 0, start: startCmd, end: startCmd, bounds: null });
      return;
    }

    // Color change between differently-colored objects.
    if (currentThread === null) {
      colorBlocks.push(obj.thread);
      currentThread = obj.thread;
    } else if (obj.thread !== currentThread) {
      b.marker(CMD.TRIM, -1);
      b.marker(CMD.COLOR_CHANGE, -1);
      colorBlocks.push(obj.thread);
      currentThread = obj.thread;
      pendingTrim = false;
    } else if (r.trimBefore) {
      pendingTrim = true;
    }

    const isRaw = obj.geometry.kind === 'stitches';
    let firstGroup = true;
    pieces.forEach((piece, pi) => {
      if (!('pts' in piece)) {
        b.marker(CMD.STOP, index);
        return;
      }
      let pts = piece.pts;
      const target = pts[0];
      let trimmed = firstGroup;
      if (b.pos === null) {
        b.moveTo(CMD.JUMP, target, -1);
      } else {
        const d = dist(b.pos, target);
        const needTrim = pendingTrim || d > TRIM_ABOVE;
        if (d <= TRAVEL_STITCH_MAX && !pendingTrim && !isRaw) {
          trimmed = false;
        } else {
          if (needTrim) b.marker(CMD.TRIM, firstGroup ? -1 : index);
          b.moveTo(CMD.JUMP, target, firstGroup ? -1 : index);
          trimmed = needTrim || firstGroup;
        }
      }
      pendingTrim = false;
      // Tie in after arriving with a cut thread; tie off before the next trim.
      const nextPiece = pieces.slice(pi + 1).find((p) => 'pts' in p) as { pts: P[] } | undefined;
      const nextIsStop = pieces[pi + 1] && !('pts' in pieces[pi + 1]);
      const lastGroup = !nextPiece;
      const willTrim =
        nextIsStop ||
        (lastGroup && r.trimAfter) ||
        (!!nextPiece && dist(pts[pts.length - 1], nextPiece.pts[0]) > TRIM_ABOVE);
      if (!isRaw) {
        if (r.tieIn && trimmed) pts = tieIn(pts);
        if (r.tieOff && (willTrim || lastGroup)) pts = tieOff(pts);
      }
      // Skip a first point that duplicates the current position.
      const startAt = b.pos && dist(b.pos, pts[0]) < 0.5 ? 1 : 0;
      if (isRaw) {
        rawEmit(b, piece as RawPiece, index);
      } else {
        for (let i = startAt; i < pts.length; i++) b.moveTo(CMD.STITCH, pts[i], index);
      }
      firstGroup = false;
    });
    if (r.trimAfter) pendingTrim = true;

    const end = b.cmds.length;
    let stitches = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = startCmd; i < end; i++) {
      if (b.cmds[i] !== CMD.STITCH || b.obj[i] !== index) continue;
      stitches++;
      if (b.xs[i] < minX) minX = b.xs[i];
      if (b.ys[i] < minY) minY = b.ys[i];
      if (b.xs[i] > maxX) maxX = b.xs[i];
      if (b.ys[i] > maxY) maxY = b.ys[i];
    }
    objectStats.push({
      id: obj.id,
      stitches,
      start: startCmd,
      end,
      bounds: stitches ? { minX, minY, maxX, maxY } : null,
    });
    if (b.cmds.length > MAX_PLAN_STITCHES) truncated = true;
  });

  if (b.cmds.length) {
    b.marker(CMD.TRIM, -1);
    b.marker(CMD.END, -1);
  }

  let stitchCount = 0;
  let trims = 0;
  let colorChanges = 0;
  let stops = 0;
  let bounds: Bounds | null = null;
  for (let i = 0; i < b.cmds.length; i++) {
    const c = b.cmds[i];
    if (c === CMD.STITCH) {
      stitchCount++;
      const x = b.xs[i];
      const y = b.ys[i];
      if (!bounds) bounds = { minX: x, minY: y, maxX: x, maxY: y };
      else {
        if (x < bounds.minX) bounds.minX = x;
        if (y < bounds.minY) bounds.minY = y;
        if (x > bounds.maxX) bounds.maxX = x;
        if (y > bounds.maxY) bounds.maxY = y;
      }
    } else if (c === CMD.TRIM) trims++;
    else if (c === CMD.COLOR_CHANGE) colorChanges++;
    else if (c === CMD.STOP) stops++;
  }
  // The final trim before END is not a "real" trim for the user.
  if (trims > 0 && b.cmds.length >= 2 && b.cmds[b.cmds.length - 2] === CMD.TRIM) trims--;
  // Count jump moves (consecutive jump records form one move).
  let jumpMoves = 0;
  for (let i = 0; i < b.cmds.length; i++) {
    if (b.cmds[i] === CMD.JUMP && (i === 0 || b.cmds[i - 1] !== CMD.JUMP)) jumpMoves++;
  }

  return {
    xs: Int32Array.from(b.xs),
    ys: Int32Array.from(b.ys),
    cmds: Uint8Array.from(b.cmds),
    obj: Int32Array.from(b.obj),
    colorBlocks,
    objectStats,
    skipped,
    truncated,
    bounds,
    stitchCount,
    jumps: jumpMoves,
    trims,
    colorChanges,
    stops,
  };
}

interface RawPiece {
  pts: P[];
  raw: number[];
}

/** Raw stitch-file data becomes one piece that is replayed command by command. */
function rawPieces(data: number[]): Piece[] {
  const pts: P[] = [];
  for (let i = 0; i + 2 < data.length; i += 3) {
    if (data[i + 2] === CMD.STITCH || data[i + 2] === CMD.JUMP) pts.push([data[i], data[i + 1]]);
  }
  if (!pts.length) return [];
  return [{ pts, raw: data } as RawPiece as Piece];
}

function rawEmit(b: Builder, piece: RawPiece, index: number) {
  const d = piece.raw;
  for (let i = 0; i + 2 < d.length; i += 3) {
    const c = d[i + 2];
    if (c === CMD.STITCH || c === CMD.JUMP) b.moveTo(c, [d[i], d[i + 1]], index);
    else if (c === CMD.TRIM || c === CMD.STOP) b.marker(c, index);
  }
}
