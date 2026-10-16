import { parse, type Font } from 'opentype.js';
import { normalizeAreas } from '../engine/clip';
import type { P } from '../engine/geom';
import { newId } from '../model/project';
import type { Geometry, Pt, StitchObject, TextSpec } from '../model/types';
import { parsePath, simplifyRing } from './svgPath';

export interface LetteringFont {
  id: string;
  name: string;
  file: string;
  style: string;
}

/** Built-in embroidery fonts (bundled, SIL OFL / Apache 2.0). */
export const LETTERING_FONTS: LetteringFont[] = [
  { id: 'geist', name: 'Geist Bold', file: 'geist-bold.ttf', style: 'Sans' },
  { id: 'oswald', name: 'Oswald', file: 'oswald.ttf', style: 'Condensed block' },
  { id: 'roboto-slab', name: 'Roboto Slab', file: 'roboto-slab.ttf', style: 'Slab serif' },
  { id: 'pacifico', name: 'Pacifico', file: 'pacifico.ttf', style: 'Script' },
];

const cache = new Map<string, Promise<Font>>();

/** Load a lettering font from /lettering (works under any GitHub Pages base path). */
export function loadFont(id: string, fetcher: (url: string) => Promise<ArrayBuffer> = defaultFetch): Promise<Font> {
  const f = LETTERING_FONTS.find((x) => x.id === id) ?? LETTERING_FONTS[0];
  let p = cache.get(f.id);
  if (!p) {
    p = fetcher(`${import.meta.env.BASE_URL}lettering/${f.file}`).then((buf) => parse(buf));
    p.catch(() => cache.delete(f.id));
    cache.set(f.id, p);
  }
  return p;
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
  const rings: P[][] = [];
  glyphs.forEach((g, i) => {
    const d = commandsToPathData(g.getPath(xs[i] - total / 2, 0, fontSize).commands);
    if (!d) return;
    for (const sp of parsePath(d, 0.3)) {
      if (sp.points.length < 3) continue;
      rings.push(simplifyRing(sp.points.map((p) => bend(p, spec.arc)), 0.3));
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
