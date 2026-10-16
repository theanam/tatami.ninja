import { parse, type Font } from 'opentype.js';
import { normalizeAreas } from '../engine/clip';
import type { P } from '../engine/geom';
import { newId } from '../model/project';
import type { Geometry, Pt, StitchObject, TextSpec } from '../model/types';
import { BUILTIN_FONTS, fontFileUrl, isGoogleFont } from './fontCatalog';
import { parsePath, simplifyRing } from './svgPath';
import { isUserFont, userFontBytes } from './userFonts';

export interface LetteringFont {
  id: string;
  name: string;
  file: string;
  style: string;
}

/** The bundled fonts (offline). Any Google Font can be used too; see fontCatalog. */
export const LETTERING_FONTS: LetteringFont[] = BUILTIN_FONTS.map((f) => ({
  id: f.id,
  name: f.family,
  file: f.file!,
  style: { geist: 'Sans', oswald: 'Condensed block', 'roboto-slab': 'Slab serif', pacifico: 'Script' }[f.id] ?? 'Sans',
}));

const cache = new Map<string, Promise<Font>>();

/**
 * Load a lettering font's outlines: a bundled TTF, or a Google Font (`gf:<id>`) as WOFF from
 * Fontsource. Unknown ids fall back to the first built-in. Works under any Pages base path.
 */
export function loadFont(id: string, fetcher: (url: string) => Promise<ArrayBuffer> = defaultFetch, weight?: number): Promise<Font> {
  const fid = isGoogleFont(id) || isUserFont(id) || BUILTIN_FONTS.some((f) => f.id === id) ? id : BUILTIN_FONTS[0].id;
  const w = isGoogleFont(fid) ? weight ?? 400 : undefined;
  const key = `${fid}@${w ?? ''}`;
  let p = cache.get(key);
  if (!p) {
    p = (isUserFont(fid) ? userFontBytes(fid) : fetcher(fontFileUrl(fid, w))).then((buf) => parse(buf));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** Load the font a text spec asks for. */
export function loadSpecFont(spec: Pick<TextSpec, 'font' | 'weight'>, fetcher?: (url: string) => Promise<ArrayBuffer>): Promise<Font> {
  return loadFont(spec.font, fetcher, spec.weight);
}

/** Vertical metrics (font units) for placing live text over the stitched outline. */
export function fontMetrics(font: Font) {
  return { unitsPerEm: font.unitsPerEm, capHeight: capHeight(font), ascender: font.ascender, descender: font.descender };
}

async function defaultFetch(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load font (${res.status})`);
  return res.arrayBuffer();
}

/** Cap height of a font in font units. */
function capHeight(font: Font): number {
  const os2 = (font.tables as Record<string, { sCapHeight?: number } | undefined>).os2;
  if (os2?.sCapHeight) return os2.sCapHeight;
  const h = font.charToGlyph('H').getBoundingBox();
  return h.y2 - h.y1 || font.unitsPerEm * 0.7;
}

/** Lay out text into outline parts (0.1 mm), baseline centered at (spec.x, spec.y). */
export function layoutText(font: Font, spec: TextSpec): Geometry {
  const content = spec.content.replace(/\s+$/g, '');
  if (!content.trim()) return { kind: 'compound', parts: [] };
  const fontSize = (spec.height * font.unitsPerEm) / capHeight(font);
  const scale = fontSize / font.unitsPerEm;
  const glyphs = font.stringToGlyphs(content);
  // Horizontal layout with kerning and extra spacing.
  const xs: number[] = [];
  let x = 0;
  for (let i = 0; i < glyphs.length; i++) {
    xs.push(x);
    x += (glyphs[i].advanceWidth ?? 0) * scale + spec.spacing;
    if (i + 1 < glyphs.length) x += font.getKerningValue(glyphs[i], glyphs[i + 1]) * scale;
  }
  const total = x - spec.spacing;
  const shaped = !!(spec.arc || spec.shape || (spec.warp && spec.warpAmount !== 0));
  const place = placer(spec, total, x);
  const rings: P[][] = [];
  glyphs.forEach((g, i) => {
    const d = commandsToPathData(g.getPath(xs[i] - total / 2, 0, fontSize).commands);
    if (!d) return;
    for (const sp of parsePath(d, 0.3)) {
      if (sp.points.length < 3) continue;
      // Straight glyph edges must bend with the baseline, so split them before shaping.
      const pts = shaped ? densify(sp.points, 5) : sp.points;
      rings.push(simplifyRing(pts.map(place), 0.3));
    }
  });
  const areas = normalizeAreas(rings.map((r) => ({ outer: r, holes: [] })), 'nonzero');
  const round = (pts: P[]): Pt[] => pts.map(([px, py]) => [Math.round(px + spec.x), Math.round(py + spec.y)]);
  return { kind: 'compound', parts: areas.map((a) => ({ points: round(a.outer), holes: a.holes.map(round) })) };
}

type PathCommand = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };

/** Build SVG path data from opentype commands (its own toPathData can emit NaN in v2.0). */
export function commandsToPathData(cmds: PathCommand[]): string {
  const n = (v: number | undefined) => (Number.isFinite(v) ? (v as number).toFixed(3) : '0');
  return cmds
    .map((c) => {
      switch (c.type) {
        case 'M':
        case 'L':
          return `${c.type}${n(c.x)} ${n(c.y)}`;
        case 'Q':
          return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
        case 'C':
          return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
        case 'Z':
          return 'Z';
        default:
          return '';
      }
    })
    .join('');
}

/** Split segments longer than `max` so a non-linear map keeps them smooth. */
function densify(ring: P[], max: number): P[] {
  const out: P[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    out.push(a);
    const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / max);
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / (n + 1), a[1] + ((b[1] - a[1]) * k) / (n + 1)]);
  }
  return out;
}

/**
 * Envelope warp of straight text. `u` runs 0–1 across the text; y is negative above the
 * baseline, and `h` is the cap height.
 */
export function warpPoint([x, y]: P, u: number, h: number, warp: TextSpec['warp'], amount: number): P {
  const k = amount / 100;
  const sinU = Math.sin(Math.PI * u);
  switch (warp) {
    case 'arch': // top bulges up, baseline stays
      return [x, y * (1 + k * sinU)];
    case 'peak': // top rises to a point in the middle
      return [x, y * (1 + k * (1 - Math.abs(2 * u - 1)))];
    case 'bulge': {
      // grows from the middle line
      const c = -h / 2;
      return [x, c + (y - c) * (1 + k * sinU)];
    }
    case 'pinch': {
      const c = -h / 2;
      return [x, c + (y - c) * (1 - 0.6 * k * sinU)];
    }
    case 'wave':
      return [x, y + 0.5 * k * h * Math.sin(2 * Math.PI * u)];
    case 'rise':
      return [x, y - k * h * u];
    default:
      return [x, y];
  }
}

/** Map points of straight, centered text onto the spec's baseline and envelope. */
function placer(spec: TextSpec, total: number, advance: number): (p: P) => P {
  const h = spec.height;
  const warp = spec.warp && (spec.warpAmount ?? 50) !== 0 ? spec.warp : undefined;
  const amount = spec.warpAmount ?? 50;
  const env = (p: P): P => (warp ? warpPoint(p, total > 0 ? (p[0] + total / 2) / total : 0.5, h, warp, amount) : p);
  if (spec.shape === 'circle') {
    // The circle's length is the text's full advance, so the end meets the start.
    const R = Math.max(h, (advance + spec.spacing) / (2 * Math.PI));
    return (p) => bend(env(p), R);
  }
  if (spec.shape === 'spiral') {
    const R0 = Math.max(h * 2, Math.abs(spec.arc) || 300);
    const pitch = h * 1.4;
    return (p) => {
      const [x, y] = env(p);
      // Arc length ≈ ∫ r dt with r = R0 − pitch·t/2π; solve for the angle t at length x + total/2.
      const s = x + total / 2;
      const a = pitch / (4 * Math.PI);
      const disc = R0 * R0 - 4 * a * s;
      const t = disc > 0 ? (R0 - Math.sqrt(disc)) / (2 * a) : R0 / (2 * a);
      const r = R0 - (pitch * t) / (2 * Math.PI) - y;
      const t0 = total / 2 / R0; // center the start of the text at the top
      const ang = t - t0;
      return [r * Math.sin(ang), R0 - r * Math.cos(ang)];
    };
  }
  return (p) => bend(env(p), spec.arc);
}

/** Map a point of straight text onto an arc of radius |arc| (positive bulges up). */
export function bend([x, y]: P, arc: number): P {
  if (!arc) return [x, y];
  const R = Math.abs(arc);
  const t = x / R;
  if (arc > 0) {
    const r = R - y;
    return [r * Math.sin(t), R - r * Math.cos(t)];
  }
  const r = R + y;
  return [r * Math.sin(t), -R + r * Math.cos(t)];
}

export function defaultTextSpec(x: number, y: number, content = 'Text'): TextSpec {
  return { content, font: 'geist', height: 100, spacing: 0, arc: 0, x, y };
}

export function makeTextObject(spec: TextSpec, geometry: Geometry, thread: string): StitchObject {
  return {
    id: newId('o'),
    name: textObjectName(spec.content),
    type: 'satin',
    thread,
    visible: true,
    locked: false,
    geometry,
    params: {},
    advanced: { underlay: 'inherit', pullComp: 'inherit', tieIn: true, tieOff: true, trimBefore: false, trimAfter: true },
    text: spec,
  };
}

export function textObjectName(content: string): string {
  const c = content.trim();
  return c ? `“${c.length > 24 ? `${c.slice(0, 24)}…` : c}”` : 'Text';
}
