import type { Pt, StitchObject } from '../model/types';
import { areaOfAreas, booleanAreas, offsetAreas } from './clip';
import { areasOf, type Area } from './geom';

/** Lower layers keep this much (0.1 mm) under the edge of what covers them, so no gaps show. */
export const HIDDEN_OVERLAP = 10;

const covers = (o: StitchObject) => o.visible && o.geometry.kind !== 'stitches' && o.type !== 'run' && o.type !== 'applique';
const cuttable = (o: StitchObject) => o.visible && (o.type === 'tatami' || o.type === 'contour') && !o.text;

/**
 * Remove the parts of fills that later objects sew over (they would be hidden and only add
 * stiffness and thread). Returns a new object list; untouched objects keep their identity.
 */
export function removeHiddenStitches(objects: StitchObject[]): StitchObject[] {
  const out = objects.slice();
  let cover: Area[] = [];
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (cuttable(o) && cover.length) {
      const own = areasOf(o.geometry);
      const cut = booleanAreas(own, offsetAreas(cover, -HIDDEN_OVERLAP), 'difference');
      // Leave objects that nothing really covers exactly as they are.
      if (areaOfAreas(own) - areaOfAreas(cut) < 1) {
        if (covers(o)) cover = booleanAreas(cover, own, 'union');
        continue;
      }
      const round = (pts: [number, number][]): Pt[] => pts.map(([x, y]) => [Math.round(x), Math.round(y)]);
      out[i] = { ...o, geometry: { kind: 'compound', parts: cut.map((a) => ({ points: round(a.outer), holes: a.holes.map(round) })) } };
    }
    if (covers(o)) {
      const a = areasOf(o.geometry);
      if (a.length) cover = cover.length ? booleanAreas(cover, a, 'union') : a;
    }
  }
  return out;
}
