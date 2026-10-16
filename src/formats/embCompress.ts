/**
 * HUS compression (an LHA-style static-Huffman LZ scheme).
 *
 * The decoder is ported from pyembroidery's EmbCompress
 * (MIT License, Copyright (c) 2018 Tatarize). Like pyembroidery's
 * `compress`, the encoder emits "stored" blocks: every byte is a literal
 * coded with a flat 8-bit Huffman code, so no LZ matching is needed.
 *
 * Block layout (MSB-first bit stream):
 *   16  number of tokens in block
 *    5  code-length table count = 0, 5  its single value = 10 (=> length 8)
 *    9  literal table count = 256 (all lengths 8 => identity code)
 *    5  distance table count = 0, 5  its single value = 0
 *   8*n literal bytes
 * Differences from pyembroidery's compress(): the token count is written in
 * the bit order the decoder reads it (pyembroidery writes it byte-swapped,
 * which breaks for some sizes), single-value tables are used for the unused
 * distance table, and data over 65535 bytes is split into several blocks.
 */

class BitWriter {
  private out: number[] = [];
  private acc = 0;
  private n = 0;
  write(value: number, bits: number): void {
    for (let i = bits - 1; i >= 0; i--) {
      this.acc = (this.acc << 1) | ((value >> i) & 1);
      this.n++;
      if (this.n === 8) {
        this.out.push(this.acc);
        this.acc = 0;
        this.n = 0;
      }
    }
  }
  finish(): Uint8Array {
    if (this.n > 0) this.write(0, 8 - this.n);
    return Uint8Array.from(this.out);
  }
}

const MAX_BLOCK = 0xffff;

export function husCompress(data: Uint8Array): Uint8Array {
  const bw = new BitWriter();
  for (let start = 0; start < data.length || start === 0; start += MAX_BLOCK) {
    const chunk = data.subarray(start, Math.min(data.length, start + MAX_BLOCK));
    bw.write(chunk.length, 16);
    bw.write(0, 5);
    bw.write(10, 5);
    bw.write(256, 9);
    bw.write(0, 5);
    bw.write(0, 5);
    for (const b of chunk) bw.write(b, 8);
    if (data.length === 0) break;
  }
  return bw.finish();
}

// ---------------------------------------------------------------------------
// Decoder (used by tests to verify the encoder)
// ---------------------------------------------------------------------------

class Huffman {
  table: number[] | null = null;
  width = 0;
  constructor(readonly lengths: number[] | null, readonly defaultValue = 0) {
    if (lengths) {
      this.width = Math.max(...lengths);
      const table: number[] = [];
      let size = 1 << this.width;
      for (let len = 1; len <= this.width; len++) {
        size /= 2;
        for (let i = 0; i < lengths.length; i++) {
          if (lengths[i] === len) for (let k = 0; k < size; k++) table.push(i);
        }
      }
      this.table = table;
    }
  }
  lookup(bits16: number): [number, number] {
    if (!this.table || !this.lengths) return [this.defaultValue, 0];
    const v = this.table[bits16 >> (16 - this.width)] ?? 0;
    return [v, this.lengths[v]];
  }
}

export function husExpand(input: Uint8Array, size?: number): Uint8Array {
  let pos = 0;
  const peek = (count: number): number => {
    let v = 0;
    for (let i = 0; i < count; i++) {
      const bitPos = pos + i;
      const byte = input[bitPos >> 3] ?? 0;
      v = (v << 1) | ((byte >> (7 - (bitPos & 7))) & 1);
    }
    return v;
  };
  const pop = (count: number): number => {
    const v = peek(count);
    pos += count;
    return v;
  };
  const varLen = (): number => {
    let m = pop(3);
    if (m !== 7) return m;
    for (let q = 0; q < 13; q++) {
      if (pop(1) === 1) m++;
      else break;
    }
    return m;
  };
  let blockLeft = -1;
  let chars = new Huffman(null);
  let dist = new Huffman(null);
  const loadBlock = (): void => {
    blockLeft = pop(16);
    let count = pop(5);
    let lenHuff: Huffman;
    if (count === 0) lenHuff = new Huffman(null, pop(5));
    else {
      const lengths = new Array<number>(count).fill(0);
      let i = 0;
      while (i < count) {
        if (i === 3) i += pop(2);
        lengths[i] = varLen();
        i++;
      }
      lenHuff = new Huffman(lengths, 8);
    }
    count = pop(9);
    if (count === 0) chars = new Huffman(null, pop(9));
    else {
      const lengths = new Array<number>(count).fill(0);
      let i = 0;
      while (i < count) {
        const [c, l] = lenHuff.lookup(peek(16));
        pos += l;
        if (c === 0) i += 1;
        else if (c === 1) i += 3 + pop(4);
        else if (c === 2) i += 20 + pop(9);
        else lengths[i++] = c - 2;
      }
      chars = new Huffman(lengths);
    }
    count = pop(5);
    if (count === 0) dist = new Huffman(null, pop(5));
    else {
      const lengths: number[] = [];
      for (let i = 0; i < count; i++) lengths.push(varLen());
      dist = new Huffman(lengths);
    }
  };
  const out: number[] = [];
  const total = input.length * 8;
  while (pos < total && (size === undefined || out.length < size)) {
    if (blockLeft <= 0) loadBlock();
    blockLeft--;
    const [ch, l] = chars.lookup(peek(16));
    pos += l;
    if (ch <= 255) out.push(ch);
    else if (ch === 510) break;
    else {
      const length = ch - 253;
      const [d, dl] = dist.lookup(peek(16));
      pos += dl;
      const back = (d === 0 ? 0 : (1 << (d - 1)) + pop(d - 1)) + 1;
      const start = out.length - back;
      for (let i = 0; i < length; i++) out.push(out[start + i]);
    }
  }
  return Uint8Array.from(out);
}
