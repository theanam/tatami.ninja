import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUILTIN_FONTS,
  filterFonts,
  fontDisplayName,
  fontFileUrl,
  loadCatalog,
  nearestWeight,
  parseCatalog,
  previewCssUrl,
  resetCatalog,
} from './fontCatalog';
import { loadFont } from './lettering';

const rows = JSON.parse(readFileSync(resolve(__dirname, '../../public/fonts/google-fonts.json'), 'utf8'));

afterEach(() => resetCatalog());

describe('font catalog', () => {
  it('ships every Latin Google Font, built-ins first', () => {
    const list = parseCatalog(rows);
    expect(list.length).toBeGreaterThan(1500);
    expect(list.slice(0, BUILTIN_FONTS.length)).toEqual(BUILTIN_FONTS);
    const lobster = list.find((f) => f.family === 'Lobster')!;
    expect(lobster).toMatchObject({ id: 'gf:lobster', category: 'display' });
    expect(list.find((f) => f.family === 'Open Sans')?.weights).toContain(700);
  });

  it('ignores malformed rows', () => {
    expect(parseCatalog([['x', 'X', 'sans', []], ['y'] as never, ['z', 'Z', 'weird', [400]]])).toHaveLength(BUILTIN_FONTS.length + 1);
  });

  it('loads lazily and falls back to built-ins when offline', async () => {
    expect(await loadCatalog(async () => rows)).toHaveLength(BUILTIN_FONTS.length + rows.length);
    resetCatalog();
    expect(await loadCatalog(async () => Promise.reject(new Error('offline')))).toEqual(BUILTIN_FONTS);
  });

  it('searches by name (prefix first) and filters by category', () => {
    const list = parseCatalog(rows);
    const lob = filterFonts(list, 'lob', 'all');
    expect(lob[0].family.toLowerCase().startsWith('lob')).toBe(true);
    expect(filterFonts(list, '', 'builtin')).toEqual(BUILTIN_FONTS);
    expect(filterFonts(list, '', 'mono').every((f) => f.category === 'mono')).toBe(true);
    expect(filterFonts(list, 'zzzz-not-a-font', 'all')).toEqual([]);
  });

  it('picks the closest weight, preferring bold for embroidery', () => {
    expect(nearestWeight([300, 400, 700, 900])).toBe(700);
    expect(nearestWeight([400])).toBe(400);
    expect(nearestWeight([300, 600, 800], 700)).toBe(800);
    expect(nearestWeight([100, 400], 400)).toBe(400);
  });

  it('builds outline and preview URLs', () => {
    expect(fontFileUrl('gf:open-sans', 700)).toBe('https://cdn.jsdelivr.net/fontsource/fonts/open-sans@latest/latin-700-normal.woff');
    expect(fontFileUrl('pacifico')).toMatch(/lettering\/pacifico\.ttf$/);
    const url = previewCssUrl({ id: 'gf:open-sans', family: 'Open Sans', category: 'sans', weights: [300, 400, 700] });
    expect(url).toBe('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400&text=Open%20Sans&display=swap');
    expect(previewCssUrl({ id: 'gf:x', family: 'X', category: 'sans', weights: [300] })).toContain(':wght@300');
  });

  it('names fonts before the catalog arrives', () => {
    expect(fontDisplayName('gf:open-sans')).toBe('Open Sans');
    expect(fontDisplayName('oswald')).toBe('Oswald');
    expect(fontDisplayName('gf:lobster', parseCatalog(rows))).toBe('Lobster');
  });

  it('loads Google Font outlines from the WOFF URL with the chosen weight', async () => {
    const urls: string[] = [];
    const ttf = readFileSync(resolve(__dirname, '../../public/lettering/oswald.ttf'));
    const font = await loadFont('gf:test-font', async (u) => {
      urls.push(u);
      return ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength) as ArrayBuffer;
    }, 700);
    expect(font.unitsPerEm).toBeGreaterThan(0);
    expect(urls).toEqual(['https://cdn.jsdelivr.net/fontsource/fonts/test-font@latest/latin-700-normal.woff']);
  });
});
