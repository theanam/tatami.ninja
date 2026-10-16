import { areasOf } from '../engine/geom';
import type { StitchObject } from '../model/types';

/**
 * The appliqué fabric pieces as an SVG at true size (mm), for a cutting machine or to print
 * as a template. Each piece keeps its holes.
 */
export function appliqueCutSvg(objs: StitchObject[]): string | null {
  const areas = objs.filter((o) => o.type === 'applique').flatMap((o) => areasOf(o.geometry));
  if (!areas.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const a of areas)
    for (const [x, y] of a.outer) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  const m = 20; // 2 mm margin
  const mm = (v: number) => (v / 10).toFixed(2);
  const ring = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${mm(x - minX + m)} ${mm(y - minY + m)}`).join('L')}Z`;
  const d = areas.map((a) => [a.outer, ...a.holes].map(ring).join('')).join('');
  const w = mm(maxX - minX + 2 * m);
  const h = mm(maxY - minY + 2 * m);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="none" stroke="#000" stroke-width="0.2" fill-rule="evenodd"/></svg>`;
}
