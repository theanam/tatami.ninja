/**
 * Embroidery machine file formats: writers for every supported format and
 * readers for the common ones. Pure TS, no DOM; safe in Web Workers.
 */
import type { FileFormat, StitchPattern } from '../model/types';
import { readDst, writeDst } from './dst';
import { readExp, writeExp } from './exp';
import { writeHus } from './hus';
import { readJef, writeJef } from './jef';
import { readPes, writePes } from './pes';
import { writeVp3 } from './vp3';
import { writeXxx } from './xxx';

export interface FormatInfo {
  ext: string;
  label: string;
  machines: string;
  keepsColors: boolean;
  write(p: StitchPattern): Uint8Array;
}

export const FORMATS: Record<FileFormat, FormatInfo> = {
  PES: { ext: 'pes', label: 'PES', machines: 'Brother, Baby Lock', keepsColors: true, write: writePes },
  DST: { ext: 'dst', label: 'DST', machines: 'Tajima, most commercial', keepsColors: false, write: writeDst },
  JEF: { ext: 'jef', label: 'JEF', machines: 'Janome', keepsColors: true, write: (p) => writeJef(p) },
  EXP: { ext: 'exp', label: 'EXP', machines: 'Bernina', keepsColors: false, write: writeExp },
  VP3: { ext: 'vp3', label: 'VP3', machines: 'Husqvarna Viking, Pfaff', keepsColors: true, write: writeVp3 },
  XXX: { ext: 'xxx', label: 'XXX', machines: 'Singer', keepsColors: true, write: writeXxx },
  HUS: { ext: 'hus', label: 'HUS', machines: 'Older Husqvarna Viking', keepsColors: true, write: writeHus },
};

const READERS: Record<string, (bytes: Uint8Array) => StitchPattern> = {
  dst: readDst,
  pes: readPes,
  pec: readPes,
  jef: readJef,
  exp: readExp,
};

/** Extensions readStitchFile accepts. */
export const READABLE_EXTENSIONS = Object.keys(READERS);

/** Reads a stitch file, dispatching on its extension. The pattern name is the file's base name. */
export function readStitchFile(fileName: string, bytes: Uint8Array): StitchPattern {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  const reader = READERS[ext];
  if (!reader) {
    throw new Error(
      `Unsupported stitch file type "${ext ? '.' + ext : fileName}". Supported: ${READABLE_EXTENSIONS.map((e) => '.' + e).join(', ')}.`,
    );
  }
  let pattern: StitchPattern;
  try {
    pattern = reader(bytes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not read ${fileName}: ${msg}`);
  }
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
  return { ...pattern, name: base || pattern.name };
}

export { readDst, writeDst, readExp, writeExp, readJef, writeJef, readPes, writePes, writeVp3, writeXxx, writeHus };
