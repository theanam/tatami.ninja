/**
 * Janome JEF writer/reader.
 *
 * Ported from pyembroidery's JefWriter / JefReader
 * (MIT License, Copyright (c) 2018 Tatarize).
 *
 * Encoding choices:
 * - JUMP: 80 02 dx dy. TRIM: not written by default (Janome machines trim
 *   jumps per their own settings; pyembroidery default). With
 *   `explicitTrims`, a TRIM is three zero-length jumps (pyembroidery "trims").
 * - COLOR_CHANGE: 80 01 00 00 with the next palette entry.
 * - STOP: 80 01 00 00 too, with palette entries alternating between 0 (stop
 *   marker) and the current color, as pyembroidery does.
 * - END: 80 10.
 * Hoop code is chosen from the design extents.
 */
import type { StitchPattern } from '../model/types';
import { CMD } from '../model/types';
import { JEF_PALETTE, JEF_RGB } from './jefPalette';
import type { ReadThread } from './util';
import { ByteReader, ByteWriter, RecordSink, finishRead, nearestColorIndex, normalize, recExtents } from './util';

export const JEF_MAX = 127;

export const JEF_HOOP = {
  HOOP_110X110: 0,
  HOOP_50X50: 1,
  HOOP_140X200: 2,
  HOOP_126X110: 3,
  HOOP_200X200: 4,
} as const;

/** Smallest standard hoop that fits (width/height in 0.1 mm). */
export function jefHoopCode(width: number, height: number): number {
  if (width < 500 && height < 500) return JEF_HOOP.HOOP_50X50;
  if (width < 1260 && height < 1100) return JEF_HOOP.HOOP_126X110;
  if (width < 1400 && height < 2000) return JEF_HOOP.HOOP_140X200;
  if (width < 2000 && height < 2000) return JEF_HOOP.HOOP_200X200;
  return JEF_HOOP.HOOP_110X110;
}

export interface JefOptions {
  /** 14-digit timestamp YYYYMMDDHHMMSS; fixed by default for deterministic output. */
  date?: string;
  /** Write TRIM as three zero-length jumps. Default false. */
  explicitTrims?: boolean;
}

const DEFAULT_DATE = '20240101000000';

function writeHoopEdge(w: ByteWriter, x: number, y: number): void {
  if (Math.min(x, y) >= 0) w.u32le(x).u32le(y).u32le(x).u32le(y);
  else w.u32le(-1).u32le(-1).u32le(-1).u32le(-1);
}

export function writeJef(p: StitchPattern, opts: JefOptions = {}): Uint8Array {
  const norm = normalize(p, { maxJump: JEF_MAX, maxStitch: JEF_MAX, fullJump: true });
  const recs = norm.recs;
  const trimCount = 3;

  // Palette: one entry per color block and per STOP (pyembroidery patch logic).
  const palette: number[] = [];
  let threadIdx = 0;
  let lastIndex = -1;
  let lastRgb = -1;
  let toggled = false;
  for (let i = 0; i < recs.length; i++) {
    const c = recs[i].c;
    if (c === CMD.COLOR_CHANGE || threadIdx === 0) {
      const t = norm.threads[threadIdx] ?? norm.threads[norm.threads.length - 1];
      threadIdx++;
      const rgb = t ? t.rgb : 0;
      let idx = nearestColorIndex(rgb, JEF_RGB);
      if (idx === lastIndex && rgb !== lastRgb) {
        // Neighboring different threads must not share a JEF color.
        const alt = JEF_RGB.slice();
        alt[idx] = null;
        idx = nearestColorIndex(rgb, alt);
      }
      palette.push(idx);
      lastIndex = idx;
      lastRgb = rgb;
      toggled = false;
    }
    if (c === CMD.STOP) {
      toggled = !toggled;
      palette.push(toggled ? 0 : lastIndex);
    }
  }
  const colorCount = palette.length;

  let pointCount = 1; // END
  for (const r of recs) {
    if (r.c === CMD.STITCH) pointCount += 1;
    else if (r.c === CMD.JUMP) pointCount += 2;
    else if (r.c === CMD.TRIM) pointCount += opts.explicitTrims ? 2 * trimCount : 0;
    else if (r.c === CMD.COLOR_CHANGE || r.c === CMD.STOP) pointCount += 2;
  }

  const e = recExtents(recs);
  const width = e.maxX - e.minX;
  const height = e.maxY - e.minY;
  const hw = Math.round(width / 2);
  const hh = Math.round(height / 2);
  const date = (opts.date ?? DEFAULT_DATE).replace(/\D/g, '').padEnd(14, '0').slice(0, 14);

  const w = new ByteWriter(0x74 + colorCount * 8 + recs.length * 4 + 2);
  w.u32le(0x74 + colorCount * 8); // stitch data offset
  w.u32le(0x14);
  w.ascii(date);
  w.u8(0).u8(0);
  w.u32le(colorCount);
  w.u32le(pointCount);
  w.u32le(jefHoopCode(width, height));
  w.u32le(hw).u32le(hh).u32le(hw).u32le(hh); // extents from center
  writeHoopEdge(w, 550 - hw, 550 - hh); // 110x110
  writeHoopEdge(w, 250 - hw, 250 - hh); // 50x50
  writeHoopEdge(w, 700 - hw, 1000 - hh); // 140x200
  writeHoopEdge(w, 700 - hw, 1000 - hh); // custom
  for (const idx of palette) w.u32le(idx);
  for (let i = 0; i < colorCount; i++) w.u32le(0x0d);

  let px = 0, py = 0;
  for (const r of recs) {
    const dx = r.x - px;
    const dy = r.y - py;
    px = r.x;
    py = r.y;
    switch (r.c) {
      case CMD.STITCH:
        w.i8(dx).i8(-dy);
        break;
      case CMD.COLOR_CHANGE:
      case CMD.STOP:
        w.u8(0x80).u8(0x01).i8(dx).i8(-dy);
        break;
      case CMD.TRIM:
        if (opts.explicitTrims) for (let k = 0; k < trimCount; k++) w.u8(0x80).u8(0x02).u8(0).u8(0);
        break;
      case CMD.JUMP:
        w.u8(0x80).u8(0x02).i8(dx).i8(-dy);
        break;
      default:
        break;
    }
  }
  w.u8(0x80).u8(0x10);
  return w.toBytes();
}

export function readJef(bytes: Uint8Array): StitchPattern {
  const r = new ByteReader(bytes);
  if (bytes.length < 0x74) throw new Error('Not a JEF file (too short)');
  const stitchOffset = r.u32le();
  r.skip(20);
  const colorCount = r.u32le();
  if (stitchOffset > bytes.length || colorCount > 1000) throw new Error('Not a JEF file (bad header)');
  r.skip(88);
  const palette: number[] = [];
  for (let i = 0; i < colorCount; i++) palette.push(Math.abs(r.i32le()));

  const toThread = (idx: number): ReadThread => {
    const t = JEF_PALETTE[idx % JEF_PALETTE.length];
    return { hex: t.hex, name: t.name, chartCode: t.code, brand: 'Janome' };
  };
  const threads: ReadThread[] = [];
  let pi = 0;
  if (palette.length) threads.push(toThread(palette[pi++] || 1));

  r.seek(stitchOffset);
  const sink = new RecordSink();
  while (r.remaining >= 2) {
    const b0 = r.u8(), b1 = r.u8();
    if (b0 !== 0x80) {
      sink.add(CMD.STITCH, b0 > 127 ? b0 - 256 : b0, -(b1 > 127 ? b1 - 256 : b1));
      continue;
    }
    if (b1 === 0x10 || r.remaining < 2) break;
    const x = r.i8();
    const y = -r.i8();
    if (b1 === 0x02) sink.add(CMD.JUMP, x, y);
    else if (b1 === 0x01) {
      const idx = palette[pi++];
      if (idx === 0) sink.add(CMD.STOP, x, y);
      else {
        sink.add(CMD.COLOR_CHANGE, x, y);
        if (idx !== undefined) threads.push(toThread(idx));
      }
    } else break;
  }
  // Janome has no trim command: infer trims from jumps longer than 3 mm.
  return finishRead(sink, threads, 'Untitled', { trimAtDistance: 30 });
}
