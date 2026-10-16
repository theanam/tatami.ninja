/**
 * Brother PES (version 1, "#PES0001") writer and PES/PEC reader.
 *
 * Ported from pyembroidery's PesWriter / PesReader
 * (MIT License, Copyright (c) 2018 Tatarize).
 *
 * The file is a minimal PES v1 header with one CEmbOne/CSewSeg object (used
 * by PE-Design and some machines) followed by the PEC section, which is what
 * Brother / Baby Lock machines actually sew from. STOP is written as a
 * color change to the same (duplicated) thread; TRIM as trim-flagged jumps.
 */
import type { StitchPattern } from '../model/types';
import { CMD } from '../model/types';
import { PEC_RGB } from './pecPalette';
import { PEC_MAX, pecThread, readPecSection, writePecSection } from './pec';
import type { Normalized, ReadThread, Rec } from './util';
import { ByteReader, ByteWriter, finishRead, nearestColorIndex, normalize, recExtents, rgbToHex } from './util';

export const PES_MAGIC = '#PES0001';

export function normalizeForPes(p: StitchPattern): Normalized {
  return normalize(p, { maxJump: PEC_MAX, maxStitch: PEC_MAX, fullJump: true, stopAsColorChange: true });
}

/** Splits records into runs of the same command (pyembroidery get_as_command_blocks). */
function commandBlocks(recs: Rec[]): Rec[][] {
  const out: Rec[][] = [];
  let cur: Rec[] = [];
  for (const r of recs) {
    if (cur.length && cur[0].c !== r.c) {
      out.push(cur);
      cur = [];
    }
    cur.push(r);
  }
  if (cur.length) out.push(cur);
  return out;
}

function writeSewSegments(w: ByteWriter, norm: Normalized, adjX: number, adjY: number): number {
  const codeOf = (i: number): number => {
    const t = norm.threads[i] ?? norm.threads[norm.threads.length - 1];
    return t ? nearestColorIndex(t.rgb, PEC_RGB) : 20;
  };
  let colorIndex = 0;
  let colorCode = codeOf(colorIndex);
  let sx = 0, sy = 0;
  let section = 0;
  let prevCode = -1;
  let first = true;
  const colorLog: [number, number][] = [];
  for (const block of commandBlocks(norm.recs)) {
    const c = block[0].c;
    let pts: [number, number][];
    let flag: number;
    if (c === CMD.JUMP) {
      const last = block[block.length - 1];
      pts = [[sx - adjX, sy - adjY], [last.x - adjX, last.y - adjY]];
      flag = 1;
    } else if (c === CMD.COLOR_CHANGE) {
      colorIndex += block.length;
      colorCode = codeOf(colorIndex);
      continue;
    } else if (c === CMD.STITCH) {
      pts = [];
      for (const r of block) {
        sx = r.x;
        sy = r.y;
        pts.push([sx - adjX, sy - adjY]);
      }
      flag = 0;
    } else continue;
    if (!first) w.u16le(0x8003); // section end
    first = false;
    if (prevCode !== colorCode) {
      colorLog.push([section, colorCode]);
      prevCode = colorCode;
    }
    w.u16le(flag).u16le(colorCode).u16le(pts.length);
    for (const [x, y] of pts) w.u16le(x).u16le(y);
    section++;
  }
  w.u16le(colorLog.length);
  for (const [s, code] of colorLog) w.u16le(s).u16le(code);
  return section;
}

export function writePes(p: StitchPattern): Uint8Array {
  const norm = normalizeForPes(p);
  const w = new ByteWriter(4096 + norm.recs.length * 6);
  w.ascii(PES_MAGIC);
  const pecPtr = w.length;
  w.u32le(0);

  const hasStitches = norm.recs.some((r) => r.c === CMD.STITCH);
  if (!hasStitches) {
    w.u16le(1).u16le(1).u16le(0); // scale-to-fit, hoop 130x180, 0 objects
    w.u16le(0).u16le(0);
  } else {
    w.u16le(1).u16le(1).u16le(1);
    w.u16le(0xffff).u16le(0);
    const e = recExtents(norm.recs);
    const width = e.maxX - e.minX;
    const height = e.maxY - e.minY;
    // CEmbOne
    w.u16le(7).ascii('CEmbOne');
    w.fill(0, 16); // two zeroed bounding boxes
    // Affine transform placing the design in PE-Design's page (130x180 hoop).
    w.f32le(1).f32le(0).f32le(0).f32le(1);
    w.f32le(350 + 1300 / 2 - width / 2);
    w.f32le(100 + height + 1800 / 2 - height / 2);
    w.u16le(1).u16le(0).u16le(0);
    w.u16le(width).u16le(height);
    w.fill(0, 8);
    const sectionsPtr = w.length;
    w.u16le(0);
    w.u16le(0xffff).u16le(0); // more blocks follow
    // CSewSeg
    w.u16le(7).ascii('CSewSeg');
    const sections = writeSewSegments(w, norm, e.minX, e.maxY);
    w.setU16le(sectionsPtr, sections);
    w.u16le(0).u16le(0); // no more blocks
  }
  w.setU32le(pecPtr, w.length);
  writePecSection(w, norm);
  return w.toBytes();
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

/** Byte skips (after metadata, after image string) per PES version with thread tables. */
const THREAD_HEADER_SKIPS: Record<string, { hoopString: boolean; a: number; b: number }> = {
  '#PES0050': { hoopString: false, a: 24, b: 24 },
  '#PES0055': { hoopString: false, a: 24, b: 24 },
  '#PES0056': { hoopString: false, a: 24, b: 24 },
  '#PES0060': { hoopString: false, a: 36, b: 24 },
  '#PES0070': { hoopString: false, a: 36, b: 24 },
  '#PES0080': { hoopString: false, a: 38, b: 26 },
  '#PES0090': { hoopString: true, a: 30, b: 34 },
  '#PES0100': { hoopString: true, a: 38, b: 34 },
};

function readPesString(r: ByteReader): string {
  const n = r.u8();
  return n ? r.ascii(n) : '';
}

/** Reads the PES v5+ thread table; returns [] on anything unexpected. */
function readPesThreads(bytes: Uint8Array, magic: string): { threads: ReadThread[]; name: string } {
  const spec = THREAD_HEADER_SKIPS[magic];
  if (!spec) return { threads: [], name: '' };
  try {
    const r = new ByteReader(bytes);
    r.seek(12);
    r.skip(4);
    const name = readPesString(r);
    for (let i = 0; i < 4; i++) readPesString(r); // category, author, keywords, comments
    if (spec.hoopString) {
      r.skip(14);
      readPesString(r);
    }
    r.skip(spec.a);
    readPesString(r); // image file
    r.skip(spec.b);
    if (r.u16le() !== 0) return { threads: [], name }; // programmable fills
    if (r.u16le() !== 0) return { threads: [], name }; // motifs
    if (r.u16le() !== 0) return { threads: [], name }; // feather patterns
    const count = r.u16le();
    const threads: ReadThread[] = [];
    for (let i = 0; i < count; i++) {
      const code = readPesString(r);
      const rgb = r.u24be();
      r.skip(5);
      const desc = readPesString(r);
      const brand = readPesString(r);
      readPesString(r); // chart
      threads.push({ hex: rgbToHex(rgb), name: desc || code || rgbToHex(rgb), chartCode: code || null, brand: brand || undefined });
    }
    return { threads, name };
  } catch {
    return { threads: [], name: '' };
  }
}

/** Maps PEC color bytes to threads, preferring PES header threads (pyembroidery map_pec_colors). */
function mapColors(indices: number[], chart: ReadThread[]): ReadThread[] {
  if (chart.length === 0) return indices.map(pecThread);
  if (chart.length >= indices.length) return chart.slice(0, indices.length);
  const pool = chart.slice();
  const byIndex = new Map<number, ReadThread>();
  return indices.map((idx) => {
    let t = byIndex.get(idx);
    if (!t) {
      t = pool.shift() ?? pecThread(idx);
      byIndex.set(idx, t);
    }
    return t;
  });
}

export function readPes(bytes: Uint8Array): StitchPattern {
  if (bytes.length < 12) throw new Error('Not a PES file (too short)');
  const magic = String.fromCharCode(...bytes.slice(0, 8));
  let pecOffset: number;
  let header = { threads: [] as ReadThread[], name: '' };
  if (magic === '#PEC0001') {
    pecOffset = 8;
  } else if (magic.startsWith('#PES')) {
    const r = new ByteReader(bytes);
    r.seek(8);
    pecOffset = r.u32le();
    header = readPesThreads(bytes, magic);
  } else {
    throw new Error('Not a PES file (bad signature)');
  }
  if (pecOffset + 532 > bytes.length) throw new Error('PES file is truncated (PEC section missing)');
  const pec = readPecSection(bytes, pecOffset);
  const threads = mapColors(pec.colorIndices, header.threads);

  // Consecutive identical colors encode a STOP (pyembroidery interpolate_duplicate_color_as_stop).
  const sink = pec.sink;
  const outThreads: ReadThread[] = threads.length ? [threads[0]] : [];
  let block = 0;
  for (let i = 0; i < sink.cmds.length; i++) {
    if (sink.cmds[i] !== CMD.COLOR_CHANGE) continue;
    block++;
    const prev = threads[block - 1];
    const cur = threads[block];
    if (prev && cur && prev.hex === cur.hex && prev.name === cur.name) sink.cmds[i] = CMD.STOP;
    else if (cur) outThreads.push(cur);
  }
  return finishRead(sink, outThreads, header.name || pec.name || 'Untitled');
}
