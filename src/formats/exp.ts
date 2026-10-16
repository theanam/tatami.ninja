/**
 * Melco / Bernina EXP writer/reader (headerless 2-byte deltas, no colors).
 *
 * Ported from pyembroidery's ExpWriter / ExpReader
 * (MIT License, Copyright (c) 2018 Tatarize).
 *
 * Encoding choices:
 * - STITCH: dx, -dy (signed bytes, max 127).
 * - JUMP: 80 04 dx -dy.
 * - TRIM: 80 80 07 00.
 * - COLOR_CHANGE and STOP: 80 01 00 00.
 * - END: nothing (end of file).
 */
import type { StitchPattern } from '../model/types';
import { CMD } from '../model/types';
import { ByteWriter, RecordSink, finishRead, normalize } from './util';

export const EXP_MAX = 127;

export function writeExp(p: StitchPattern): Uint8Array {
  const norm = normalize(p, { maxJump: EXP_MAX, maxStitch: EXP_MAX, fullJump: true, stopAsColorChange: true });
  const w = new ByteWriter(norm.recs.length * 4);
  let px = 0, py = 0;
  for (const r of norm.recs) {
    const dx = r.x - px;
    const dy = r.y - py;
    px = r.x;
    py = r.y;
    switch (r.c) {
      case CMD.STITCH:
        w.i8(dx).i8(-dy);
        break;
      case CMD.JUMP:
        w.u8(0x80).u8(0x04).i8(dx).i8(-dy);
        break;
      case CMD.TRIM:
        w.u8(0x80).u8(0x80).u8(0x07).u8(0x00);
        break;
      case CMD.COLOR_CHANGE:
      case CMD.STOP:
        w.u8(0x80).u8(0x01).u8(0x00).u8(0x00);
        break;
      default:
        break;
    }
  }
  return w.toBytes();
}

const s8 = (b: number): number => (b > 127 ? b - 256 : b);

export function readExp(bytes: Uint8Array): StitchPattern {
  const sink = new RecordSink();
  let i = 0;
  while (i + 2 <= bytes.length) {
    const b0 = bytes[i], b1 = bytes[i + 1];
    i += 2;
    if (b0 !== 0x80) {
      sink.add(CMD.STITCH, s8(b0), -s8(b1));
      continue;
    }
    if (i + 2 > bytes.length) break;
    const x = s8(bytes[i]);
    const y = -s8(bytes[i + 1]);
    i += 2;
    if (b1 === 0x80) sink.add(CMD.TRIM);
    else if (b1 === 0x02) sink.add(CMD.STITCH, x, y);
    else if (b1 === 0x04) sink.add(CMD.JUMP, x, y);
    else if (b1 === 0x01) {
      sink.add(CMD.COLOR_CHANGE);
      if (x !== 0 || y !== 0) sink.add(CMD.JUMP, x, y);
    } else break;
  }
  return finishRead(sink, [], 'Untitled');
}
