/**
 * Husqvarna Viking / Pfaff VP3 writer.
 *
 * Ported from pyembroidery's Vp3Writer
 * (MIT License, Copyright (c) 2018 Tatarize).
 *
 * Encoding choices:
 * - VP3 has no jump command: jumps are folded into the next stitch, which
 *   uses the long form (80 01 dx16 dy16 80 02) when beyond +-127.
 * - TRIM: 80 03. END: 80 03 (explicit final trim).
 * - COLOR_CHANGE: starts a new color block. STOP: a new color block with the
 *   same thread (the machine pauses at each block).
 * Units in the header are 1/1000 mm (0.1 mm * 100).
 */
import type { StitchPattern } from '../model/types';
import { CMD } from '../model/types';
import type { Extents, NormThread, Rec } from './util';
import { ByteWriter, normalize, recExtents } from './util';

const PRODUCER = 'Produced by     Software Ltd';

function string16(w: ByteWriter, s: string): void {
  w.u16be(s.length * 2);
  w.utf16be(s);
}

/** UTF-8 string with a 16-bit big-endian byte length. */
function string8(w: ByteWriter, s: string): void {
  const b = new TextEncoder().encode(s);
  w.u16be(b.length);
  w.bytes(b);
}

/** Reserves a 32-bit "distance to end of block" field; returns a patcher. */
function placeholder(w: ByteWriter): () => void {
  const at = w.length;
  w.u32be(0);
  return () => w.setU32be(at, w.length - at - 4);
}

function colorBlocks(recs: Rec[]): Rec[][] {
  const out: Rec[][] = [];
  let start = 0;
  for (let i = 0; i < recs.length; i++) {
    if (recs[i].c === CMD.COLOR_CHANGE) {
      out.push(recs.slice(start, i));
      start = i;
    }
  }
  out.push(recs.slice(start));
  return out;
}

function writeStitches(w: ByteWriter, recs: Rec[], fx: number, fy: number): void {
  w.u8(0).u8(1).u8(0);
  const done = placeholder(w);
  w.u8(0x0a).u8(0xf6).u8(0x00);
  let lx = fx, ly = fy;
  for (const r of recs) {
    if (r.c === CMD.END || r.c === CMD.TRIM) {
      w.u8(0x80).u8(0x03);
      if (r.c === CMD.END) break;
      continue;
    }
    if (r.c !== CMD.STITCH) continue; // jumps fold into the next stitch
    const dx = r.x - lx;
    const dy = r.y - ly;
    lx += dx;
    ly += dy;
    if (dx >= -127 && dx <= 127 && dy >= -127 && dy <= 127) {
      w.i8(dx).i8(dy);
    } else {
      w.u8(0x80).u8(0x01).u16be(dx).u16be(dy).u8(0x80).u8(0x02);
    }
  }
  done();
}

function writeThread(w: ByteWriter, t: NormThread): void {
  w.u8(1).u8(0); // single color, no transition
  w.u24be(t.rgb);
  w.bytes([0, 0, 0, 5, 0x28]); // no parts, no length, rayon 40wt
  string8(w, t.chartCode ?? '');
  string8(w, t.name || t.hex);
  string8(w, t.brand ?? '');
}

function writeColorBlock(w: ByteWriter, first: boolean, cx: number, cy: number, recs: Rec[], t: NormThread): void {
  w.u8(0).u8(5).u8(0);
  const done = placeholder(w);
  let fx = 0, fy = 0, lx = 0, ly = 0;
  if (recs.length) {
    fx = first ? 0 : recs[0].x;
    fy = first ? 0 : recs[0].y;
    lx = recs[recs.length - 1].x;
    ly = recs[recs.length - 1].y;
  }
  w.u32be(Math.trunc(fx - cx) * 100);
  w.u32be(Math.trunc(-(fy - cy)) * 100);
  writeThread(w, t);
  w.u32be(Math.trunc(lx - fx) * 100);
  w.u32be(Math.trunc(-(ly - fy)) * 100);
  writeStitches(w, recs, fx, fy);
  w.u8(0);
  done();
}

function writeDesign(w: ByteWriter, e: Extents, blocks: Rec[][], threads: NormThread[]): void {
  w.u8(0).u8(3).u8(0);
  const done = placeholder(w);
  const width = e.maxX - e.minX;
  const height = e.maxY - e.minY;
  const hw = width / 2;
  const hh = height / 2;
  const cx = e.maxX - hw;
  const cy = e.maxY - hh;
  w.u32be(Math.trunc(cx) * 100);
  w.u32be(Math.trunc(cy) * -100);
  w.u8(0).u8(0).u8(0);
  w.u32be(Math.trunc(hw) * -100);
  w.u32be(Math.trunc(hw) * 100);
  w.u32be(Math.trunc(hh) * -100);
  w.u32be(Math.trunc(hh) * 100);
  w.u32be(width * 100);
  w.u32be(height * 100);
  string16(w, '');
  w.u8(0x64).u8(0x64);
  w.u32be(4096).u32be(0).u32be(0).u32be(4096);
  w.ascii('xxPP').u8(1).u8(0);
  string16(w, PRODUCER);
  w.u16be(blocks.length);
  blocks.forEach((b, i) => writeColorBlock(w, i === 0, cx, cy, b, threads[i] ?? threads[threads.length - 1]));
  done();
}

export function writeVp3(p: StitchPattern): Uint8Array {
  const norm = normalize(p, { maxJump: 3200, maxStitch: 255, fullJump: false, stopAsColorChange: true });
  const threads: NormThread[] = norm.threads.length
    ? norm.threads
    : [{ hex: '#000000', name: 'Black', rgb: 0, chartCode: null, brand: null }];
  const w = new ByteWriter(1024 + norm.recs.length * 2);
  w.ascii('%vsm%').u8(0);
  string16(w, PRODUCER);
  w.u8(0).u8(2).u8(0);
  const done = placeholder(w);
  string16(w, '');
  const blocks = colorBlocks(norm.recs);
  const e = recExtents(norm.recs);
  w.u32be(e.maxX * 100);
  w.u32be(e.minY * -100);
  w.u32be(e.minX * 100);
  w.u32be(e.maxY * -100);
  const ends = norm.recs.filter((r) => r.c === CMD.END).length;
  w.u32be(norm.recs.length - ends);
  w.u8(0);
  w.u8(blocks.length);
  w.u8(12);
  w.u8(0);
  w.u8(1); // one design
  writeDesign(w, e, blocks, threads);
  done();
  return w.toBytes();
}
