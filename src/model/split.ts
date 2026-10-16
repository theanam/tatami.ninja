import { booleanAreas, offsetAreas } from '../engine/clip';
import { areasOf, geometryBounds, type Area } from '../engine/geom';
import { newId } from './project';
import { objectsBounds, translateObject } from './transform';
import type { Bounds, Project, Pt, StitchObject } from './types';

/** Space kept free at the hoop's edge (0.1 mm). */
const EDGE = 50;
/** Cut fills overlap by this much (0.1 mm) so no gap shows at the seam. */
const SEAM_OVERLAP = 10;
/** Alignment cross size (0.1 mm). */
const MARK = 60;

export interface Section {
  index: number;
  col: number;
  row: number;
  /** The part of the design this hooping sews (0.1 mm, design coordinates). */
  rect: Bounds;
  objects: StitchObject[];
}

export interface SplitResult {
  cols: number;
  rows: number;
  sections: Section[];
  /** Objects too big for any one hooping (sewn where their center falls; check them). */
  oversize: string[];
}

const rectArea = (b: Bounds): Area => ({
  outer: [
    [b.minX, b.minY],
    [b.maxX, b.minY],
    [b.maxX, b.maxY],
    [b.minX, b.maxY],
  ],
  holes: [],
});
const round = (pts: [number, number][]): Pt[] => pts.map(([x, y]) => [Math.round(x), Math.round(y)]);
const cuttable = (o: StitchObject) => (o.type === 'tatami' || o.type === 'contour') && areasOf(o.geometry).length > 0;

/** Split a design into hoopings that each fit `hoop`. */
export function splitDesign(project: Project, hoop: { width: number; height: number }): SplitResult | null {
  const objs = project.objects.filter((o) => o.visible);
  const B = objectsBounds(objs);
  if (!B) return null;
  const uw = hoop.width - 2 * EDGE;
  const uh = hoop.height - 2 * EDGE;
  if (uw <= 0 || uh <= 0) return null;
  const W = B.maxX - B.minX;
  const H = B.maxY - B.minY;
  const cols = Math.max(1, Math.ceil(W / (uw * 0.92)));
  const rows = Math.max(1, Math.ceil(H / (uh * 0.92)));
  const sw = W / cols;
  const sh = H / rows;
  const sections: Section[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      sections.push({
        index: sections.length,
        col: c,
        row: r,
        rect: { minX: B.minX + c * sw, minY: B.minY + r * sh, maxX: B.minX + (c + 1) * sw, maxY: B.minY + (r + 1) * sh },
        objects: [],
      });
  const slackX = (uw - sw) / 2;
  const slackY = (uh - sh) / 2;
  const oversize: string[] = [];
  const fits = (b: Bounds, s: Section) =>
    b.minX >= s.rect.minX - slackX && b.maxX <= s.rect.maxX + slackX && b.minY >= s.rect.minY - slackY && b.maxY <= s.rect.maxY + slackY;
  // Sewing order inside each hooping follows the design (cut pieces keep their object's place).
  const rank = new Map<string, number>();
  objs.forEach((o, i) => {
    const b = geometryBounds(o.geometry);
    if (!b) return;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const home = sections.find((s) => cx >= s.rect.minX - 0.5 && cx <= s.rect.maxX + 0.5 && cy >= s.rect.minY - 0.5 && cy <= s.rect.maxY + 0.5) ?? sections[0];
    if (fits(b, home)) {
      rank.set(o.id, i);
      home.objects.push(o);
      return;
    }
    if (cuttable(o)) {
      // Cut the fill along the section edges (with a little overlap at each seam).
      const own = areasOf(o.geometry);
      sections.forEach((s) => {
        const piece = booleanAreas(own, [rectArea({ minX: s.rect.minX - SEAM_OVERLAP, minY: s.rect.minY - SEAM_OVERLAP, maxX: s.rect.maxX + SEAM_OVERLAP, maxY: s.rect.maxY + SEAM_OVERLAP })], 'intersection');
        const real = offsetAreas(piece, -2).length > 0;
        if (!real) return;
        const id = newId('o');
        rank.set(id, i);
        s.objects.push({
          ...o,
          id,
          name: `${o.name} (${s.index + 1})`,
          geometry: { kind: 'compound', parts: piece.map((a) => ({ points: round(a.outer), holes: a.holes.map(round) })) },
          text: undefined,
        });
      });
      return;
    }
    oversize.push(o.id);
    rank.set(o.id, i);
    home.objects.push(o);
  });
  for (const s of sections) s.objects.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return { cols, rows, sections, oversize };
}

/**
 * The project for one hooping: its objects centered in the physical hoop, preceded by small
 * alignment crosses at the section's corners (neighbors sew the same crosses, so each new
 * hooping can be lined up with the stitches already on the fabric).
 */
export function sectionProject(project: Project, split: SplitResult, s: Section, hoop: { id: string; width: number; height: number }): Project {
  const cx = Math.round((s.rect.minX + s.rect.maxX) / 2);
  const cy = Math.round((s.rect.minY + s.rect.maxY) / 2);
  const marks: StitchObject[] = [];
  if (split.sections.length > 1) {
    const thread = s.objects[0]?.thread ?? project.threads[0]?.id ?? '';
    const corners: [number, number][] = [
      [s.rect.minX, s.rect.minY],
      [s.rect.maxX, s.rect.minY],
      [s.rect.minX, s.rect.maxY],
      [s.rect.maxX, s.rect.maxY],
    ];
    for (const [x, y] of corners) {
      const X = Math.round(x);
      const Y = Math.round(y);
      marks.push({
        id: newId('o'),
        name: 'Alignment mark',
        type: 'run',
        thread,
        visible: true,
        locked: false,
        geometry: { kind: 'polyline', points: [[X - MARK / 2, Y], [X + MARK / 2, Y], [X, Y], [X, Y - MARK / 2], [X, Y + MARK / 2]] },
        params: { stitchLength: 20 },
        advanced: { trimAfter: true },
      });
    }
  }
  const objects = [...marks, ...s.objects].map((o) => translateObject(o, -cx, -cy));
  return { ...project, hoop: { id: hoop.id, width: hoop.width, height: hoop.height }, objects };
}
