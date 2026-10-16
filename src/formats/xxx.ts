/**
 * Singer XXX writer.
 *
 * Ported from pyembroidery's XxxWriter
 * (MIT License, Copyright (c) 2018 Tatarize).
 *
 * Encoding choices:
 * - STITCH: dx, -dy as signed bytes when |d| < 124, else 7D dx16 -dy16.
 * - JUMP: 7F 01 dx -dy. TRIM: 7F 03 00 00.
 * - COLOR_CHANGE: 7F 08 00 00. STOP: same, with the thread repeated.
 * - END: 7F 7F 02 14 after the stitch data, followed by the color table.
 */
import type { StitchPattern } from '../model/types';
import { CMD } from '../model/types';
import { ByteWriter, normalize, recExtents } from './util';

export const XXX_MAX = 124;

export function writeXxx(p: StitchPattern): Uint8Array {
  const norm = normalize(p, { maxJump: XXX_MAX, maxStitch: XXX_MAX, fullJump: false, stopAsColorChange: true });
  const recs = norm.recs;
  const e = recExtents(recs);
  const last = recs[recs.length - 1];
  const w = new ByteWriter(512 + recs.length * 4);

  // Header (0x100 bytes including the end-of-stitches pointer).
  w.fill(0, 0x17);
  w.u32le(recs.length - 1); // END is not counted
  w.fill(0, 0x0c);
  w.u32le(norm.threads.length);
  w.u16le(0);
  w.u16le(e.maxX - e.minX);
  w.u16le(e.maxY - e.minY);
  w.u16le(last.x);
  w.u16le(-last.y);
  w.u16le(-e.minX);
  w.u16le(e.maxY);
  w.fill(0, 0x42);
  w.u16le(0).u16le(0);
  w.fill(0, 0x73);
  w.u16le(0x20);
  w.fill(0, 0x08);
  const endPtr = w.length;
  w.u32le(0);

  let px = 0, py = 0;
  for (const r of recs) {
    const dx = r.x - px;
    const dy = r.y - py;
    px = r.x;
    py = r.y;
    if (r.c === CMD.END) break;
    switch (r.c) {
      case CMD.COLOR_CHANGE:
      case CMD.STOP:
        w.u8(0x7f).u8(0x08).i8(dx).i8(-dy);
        break;
      case CMD.STITCH:
        if (dx > -124 && dx < 124 && dy > -124 && dy < 124) w.i8(dx).i8(-dy);
        else w.u8(0x7d).u16le(dx).u16le(-dy);
        break;
      case CMD.TRIM:
        w.u8(0x7f).u8(0x03).i8(dx).i8(-dy);
        break;
      case CMD.JUMP:
        w.u8(0x7f).u8(0x01).i8(dx).i8(-dy);
        break;
    }
  }
  w.setU32le(endPtr, w.length);
  w.u8(0x7f).u8(0x7f).u8(0x02).u8(0x14);

  // Color table.
  w.u8(0).u8(0);
  for (const t of norm.threads) w.u8(0).u8(t.rgb >> 16).u8(t.rgb >> 8).u8(t.rgb);
  for (let i = norm.threads.length; i < 21; i++) w.u32le(0);
  w.u32le(0xffffff00);
  w.u8(0).u8(1);
  return w.toBytes();
}
