import { describe, expect, it } from 'vitest';
import sample from '../model/harbor-club-badge.tatami.json';
import { CMD, type Project, type StitchObject } from '../model/types';
import { contourFill } from './contour';
import { fillAreas, rowSegments, rowStitches, splitStitch } from './fill';
import { areasOf, circlePoints, dist, type P } from './geom';
import { generatePlan, MAX_STEP } from './plan';
import { beanStitches, runStitches } from './run';
import { columnFromRails, satinStitches } from './satin';
import { checkWarnings } from './warnings';

const project = sample as unknown as Project;

function baseProject(objects: StitchObject[]): Project {
  return { ...project, objects, threads: project.threads };
}

function obj(partial: Partial<StitchObject>): StitchObject {
  return {
    id: 'x',
    name: 'X',
    type: 'run',
    thread: 't1',
    visible: true,
    locked: false,
    geometry: { kind: 'polyline', points: [[0, 0], [100, 0]] },
    params: {},
    advanced: { tieIn: false, tieOff: false },
    ...partial,
  };
}

describe('run stitches', () => {
  it('splits a straight line into equal stitches no longer than the stitch length', () => {
    const st = runStitches([[0, 0], [100, 0]], false, 25);
    expect(st[0]).toEqual([0, 0]);
    expect(st[st.length - 1]).toEqual([100, 0]);
    for (let i = 1; i < st.length; i++) expect(dist(st[i - 1], st[i])).toBeLessThanOrEqual(25.0001);
    expect(st.length).toBe(5);
  });

  it('keeps sharp corners', () => {
    const st = runStitches([[0, 0], [100, 0], [100, 100]], false, 30);
    expect(st.some((p) => p[0] === 100 && p[1] === 0)).toBe(true);
  });

  it('closes rings back at the start, starting near the requested point', () => {
    const ring: P[] = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const st = runStitches(ring, true, 25, [101, 99]);
    expect(st[0]).toEqual([100, 100]);
    expect(st[st.length - 1]).toEqual([100, 100]);
  });

  it('builds bean (triple) stitches', () => {
    const st = beanStitches([[0, 0], [10, 0], [20, 0]], 3);
    expect(st).toEqual([[0, 0], [10, 0], [0, 0], [10, 0], [20, 0], [10, 0], [20, 0]]);
  });
});

describe('tatami fill', () => {
  const square = [{ outer: [[0, 0], [200, 0], [200, 200], [0, 200]] as P[], holes: [] }];

  it('creates rows at the row spacing', () => {
    const rows = rowSegments(square, 4);
    expect(rows.length).toBe(50);
    expect(rows[0][0].x0).toBeCloseTo(0);
    expect(rows[0][0].x1).toBeCloseTo(200);
  });

  it('applies pull compensation to both ends of each row', () => {
    const rows = rowSegments(square, 4, 4);
    expect(rows[0][0].x0).toBeCloseTo(-2);
    expect(rows[0][0].x1).toBeCloseTo(202);
  });

  it('leaves holes empty', () => {
    const withHole = [{ outer: square[0].outer, holes: [[[50, 50], [150, 50], [150, 150], [50, 150]]] as P[][] }];
    const groups = fillAreas(withHole, { angleDeg: 0, spacing: 4, stitchLen: 30 });
    for (const g of groups) {
      for (const p of g) {
        const inHole = p[0] > 52 && p[0] < 148 && p[1] > 52 && p[1] < 148;
        expect(inHole).toBe(false);
      }
    }
  });

  it('uses a brick offset between rows', () => {
    const a = rowStitches(0, 200, 0, 0, 40).map((p) => p[0]);
    const b = rowStitches(0, 200, 4, 1, 40).map((p) => p[0]);
    expect(a.slice(1, -1)).toContain(40);
    expect(b.slice(1, -1)).toContain(60);
  });

  it('honors the fill angle', () => {
    const groups = fillAreas(square, { angleDeg: 90, spacing: 4, stitchLen: 30 });
    const pts = groups.flat();
    // Vertical rows: consecutive stitches within a row share x.
    let vertical = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - pts[i - 1][0]) < 0.01) vertical++;
    expect(vertical / pts.length).toBeGreaterThan(0.8);
  });

  it('is deterministic', () => {
    const a = fillAreas(areasOf({ kind: 'circle', cx: 0, cy: 0, r: 300 }), { angleDeg: 45, spacing: 4, stitchLen: 35 });
    const b = fillAreas(areasOf({ kind: 'circle', cx: 0, cy: 0, r: 300 }), { angleDeg: 45, spacing: 4, stitchLen: 35 });
    expect(a).toEqual(b);
  });

  it('splits long satin stitches with a stagger', () => {
    expect(splitStitch([0, 0], [100, 0], 80, 0)).toEqual([[50, 0], [100, 0]]);
    expect(splitStitch([0, 0], [100, 0], 80, 1)).toEqual([[25, 0], [75, 0], [100, 0]]);
  });
});

describe('satin', () => {
  it('zigzags between two circular rails', () => {
    const col = columnFromRails({ kind: 'circle', cx: 0, cy: 0, r: 350 }, { kind: 'circle', cx: 0, cy: 0, r: 412 });
    const st = satinStitches(col, { density: 4, pullComp: 0, shortStitches: false, splitAbove: 80 });
    expect(st.length).toBeGreaterThan(1000);
    for (const p of st) {
      const r = Math.hypot(p[0], p[1]);
      expect(r).toBeGreaterThan(345);
      expect(r).toBeLessThan(417);
    }
    // Alternates sides.
    const r0 = Math.hypot(...st[0]);
    const r1 = Math.hypot(...st[1]);
    expect(Math.abs(r0 - r1)).toBeGreaterThan(50);
  });

  it('pairs rails by vertex for satin-tool columns', () => {
    const col = columnFromRails(
      { kind: 'polyline', points: [[0, 0], [100, 0], [200, 50]] },
      { kind: 'polyline', points: [[0, 40], [100, 40], [180, 80]] },
    );
    expect(col.a[0]).toEqual([0, 0]);
    expect(col.b[0]).toEqual([0, 40]);
    expect(col.a[col.a.length - 1]).toEqual([200, 50]);
  });
});

describe('contour fill', () => {
  it('produces concentric rings inside the shape', () => {
    const groups = contourFill(areasOf({ kind: 'circle', cx: 0, cy: 0, r: 100 }), 10, 25);
    const pts = groups.flat();
    expect(pts.length).toBeGreaterThan(50);
    for (const p of pts) expect(Math.hypot(p[0], p[1])).toBeLessThanOrEqual(100);
  });
});

describe('plan', () => {
  it('generates the sample badge with color change and plausible counts', () => {
    const plan = generatePlan(project);
    expect(plan.colorBlocks).toEqual(['t1', 't2']);
    expect(plan.colorChanges).toBe(1);
    expect(plan.stitchCount).toBeGreaterThan(3000);
    expect(plan.objectStats.map((s) => s.id)).toEqual(['o1', 'o2', 'o3', 'o4']);
    for (const s of plan.objectStats) expect(s.stitches).toBeGreaterThan(50);
    expect(plan.cmds[plan.cmds.length - 1]).toBe(CMD.END);
    // Design is ~82 mm wide.
    const w = (plan.bounds!.maxX - plan.bounds!.minX) / 10;
    expect(w).toBeGreaterThan(80);
    expect(w).toBeLessThan(86);
  });

  it('never moves further than the max step in one command', () => {
    const plan = generatePlan(project);
    for (let i = 1; i < plan.cmds.length; i++) {
      if (plan.cmds[i] !== CMD.STITCH && plan.cmds[i] !== CMD.JUMP) continue;
      const d = Math.hypot(plan.xs[i] - plan.xs[i - 1], plan.ys[i] - plan.ys[i - 1]);
      expect(d).toBeLessThanOrEqual(MAX_STEP + 1);
    }
  });

  it('is deterministic', () => {
    const a = generatePlan(project);
    const b = generatePlan(project);
    expect(Array.from(a.xs)).toEqual(Array.from(b.xs));
    expect(Array.from(a.cmds)).toEqual(Array.from(b.cmds));
  });

  it('skips hidden objects', () => {
    const p = { ...project, objects: project.objects.map((o, i) => ({ ...o, visible: i !== 0 })) };
    const plan = generatePlan(p);
    expect(plan.colorBlocks).toEqual(['t2']);
    expect(plan.objectStats[0].stitches).toBe(0);
  });

  it('inserts trims before long jumps and color changes', () => {
    const p = baseProject([
      obj({ id: 'a', geometry: { kind: 'polyline', points: [[0, 0], [100, 0]] } }),
      obj({ id: 'b', geometry: { kind: 'polyline', points: [[500, 0], [600, 0]] } }),
      obj({ id: 'c', thread: 't2', geometry: { kind: 'polyline', points: [[600, 10], [700, 10]] } }),
    ]);
    const plan = generatePlan(p);
    const cmds = Array.from(plan.cmds);
    const firstB = cmds.findIndex((c, i) => c === CMD.STITCH && plan.obj[i] === 1);
    expect(cmds.slice(0, firstB)).toContain(CMD.TRIM);
    expect(cmds).toContain(CMD.COLOR_CHANGE);
    expect(plan.colorBlocks).toEqual(['t1', 't2']);
  });

  it('sews short travel as a stitch instead of a jump', () => {
    const p = baseProject([
      obj({ id: 'a', geometry: { kind: 'polyline', points: [[0, 0], [100, 0]] } }),
      obj({ id: 'b', geometry: { kind: 'polyline', points: [[110, 0], [200, 0]] } }),
    ]);
    const plan = generatePlan(p);
    expect(plan.trims).toBe(0);
    expect(plan.jumps).toBe(1); // only the initial move to the start
  });

  it('adds tie-in and tie-off stitches', () => {
    const tied = generatePlan(baseProject([obj({ advanced: { tieIn: true, tieOff: true } })]));
    const untied = generatePlan(baseProject([obj({})]));
    expect(tied.stitchCount).toBe(untied.stitchCount + 4);
  });

  it('emits stops for appliqué', () => {
    const plan = generatePlan(
      baseProject([obj({ type: 'applique', geometry: { kind: 'circle', cx: 0, cy: 0, r: 200 } })]),
    );
    expect(plan.stops).toBe(2);
  });

  it('replays raw stitch-file objects', () => {
    const plan = generatePlan(
      baseProject([obj({ type: 'stitches', geometry: { kind: 'stitches', data: [0, 0, 1, 10, 0, 0, 20, 0, 0, 30, 5, 0] } })]),
    );
    expect(plan.stitchCount).toBe(3);
  });

  it('handles every stitch type on every geometry without throwing', () => {
    const geos: StitchObject['geometry'][] = [
      { kind: 'circle', cx: 0, cy: 0, r: 150 },
      { kind: 'polygon', points: circlePoints(0, 0, 100).map((p) => [Math.round(p[0]), Math.round(p[1])]) },
      { kind: 'polyline', points: [[0, 0], [200, 50], [300, 0]] },
      { kind: 'satin', railA: { kind: 'polyline', points: [[0, 0], [300, 0]] }, railB: { kind: 'polyline', points: [[0, 50], [300, 50]] }, rungs: 'auto' },
      { kind: 'compound', parts: [{ points: [[0, 0], [100, 0], [100, 100], [0, 100]], holes: [[[30, 30], [70, 30], [70, 70], [30, 70]]] }] },
    ];
    for (const type of ['run', 'satin', 'tatami', 'contour', 'applique'] as const) {
      for (const geometry of geos) {
        const plan = generatePlan(baseProject([obj({ type, geometry, advanced: {} })]));
        expect(plan.cmds.length).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('warnings', () => {
  it('reports no warnings for the sample badge', () => {
    const plan = generatePlan(project);
    expect(checkWarnings(project, plan)).toEqual([]);
  });

  it('flags designs outside the hoop', () => {
    const p = { ...project, hoop: { id: '100x100', width: 700, height: 700 } };
    const w = checkWarnings(p, generatePlan(p));
    const hoop = w.find((x) => x.kind === 'out-of-hoop');
    expect(hoop?.severity).toBe('error');
    expect(hoop?.objectIds).toContain('o4');
  });

  it('flags short stitches', () => {
    const zig: [number, number][] = [];
    for (let i = 0; i < 40; i++) zig.push([i * 6, i % 2 ? 6 : 0]);
    const p = baseProject([obj({ id: 'z', name: 'Zig', geometry: { kind: 'polyline', points: zig }, params: { stitchLength: 25 } })]);
    const w = checkWarnings(p, generatePlan(p));
    expect(w.find((x) => x.kind === 'short-stitches')?.message).toMatch(/in Zig/);
  });

  it('does not flag a satin border over a fill (normal practice)', () => {
    const p = baseProject(project.objects.filter((o) => o.id === 'o1' || o.id === 'o4'));
    expect(checkWarnings(p, generatePlan(p)).filter((w) => w.kind === 'density')).toEqual([]);
  });

  it('flags layered dense fills', () => {
    const sq = { kind: 'polygon' as const, points: [[0, 0], [200, 0], [200, 200], [0, 200]] as [number, number][] };
    const p = baseProject([
      obj({ id: 'a', name: 'A', type: 'tatami', geometry: sq, params: { rowSpacing: 2 } }),
      obj({ id: 'b', name: 'B', type: 'tatami', geometry: sq, params: { rowSpacing: 2, angleDeg: 0 } }),
      obj({ id: 'c', name: 'C', type: 'tatami', geometry: sq, params: { rowSpacing: 2, angleDeg: 90 } }),
    ]);
    const w = checkWarnings(p, generatePlan(p));
    expect(w.some((x) => x.kind === 'density')).toBe(true);
  });

  it('flags small lettering', () => {
    const p = baseProject([
      obj({ id: 't', name: 'Name', type: 'tatami', geometry: { kind: 'circle', cx: 0, cy: 0, r: 20 }, text: { content: 'A', font: 'geist', height: 30, spacing: 0, arc: 0, x: 0, y: 0 } }),
    ]);
    expect(checkWarnings(p, generatePlan(p)).some((x) => x.kind === 'small-text')).toBe(true);
  });
});

describe('gaps and entry/exit points', () => {
  const sq = (x: number): StitchObject['geometry'] => ({ kind: 'polygon', points: [[x, 0], [x + 100, 0], [x + 100, 100], [x, 100]] });

  it('flags a small gap between differently colored shapes', () => {
    const p = baseProject([
      obj({ id: 'a', name: 'Left', type: 'tatami', geometry: sq(0) }),
      obj({ id: 'b', name: 'Right', type: 'tatami', thread: 't2', geometry: sq(105) }),
    ]);
    const gap = checkWarnings(p, generatePlan(p)).find((w) => w.kind === 'gap');
    expect(gap?.message).toMatch(/Left and Right are 0\.5 mm apart/);
  });

  it('does not flag touching, overlapping or far-apart shapes', () => {
    for (const x of [100, 90, 300]) {
      const p = baseProject([
        obj({ id: 'a', type: 'tatami', geometry: sq(0) }),
        obj({ id: 'b', type: 'tatami', thread: 't2', geometry: sq(x) }),
      ]);
      expect(checkWarnings(p, generatePlan(p)).filter((w) => w.kind === 'gap')).toEqual([]);
    }
  });

  it('starts sewing at the entry point', () => {
    const p = baseProject([obj({ id: 'r', geometry: { kind: 'polyline', points: [[0, 0], [300, 0]] }, entry: [300, 0] })]);
    const plan = generatePlan(p);
    // The needle jumps to the entry point, then stitches away from it.
    expect(plan.cmds[0]).toBe(CMD.JUMP);
    expect(plan.xs[0]).toBe(300);
  });

  it('ends near the exit point when no entry is set', () => {
    const p = baseProject([obj({ id: 'r', geometry: { kind: 'polyline', points: [[0, 0], [300, 0]] }, exit: [0, 0] })]);
    const plan = generatePlan(p);
    const st = plan.objectStats[0];
    let last = -1;
    for (let i = st.start; i < st.end; i++) if (plan.cmds[i] === CMD.STITCH) last = i;
    expect(plan.xs[last]).toBe(0);
  });
});

describe('safety limits', () => {
  it('skips objects larger than any hoop instead of generating millions of stitches', () => {
    const t0 = performance.now();
    const p = baseProject([
      obj({ id: 'big', name: 'Huge', type: 'tatami', geometry: { kind: 'circle', cx: 0, cy: 0, r: 10_000 } }),
      obj({ id: 'ok', type: 'tatami', geometry: { kind: 'circle', cx: 0, cy: 0, r: 100 } }),
    ]);
    const plan = generatePlan(p);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(plan.skipped).toEqual(['big']);
    expect(plan.objectStats[1].stitches).toBeGreaterThan(50);
    const w = checkWarnings(p, plan).find((x) => x.kind === 'too-large');
    expect(w?.severity).toBe('error');
    expect(w?.message).toMatch(/Huge is too large/);
  });

  it('skips objects that would be too dense to stitch', () => {
    const p = baseProject([obj({ id: 'd', type: 'tatami', geometry: { kind: 'circle', cx: 0, cy: 0, r: 2900 }, params: { rowSpacing: 1 } })]);
    expect(generatePlan(p).skipped).toEqual(['d']);
  });

  it('stops the plan at the stitch limit', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      obj({ id: `f${i}`, type: 'tatami', geometry: { kind: 'circle', cx: 0, cy: 0, r: 1400 }, params: { rowSpacing: 2 } }),
    );
    const plan = generatePlan(baseProject(many));
    expect(plan.truncated).toBe(true);
    expect(plan.stitchCount).toBeLessThan(400_000);
  });
});
