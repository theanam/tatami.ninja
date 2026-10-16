/**
 * Tajima DST writer/reader.
 *
 * Record encoding and trim convention ported from pyembroidery
 * (MIT License, Copyright (c) 2018 Tatarize).
 *
 * Encoding choices:
 * - TRIM: three jump records (+2,+2) (-4,-4) (+2,+2) (net zero). Tajima
 *   machines (and pyembroidery/Wilcom readers) treat a run of >= 3 jumps as a
 *   trim. Note that any un-trimmed jump needing >= 3 records (> 242 units)
 *   will also be read back as a trim by most software.
 * - COLOR_CHANGE and STOP: both the 0xC3 "color change / stop" record.
 * - END: 00 00 F3.
 */
import type { StitchPattern } from '../model/types';
import { CMD } from '../model/types';
import { ByteWriter, RecordSink, asciiSafe, finishRead, normalize, recExtents, hexToRgb, rgbToHex } from './util';
import type { ReadThread } from './util';

export const DST_MAX = 121;
const HEADER_SIZE = 512;

const bit = (b: number): number => 1 << b;

/** Encodes one 3-byte record. dx/dy in DST space (+y up). */
export function encodeDstRecord(dx: number, dy: number, kind: 'stitch' | 'jump' | 'color' | 'end'): [number, number, number] {
  if (kind === 'color') return [0, 0, 0xc3];
  if (kind === 'end') return [0, 0, 0xf3];
  let b0 = 0, b1 = 0, b2 = 0b00000011;
  if (kind === 'jump') b2 |= bit(7);
  let x = dx, y = dy;
  if (Math.abs(x) > DST_MAX || Math.abs(y) > DST_MAX) {
    throw new Error(`DST delta out of range: ${dx},${dy}`);
  }
  // Balanced ternary digits: 81, 27, 9, 3, 1.
  if (x > 40) { b2 |= bit(2); x -= 81; }
  if (x < -40) { b2 |= bit(3); x += 81; }
  if (x > 13) { b1 |= bit(2); x -= 27; }
  if (x < -13) { b1 |= bit(3); x += 27; }
  if (x > 4) { b0 |= bit(2); x -= 9; }
  if (x < -4) { b0 |= bit(3); x += 9; }
  if (x > 1) { b1 |= bit(0); x -= 3; }
  if (x < -1) { b1 |= bit(1); x += 3; }
  if (x > 0) { b0 |= bit(0); x -= 1; }
  if (x < 0) { b0 |= bit(1); x += 1; }
  if (y > 40) { b2 |= bit(5); y -= 81; }
  if (y < -40) { b2 |= bit(4); y += 81; }
  if (y > 13) { b1 |= bit(5); y -= 27; }
  if (y < -13) { b1 |= bit(4); y += 27; }
  if (y > 4) { b0 |= bit(5); y -= 9; }
  if (y < -4) { b0 |= bit(4); y += 9; }
  if (y > 1) { b1 |= bit(7); y -= 3; }
  if (y < -1) { b1 |= bit(6); y += 3; }
  if (y > 0) { b0 |= bit(7); y -= 1; }
  if (y < 0) { b0 |= bit(6); y += 1; }
  return [b0, b1, b2];
}

const getbit = (b: number, pos: number): number => (b >> pos) & 1;

/** Decodes dx, dy (DST space, +y up) from a record. */
export function decodeDstRecord(b0: number, b1: number, b2: number): [number, number] {
  const x =
    81 * (getbit(b2, 2) - getbit(b2, 3)) +
    27 * (getbit(b1, 2) - getbit(b1, 3)) +
    9 * (getbit(b0, 2) - getbit(b0, 3)) +
    3 * (getbit(b1, 0) - getbit(b1, 1)) +
    (getbit(b0, 0) - getbit(b0, 1));
  const y =
    81 * (getbit(b2, 5) - getbit(b2, 4)) +
    27 * (getbit(b1, 5) - getbit(b1, 4)) +
    9 * (getbit(b0, 5) - getbit(b0, 4)) +
    3 * (getbit(b1, 7) - getbit(b1, 6)) +
    (getbit(b0, 7) - getbit(b0, 6));
  return [x, y];
}

const pad = (n: number, w: number): string => String(n).padStart(w, ' ');
const signed = (n: number): string => (n >= 0 ? '+' : '-') + pad(Math.abs(n), 5);

export function writeDst(p: StitchPattern): Uint8Array {
  const norm = normalize(p, { maxJump: DST_MAX, maxStitch: DST_MAX, fullJump: false, stopAsColorChange: true });
  const body = new ByteWriter(norm.recs.length * 3 + 16);
  let px = 0, py = 0;
  let count = 0;
  let colors = 0;
  const rec = (r: [number, number, number]): void => {
    body.bytes(r);
    count++;
  };
  for (const r of norm.recs) {
    const dx = r.x - px;
    const dy = r.y - py;
    px = r.x;
    py = r.y;
    switch (r.c) {
      case CMD.STITCH:
        rec(encodeDstRecord(dx, -dy, 'stitch'));
        break;
      case CMD.JUMP:
        rec(encodeDstRecord(dx, -dy, 'jump'));
        break;
      case CMD.TRIM:
        rec(encodeDstRecord(2, 2, 'jump'));
        rec(encodeDstRecord(-4, -4, 'jump'));
        rec(encodeDstRecord(2, 2, 'jump'));
        break;
      case CMD.COLOR_CHANGE:
      case CMD.STOP:
        rec(encodeDstRecord(0, 0, 'color'));
        colors++;
        break;
      case CMD.END:
        rec(encodeDstRecord(0, 0, 'end'));
        break;
    }
  }

  const e = recExtents(norm.recs);
  const last = norm.recs[norm.recs.length - 1];
  const h = new ByteWriter(HEADER_SIZE);
  h.ascii(`LA:${asciiSafe(norm.name, 16).padEnd(16, ' ')}\r`);
  h.ascii(`ST:${pad(count, 7)}\r`);
  h.ascii(`CO:${pad(colors, 3)}\r`);
  // DST extents are in +y-up space.
  h.ascii(`+X:${pad(Math.abs(e.maxX), 5)}\r`);
  h.ascii(`-X:${pad(Math.abs(e.minX), 5)}\r`);
  h.ascii(`+Y:${pad(Math.abs(e.minY), 5)}\r`);
  h.ascii(`-Y:${pad(Math.abs(e.maxY), 5)}\r`);
  h.ascii(`AX:${signed(last ? last.x : 0)}\r`);
  h.ascii(`AY:${signed(last ? -last.y : 0)}\r`);
  h.ascii(`MX:${signed(0)}\r`);
  h.ascii(`MY:${signed(0)}\r`);
  h.ascii('PD:******\r');
  h.u8(0x1a);
  h.fill(0x20, HEADER_SIZE - h.length);

  const out = new ByteWriter(HEADER_SIZE + body.length);
  out.bytes(h.toBytes());
  out.bytes(body.toBytes());
  return out.toBytes();
}

/** Parses header lines (LA, TC...) from the 512-byte header. */
function readHeader(bytes: Uint8Array): { name: string; threads: ReadThread[] } {
  let text = '';
  for (let i = 0; i < Math.min(HEADER_SIZE, bytes.length); i++) {
    if (bytes[i] === 0x1a) break;
    text += String.fromCharCode(bytes[i]);
  }
  let name = '';
  const threads: ReadThread[] = [];
  for (const raw of text.split(/[\r\n]/)) {
    const line = raw.trim();
    if (line.startsWith('LA:')) name = line.slice(3).trim();
    else if (line.startsWith('TC:')) {
      const [hex, desc, code] = line.slice(3).split(',').map((s) => s.trim());
      if (hex && /^#?[0-9a-fA-F]{6}$/.test(hex)) {
        threads.push({ hex: rgbToHex(hexToRgb(hex)), name: desc || hex, chartCode: code || null });
      }
    }
  }
  return { name, threads };
}

export function readDst(bytes: Uint8Array): StitchPattern {
  if (bytes.length < HEADER_SIZE) throw new Error('Not a DST file (too short)');
  const { name, threads } = readHeader(bytes);
  const sink = new RecordSink();
  for (let i = HEADER_SIZE; i + 3 <= bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    if ((b2 & 0xf3) === 0xf3) break;
    const [dx, dy] = decodeDstRecord(b0, b1, b2);
    if ((b2 & 0xc3) === 0xc3) sink.add(CMD.COLOR_CHANGE, dx, -dy);
    else if ((b2 & 0x43) === 0x43) sink.add(CMD.JUMP, dx, -dy); // sequin mode: treat as move
    else if ((b2 & 0x83) === 0x83) sink.add(CMD.JUMP, dx, -dy);
    else sink.add(CMD.STITCH, dx, -dy);
  }
  return finishRead(sink, threads, name || 'Untitled', { trimAtJumpCount: 3 });
}
