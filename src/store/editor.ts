import { create } from 'zustand';
import { alignObjects, backgroundObject, circleCopies, distributeObjects, echoObject, flipObject, gridCopies, regionToLines, type AlignTo, type BackgroundKind, type FlipAxis } from '../model/arrange';
import { booleanAreas, offsetAreas, type BoolOp } from '../engine/clip';
import { areasOf, unionBounds, type Area } from '../engine/geom';
import type { Warning } from '../engine/warnings';
import { ensureThread, newId } from '../model/project';
import { objectsBounds, rotateObject, runToSatin, scaleObject, setSatinWidth, translateObject } from '../model/transform';
import type {
  AdvancedParams,
  Backdrop,
  ObjectParams,
  Project,
  Pt,
  StitchObject,
  StitchPlan,
  StitchType,
  Thread,
} from '../model/types';

export type ViewMode = 'artwork' | 'objects' | 'stitches' | 'realistic';
export type ToolId =
  | 'select'
  | 'node'
  | 'pen'
  | 'run'
  | 'satin'
  | 'fill'
  | 'shapes'
  | 'lettering'
  | 'applique'
  | 'auto-digitize'
  | 'measure';

export interface SimState {
  active: boolean;
  playing: boolean;
  /** Commands sewn so far (index into the plan). */
  position: number;
  speed: number;
}

export interface GridPrefs {
  show: boolean;
  /** Grid size in 0.1 mm. */
  size: number;
  /** Snap moves, resizes and drawn points to the grid. */
  snap: boolean;
  /** Snap to other objects' edges and centers and to the hoop. */
  smart: boolean;
}

const PREFS_KEY = 'tatami.gridPrefs';
const DEFAULT_GRID: GridPrefs = { show: true, size: 50, snap: false, smart: true };

function loadGridPrefs(): GridPrefs {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PREFS_KEY) : null;
    if (raw) return { ...DEFAULT_GRID, ...(JSON.parse(raw) as Partial<GridPrefs>) };
  } catch {
    /* storage unavailable: use defaults */
  }
  return { ...DEFAULT_GRID };
}

export interface EditorState {
  project: Project | null;
  past: Project[];
  future: Project[];
  /** Coalesces rapid edits (slider drags) into one undo step. */
  lastEditKey: string | null;
  lastEditAt: number;
  selection: string[];
  view: ViewMode;
  tool: ToolId;
  /** Pixels per millimetre. 1 = 100%. */
  zoom: number;
  /** Screen offset (px) of the hoop center from the canvas center. */
  pan: { x: number; y: number };
  plan: StitchPlan | null;
  /** The project the current plan was computed from. */
  planFor: Project | null;
  warnings: Warning[];
  /** Thread used for newly drawn objects. */
  activeThread: string | null;
  computing: boolean;
  /** Ids edited since the last engine result (spinner in rows). */
  dirtyIds: string[];
  saveState: 'saved' | 'saving';
  sim: SimState;
  dialog: null | 'export' | 'auto-digitize' | 'lettering' | 'shortcuts';
  /** Image the tracer opens with (a data URL), when it was opened from an import. */
  traceSource: string | null;
  warningsOpen: boolean;
  fitRequest: number;
  /** Waiting for a canvas click to set an object's entry or exit point. */
  pickPoint: { id: string; which: 'entry' | 'exit' } | null;
  grid: GridPrefs;
  /** Shapes tool: what a drag draws. */
  shapeKind: 'rect' | 'ellipse';
  /** Lettering object whose text is being edited in place on the canvas. */
  editingTextId: string | null;

  load(project: Project): void;
  update(fn: (p: Project) => Project, opts?: { key?: string; dirty?: string[] }): void;
  undo(): void;
  redo(): void;
  select(ids: string[], additive?: boolean): void;
  setView(v: ViewMode): void;
  setTool(t: ToolId): void;
  setZoom(z: number, pan?: { x: number; y: number }): void;
  setPan(p: { x: number; y: number }): void;
  requestFit(): void;
  setEngineResult(plan: StitchPlan, warnings: Warning[], forProject?: Project | null): void;
  setActiveThread(id: string | null): void;
  /** The thread new objects get: the active one, else the first, else a new navy thread. */
  ensureActiveThread(): string;
  setComputing(c: boolean): void;
  setSaveState(s: 'saved' | 'saving'): void;
  setDialog(d: EditorState['dialog']): void;
  /** Open the tracer, optionally with an image to trace. */
  openTracer(src?: string | null): void;
  setWarningsOpen(o: boolean): void;
  setSim(s: Partial<SimState>): void;
  setPickPoint(p: EditorState['pickPoint']): void;
  setEditingText(id: string | null): void;
  setGrid(patch: Partial<GridPrefs>): void;
  setShapeKind(k: 'rect' | 'ellipse'): void;
  setSewPoint(id: string, which: 'entry' | 'exit', pt: Pt | null): void;

  // Document operations
  addObjects(objs: StitchObject[], threads?: Thread[]): void;
  deleteSelected(): void;
  duplicateSelected(): void;
  moveObject(from: number, to: number): void;
  toggleVisible(id: string): void;
  toggleLocked(id: string): void;
  renameObject(id: string, name: string): void;
  setObjectType(ids: string[], type: StitchType): void;
  setParams(ids: string[], params: Partial<ObjectParams>, key?: string): void;
  setAdvanced(ids: string[], adv: Partial<AdvancedParams>, key?: string): void;
  setObjectThread(ids: string[], threadId: string): void;
  setSatinWidth(ids: string[], width: number, key?: string): void;
  translateSelected(dx: number, dy: number, key?: string): void;
  scaleSelected(sx: number, sy: number, key?: string): void;
  rotateSelected(deg: number): void;
  flipSelected(axis: FlipAxis): void;
  alignSelected(to: AlignTo): void;
  distributeSelected(axis: 'horizontal' | 'vertical'): void;
  groupSelected(): void;
  ungroupSelected(): void;
  copyAroundCircle(count: number, radius: number): void;
  copyInGrid(rows: number, cols: number, gapX: number, gapY: number): void;
  addEcho(count: number, spacing: number): void;
  regionToLine(id: string, spacing: number): void;
  addBackground(kind: BackgroundKind, margin: number): void;
  scaleToFitHoop(): void;
  autoOrderByColor(): void;
  convertToSatin(ids: string[], width: number): void;
  booleanSelected(op: BoolOp): void;
  offsetOutline(id: string, distance: number): void;
  replaceObject(obj: StitchObject, key?: string): void;
  /** Replace several objects at once (by id), e.g. the result of a drag. */
  replaceObjects(objs: StitchObject[], key?: string): void;
  addThread(hex: string, name?: string): string;
  updateThread(id: string, patch: Partial<Thread>): void;
  /** Remove a thread; objects using it switch to `replaceWith` (required when it is in use). */
  removeThread(id: string, replaceWith?: string): void;
  /** Cap sewing order: within each color block, center-out then bottom-up. */
  orderForCaps(): void;
  setProjectFields(patch: Partial<Project>, key?: string): void;
  setBackdrop(b: Backdrop | null): void;
  updateBackdrop(patch: Partial<Backdrop>, key?: string): void;
}

const HISTORY_LIMIT = 100;
const COALESCE_MS = 1200;

const editable = (o: StitchObject) => !o.locked;

export const useEditor = create<EditorState>((set, get) => {
  const mapSelected = (ids: string[], fn: (o: StitchObject) => StitchObject, key?: string) => {
    const idSet = new Set(ids);
    get().update(
      (p) => ({ ...p, objects: p.objects.map((o) => (idSet.has(o.id) && editable(o) ? fn(o) : o)) }),
      { key, dirty: ids },
    );
  };

  return {
    project: null,
    past: [],
    future: [],
    lastEditKey: null,
    lastEditAt: 0,
    selection: [],
    view: 'artwork',
    tool: 'select',
    zoom: 3,
    pan: { x: 0, y: 0 },
    plan: null,
    planFor: null,
    warnings: [],
    activeThread: null,
    computing: false,
    dirtyIds: [],
    saveState: 'saved',
    sim: { active: false, playing: false, position: 0, speed: 10 },
    dialog: null,
    traceSource: null,
    warningsOpen: false,
    fitRequest: 0,
    pickPoint: null,
    editingTextId: null,
    grid: loadGridPrefs(),
    shapeKind: 'rect',

    load(project) {
      set({
        project,
        past: [],
        future: [],
        selection: [],
        plan: null,
        planFor: null,
        warnings: [],
        activeThread: project.threads[0]?.id ?? null,
        dirtyIds: [],
        saveState: 'saved',
        lastEditKey: null,
        tool: 'select',
        view: 'artwork',
        sim: { active: false, playing: false, position: 0, speed: 10 },
        dialog: null,
        warningsOpen: false,
        fitRequest: get().fitRequest + 1,
        editingTextId: null,
        pickPoint: null,
      });
    },

    update(fn, opts = {}) {
      const { project, past, lastEditKey, lastEditAt } = get();
      if (!project) return;
      const next = fn(project);
      if (next === project) return;
      const now = Date.now();
      const coalesce = !!opts.key && opts.key === lastEditKey && now - lastEditAt < COALESCE_MS;
      set({
        project: next,
        past: coalesce ? past : [...past, project].slice(-HISTORY_LIMIT),
        future: [],
        lastEditKey: opts.key ?? null,
        lastEditAt: now,
        dirtyIds: opts.dirty ? Array.from(new Set([...get().dirtyIds, ...opts.dirty])) : get().dirtyIds,
        saveState: 'saving',
      });
    },

    undo() {
      const { past, project, future } = get();
      if (!past.length || !project) return;
      const prev = past[past.length - 1];
      const ids = new Set(prev.objects.map((o) => o.id));
      set({
        project: prev,
        past: past.slice(0, -1),
        future: [project, ...future],
        lastEditKey: null,
        saveState: 'saving',
        selection: get().selection.filter((id) => ids.has(id)),
      });
    },

    redo() {
      const { past, project, future } = get();
      if (!future.length || !project) return;
      const next = future[0];
      const ids = new Set(next.objects.map((o) => o.id));
      set({
        project: next,
        past: [...past, project],
        future: future.slice(1),
        lastEditKey: null,
        saveState: 'saving',
        selection: get().selection.filter((id) => ids.has(id)),
      });
    },

    select(ids, additive = false) {
      if (!additive) return set({ selection: ids });
      const cur = new Set(get().selection);
      for (const id of ids) {
        if (cur.has(id)) cur.delete(id);
        else cur.add(id);
      }
      set({ selection: [...cur] });
    },

    setView: (view) => set({ view }),
    setTool: (tool) => set({ tool }),
    setZoom: (zoom, pan) => set({ zoom: Math.min(40, Math.max(0.25, zoom)), ...(pan ? { pan } : {}) }),
    setPan: (pan) => set({ pan }),
    requestFit: () => set({ fitRequest: get().fitRequest + 1 }),
    setEngineResult: (plan, warnings, forProject = get().project) =>
      set({ plan, warnings, planFor: forProject, dirtyIds: forProject === get().project ? [] : get().dirtyIds, computing: forProject !== get().project }),
    setActiveThread: (activeThread) => set({ activeThread }),
    ensureActiveThread() {
      const { project: p, activeThread } = get();
      if (!p) return '';
      if (activeThread && p.threads.some((t) => t.id === activeThread)) return activeThread;
      if (p.threads.length) return p.threads[0].id;
      const res = ensureThread(p.threads, '#24357A', 'Navy');
      get().update((pp) => ({ ...pp, threads: res.threads }));
      set({ activeThread: res.id });
      return res.id;
    },
    setComputing: (computing) => set({ computing }),
    setSaveState: (saveState) => set({ saveState }),
    setDialog: (dialog) => set(dialog === null ? { dialog, traceSource: null } : { dialog }),
    openTracer: (src = null) => set({ dialog: 'auto-digitize', traceSource: src }),
    setWarningsOpen: (warningsOpen) => set({ warningsOpen }),
    setSim: (s) => set({ sim: { ...get().sim, ...s } }),
    setPickPoint: (pickPoint) => set({ pickPoint }),
    setShapeKind: (shapeKind) => set({ shapeKind }),
    setGrid(patch) {
      const grid = { ...get().grid, ...patch };
      set({ grid });
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(grid));
      } catch {
        /* not persisted */
      }
    },
    setEditingText: (editingTextId) => set(editingTextId ? { editingTextId, selection: [editingTextId] } : { editingTextId }),
    setSewPoint(id, which, pt) {
      mapSelected([id], (o) => ({ ...o, [which]: pt }));
      set({ pickPoint: null });
    },

    addObjects(objs, threads) {
      get().update((p) => ({ ...p, threads: threads ?? p.threads, objects: [...p.objects, ...objs] }), {
        dirty: objs.map((o) => o.id),
      });
      set({ selection: objs.map((o) => o.id) });
    },

    deleteSelected() {
      const sel = new Set(get().selection);
      if (!sel.size) return;
      get().update((p) => ({ ...p, objects: p.objects.filter((o) => !sel.has(o.id) || o.locked) }));
      set({ selection: [] });
    },

    duplicateSelected() {
      const { project, selection } = get();
      if (!project || !selection.length) return;
      const sel = new Set(selection);
      const regroup = new Map<string, string>();
      const copies = project.objects
        .filter((o) => sel.has(o.id))
        .map((o) => {
          if (o.group && !regroup.has(o.group)) regroup.set(o.group, newId('g'));
          return { ...translateObject(o, 50, 50), id: newId('o'), name: `${o.name} copy`, locked: false, group: o.group ? regroup.get(o.group) : undefined };
        });
      get().addObjects(copies);
    },

    moveObject(from, to) {
      get().update((p) => {
        if (from === to || from < 0 || from >= p.objects.length) return p;
        const objs = [...p.objects];
        const [o] = objs.splice(from, 1);
        objs.splice(Math.max(0, Math.min(objs.length, to)), 0, o);
        return { ...p, objects: objs };
      });
    },

    toggleVisible(id) {
      get().update((p) => ({ ...p, objects: p.objects.map((o) => (o.id === id ? { ...o, visible: !o.visible } : o)) }));
    },

    toggleLocked(id) {
      get().update((p) => ({ ...p, objects: p.objects.map((o) => (o.id === id ? { ...o, locked: !o.locked } : o)) }));
    },

    renameObject(id, name) {
      const n = name.trim();
      if (!n) return;
      get().update((p) => ({ ...p, objects: p.objects.map((o) => (o.id === id ? { ...o, name: n } : o)) }));
    },

    setObjectType(ids, type) {
      mapSelected(ids, (o) => {
        if (o.type === 'stitches' || o.type === type) return o;
        if (type === 'satin' && o.geometry.kind === 'polyline') return { ...o, type, params: { width: 30, ...o.params } };
        return { ...o, type };
      });
    },

    setParams(ids, params, key) {
      mapSelected(ids, (o) => ({ ...o, params: { ...o.params, ...params } }), key);
    },

    setAdvanced(ids, adv, key) {
      mapSelected(ids, (o) => ({ ...o, advanced: { ...o.advanced, ...adv } }), key);
    },

    setObjectThread(ids, threadId) {
      mapSelected(ids, (o) => ({ ...o, thread: threadId }));
    },

    setSatinWidth(ids, width, key) {
      mapSelected(ids, (o) => setSatinWidth(o, width), key);
    },

    translateSelected(dx, dy, key) {
      mapSelected(get().selection, (o) => translateObject(o, Math.round(dx), Math.round(dy)), key);
    },

    scaleSelected(sx, sy, key) {
      const { project, selection } = get();
      if (!project) return;
      const objs = project.objects.filter((o) => selection.includes(o.id));
      const b = objectsBounds(objs);
      if (!b) return;
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      mapSelected(selection, (o) => scaleObject(o, sx, sy, cx, cy), key);
    },

    rotateSelected(deg) {
      const { project, selection } = get();
      if (!project) return;
      const b = objectsBounds(project.objects.filter((o) => selection.includes(o.id)));
      if (!b) return;
      mapSelected(selection, (o) => rotateObject(o, deg, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2));
    },

    flipSelected(axis) {
      const { project, selection } = get();
      if (!project) return;
      const b = objectsBounds(project.objects.filter((o) => selection.includes(o.id)));
      if (!b) return;
      mapSelected(selection, (o) => flipObject(o, axis, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2));
    },

    alignSelected(to) {
      const { project } = get();
      if (!project) return;
      const objs = selectedObjects(get()).filter(editable);
      if (objs.length) get().replaceObjects(alignObjects(objs, to, project.hoop));
    },

    distributeSelected(axis) {
      const objs = selectedObjects(get()).filter(editable);
      if (objs.length >= 3) get().replaceObjects(distributeObjects(objs, axis));
    },

    groupSelected() {
      const sel = new Set(get().selection);
      if (sel.size < 2) return;
      const g = newId('g');
      get().update((p) => ({ ...p, objects: p.objects.map((o) => (sel.has(o.id) ? { ...o, group: g } : o)) }));
    },

    ungroupSelected() {
      const sel = new Set(get().selection);
      get().update((p) => {
        if (!p.objects.some((o) => sel.has(o.id) && o.group)) return p;
        return { ...p, objects: p.objects.map((o) => (sel.has(o.id) && o.group ? { ...o, group: undefined } : o)) };
      });
    },

    copyAroundCircle(count, radius) {
      const objs = selectedObjects(get());
      const copies = circleCopies(objs, Math.round(count), radius);
      if (copies.length) {
        get().addObjects(copies);
        set({ selection: [...objs.map((o) => o.id), ...copies.map((o) => o.id)] });
      }
    },

    copyInGrid(rows, cols, gapX, gapY) {
      const objs = selectedObjects(get());
      const copies = gridCopies(objs, Math.round(rows), Math.round(cols), gapX, gapY);
      if (copies.length) {
        get().addObjects(copies);
        set({ selection: [...objs.map((o) => o.id), ...copies.map((o) => o.id)] });
      }
    },

    addEcho(count, spacing) {
      const objs = selectedObjects(get());
      const echo = echoObject(objs, Math.max(1, Math.round(count)), spacing, get().ensureActiveThread());
      if (!echo) return;
      const last = Math.max(...objs.map((o) => get().project!.objects.indexOf(o)));
      get().update((p) => {
        const objects = [...p.objects];
        objects.splice(last + 1, 0, echo);
        return { ...p, objects };
      }, { dirty: [echo.id] });
      set({ selection: [echo.id] });
    },

    regionToLine(id, spacing) {
      const o = get().project?.objects.find((x) => x.id === id);
      if (!o || o.locked) return;
      const lines = regionToLines(o, spacing);
      if (!lines.length) return;
      const group = lines.length > 1 ? newId('g') : undefined;
      const repl = lines.map((l) => ({ ...l, group }));
      get().update((p) => {
        const i = p.objects.findIndex((x) => x.id === id);
        const objects = [...p.objects];
        objects.splice(i, 1, ...repl);
        return { ...p, objects };
      }, { dirty: repl.map((l) => l.id) });
      set({ selection: repl.map((l) => l.id) });
    },

    addBackground(kind, margin) {
      const { project } = get();
      if (!project) return;
      const objs = selectedObjects(get());
      const bg = backgroundObject(objs.length ? objs : project.objects, project.hoop, kind, margin, get().ensureActiveThread());
      if (!bg) return;
      // Backgrounds sew first, under everything.
      get().update((p) => ({ ...p, objects: [bg, ...p.objects] }), { dirty: [bg.id] });
      set({ selection: [bg.id] });
    },

    scaleToFitHoop() {
      const { project, plan } = get();
      if (!project) return;
      const visible = project.objects.filter((o) => o.visible);
      // Stitched extents include pull compensation; geometry covers objects the engine skipped.
      const b = unionBounds(plan?.bounds ?? null, objectsBounds(visible));
      if (!b) return;
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      // Leave a 2 mm margin inside the hoop.
      const s = Math.min((project.hoop.width - 40) / w, (project.hoop.height - 40) / h, 1);
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      get().update(
        (p) => ({
          ...p,
          objects: p.objects.map((o) => translateObject(scaleObject(o, s, s, cx, cy), -cx, -cy)),
        }),
        { dirty: project.objects.map((o) => o.id) },
      );
    },

    autoOrderByColor() {
      get().update((p) => {
        // Stable grouping by the thread's first appearance keeps layering within each color.
        const order: string[] = [];
        for (const o of p.objects) if (!order.includes(o.thread)) order.push(o.thread);
        const objects = [...p.objects].sort((a, b) => order.indexOf(a.thread) - order.indexOf(b.thread));
        return objects.every((o, i) => o === p.objects[i]) ? p : { ...p, objects };
      });
    },

    convertToSatin(ids, width) {
      mapSelected(ids, (o) => runToSatin(o, width) ?? o);
    },

    booleanSelected(op) {
      const { project, selection } = get();
      if (!project) return;
      const objs = project.objects.filter((o) => selection.includes(o.id) && areasOf(o.geometry).length > 0);
      if (objs.length < 2) return;
      const [first, ...rest] = objs;
      let result: Area[] = areasOf(first.geometry);
      const others = rest.flatMap((o) => areasOf(o.geometry));
      result = booleanAreas(result, others, op);
      const toPts = (pts: [number, number][]): Pt[] => pts.map(([x, y]) => [Math.round(x), Math.round(y)]);
      const merged: StitchObject = {
        ...first,
        id: newId('o'),
        name: `${first.name} ${op === 'union' ? '+ ' : '− '}${rest.map((r) => r.name).join(', ')}`,
        type: first.type === 'run' ? 'tatami' : first.type,
        geometry: { kind: 'compound', parts: result.map((a) => ({ points: toPts(a.outer), holes: a.holes.map(toPts) })) },
        text: undefined,
      };
      const removeIds = new Set(op === 'union' ? objs.map((o) => o.id) : [first.id]);
      get().update((p) => {
        const idx = p.objects.findIndex((o) => o.id === first.id);
        const kept = p.objects.filter((o) => !removeIds.has(o.id));
        const at = Math.min(idx, kept.length);
        kept.splice(at, 0, merged);
        return { ...p, objects: kept };
      }, { dirty: [merged.id] });
      set({ selection: [merged.id] });
    },

    offsetOutline(id, distance) {
      const o = get().project?.objects.find((x) => x.id === id);
      if (!o) return;
      const areas = offsetAreas(areasOf(o.geometry), distance);
      if (!areas.length) return;
      const toPts = (pts: [number, number][]): Pt[] => pts.map(([x, y]) => [Math.round(x), Math.round(y)]);
      const outline: StitchObject = {
        ...o,
        id: newId('o'),
        name: `${o.name} outline`,
        type: 'run',
        locked: false,
        geometry: { kind: 'compound', parts: areas.map((a) => ({ points: toPts(a.outer), holes: a.holes.map(toPts) })) },
        params: { stitchLength: 25, repeats: 1 },
        advanced: { tieIn: true, tieOff: true },
        text: undefined,
      };
      get().update((p) => {
        const idx = p.objects.findIndex((x) => x.id === id);
        const objects = [...p.objects];
        objects.splice(idx + 1, 0, outline);
        return { ...p, objects };
      }, { dirty: [outline.id] });
      set({ selection: [outline.id] });
    },

    replaceObject(obj, key) {
      get().update((p) => ({ ...p, objects: p.objects.map((o) => (o.id === obj.id ? obj : o)) }), { key, dirty: [obj.id] });
    },

    replaceObjects(objs, key) {
      const byId = new Map(objs.map((o) => [o.id, o]));
      get().update((p) => ({ ...p, objects: p.objects.map((o) => byId.get(o.id) ?? o) }), { key, dirty: objs.map((o) => o.id) });
    },

    addThread(hex, name) {
      const p = get().project;
      if (!p) return '';
      const res = ensureThread(p.threads, hex, name);
      if (res.threads !== p.threads) get().update((pp) => ({ ...pp, threads: res.threads }));
      return res.id;
    },

    updateThread(id, patch) {
      get().update(
        (p) => ({ ...p, threads: p.threads.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
        { key: `thread-${id}-${Object.keys(patch).join()}` },
      );
    },

    removeThread(id, replaceWith) {
      const p0 = get().project;
      if (!p0) return;
      const used = p0.objects.some((o) => o.thread === id);
      if (used && (!replaceWith || replaceWith === id || !p0.threads.some((t) => t.id === replaceWith))) return;
      const affected = used ? p0.objects.filter((o) => o.thread === id).map((o) => o.id) : [];
      get().update(
        (p) => ({
          ...p,
          threads: p.threads.filter((t) => t.id !== id),
          objects: used ? p.objects.map((o) => (o.thread === id ? { ...o, thread: replaceWith! } : o)) : p.objects,
        }),
        { dirty: affected },
      );
      if (get().activeThread === id) set({ activeThread: replaceWith ?? get().project?.threads[0]?.id ?? null });
    },

    orderForCaps() {
      get().update((p) => {
        const key = (o: StitchObject) => {
          const b = objectsBounds([o]);
          if (!b) return { d: 0, y: 0 };
          return { d: Math.abs((b.minX + b.maxX) / 2), y: -(b.minY + b.maxY) / 2 };
        };
        // Split into runs of the same thread (color blocks), sort each run, keep run order.
        const out: StitchObject[] = [];
        let run: StitchObject[] = [];
        const flush = () => {
          const keyed = run.map((o, i) => ({ o, i, k: key(o) }));
          keyed.sort((a, b) => a.k.d - b.k.d || a.k.y - b.k.y || a.i - b.i);
          out.push(...keyed.map((x) => x.o));
          run = [];
        };
        for (const o of p.objects) {
          if (run.length && run[0].thread !== o.thread) flush();
          run.push(o);
        }
        flush();
        return out.every((o, i) => o === p.objects[i]) ? p : { ...p, objects: out };
      });
    },

    setProjectFields(patch, key) {
      get().update((p) => ({ ...p, ...patch }), { key });
    },

    setBackdrop(b) {
      get().update((p) => ({ ...p, backdrop: b }));
    },

    updateBackdrop(patch, key) {
      get().update((p) => (p.backdrop ? { ...p, backdrop: { ...p.backdrop, ...patch } } : p), { key });
    },
  };
});

export function selectedObjects(s: Pick<EditorState, 'project' | 'selection'>): StitchObject[] {
  if (!s.project) return [];
  const sel = new Set(s.selection);
  return s.project.objects.filter((o) => sel.has(o.id));
}
