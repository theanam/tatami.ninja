/**
 * Brother PEC section (embedded in every PES file): header, stitch block,
 * thumbnails, and the matching reader.
 *
 * Ported from pyembroidery's PecWriter / PecReader / PecGraphics
 * (MIT License, Copyright (c) 2018 Tatarize).
 *
 * Encoding choices:
 * - Deltas: 7-bit short form for -64 < d < 63, otherwise 12-bit long form
 *   (0x80 flag) per axis.
 * - JUMP: long form with jump flag 0x10, or trim flag 0x20 for jumps that
 *   follow a TRIM (Brother: trim, then move). A TRIM not followed by a jump
 *   is written as a zero-length trim-jump. pyembroidery instead flags every
 *   non-initial jump as a trim; Brother machines accept both.
 * - COLOR_CHANGE: FE B0 then alternating 02/01. STOP is written as a color
 *   change to a duplicate thread (Brother has no stop command).
 * - END: FF.
 */
import { CMD } from '../model/types';
import { PEC_PALETTE, PEC_RGB } from './pecPalette';
import type { Extents, Normalized, ReadThread, Rec } from './util';
import { ByteReader, ByteWriter, RecordSink, asciiSafe, nearestColorIndex, recExtents } from './util';

export const PEC_MAX = 2047;
export const PEC_ICON_WIDTH = 48;
export const PEC_ICON_HEIGHT = 38;
const STRIDE = PEC_ICON_WIDTH / 8;
const JUMP_CODE = 0x10;
const TRIM_CODE = 0x20;

/** Blank 48x38 thumbnail with a rounded border frame. */
export function blankPecGraphic(): number[] {
  const g = new Array<number>(STRIDE * PEC_ICON_HEIGHT).fill(0);
  const row = (r: number, bytes: number[]): void => {
    for (let i = 0; i < STRIDE; i++) g[r * STRIDE + i] = bytes[i];
  };
  row(1, [0xf0, 0xff, 0xff, 0xff, 0xff, 0x0f]);
  row(2, [0x08, 0, 0, 0, 0, 0x10]);
  row(3, [0x04, 0, 0, 0, 0, 0x20]);
  for (let r = 4; r <= 33; r++) row(r, [0x02, 0, 0, 0, 0, 0x40]);
  row(34, [0x04, 0, 0, 0, 0, 0x20]);
  row(35, [0x08, 0, 0, 0, 0, 0x10]);
  row(36, [0xf0, 0xff, 0xff, 0xff, 0xff, 0x0f]);
  return g;
}

/** Plots points scaled to fit the icon (pyembroidery draw_scaled). */
function drawScaled(e: Extents, pts: Rec[], g: number[], buffer: number): void {
  const gw = STRIDE * 8;
  const gh = g.length / STRIDE;
  const dw = e.maxX - e.minX || 1;
  const dh = e.maxY - e.minY || 1;
  const scale = Math.min((gw - buffer) / dw, (gh - buffer) / dh);
  const tx = -((e.maxX + e.minX) / 2) * scale + gw / 2;
  const ty = -((e.maxY + e.minY) / 2) * scale + gh / 2;
  for (const p of pts) {
    const x = Math.floor(p.x * scale + tx);
    const y = Math.floor(p.y * scale + ty);
    const idx = y * STRIDE + Math.trunc(x / 8);
    if (x < 0 || y < 0 || idx < 0 || idx >= g.length) continue;
    g[idx] |= 1 << (x % 8);
  }
}

/**
 * Assigns each thread a PEC palette index; distinct colors get distinct
 * indices (pyembroidery build_unique_palette, first-appearance order).
 */
export function pecColorIndices(threads: { rgb: number }[]): number[] {
  const avail: (number | null)[] = PEC_RGB.slice();
  const chart: (number | null)[] = new Array<number | null>(avail.length).fill(null);
  const seen = new Set<number>();
  for (const t of threads) {
    if (seen.has(t.rgb)) continue;
    seen.add(t.rgb);
    const idx = nearestColorIndex(t.rgb, avail);
    if (idx < 0) break;
    avail[idx] = null;
    chart[idx] = t.rgb;
  }
  return threads.map((t) => {
    const i = nearestColorIndex(t.rgb, chart);
    return i < 0 ? nearestColorIndex(t.rgb, PEC_RGB) : i;
  });
}

function writeValue(w: ByteWriter, v: number, long: boolean, flag: number): void {
  if (!long && v > -64 && v < 63) {
    w.u8(v & 0x7f);
  } else {
    const code = (v & 0x0fff) | 0x8000 | (flag << 8);
    w.u8((code >> 8) & 0xff).u8(code & 0xff);
  }
}

/** PEC stitch encoding (pyembroidery pec_encode, with explicit jump/trim flags). */
export function pecEncode(recs: Rec[], w: ByteWriter): void {
  let colorTwo = true;
  let jumping = true;
  /** A TRIM was seen and no jump has carried it yet. */
  let trimPending = false;
  /** Jumps since the last stitch belong to a trim. */
  let trimRun = false;
  let px = 0, py = 0;
  const stitch = (dx: number, dy: number): void => {
    writeValue(w, dx, false, 0);
    writeValue(w, dy, false, 0);
  };
  for (const r of recs) {
    const dx = r.x - px;
    const dy = r.y - py;
    px = r.x;
    py = r.y;
    switch (r.c) {
      case CMD.STITCH:
        if (trimPending) {
          // Trim with no move: zero-length trim-jump.
          writeValue(w, 0, true, TRIM_CODE);
          writeValue(w, 0, true, TRIM_CODE);
          trimPending = false;
          jumping = true;
        }
        trimRun = false;
        if (jumping) {
          if (dx !== 0 && dy !== 0) stitch(0, 0);
          jumping = false;
        }
        stitch(dx, dy);
        break;
      case CMD.JUMP: {
        trimRun = trimRun || trimPending;
        trimPending = false;
        const flag = trimRun ? TRIM_CODE : JUMP_CODE;
        writeValue(w, dx, true, flag);
        writeValue(w, dy, true, flag);
        jumping = true;
        break;
      }
      case CMD.TRIM:
        trimPending = true;
        break;
      case CMD.COLOR_CHANGE:
        trimPending = false; // the color change cuts the thread anyway
        trimRun = false;
        if (jumping) {
          stitch(0, 0);
          jumping = false;
        }
        w.u8(0xfe).u8(0xb0).u8(colorTwo ? 2 : 1);
        colorTwo = !colorTwo;
        break;
      case CMD.END:
        w.u8(0xff);
        return;
      default:
        break;
    }
  }
  w.u8(0xff);
}

/**
 * Writes the PEC section (header + stitch block + graphics) for an already
 * normalized pattern (STOPs converted to duplicate color changes).
 */
export function writePecSection(w: ByteWriter, norm: Normalized): void {
  const e = recExtents(norm.recs);
  const threads = norm.threads.length ? norm.threads : [{ rgb: 0, hex: '#000000', name: 'Black', chartCode: null, brand: null }];
  const name = asciiSafe(norm.name, 8);

  // --- Header (512 bytes) ---
  w.ascii(`LA:${name.padEnd(16, ' ')}\r`);
  w.fill(0x20, 12).u8(0xff).u8(0x00);
  w.u8(STRIDE).u8(PEC_ICON_HEIGHT);
  const indices = pecColorIndices(threads);
  if (indices.length > 255) throw new Error('Too many color changes for PEC (max 255)');
  w.fill(0x20, 12);
  w.u8(indices.length - 1);
  w.bytes(indices);
  w.fill(0x20, 463 - indices.length);

  // --- Stitch block ---
  const start = w.length;
  w.u8(0).u8(0);
  w.u24le(0); // block length placeholder
  w.u8(0x31).u8(0xff).u8(0xf0);
  w.u16le(Math.round(e.maxX - e.minX));
  w.u16le(Math.round(e.maxY - e.minY));
  w.u16le(0x1e0);
  w.u16le(0x1b0);
  pecEncode(norm.recs, w);
  w.setU24le(start + 2, w.length - start);

  // --- Graphics: whole design, then one per color block ---
  const all = blankPecGraphic();
  const stitches = norm.recs.filter((r) => r.c === CMD.STITCH);
  drawScaled(e, stitches, all, 4);
  w.bytes(all);
  let block: Rec[] = [];
  const blocks: Rec[][] = [];
  for (const r of norm.recs) {
    if (r.c === CMD.STITCH) block.push(r);
    else if (r.c === CMD.COLOR_CHANGE) {
      blocks.push(block);
      block = [];
    }
  }
  blocks.push(block);
  for (let i = 0; i < threads.length; i++) {
    const g = blankPecGraphic();
    drawScaled(e, blocks[i] ?? [], g, 5);
    w.bytes(g);
  }
}

const signed12 = (v: number): number => {
  const b = v & 0xfff;
  return b > 0x7ff ? b - 0x1000 : b;
};
const signed7 = (v: number): number => (v > 63 ? v - 128 : v);

export interface PecReadResult {
  name: string;
  sink: RecordSink;
  /** PEC palette index per color block. */
  colorIndices: number[];
}

/** Reads a PEC section starting at `offset`. */
export function readPecSection(bytes: Uint8Array, offset: number): PecReadResult {
  const r = new ByteReader(bytes);
  r.seek(offset);
  if (r.ascii(3) !== 'LA:') throw new Error('Invalid PEC section');
  const name = r.ascii(16).trim();
  r.skip(15);
  r.u8(); // stride
  r.u8(); // icon height
  r.skip(12);
  const changes = r.u8();
  const colorIndices: number[] = [];
  for (let i = 0; i <= changes; i++) colorIndices.push(r.u8());
  r.seek(offset + 512 + 2);
  r.u24le(); // stitch block length (stitches are read up to the FF end marker)
  r.skip(11);

  const sink = new RecordSink();
  try {
    decodeStitches(r, sink);
  } catch {
    // Truncated stitch block: keep what was decoded.
  }
  return { name, sink, colorIndices };
}

function decodeStitches(r: ByteReader, sink: RecordSink): void {
  while (r.remaining > 0) {
    const v1 = r.u8();
    if (v1 === 0xff) break;
    let v2 = r.u8();
    if (v1 === 0xfe && v2 === 0xb0) {
      r.skip(1);
      sink.add(CMD.COLOR_CHANGE);
      continue;
    }
    let jump = false, trim = false;
    let x: number, y: number;
    if (v1 & 0x80) {
      if (v1 & TRIM_CODE) trim = true;
      if (v1 & JUMP_CODE) jump = true;
      x = signed12((v1 << 8) | v2);
      v2 = r.u8();
    } else {
      x = signed7(v1);
    }
    if (v2 & 0x80) {
      if (v2 & TRIM_CODE) trim = true;
      if (v2 & JUMP_CODE) jump = true;
      y = signed12((v2 << 8) | r.u8());
    } else {
      y = signed7(v2);
    }
    if (jump) sink.add(CMD.JUMP, x, y);
    else if (trim) {
      sink.add(CMD.TRIM);
      sink.add(CMD.JUMP, x, y);
    } else sink.add(CMD.STITCH, x, y);
  }
}

export function pecThread(index: number): ReadThread {
  const t = PEC_PALETTE[index % PEC_PALETTE.length] ?? PEC_PALETTE[0];
  return { hex: t.hex, name: t.name, chartCode: t.code, brand: 'Brother' };
}
