/**
 * Husqvarna Viking HUS writer.
 *
 * Layout follows pyembroidery's HusReader (MIT License, Copyright (c) 2018
 * Tatarize) and libembroidery's writer: a 0x2A-byte header, one 16-bit HUS
 * palette index per color, then three separately compressed streams
 * (commands, x deltas, y deltas).
 *
 * Encoding choices:
 * - Commands: 0x80 stitch, 0x81 jump, 0x84 color change, 0x88 trim, 0x90 end.
 * - Deltas: signed bytes (max 127), y inverted (+y up).
 * - STOP: color change to the same (repeated) thread.
 */
import type { StitchPattern } from '../model/types';
import { CMD } from '../model/types';
import { husCompress } from './embCompress';
import { HUS_RGB } from './husPalette';
import { ByteWriter, nearestColorIndex, normalize, recExtents } from './util';

export const HUS_MAX = 127;
export const HUS_MAGIC = 0x00c8af5b;

const CODE: Record<number, number> = {
  [CMD.STITCH]: 0x80,
  [CMD.JUMP]: 0x81,
  [CMD.COLOR_CHANGE]: 0x84,
  [CMD.TRIM]: 0x88,
  [CMD.END]: 0x90,
};

export function writeHus(p: StitchPattern): Uint8Array {
  const norm = normalize(p, { maxJump: HUS_MAX, maxStitch: HUS_MAX, fullJump: false, stopAsColorChange: true });
  const recs = norm.recs.filter((r) => CODE[r.c] !== undefined);
  const n = recs.length;
  const cmds = new Uint8Array(n);
  const xs = new Uint8Array(n);
  const ys = new Uint8Array(n);
  let px = 0, py = 0;
  recs.forEach((r, i) => {
    cmds[i] = CODE[r.c];
    xs[i] = (r.x - px) & 0xff;
    ys[i] = -(r.y - py) & 0xff;
    px = r.x;
    py = r.y;
  });
  const cmdZ = husCompress(cmds);
  const xZ = husCompress(xs);
  const yZ = husCompress(ys);

  const colors = norm.threads.map((t) => Math.max(0, nearestColorIndex(t.rgb, HUS_RGB)));
  if (colors.length === 0) colors.push(0);
  const e = recExtents(recs);
  const cmdOffset = 0x2a + 2 * colors.length;

  const w = new ByteWriter(cmdOffset + cmdZ.length + xZ.length + yZ.length);
  w.u32le(HUS_MAGIC);
  w.u32le(n);
  w.u32le(colors.length);
  w.u16le(e.maxX); // +x extent
  w.u16le(-e.minY); // +y extent (y up)
  w.u16le(e.minX); // -x extent
  w.u16le(-e.maxY); // -y extent
  w.u32le(cmdOffset);
  w.u32le(cmdOffset + cmdZ.length);
  w.u32le(cmdOffset + cmdZ.length + xZ.length);
  w.fill(0, 8); // name/string field
  w.u16le(0);
  for (const c of colors) w.u16le(c);
  w.bytes(cmdZ).bytes(xZ).bytes(yZ);
  return w.toBytes();
}
