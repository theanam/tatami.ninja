import { beforeEach, describe, expect, it } from 'vitest';
import sample from '../model/harbor-club-badge.tatami.json';
import { generatePlan } from '../engine/plan';
import { objectsBounds } from '../model/transform';
import type { Project, StitchObject } from '../model/types';
import { useEditor } from './editor';

const fixture = () => JSON.parse(JSON.stringify(sample)) as Project;
const s = () => useEditor.getState();
const ids = () => s().project!.objects.map((o) => o.id);

function square(id: string, x: number, thread = 't1'): StitchObject {
  return {
    id,
    name: id,
    type: 'tatami',
    thread,
    visible: true,
    locked: false,
    geometry: { kind: 'polygon', points: [[x, 0], [x + 100, 0], [x + 100, 100], [x, 100]] },
    params: {},
    advanced: {},
  };
}

beforeEach(() => {
  s().load(fixture());
});

describe('editor store', () => {
  it('loads a project and always opens the Artwork view', () => {
    expect(ids()).toEqual(['o1', 'o2', 'o3', 'o4']);
    expect(s().view).toBe('artwork');
    expect(s().past).toEqual([]);
  });

  it('undoes and redoes edits', () => {
    s().renameObject('o1', 'Background');
    expect(s().project!.objects[0].name).toBe('Background');
    s().undo();
    expect(s().project!.objects[0].name).toBe('Badge fill');
    s().redo();
    expect(s().project!.objects[0].name).toBe('Background');
  });

  it('coalesces slider drags with the same key into one undo step', () => {
    s().setParams(['o1'], { angleDeg: 10 }, 'angle');
    s().setParams(['o1'], { angleDeg: 20 }, 'angle');
    s().setParams(['o1'], { angleDeg: 30 }, 'angle');
    expect(s().past.length).toBe(1);
    s().undo();
    expect(s().project!.objects[0].params.angleDeg).toBe(45);
  });

  it('reorders objects', () => {
    s().moveObject(3, 0);
    expect(ids()).toEqual(['o4', 'o1', 'o2', 'o3']);
  });

  it('toggles visibility and lock', () => {
    s().toggleVisible('o2');
    s().toggleLocked('o3');
    expect(s().project!.objects[1].visible).toBe(false);
    expect(s().project!.objects[2].locked).toBe(true);
  });

  it('does not edit locked objects', () => {
    s().toggleLocked('o1');
    s().setParams(['o1'], { angleDeg: 90 });
    expect(s().project!.objects[0].params.angleDeg).toBe(45);
  });

  it('switches stitch type', () => {
    s().setObjectType(['o1'], 'contour');
    expect(s().project!.objects[0].type).toBe('contour');
  });

  it('auto-orders by color keeping relative order', () => {
    s().addObjects([square('n1', 0, 't1')]);
    expect(ids()).toEqual(['o1', 'o2', 'o3', 'o4', 'n1']);
    s().autoOrderByColor();
    expect(ids()).toEqual(['o1', 'n1', 'o2', 'o3', 'o4']);
  });

  it('deletes and duplicates the selection', () => {
    s().select(['o2']);
    s().duplicateSelected();
    expect(ids().length).toBe(5);
    s().select(['o2']);
    s().deleteSelected();
    expect(ids()).not.toContain('o2');
  });

  it('scales the design to fit the hoop', () => {
    s().update((p) => ({ ...p, hoop: { id: '100x100', width: 700, height: 700 } }));
    s().setEngineResult(generatePlan(s().project!), []);
    s().scaleToFitHoop();
    const b = objectsBounds(s().project!.objects)!;
    expect(b.maxX - b.minX).toBeLessThanOrEqual(700);
    const plan = generatePlan(s().project!);
    expect(plan.bounds!.maxX).toBeLessThanOrEqual(350);
    expect(plan.bounds!.minX).toBeGreaterThanOrEqual(-350);
  });

  it('scales objects the engine skipped (too large) back into the hoop', () => {
    s().addObjects([{ ...square('giant', 0), geometry: { kind: 'circle', cx: 0, cy: 0, r: 20000 } }]);
    s().setEngineResult(generatePlan(s().project!), []);
    s().scaleToFitHoop();
    const plan = generatePlan(s().project!);
    expect(plan.skipped).toEqual([]);
    expect(plan.bounds!.maxX - plan.bounds!.minX).toBeLessThanOrEqual(1300);
  });

  it('merges shapes with a boolean union', () => {
    s().addObjects([square('a', 0), square('b', 50)]);
    s().select(['a', 'b']);
    s().booleanSelected('union');
    const merged = s().project!.objects.find((o) => o.id === s().selection[0])!;
    expect(merged.geometry.kind).toBe('compound');
    expect(ids()).not.toContain('a');
    const b = objectsBounds([merged])!;
    expect(b.maxX - b.minX).toBe(150);
  });

  it('subtracts shapes', () => {
    s().addObjects([square('a', 0), square('b', 50)]);
    s().select(['a', 'b']);
    s().booleanSelected('difference');
    const merged = s().project!.objects.find((o) => o.id === s().selection[0])!;
    const b = objectsBounds([merged])!;
    expect(b.maxX - b.minX).toBe(50);
    expect(ids()).toContain('b');
  });

  it('adds an offset outline as a run object', () => {
    s().offsetOutline('o3', 10);
    const o = s().project!.objects[3];
    expect(o.type).toBe('run');
    expect(o.name).toBe('Star outline');
  });

  it('converts a run path to satin', () => {
    s().addObjects([{ ...square('r', 0), type: 'run', geometry: { kind: 'polyline', points: [[0, 0], [300, 0]] } }]);
    s().convertToSatin(['r'], 40);
    const o = s().project!.objects.find((x) => x.id === 'r')!;
    expect(o.type).toBe('satin');
    expect(o.geometry.kind).toBe('satin');
  });

  it('changes satin width around the center line', () => {
    s().setSatinWidth(['o4'], 40);
    const g = s().project!.objects[3].geometry;
    if (g.kind !== 'satin' || g.railA.kind !== 'circle' || g.railB.kind !== 'circle') throw new Error('bad geometry');
    expect(g.railB.r - g.railA.r).toBe(40);
    expect((g.railA.r + g.railB.r) / 2).toBe(381);
  });

  it('adds and edits threads', () => {
    const id = s().addThread('#ff0000');
    expect(s().project!.threads.find((t) => t.id === id)?.name).toBe('Red');
    expect(s().addThread('#FF0000')).toBe(id);
    s().updateThread(id, { chartCode: '1147' });
    expect(s().project!.threads.find((t) => t.id === id)?.chartCode).toBe('1147');
  });

  it('sets and clears entry/exit points', () => {
    s().setPickPoint({ id: 'o2', which: 'entry' });
    s().setSewPoint('o2', 'entry', [0, -310]);
    expect(s().project!.objects[1].entry).toEqual([0, -310]);
    expect(s().pickPoint).toBeNull();
    s().setSewPoint('o2', 'entry', null);
    expect(s().project!.objects[1].entry).toBeNull();
  });

  it('keeps grid and snap preferences and remembers them', () => {
    expect(s().grid).toMatchObject({ show: true, size: 50, snap: false, smart: true });
    s().setGrid({ snap: true, size: 20 });
    expect(s().grid).toMatchObject({ snap: true, size: 20 });
    expect(JSON.parse(localStorage.getItem('tatami.gridPrefs')!)).toMatchObject({ snap: true, size: 20 });
    s().setGrid({ snap: false, size: 50 });
  });

  it('marks the document as saving after an edit', () => {
    s().setSaveState('saved');
    s().renameObject('o1', 'X');
    expect(s().saveState).toBe('saving');
  });
});
