/**
 * Built-in design library: simple shapes, frames and motifs drawn in code as SVG (so they are
 * crisp at any size) and inserted through the normal SVG import, which turns them into
 * editable fills, satins and runs.
 */

export type LibraryCategory = 'shapes' | 'frames' | 'nature' | 'symbols';

export interface LibraryItem {
  id: string;
  name: string;
  category: LibraryCategory;
  /** Size it is inserted at (mm, longest side). */
  mm: number;
  svg: string;
}

export const LIBRARY_CATEGORIES: { id: LibraryCategory; label: string }[] = [
  { id: 'shapes', label: 'Shapes' },
  { id: 'frames', label: 'Frames' },
  { id: 'nature', label: 'Nature' },
  { id: 'symbols', label: 'Symbols' },
];

const f = (n: number) => n.toFixed(2);
const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
const circle = (cx: number, cy: number, r: number) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
const ring = (n: number, r0: number, r1: number, start = -Math.PI / 2): [number, number][] =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = start + (i * Math.PI) / n;
    const r = i % 2 ? r1 : r0;
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
  });
const roundRect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`;

function heartPath(cx = 50, cy = 52, s = 2.6): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 64; i++) {
    const t = (2 * Math.PI * i) / 64;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([cx + x * s, cy - y * s]);
  }
  return poly(pts);
}

function scallopRing(n: number, r: number, bump: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 12; i++) {
    const a = (2 * Math.PI * i) / (n * 12);
    const k = Math.abs(Math.sin((n * a) / 2));
    pts.push([50 + (r + bump * k) * Math.cos(a), 50 + (r + bump * k) * Math.sin(a)]);
  }
  return pts;
}

function leafPath(cx: number, cy: number, len: number, wid: number, rot: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push([t * len, Math.sin(Math.PI * t) * wid * (1 - 0.3 * t)]);
  }
  for (let i = 24; i >= 0; i--) {
    const t = i / 24;
    pts.push([t * len, -Math.sin(Math.PI * t) * wid * (1 - 0.3 * t)]);
  }
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return poly(pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]));
}

const svg = (body: string, mm: number, fill = '#24357A', extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${mm}mm" height="${mm}mm" viewBox="0 0 100 100"><path fill="${fill}" fill-rule="evenodd" d="${body}"/>${extra}</svg>`;

export const LIBRARY: LibraryItem[] = [
  { id: 'star', name: 'Star', category: 'shapes', mm: 40, svg: svg(poly(ring(5, 46, 19)), 40, '#D4A43A') },
  { id: 'star6', name: 'Six-point star', category: 'shapes', mm: 40, svg: svg(poly(ring(6, 46, 24)), 40, '#D4A43A') },
  { id: 'heart', name: 'Heart', category: 'shapes', mm: 40, svg: svg(heartPath(), 40, '#C8323C') },
  { id: 'circle', name: 'Circle', category: 'shapes', mm: 40, svg: svg(circle(50, 50, 45), 40) },
  { id: 'hexagon', name: 'Hexagon', category: 'shapes', mm: 40, svg: svg(poly(Array.from({ length: 6 }, (_, i) => [50 + 46 * Math.cos((Math.PI / 3) * i), 50 + 46 * Math.sin((Math.PI / 3) * i)] as [number, number])), 40) },
  { id: 'shield', name: 'Shield', category: 'shapes', mm: 45, svg: svg('M10 8H90V45C90 70 72 86 50 95C28 86 10 70 10 45Z', 45) },
  { id: 'drop', name: 'Drop', category: 'shapes', mm: 40, svg: svg('M50 4C62 28 82 46 82 64A32 32 0 0 1 18 64C18 46 38 28 50 4Z', 40, '#2E7DAF') },
  { id: 'ring', name: 'Ring frame', category: 'frames', mm: 60, svg: svg(circle(50, 50, 48) + circle(50, 50, 42), 60) },
  { id: 'rect-frame', name: 'Rounded frame', category: 'frames', mm: 70, svg: svg(roundRect(3, 18, 94, 64, 12) + roundRect(9, 24, 82, 52, 7), 70) },
  { id: 'scallop', name: 'Scallop frame', category: 'frames', mm: 60, svg: svg(poly(scallopRing(16, 43, 5)) + circle(50, 50, 39), 60, '#2F7D5B') },
  { id: 'starburst', name: 'Starburst badge', category: 'frames', mm: 55, svg: svg(poly(ring(24, 48, 42)), 55, '#C8323C') },
  { id: 'banner', name: 'Banner', category: 'frames', mm: 80, svg: svg('M14 34H86V66H14ZM2 42H14V74H2L8 58ZM98 42H86V74H98L92 58Z', 80, '#24357A') },
  { id: 'oval', name: 'Oval frame', category: 'frames', mm: 70, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="70mm" height="50mm" viewBox="0 0 140 100"><path fill="#24357A" fill-rule="evenodd" d="M2 50A68 48 0 1 0 138 50A68 48 0 1 0 2 50ZM9 50A61 41 0 1 0 131 50A61 41 0 1 0 9 50Z"/></svg>` },
  { id: 'leaf', name: 'Leaf', category: 'nature', mm: 45, svg: svg(leafPath(8, 60, 88, 22, -0.45), 45, '#2F7D5B') },
  {
    id: 'flower',
    name: 'Flower',
    category: 'nature',
    mm: 45,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="45mm" height="45mm" viewBox="0 0 100 100">${Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i;
      return `<circle fill="#E07A5F" cx="${f(50 + 26 * Math.cos(a))}" cy="${f(50 + 26 * Math.sin(a))}" r="20"/>`;
    }).join('')}<circle fill="#D4A43A" cx="50" cy="50" r="15"/></svg>`,
  },
  {
    id: 'sun',
    name: 'Sun',
    category: 'nature',
    mm: 50,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="50mm" viewBox="0 0 100 100"><path fill="#E8A33D" d="${poly(ring(12, 48, 34))}"/><circle fill="#F2C94C" cx="50" cy="50" r="28"/></svg>`,
  },
  { id: 'moon', name: 'Crescent moon', category: 'nature', mm: 40, svg: svg('M62 6A45 45 0 1 0 94 70A36 36 0 1 1 62 6Z', 40, '#D4A43A') },
  {
    id: 'paw',
    name: 'Paw',
    category: 'nature',
    mm: 40,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="40mm" viewBox="0 0 100 100"><g fill="#5B4636"><ellipse cx="50" cy="68" rx="24" ry="20"/><ellipse cx="20" cy="42" rx="10" ry="13"/><ellipse cx="38" cy="22" rx="10" ry="14"/><ellipse cx="62" cy="22" rx="10" ry="14"/><ellipse cx="80" cy="42" rx="10" ry="13"/></g></svg>`,
  },
  { id: 'clover', name: 'Clover', category: 'nature', mm: 40, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="40mm" viewBox="0 0 100 100"><g fill="#2F7D5B"><circle cx="50" cy="28" r="20"/><circle cx="29" cy="52" r="20"/><circle cx="71" cy="52" r="20"/><path d="M47 60H53L56 96H44Z"/></g></svg>` },
  { id: 'crown', name: 'Crown', category: 'symbols', mm: 45, svg: svg('M8 80L4 26L28 50L50 14L72 50L96 26L92 80Z', 45, '#D4A43A') },
  { id: 'bolt', name: 'Lightning', category: 'symbols', mm: 40, svg: svg('M58 2L16 56H44L36 98L84 38H54Z', 40, '#E8A33D') },
  { id: 'check', name: 'Check mark', category: 'symbols', mm: 35, svg: svg('M6 52L20 38L40 58L80 14L94 28L40 86Z', 35, '#2F7D5B') },
  { id: 'arrow', name: 'Arrow', category: 'symbols', mm: 45, svg: svg('M4 40H60V18L96 50L60 82V60H4Z', 45) },
  { id: 'anchor-cross', name: 'Cross', category: 'symbols', mm: 35, svg: svg('M38 4H62V38H96V62H62V96H38V62H4V38H38Z', 35, '#C8323C') },
  { id: 'house', name: 'House', category: 'symbols', mm: 40, svg: svg('M50 6L94 46H82V92H58V64H42V92H18V46H6Z', 40) },
  { id: 'note', name: 'Music note', category: 'symbols', mm: 40, svg: svg('M40 70V12L86 4V60A12 10 0 1 1 78 52V22L48 27V78A12 10 0 1 1 40 70Z', 40) },
];
