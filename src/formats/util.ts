/**
 * Shared helpers for the embroidery file writers/readers: byte I/O, color
 * matching, extents and command-stream normalization.
 *
 * Parts of the normalization and color-matching logic are ported from
 * pyembroidery (MIT License, Copyright (c) 2018 Tatarize).
 */
import type { StitchPattern } from '../model/types';
import { CMD } from '../model/types';

// ---------------------------------------------------------------------------
// Byte writer / reader
// ---------------------------------------------------------------------------

/** Growable little/big-endian byte buffer. */
export class ByteWriter {
  private buf: Uint8Array;
  private view: DataView;
  pos = 0;

  constructor(initial = 1024) {
    this.buf = new Uint8Array(initial);
    this.view = new DataView(this.buf.buffer);
  }

  private ensure(n: number): void {
    const need = this.pos + n;
    if (need <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < need) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf);
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  get length(): number {
    return this.pos;
  }

  u8(v: number): this {
    this.ensure(1);
    this.buf[this.pos++] = v & 0xff;
    return this;
  }
  /** Signed byte (two's complement, wraps). */
  i8(v: number): this {
    return this.u8(v & 0xff);
  }
  u16le(v: number): this {
    this.ensure(2);
    this.view.setUint16(this.pos, v & 0xffff, true);
    this.pos += 2;
    return this;
  }
  u16be(v: number): this {
    this.ensure(2);
    this.view.setUint16(this.pos, v & 0xffff, false);
    this.pos += 2;
    return this;
  }
  u24le(v: number): this {
    return this.u8(v).u8(v >> 8).u8(v >> 16);
  }
  u24be(v: number): this {
    return this.u8(v >> 16).u8(v >> 8).u8(v);
  }
  u32le(v: number): this {
    this.ensure(4);
    this.view.setUint32(this.pos, v >>> 0, true);
    this.pos += 4;
    return this;
  }
  u32be(v: number): this {
    this.ensure(4);
    this.view.setUint32(this.pos, v >>> 0, false);
    this.pos += 4;
    return this;
  }
  f32le(v: number): this {
    this.ensure(4);
    this.view.setFloat32(this.pos, v, true);
    this.pos += 4;
    return this;
  }
  /** Writes each char code as one byte (callers pass ASCII). */
  ascii(s: string): this {
    for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i));
    return this;
  }
  /** UTF-16 big-endian code units. */
  utf16be(s: string): this {
    for (let i = 0; i < s.length; i++) this.u16be(s.charCodeAt(i));
    return this;
  }
  bytes(b: ArrayLike<number>): this {
    this.ensure(b.length);
    for (let i = 0; i < b.length; i++) this.buf[this.pos++] = b[i] & 0xff;
    return this;
  }
  fill(value: number, count: number): this {
    for (let i = 0; i < count; i++) this.u8(value);
    return this;
  }

  // Patching at absolute offsets (does not move pos).
  setU16le(at: number, v: number): void {
    this.view.setUint16(at, v & 0xffff, true);
  }
  setU24le(at: number, v: number): void {
    this.buf[at] = v & 0xff;
    this.buf[at + 1] = (v >> 8) & 0xff;
    this.buf[at + 2] = (v >> 16) & 0xff;
  }
  setU32le(at: number, v: number): void {
    this.view.setUint32(at, v >>> 0, true);
  }
  setU32be(at: number, v: number): void {
    this.view.setUint32(at, v >>> 0, false);
  }

  toBytes(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

/** Bounds-checked sequential reader. Reads past the end throw. */
export class ByteReader {
  pos = 0;
  private view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get length(): number {
    return this.bytes.length;
  }
  get remaining(): number {
    return this.bytes.length - this.pos;
  }
  private need(n: number): void {
    if (this.pos + n > this.bytes.length) throw new Error('Unexpected end of file');
  }
  seek(at: number): void {
    if (at < 0 || at > this.bytes.length) throw new Error('Seek out of range');
    this.pos = at;
  }
  skip(n: number): void {
    this.seek(this.pos + n);
  }
  u8(): number {
    this.need(1);
    return this.bytes[this.pos++];
  }
  i8(): number {
    const v = this.u8();
    return v > 127 ? v - 256 : v;
  }
  u16le(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  i16le(): number {
    this.need(2);
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u24le(): number {
    this.need(3);
    const b = this.bytes;
    const v = b[this.pos] | (b[this.pos + 1] << 8) | (b[this.pos + 2] << 16);
    this.pos += 3;
    return v;
  }
  u24be(): number {
    this.need(3);
    const b = this.bytes;
    const v = (b[this.pos] << 16) | (b[this.pos + 1] << 8) | b[this.pos + 2];
    this.pos += 3;
    return v;
  }
  u32le(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  i32le(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  ascii(n: number): string {
    this.need(n);
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.bytes[this.pos + i]);
    this.pos += n;
    return s;
  }
}

/** Keeps printable ASCII only (file headers are byte strings). */
export function asciiSafe(s: string, maxLen: number): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\x20-\x7e]/g, '_').slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export interface PaletteThread {
  name: string;
  hex: string;
  /** Catalog / chart code. */
  code: string;
}

export function hexToRgb(hex: string): number {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const v = parseInt(h.slice(0, 6), 16);
  return Number.isFinite(v) ? v & 0xffffff : 0;
}

export function rgbToHex(rgb: number): string {
  return '#' + (rgb & 0xffffff).toString(16).padStart(6, '0').toUpperCase();
}

/** "Red-mean" weighted RGB distance (compuphase), as used by pyembroidery. */
export function colorDistance(a: number, b: number): number {
  const r1 = (a >> 16) & 0xff, g1 = (a >> 8) & 0xff, b1 = a & 0xff;
  const r2 = (b >> 16) & 0xff, g2 = (b >> 8) & 0xff, b2 = b & 0xff;
  const rmean = Math.round((r1 + r2) / 2);
  const r = r1 - r2, g = g1 - g2, bl = b1 - b2;
  return (((512 + rmean) * r * r) >> 8) + 4 * g * g + (((767 - rmean) * bl * bl) >> 8);
}

/**
 * Index of the nearest color in `palette`; null entries are skipped.
 * Ties go to the later index (matches pyembroidery's `<=`). -1 if none.
 */
export function nearestColorIndex(rgb: number, palette: ReadonlyArray<number | null>): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    if (p === null) continue;
    const d = colorDistance(rgb, p);
    if (d <= bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Distinct default colors for formats without color info (DST, EXP). */
export const DEFAULT_COLORS: ReadonlyArray<PaletteThread> = [
  { name: 'Navy', hex: '#24357A', code: '' },
  { name: 'Red', hex: '#D0202E', code: '' },
  { name: 'Green', hex: '#1E8A3C', code: '' },
  { name: 'Gold', hex: '#E8A900', code: '' },
  { name: 'Purple', hex: '#7A3E9D', code: '' },
  { name: 'Sky Blue', hex: '#2584BB', code: '' },
  { name: 'Orange', hex: '#F27B1C', code: '' },
  { name: 'Black', hex: '#1A1A1A', code: '' },
  { name: 'Pink', hex: '#F27BAA', code: '' },
  { name: 'Brown', hex: '#7A4A1E', code: '' },
  { name: 'Teal', hex: '#008777', code: '' },
  { name: 'Gray', hex: '#878787', code: '' },
];

export function defaultThread(i: number): { hex: string; name: string } {
  const t = DEFAULT_COLORS[i % DEFAULT_COLORS.length];
  return { hex: t.hex, name: t.name };
}

// ---------------------------------------------------------------------------
// Extents
// ---------------------------------------------------------------------------

export interface Extents {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Bounding box of the given points; all zero when empty. */
export function extentsOf(xs: ArrayLike<number>, ys: ArrayLike<number>): Extents {
  if (xs.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i], y = ys[i];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

// ---------------------------------------------------------------------------
// Normalization (writer side)
// ---------------------------------------------------------------------------

/** One low-level machine record with absolute position. */
export interface Rec {
  x: number;
  y: number;
  c: number;
}

export interface NormThread {
  hex: string;
  name: string;
  chartCode: string | null;
  brand: string | null;
  rgb: number;
}

export interface Normalized {
  name: string;
  recs: Rec[];
  /** One thread per color block actually sewn (after STOP duplication if requested). */
  threads: NormThread[];
}

export interface NormalizeOptions {
  /** Max |dx| / |dy| of a single jump record. */
  maxJump: number;
  /** Max |dx| / |dy| of a single stitch record; longer stitches are split evenly. */
  maxStitch: number;
  /**
   * true: after a needle-up move, jump all the way to the target and put a
   * zero-length stitch there (PES/JEF/EXP style). false: jump to within
   * range and let the first stitch carry the rest (DST/XXX/VP3 style).
   */
  fullJump: boolean;
  /** Encode STOP as COLOR_CHANGE with the same thread repeated. */
  stopAsColorChange?: boolean;
}

function toNormThread(t: StitchPattern['threads'][number] | undefined, i: number): NormThread {
  const src = t ?? defaultThread(i);
  const rgb = hexToRgb(src.hex);
  return {
    hex: rgbToHex(rgb),
    name: src.name || rgbToHex(rgb),
    chartCode: (t && t.chartCode) || null,
    brand: (t && t.brand) || null,
    rgb,
  };
}

/**
 * Converts an engine StitchPattern into a clean record list for a writer:
 * - long jumps / stitches split into evenly spaced records within limits,
 * - redundant trims, color changes before the first / after the last stitch,
 *   and empty color blocks dropped (with their threads),
 * - an END record appended.
 * Positions are rounded to integers (0.1 mm).
 */
export function normalize(p: StitchPattern, o: NormalizeOptions): Normalized {
  const n = Math.min(p.xs.length, p.ys.length, p.cmds.length);
  let first = -1;
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (p.cmds[i] === CMD.END) break;
    if (p.cmds[i] === CMD.STITCH) {
      if (first < 0) first = i;
      last = i;
    }
  }

  const recs: Rec[] = [];
  const threads: NormThread[] = [];
  let x = 0, y = 0;
  let needleUp = true;
  let trimmed = true;
  let block = 0;
  /** A color change / stop record was emitted and no stitch followed yet. */
  let open: 'color' | 'stop' | null = null;
  let openIdx = -1;
  let started = false;

  const push = (c: number, nx: number, ny: number): void => {
    recs.push({ x: nx, y: ny, c });
    x = nx;
    y = ny;
  };
  /** Emits evenly spaced intermediate records toward (tx,ty) (exclusive). */
  const gap = (tx: number, ty: number, max: number, c: number): void => {
    const dx = tx - x, dy = ty - y;
    if (Math.abs(dx) <= max && Math.abs(dy) <= max) return;
    const steps = Math.max(Math.ceil(Math.abs(dx) / max), Math.ceil(Math.abs(dy) / max));
    const x0 = x, y0 = y;
    for (let k = 1; k < steps; k++) {
      push(c, x0 + Math.round((dx * k) / steps), y0 + Math.round((dy * k) / steps));
    }
  };

  for (let i = 0; i < n; i++) {
    const c = p.cmds[i];
    if (c === CMD.END) break;
    const tx = Math.round(p.xs[i]);
    const ty = Math.round(p.ys[i]);
    switch (c) {
      case CMD.JUMP:
        if (tx !== x || ty !== y) {
          gap(tx, ty, o.maxJump, CMD.JUMP);
          push(CMD.JUMP, tx, ty);
          needleUp = true;
        }
        break;
      case CMD.STITCH:
        if (!started || open === 'color' || (open === 'stop' && o.stopAsColorChange)) {
          threads.push(toNormThread(p.threads[block], block));
        }
        started = true;
        open = null;
        if (needleUp) {
          if (tx !== x || ty !== y) {
            gap(tx, ty, o.maxJump, CMD.JUMP);
            if (o.fullJump) push(CMD.JUMP, tx, ty);
          }
          needleUp = false;
        } else {
          gap(tx, ty, o.maxStitch, CMD.STITCH);
        }
        push(CMD.STITCH, tx, ty);
        trimmed = false;
        break;
      case CMD.TRIM:
        if (started && !trimmed) {
          push(CMD.TRIM, x, y);
          trimmed = true;
          needleUp = true;
        }
        break;
      case CMD.COLOR_CHANGE:
        block++;
        if (i > first && i < last) {
          if (open === 'stop') {
            // A stop directly followed by a color change: the change alone suffices.
            recs[openIdx].c = CMD.COLOR_CHANGE;
          } else if (open === null) {
            openIdx = recs.length;
            push(CMD.COLOR_CHANGE, x, y);
          }
          open = 'color';
          trimmed = true;
          needleUp = true;
        }
        break;
      case CMD.STOP:
        if (i > first && i < last && open === null) {
          openIdx = recs.length;
          push(o.stopAsColorChange ? CMD.COLOR_CHANGE : CMD.STOP, x, y);
          open = 'stop';
        }
        break;
      default:
        break;
    }
  }
  push(CMD.END, x, y);
  return { name: p.name || 'Untitled', recs, threads };
}

/** Bounds over all record positions. */
export function recExtents(recs: Rec[]): Extents {
  if (recs.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of recs) {
    if (r.x < minX) minX = r.x;
    if (r.x > maxX) maxX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.y > maxY) maxY = r.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Number of color blocks implied by the records (COLOR_CHANGE count + 1). */
export function countColorChanges(recs: Rec[]): number {
  let n = 0;
  for (const r of recs) if (r.c === CMD.COLOR_CHANGE) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Reader side
// ---------------------------------------------------------------------------

export interface ReadThread {
  hex: string;
  name: string;
  chartCode?: string | null;
  brand?: string;
}

/** Collects absolute records while decoding a file. */
export class RecordSink {
  xs: number[] = [];
  ys: number[] = [];
  cmds: number[] = [];
  x = 0;
  y = 0;

  /** Relative move/command. */
  add(c: number, dx = 0, dy = 0): void {
    this.x += dx;
    this.y += dy;
    this.xs.push(this.x);
    this.ys.push(this.y);
    this.cmds.push(c);
  }
}

export interface FinishOptions {
  /** Insert a TRIM before a jump run of at least this many records. */
  trimAtJumpCount?: number;
  /** Insert a TRIM before a jump run longer than this (0.1 mm, per axis). */
  trimAtDistance?: number;
}

/**
 * Turns decoded records into a StitchPattern: optional trim inference from
 * jump runs, zero-length jump runs dropped, consecutive jumps merged, END
 * appended and the design re-centered on its bounding-box center.
 */
export function finishRead(
  sink: RecordSink,
  threads: ReadThread[],
  name: string,
  opts: FinishOptions = {},
): StitchPattern {
  const xs: number[] = [];
  const ys: number[] = [];
  const cmds: number[] = [];
  const n = sink.cmds.length;
  let trimmed = true;
  let px = 0, py = 0;
  let i = 0;
  while (i < n) {
    const c = sink.cmds[i];
    if (c === CMD.END) break;
    if (c === CMD.JUMP) {
      let j = i;
      while (j < n && sink.cmds[j] === CMD.JUMP) j++;
      const ex = sink.xs[j - 1], ey = sink.ys[j - 1];
      const count = j - i;
      const moved = ex !== px || ey !== py;
      const far =
        opts.trimAtDistance !== undefined &&
        (Math.abs(ex - px) > opts.trimAtDistance || Math.abs(ey - py) > opts.trimAtDistance);
      const many = opts.trimAtJumpCount !== undefined && count >= opts.trimAtJumpCount;
      if (!trimmed && (many || far)) {
        xs.push(px); ys.push(py); cmds.push(CMD.TRIM);
        trimmed = true;
      }
      if (moved) {
        xs.push(ex); ys.push(ey); cmds.push(CMD.JUMP);
        px = ex; py = ey;
      }
      i = j;
      continue;
    }
    if (c === CMD.STITCH) trimmed = false;
    else if (c === CMD.TRIM || c === CMD.COLOR_CHANGE) trimmed = true;
    px = sink.xs[i];
    py = sink.ys[i];
    xs.push(px); ys.push(py); cmds.push(c);
    i++;
  }
  xs.push(px); ys.push(py); cmds.push(CMD.END);

  // Re-center on the stitch bounding box (all records if there are no stitches).
  const sx: number[] = [], sy: number[] = [];
  for (let k = 0; k < cmds.length; k++) {
    if (cmds[k] === CMD.STITCH) { sx.push(xs[k]); sy.push(ys[k]); }
  }
  const e = sx.length ? extentsOf(sx, sy) : extentsOf(xs, ys);
  const cx = Math.round((e.minX + e.maxX) / 2);
  const cy = Math.round((e.minY + e.maxY) / 2);
  const outX = new Int32Array(xs.length);
  const outY = new Int32Array(ys.length);
  for (let k = 0; k < xs.length; k++) {
    outX[k] = xs[k] - cx;
    outY[k] = ys[k] - cy;
  }

  // One thread per block.
  let blocks = 1;
  for (const c of cmds) if (c === CMD.COLOR_CHANGE) blocks++;
  const outThreads: ReadThread[] = [];
  for (let b = 0; b < blocks; b++) outThreads.push(threads[b] ?? defaultThread(b));

  return { name, xs: outX, ys: outY, cmds: Uint8Array.from(cmds), threads: outThreads };
}
