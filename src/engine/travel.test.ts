import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultTextSpec, layoutText, loadFont, makeTextObject } from '../importers/lettering';
import sample from '../model/harbor-club-badge.tatami.json';
import { CMD, type Project } from '../model/types';
import { circlePoints, type Area } from './geom';
import { generatePlan } from './plan';
import { travelContext, travelPath } from './travel';

const diskFetch = async (url: string) => {
  const buf = readFileSync(resolve(__dirname, '../../public/lettering', url.split('/').pop()!));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};
const fixture = () => JSON.parse(JSON.stringify(sample)) as Project;

describe('travel inside objects', () => {
  it('goes straight when it can, around the edge when it must, and never far', () => {
    // A C shape: the straight line between the tips crosses the gap.
    const ring: Area = { outer: circlePoints(0, 0, 100), holes: [circlePoints(0, 0, 70)] };
    const ctx = travelContext([ring]);
    expect(travelPath(ctx, [72, 0], [98, 0])).toEqual([[85, 0], [98, 0]]);
    const around = travelPath(ctx, [85, 0], [-85, 0])!;
    expect(around.length).toBeGreaterThan(5);
    for (const [x, y] of around) expect(Math.hypot(x, y)).toBeGreaterThan(68);
    for (let i = 1; i < around.length; i++) expect(Math.hypot(around[i][0] - around[i - 1][0], around[i][1] - around[i - 1][1])).toBeGreaterThan(9);
    expect(travelPath(ctx, [175, 0], [900, 0])).toBeNull();
  });

  it('a satin ring and its underlay sew without trims inside', () => {
    const p = fixture();
    const border = p.objects.findIndex((o) => o.name === 'Border');
    const plan = generatePlan(p);
    const st = plan.objectStats[border];
    let trims = 0;
    for (let i = st.start; i < st.end; i++) if (plan.cmds[i] === CMD.TRIM && plan.obj[i] === border) trims++;
    expect(trims).toBe(0);
  });

  it('lettering sews letter by letter, left to right', async () => {
    const font = await loadFont('geist', diskFetch);
    const spec = { ...defaultTextSpec(0, 0, 'ABCDEFG'), height: 100, spacing: 20 };
    const p = { ...fixture(), objects: [makeTextObject(spec, layoutText(font, spec), 't1')] };
    const plan = generatePlan(p);
    // Every jump moves to the right: no going back.
    for (let i = 1; i < plan.cmds.length; i++) {
      if (plan.cmds[i] === CMD.JUMP && plan.cmds[i - 1] !== CMD.JUMP && plan.xs[i - 1] !== 0) expect(plan.xs[i]).toBeGreaterThan(plan.xs[i - 1] - 60);
    }
    expect(plan.trims).toBeLessThanOrEqual(7);
  });
});
