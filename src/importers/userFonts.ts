/** Fonts the user adds from their own files (TTF, OTF, WOFF), kept in this browser. */
import { parse } from 'opentype.js';
import { slugify } from '../model/project';
import { getUserFont, listUserFonts, putUserFont } from '../storage/db';
import type { FontEntry } from './fontCatalog';

export const USER_FONT_ACCEPT = '.ttf,.otf,.woff,font/ttf,font/otf,font/woff';
export const isUserFont = (id: string) => id.startsWith('user:');

/** Validate a font file, store it, and return its catalog entry. */
export async function addUserFont(file: File): Promise<FontEntry> {
  const data = await file.arrayBuffer();
  let family = file.name.replace(/\.[^.]+$/, '');
  try {
    const font = parse(data);
    // opentype.js 2 groups names by platform; older builds keep them flat.
    type NameTable = Record<string, Record<string, string> | undefined>;
    const raw = font.names as unknown as NameTable & { windows?: NameTable; macintosh?: NameTable; unicode?: NameTable };
    const tables: NameTable[] = [raw.windows, raw.macintosh, raw.unicode, raw].filter((t): t is NameTable => !!t);
    for (const t of tables) {
      const name = t.preferredFamily?.en ?? t.fontFamily?.en;
      if (name) {
        family = name;
        break;
      }
    }
    if (!font.unitsPerEm || !font.charToGlyph('A')) throw new Error('no glyphs');
  } catch {
    throw new Error(`${file.name} is not a font file that can be used (TTF, OTF or WOFF).`);
  }
  const id = `user:${slugify(family) || 'font'}`;
  await putUserFont({ id, family, data, addedAt: Date.now() });
  return entryOf(id, family);
}

const entryOf = (id: string, family: string): FontEntry => ({ id, family, category: 'mine', weights: [400] });

export async function userFontEntries(): Promise<FontEntry[]> {
  try {
    return (await listUserFonts()).map((f) => entryOf(f.id, f.family));
  } catch {
    return [];
  }
}

export async function userFontBytes(id: string): Promise<ArrayBuffer> {
  const rec = await getUserFont(id);
  if (!rec) throw new Error('This font is not in this browser. Add the font file again to edit the text.');
  return rec.data;
}
