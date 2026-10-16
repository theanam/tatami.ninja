import { normalizeAreas } from '../engine/clip';
import { columnFromPath } from '../engine/satin';
import type { Area, P } from '../engine/geom';
import { ensureThread, newId, normalizeHex, rgbToHex } from '../model/project';
import type { Geometry, Pt, StitchObject, Thread } from '../model/types';
import { apply, ellipsePoints, IDENTITY, multiply, parsePath, parseTransform, simplify, simplifyRing, type Matrix, type Subpath, type V } from './svgPath';

export interface SvgImportResult {
  objects: StitchObject[];
  threads: Thread[];
  /** Size of the imported artwork in 0.1 mm. */
  width: number;
  height: number;
}

interface Style {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  fillRule: 'nonzero' | 'evenodd';
  display: boolean;
  opacity: number;
}

interface Shape {
  subpaths: Subpath[];
  style: Style;
  name: string | null;
  /** Uniform scale of the CTM, to convert stroke widths. */
  scale: number;
}

const SKIP = new Set(['defs', 'clipPath', 'mask', 'symbol', 'marker', 'pattern', 'title', 'desc', 'metadata', 'style', 'script', 'linearGradient', 'radialGradient', 'filter', 'text']);

const NAMED_COLORS: Record<string, string> = {
  black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#008000', blue: '#0000FF', yellow: '#FFFF00',
  orange: '#FFA500', purple: '#800080', pink: '#FFC0CB', gray: '#808080', grey: '#808080', navy: '#000080',
  gold: '#FFD700', silver: '#C0C0C0', brown: '#A52A2A', teal: '#008080', maroon: '#800000', olive: '#808000',
  lime: '#00FF00', aqua: '#00FFFF', cyan: '#00FFFF', fuchsia: '#FF00FF', magenta: '#FF00FF', crimson: '#DC143C',
  darkgreen: '#006400', darkblue: '#00008B', darkred: '#8B0000', lightblue: '#ADD8E6', skyblue: '#87CEEB',
  beige: '#F5F5DC', ivory: '#FFFFF0', tan: '#D2B48C', coral: '#FF7F50', salmon: '#FA8072', indigo: '#4B0082',
  violet: '#EE82EE', turquoise: '#40E0D0', khaki: '#F0E68C', forestgreen: '#228B22', royalblue: '#4169E1',
};

/** Parse a CSS color to #RRGGBB, or null for none/transparent. */
export function parseColor(value: string | null | undefined, doc?: Document): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === 'none' || v === 'transparent') return null;
  if (v.startsWith('#')) return /^#([0-9a-f]{3}|[0-9a-f]{6})/.test(v) ? normalizeHex(v) : null;
  const rgb = v.match(/^rgba?\(([^)]+)\)/);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    const c = parts.slice(0, 3).map((p) => (p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p)));
    if (parts[3] !== undefined && parseFloat(parts[3]) === 0) return null;
    return rgbToHex(c[0], c[1], c[2]);
  }
  const url = v.match(/^url\(\s*#([^)\s]+)\s*\)/);
  if (url && doc) {
    const grad = doc.getElementById(url[1]);
    const stop = grad?.querySelector('stop');
    if (stop) return parseColor(stop.getAttribute('stop-color') ?? styleProp(stop.getAttribute('style'), 'stop-color') ?? '#000');
    return '#000000';
  }
  return NAMED_COLORS[v] ?? null;
}

function styleProp(style: string | null, prop: string): string | null {
  if (!style) return null;
  for (const decl of style.split(';')) {
    const [k, ...rest] = decl.split(':');
    if (k && k.trim() === prop) return rest.join(':').trim();
  }
  return null;
}

/** Very small CSS support: `.class`, `tag` and `#id` selectors with declarations. */
function parseStyleSheets(doc: Document): { sel: string; decls: Record<string, string> }[] {
  const rules: { sel: string; decls: Record<string, string> }[] = [];
  doc.querySelectorAll('style').forEach((el) => {
    const css = (el.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      const decls: Record<string, string> = {};
      for (const d of m[2].split(';')) {
        const [k, ...v] = d.split(':');
        if (k && v.length) decls[k.trim()] = v.join(':').trim();
      }
      for (const sel of m[1].split(',')) rules.push({ sel: sel.trim(), decls });
    }
  });
  return rules;
}

function matches(el: Element, sel: string): boolean {
  if (sel.startsWith('.')) return el.classList?.contains(sel.slice(1)) ?? false;
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  return el.tagName.toLowerCase() === sel.toLowerCase();
}

function lengthAttr(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name);
  if (v === null) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Physical size of an SVG length in mm, or null for unitless/px. */
function physicalMm(v: string | null): number | null {
  if (!v) return null;
  const m = v.trim().match(/^([\d.]+)\s*(mm|cm|in|pt|pc)$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return { mm: n, cm: n * 10, in: n * 25.4, pt: (n * 25.4) / 72, pc: (n * 25.4) / 6 }[m[2] as 'mm'] ?? null;
}

function elementSubpaths(el: Element): Subpath[] {
  const tag = el.tagName.toLowerCase().replace(/^svg:/, '');
  switch (tag) {
    case 'path':
      return parsePath(el.getAttribute('d') ?? '');
    case 'rect': {
      const x = lengthAttr(el, 'x');
      const y = lengthAttr(el, 'y');
      const w = lengthAttr(el, 'width');
      const h = lengthAttr(el, 'height');
      if (w <= 0 || h <= 0) return [];
      let rx = lengthAttr(el, 'rx', NaN);
      let ry = lengthAttr(el, 'ry', NaN);
      if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
      if (Number.isNaN(ry)) ry = rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (rx > 0 && ry > 0) {
        const d = `M${x + rx},${y}H${x + w - rx}A${rx},${ry} 0 0 1 ${x + w},${y + ry}V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`;
        return parsePath(d);
      }
      return [{ points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true }];
    }
    case 'circle': {
      const r = lengthAttr(el, 'r');
      return r > 0 ? [{ points: ellipsePoints(lengthAttr(el, 'cx'), lengthAttr(el, 'cy'), r, r), closed: true }] : [];
    }
    case 'ellipse': {
      const rx = lengthAttr(el, 'rx');
      const ry = lengthAttr(el, 'ry');
      return rx > 0 && ry > 0 ? [{ points: ellipsePoints(lengthAttr(el, 'cx'), lengthAttr(el, 'cy'), rx, ry), closed: true }] : [];
    }
    case 'line':
      return [{ points: [[lengthAttr(el, 'x1'), lengthAttr(el, 'y1')], [lengthAttr(el, 'x2'), lengthAttr(el, 'y2')]], closed: false }];
    case 'polyline':
    case 'polygon': {
      const nums = (el.getAttribute('points') ?? '').match(/-?[\d.]+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
      const pts: V[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
      return pts.length > 1 ? [{ points: pts, closed: tag === 'polygon' }] : [];
    }
    default:
      return [];
  }
}

/** Collect drawable shapes with resolved styles and transforms. */
export function collectShapes(doc: Document): { shapes: Shape[]; root: Element } {
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase().replace(/^svg:/, '') !== 'svg' || doc.querySelector('parsererror')) {
    throw new Error('This file is not a valid SVG.');
  }
  const sheets = parseStyleSheets(doc);
  const shapes: Shape[] = [];
  const base: Style = { fill: '#000000', stroke: null, strokeWidth: 1, fillRule: 'nonzero', display: true, opacity: 1 };

  const resolve = (el: Element, parent: Style): Style => {
    const st: Style = { ...parent };
    const get = (prop: string): string | null => {
      let v = styleProp(el.getAttribute('style'), prop);
      if (v !== null) return v;
      for (const rule of sheets) if (rule.decls[prop] !== undefined && matches(el, rule.sel)) v = rule.decls[prop];
      if (v !== null) return v;
      return el.getAttribute(prop);
    };
    const fill = get('fill');
    if (fill !== null && fill !== 'inherit') st.fill = fill === 'currentColor' ? parent.fill : parseColor(fill, doc);
    const stroke = get('stroke');
    if (stroke !== null && stroke !== 'inherit') st.stroke = stroke === 'currentColor' ? parent.fill : parseColor(stroke, doc);
    const sw = get('stroke-width');
    if (sw !== null) st.strokeWidth = parseFloat(sw) || 0;
    const fr = get('fill-rule');
    if (fr === 'evenodd' || fr === 'nonzero') st.fillRule = fr;
    const disp = get('display');
    const vis = get('visibility');
    if (disp === 'none' || vis === 'hidden') st.display = false;
    const op = get('opacity');
    if (op !== null) st.opacity *= parseFloat(op);
    const fo = get('fill-opacity');
    if (fo !== null && parseFloat(fo) === 0) st.fill = null;
    const so = get('stroke-opacity');
    if (so !== null && parseFloat(so) === 0) st.stroke = null;
    return st;
  };

  const walk = (el: Element, ctm: Matrix, parent: Style, depth: number) => {
    if (depth > 64) return;
    const tag = el.tagName.toLowerCase().replace(/^svg:/, '');
    if (SKIP.has(tag)) return;
    const style = resolve(el, parent);
    if (!style.display || style.opacity === 0) return;
    let m = multiply(ctm, parseTransform(el.getAttribute('transform')));
    if (tag === 'use') {
      const href = el.getAttribute('href') ?? el.getAttribute('xlink:href');
      const target = href?.startsWith('#') ? doc.getElementById(href.slice(1)) : null;
      if (target) {
        m = multiply(m, [1, 0, 0, 1, lengthAttr(el, 'x'), lengthAttr(el, 'y')]);
        walk(target, m, style, depth + 1);
      }
      return;
    }
    if (tag === 'svg' || tag === 'g' || tag === 'a' || tag === 'switch' || tag === 'symbol') {
      if (tag === 'svg' && el !== root) m = multiply(m, [1, 0, 0, 1, lengthAttr(el, 'x'), lengthAttr(el, 'y')]);
      for (const child of Array.from(el.children)) walk(child, m, style, depth + 1);
      return;
    }
    const subs = elementSubpaths(el);
    if (!subs.length) return;
    const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    shapes.push({
      subpaths: subs.map((s) => ({ closed: s.closed, points: s.points.map((p) => apply(m, p)) })),
      style,
      name: el.getAttribute('id') ?? el.getAttribute('inkscape:label'),
      scale,
    });
  };

  // viewBox → user space transform is handled by measuring content bounds later.
  walk(root, IDENTITY, base, 0);
  return { shapes, root };
}

export interface SvgImportOptions {
  hoop: { width: number; height: number };
  threads: Thread[];
  /** Fraction of the smaller hoop side the artwork may fill when it has no physical size. */
  fit?: number;
}

/** Import SVG text into stitch objects, centered in the hoop. */
export function importSvg(text: string, o: SvgImportOptions): SvgImportResult {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const { shapes, root } = collectShapes(doc);
  // Content bounds in user units.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of shapes) {
    for (const sp of s.subpaths) {
      for (const [x, y] of sp.points) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (!shapes.length || !Number.isFinite(minX)) throw new Error('No shapes found in this SVG.');
  const cw = Math.max(maxX - minX, 1e-6);
  const ch = Math.max(maxY - minY, 1e-6);

  // Scale: physical units if declared and it fits; otherwise fit to the hoop.
  const vb = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const physW = physicalMm(root.getAttribute('width'));
  let unitsPerUser: number | null = null; // 0.1 mm per user unit
  if (physW && vb.length === 4 && vb[2] > 0) unitsPerUser = (physW * 10) / vb[2];
  else if (physW && !root.getAttribute('viewBox')) unitsPerUser = (physW * 10) / lengthAttrNum(root.getAttribute('width'));
  const maxW = o.hoop.width * 0.9;
  const maxH = o.hoop.height * 0.9;
  const fitSide = Math.min(o.hoop.width, o.hoop.height) * (o.fit ?? 0.6);
  let s = unitsPerUser ?? fitSide / Math.max(cw, ch);
  if (cw * s > maxW || ch * s > maxH) s = Math.min(maxW / cw, maxH / ch);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const toUnits = (p: V): P => [(p[0] - cx) * s, (p[1] - cy) * s];

  let threads = o.threads;
  const objects: StitchObject[] = [];
  const round = (pts: P[]): Pt[] => pts.map(([x, y]) => [Math.round(x), Math.round(y)]);
  let shapeNo = 0;
  for (const shape of shapes) {
    shapeNo++;
    const label = shape.name ? humanize(shape.name) : null;
    if (shape.style.fill) {
      const rings = shape.subpaths
        .filter((sp) => sp.points.length >= 3)
        .map((sp) => simplifyRing(sp.points.map(toUnits), 0.6));
      const areas = fillAreas(rings, shape.style.fillRule).filter((a) => ringArea(a.outer) > 100);
      if (areas.length) {
        const res = ensureThread(threads, shape.style.fill);
        threads = res.threads;
        const geometry: Geometry =
          areas.length === 1 && areas[0].holes.length === 0
            ? { kind: 'polygon', points: round(areas[0].outer) }
            : { kind: 'compound', parts: areas.map((a) => ({ points: round(a.outer), holes: a.holes.map(round) })) };
        objects.push(makeObject(label ?? `Shape ${shapeNo}`, 'tatami', res.id, geometry));
      }
    }
    if (shape.style.stroke && shape.style.strokeWidth > 0) {
      const res = ensureThread(threads, shape.style.stroke);
      threads = res.threads;
      const widthUnits = shape.style.strokeWidth * shape.scale * s;
      shape.subpaths.forEach((sp, i) => {
        const pts = sp.closed ? simplifyRing(sp.points.map(toUnits), 0.6) : simplify(sp.points.map(toUnits), 0.6);
        if (pts.length < 2) return;
        const name = `${label ?? `Outline ${shapeNo}`}${shape.subpaths.length > 1 ? ` ${i + 1}` : ''}`;
        if (widthUnits >= 15) {
          // Thick strokes become satin columns of the stroke width.
          const col = columnFromPath(pts, sp.closed, Math.min(widthUnits, 100));
          objects.push(
            makeObject(name, 'satin', res.id, {
              kind: 'satin',
              railA: { kind: 'polyline', points: round(col.a) },
              railB: { kind: 'polyline', points: round(col.b) },
              rungs: 'auto',
            }),
          );
        } else {
          const geometry: Geometry = sp.closed ? { kind: 'polygon', points: round(pts) } : { kind: 'polyline', points: round(pts) };
          objects.push(makeObject(name, 'run', res.id, geometry));
        }
      });
    }
  }
  if (!objects.length) throw new Error('No visible filled or stroked shapes found in this SVG.');
  return { objects, threads, width: Math.round(cw * s), height: Math.round(ch * s) };
}

function lengthAttrNum(v: string | null): number {
  return parseFloat(v ?? '') || 1;
}

function fillAreas(rings: P[][], rule: 'nonzero' | 'evenodd'): Area[] {
  return normalizeAreas(rings.map((r) => ({ outer: r, holes: [] })), rule);
}

function ringArea(pts: P[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return Math.abs(a / 2);
}

function humanize(id: string): string {
  const s = id.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : id;
}

function makeObject(name: string, type: StitchObject['type'], thread: string, geometry: Geometry): StitchObject {
  return {
    id: newId('o'),
    name,
    type,
    thread,
    visible: true,
    locked: false,
    geometry,
    params: type === 'tatami' ? { angleDeg: 45 } : type === 'run' ? { stitchLength: 25, repeats: 1 } : {},
    advanced: { underlay: 'inherit', pullComp: 'inherit', tieIn: true, tieOff: true, trimBefore: false, trimAfter: false },
  };
}
