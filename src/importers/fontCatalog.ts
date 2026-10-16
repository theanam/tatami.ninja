/**
 * Lettering fonts: the bundled built-ins (work offline) plus every Google Font.
 * Google font ids are `gf:<fontsource id>`. Outlines come from Fontsource's WOFF files on jsDelivr
 * (opentype.js reads WOFF); picker previews come from the Google Fonts css2 API with `text=`.
 */

export type FontCategory = 'builtin' | 'sans' | 'serif' | 'display' | 'script' | 'mono';

export interface FontEntry {
  /** `geist` for built-ins, `gf:open-sans` for Google Fonts. */
  id: string;
  family: string;
  category: FontCategory;
  weights: number[];
  /** Bundled TTF in /lettering (built-ins only). */
  file?: string;
}

/** Built-in embroidery fonts (bundled, SIL OFL / Apache 2.0). */
export const BUILTIN_FONTS: FontEntry[] = [
  { id: 'geist', family: 'Geist', category: 'builtin', weights: [700], file: 'geist-bold.ttf' },
  { id: 'oswald', family: 'Oswald', category: 'builtin', weights: [600], file: 'oswald.ttf' },
  { id: 'roboto-slab', family: 'Roboto Slab', category: 'builtin', weights: [700], file: 'roboto-slab.ttf' },
  { id: 'pacifico', family: 'Pacifico', category: 'builtin', weights: [400], file: 'pacifico.ttf' },
];

export const FONT_CATEGORIES: { id: 'all' | FontCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'builtin', label: 'Built-in' },
  { id: 'sans', label: 'Sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'display', label: 'Display' },
  { id: 'script', label: 'Script' },
  { id: 'mono', label: 'Mono' },
];

export const isGoogleFont = (id: string) => id.startsWith('gf:');

type CatalogRow = [string, string, string, number[]];

/** Turn the compact JSON rows into entries, built-ins first. */
export function parseCatalog(rows: CatalogRow[]): FontEntry[] {
  const known = new Set(['sans', 'serif', 'display', 'script', 'mono']);
  const google = rows
    .filter((r) => Array.isArray(r) && typeof r[0] === 'string' && Array.isArray(r[3]) && r[3].length)
    .map(([id, family, cat, weights]) => ({
      id: `gf:${id}`,
      family,
      category: (known.has(cat) ? cat : 'sans') as FontCategory,
      weights: [...weights].sort((a, b) => a - b),
    }));
  return [...BUILTIN_FONTS, ...google];
}

let catalogPromise: Promise<FontEntry[]> | null = null;

/** The full font list (fetched once, lazily). Falls back to built-ins offline. */
export function loadCatalog(fetcher: (url: string) => Promise<unknown> = defaultJson): Promise<FontEntry[]> {
  if (!catalogPromise) {
    catalogPromise = fetcher(`${import.meta.env.BASE_URL}fonts/google-fonts.json`)
      .then((rows) => parseCatalog(rows as CatalogRow[]))
      .catch(() => {
        catalogPromise = null;
        return [...BUILTIN_FONTS];
      });
  }
  return catalogPromise;
}

async function defaultJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font list unavailable (${res.status})`);
  return res.json();
}

/** For tests. */
export function resetCatalog() {
  catalogPromise = null;
}

/** The available weight closest to `want` (embroidery reads best bold, so 700 by default). */
export function nearestWeight(weights: number[], want = 700): number {
  if (!weights.length) return want;
  return weights.reduce((best, w) => (Math.abs(w - want) < Math.abs(best - want) || (Math.abs(w - want) === Math.abs(best - want) && w > best) ? w : best));
}

/** Font file with glyph outlines (WOFF for Google Fonts, TTF for built-ins). */
export function fontFileUrl(id: string, weight?: number): string {
  if (isGoogleFont(id)) {
    const slug = id.slice(3);
    return `https://cdn.jsdelivr.net/fontsource/fonts/${encodeURIComponent(slug)}@latest/latin-${weight ?? 400}-normal.woff`;
  }
  const b = BUILTIN_FONTS.find((f) => f.id === id) ?? BUILTIN_FONTS[0];
  return `${import.meta.env.BASE_URL}lettering/${b.file}`;
}

/** Google Fonts css2 URL that only carries the glyphs needed to preview `text`. */
export function previewCssUrl(entry: FontEntry, text = entry.family): string {
  const fam = encodeURIComponent(entry.family).replace(/%20/g, '+');
  const w = entry.weights.includes(400) ? 400 : entry.weights[0];
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@${w}&text=${encodeURIComponent(text)}&display=swap`;
}

/** Readable name for a font id, even before the catalog loads. */
export function fontDisplayName(id: string, catalog?: FontEntry[] | null): string {
  const hit = catalog?.find((f) => f.id === id) ?? BUILTIN_FONTS.find((f) => f.id === id);
  if (hit) return hit.family;
  if (isGoogleFont(id)) {
    return id
      .slice(3)
      .split('-')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
  }
  return BUILTIN_FONTS[0].family;
}

/** Case-insensitive search plus category filter. Prefix matches rank first. */
export function filterFonts(list: FontEntry[], query: string, category: 'all' | FontCategory): FontEntry[] {
  const q = query.trim().toLowerCase();
  const inCat = list.filter((f) => category === 'all' || f.category === category);
  if (!q) return inCat;
  const starts: FontEntry[] = [];
  const contains: FontEntry[] = [];
  for (const f of inCat) {
    const n = f.family.toLowerCase();
    if (n.startsWith(q)) starts.push(f);
    else if (n.includes(q)) contains.push(f);
  }
  return [...starts, ...contains];
}

/* ---------- Browser-side font faces (for live text and previews) ---------- */

const faces = new Map<string, Promise<string>>();

/**
 * Register the same font file used for outlines as a CSS font, so in-place editing looks
 * exactly like the stitched result. Resolves to the CSS family name.
 */
export function ensureCssFont(id: string, weight?: number): Promise<string> {
  const key = `${id}@${weight ?? ''}`;
  let p = faces.get(key);
  if (!p) {
    const name = `tn-${key.replace(/[^a-z0-9]/gi, '-')}`;
    p = (async () => {
      if (typeof FontFace === 'undefined' || typeof document === 'undefined') return name;
      const face = new FontFace(name, `url(${fontFileUrl(id, weight)})`, { display: 'block' });
      await face.load();
      document.fonts.add(face);
      return name;
    })();
    p.catch(() => faces.delete(key));
    faces.set(key, p);
  }
  return p;
}

const previewLinks = new Set<string>();

/** Load a picker preview (only the letters of the family name) via the css2 API. */
export function loadPreview(entry: FontEntry): string {
  if (entry.category === 'builtin') {
    void ensureCssFont(entry.id, entry.weights[0]);
    return `tn-${`${entry.id}@${entry.weights[0]}`.replace(/[^a-z0-9]/gi, '-')}`;
  }
  const href = previewCssUrl(entry);
  if (typeof document !== 'undefined' && !previewLinks.has(href)) {
    previewLinks.add(href);
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.crossOrigin = 'anonymous';
    document.head.appendChild(l);
  }
  return entry.family;
}
