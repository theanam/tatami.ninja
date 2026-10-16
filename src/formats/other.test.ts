import { describe, expect, it } from 'vitest';
import { CMD } from '../model/types';
import { husCompress, husExpand } from './embCompress';
import { HUS_MAGIC, writeHus } from './hus';
import { FORMATS, readStitchFile } from './index';
import { writeVp3 } from './vp3';
import { writeXxx } from './xxx';
import { makePattern, sampleDesign } from './testFixtures';

const dv = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength);

describe('HUS compression', () => {
  it.each([0, 1, 255, 256, 4096, 70000])('round-trips %i bytes', (n) => {
    const data = new Uint8Array(n);
    for (let i = 0; i < n; i++) data[i] = (i * 37 + (i >> 3)) & 0xff;
    expect(husExpand(husCompress(data), n)).toEqual(data);
  });
});

describe('HUS writer', () => {
  it('writes header, offsets and decodable streams', () => {
    const b = writeHus(sampleDesign());
    const v = dv(b);
    expect(v.getUint32(0, true)).toBe(HUS_MAGIC);
    const n = v.getUint32(4, true);
    const colors = v.getUint32(8, true);
    expect(colors).toBe(3);
    const cmdOff = v.getUint32(20, true);
    const xOff = v.getUint32(24, true);
    const yOff = v.getUint32(28, true);
    expect(cmdOff).toBe(0x2a + 2 * colors);
    const cmds = husExpand(b.slice(cmdOff, xOff), n);
    const xs = husExpand(b.slice(xOff, yOff), n);
    expect(cmds.length).toBe(n);
    expect(xs.length).toBe(n);
    expect(cmds[n - 1]).toBe(0x90);
    expect(Array.from(cmds).filter((c) => c === 0x84).length).toBe(2);
  });
});

describe('VP3 writer', () => {
  it('writes the magic and one color block per thread', () => {
    const b = writeVp3(sampleDesign());
    expect(String.fromCharCode(...b.slice(0, 5))).toBe('%vsm%');
    const v = dv(b);
    // "distance to end" of the file block points at the last byte
    const fileBlockLen = v.getUint32(0x43, false);
    expect(0x43 + 4 + fileBlockLen).toBe(b.length);
    const text = String.fromCharCode(...b);
    expect(text.includes('xxPP')).toBe(true);
    expect(text.split('Navy').length - 1).toBe(1);
  });
});

describe('XXX writer', () => {
  it('writes header counts and the end-of-stitches pointer', () => {
    const b = writeXxx(sampleDesign());
    const v = dv(b);
    expect(v.getUint32(0x27, true)).toBe(3); // colors
    const end = v.getUint32(0xfc, true);
    expect(Array.from(b.slice(end, end + 4))).toEqual([0x7f, 0x7f, 0x02, 0x14]);
  });
});

describe('FORMATS / readStitchFile', () => {
  it('describes every format', () => {
    expect(Object.keys(FORMATS).sort()).toEqual(['DST', 'EXP', 'HUS', 'JEF', 'PES', 'VP3', 'XXX']);
    expect(FORMATS.PES.machines).toBe('Brother, Baby Lock');
    expect(FORMATS.DST.keepsColors).toBe(false);
    expect(FORMATS.EXP.keepsColors).toBe(false);
    expect(FORMATS.VP3.keepsColors).toBe(true);
    for (const f of Object.values(FORMATS)) {
      const out = f.write(sampleDesign(true));
      expect(out.length).toBeGreaterThan(0);
    }
  });

  it('dispatches by extension and names the pattern after the file', () => {
    const bytes = FORMATS.DST.write(sampleDesign());
    const p = readStitchFile('C:\\designs\\Rose.DST', bytes);
    expect(p.name).toBe('Rose');
    expect(Array.from(p.cmds).filter((c) => c === CMD.STITCH).length).toBeGreaterThan(100);
  });

  it('rejects unsupported and corrupt files with clear errors', () => {
    expect(() => readStitchFile('a.vp3', new Uint8Array(10))).toThrow(/Unsupported stitch file type "\.vp3"/);
    expect(() => readStitchFile('noext', new Uint8Array(10))).toThrow(/Unsupported/);
    expect(() => readStitchFile('a.pes', new Uint8Array(20))).toThrow(/Could not read a\.pes/);
  });

  it('writers survive degenerate input', () => {
    const empty = makePattern([]);
    for (const f of Object.values(FORMATS)) {
      // EXP is headerless: an empty design is an empty file.
      if (f.ext !== 'exp') expect(f.write(empty).length).toBeGreaterThan(0);
    }
  });
});
