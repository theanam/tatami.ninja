import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { geometryBounds, type P } from '../../engine/geom';
import { MAX_OBJECT_SIZE } from '../../engine/plan';
import { columnFromRails } from '../../engine/satin';
import { defaultTextSpec, layoutText, loadSpecFont, makeTextObject } from '../../importers/lettering';
import { ensureThread } from '../../model/project';
import { deleteVertex, insertVertexAfter, listVertices, moveVertex, nearestSegment } from '../../model/nodes';
import { objectsBounds, satinWidth, scaleObject, translateObject } from '../../model/transform';
import type { Bounds, Pt, StitchObject } from '../../model/types';
import { fmtLen, fmtLenCompact } from '../../model/units';
import { getFabric, hoopLabel } from '../../presets';
import { buildPathCache, drawBlocks, fillFabric, partialBlocks } from '../../render/stitchRender';
import { selectedObjects, useEditor } from '../../store/editor';
import { Icon } from '../../components/Icon';
import { IconButton, SegmentedControl, Spinner, toast } from '../../components/ui';
import {
  angleFromDrag,
  boundsIntersect,
  fitZoom,
  geometryPath,
  hitTest,
  makeView,
  normRect,
  objectCenter,
  railPath,
  toScreen,
  toWorld,
  zoomAt,
  type View,
} from './canvasMath';
import { constrainSquare, objectFromPath, objectFromSatinClicks, objectFromShape, snap45, type PathTool, type ShapeKind } from './drawTools';
import { isTypingTarget } from './hooks';
import { InlineTextEditor, TextToolbar } from './TextTools';
import { gridSizes, snapLines, snapMove, snapPoint, type Guides, type SnapLines, type SnapOptions } from './snap';
import { ObjectArt } from './ObjectArt';

type Drag =
  | { kind: 'pan'; start: P; pan: { x: number; y: number } }
  | { kind: 'move'; start: P; orig: StitchObject[]; b0: Bounds | null; lines: SnapLines | null }
  | { kind: 'marquee'; start: P; end: P; additive: boolean }
  | { kind: 'angle'; id: string; center: P }
  | { kind: 'scale'; anchor: P; startDist: number; orig: StitchObject[]; b0: Bounds | null; lines: SnapLines | null }
  | { kind: 'node'; id: string; key: string }
  | { kind: 'shape'; start: P; end: P }
  | { kind: 'measure'; start: P; end: P }
  | { kind: 'backdrop'; start: P; origX: number; origY: number };

interface Props {
  readOnly: boolean;
  onImportFile(file: File): void;
  onImportClick(): void;
  onOpenStitchFile(): void;
  simCmd: number;
}

/** 2D affine [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
type Mat = [number, number, number, number, number, number];

/**
 * A drag in progress: objects are shown transformed but the document is untouched until the
 * pointer is released ('drag'). After release, stitch views keep the transform until the
 * worker returns stitches for the new positions ('settle'), so nothing jumps back.
 */
interface DragXf {
  ids: string[];
  m: Mat;
  phase: 'drag' | 'settle';
  backdrop?: boolean;
}

const applyMat = (m: Mat, p: P): P => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

const BLANK_KEY = 'tatami.startBlank';

/** Designs where the user chose to start blank (the empty-state card stays hidden). */
function blankChosen(id: string | undefined): boolean {
  try {
    return !!id && (JSON.parse(localStorage.getItem(BLANK_KEY) ?? '[]') as string[]).includes(id);
  } catch {
    return false;
  }
}

function rememberBlank(id: string | undefined) {
  if (!id) return;
  try {
    const ids = JSON.parse(localStorage.getItem(BLANK_KEY) ?? '[]') as string[];
    if (!ids.includes(id)) localStorage.setItem(BLANK_KEY, JSON.stringify([...ids, id].slice(-200)));
  } catch {
    /* not remembered across reloads */
  }
}

function cssVar(name: string): string {
  if (typeof document === 'undefined') return '#000';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

function roundRect(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  const rr = Math.min(r, w / 2, h / 2);
  p.moveTo(x + rr, y);
  p.arcTo(x + w, y, x + w, y + h, rr);
  p.arcTo(x + w, y + h, x, y + h, rr);
  p.arcTo(x, y + h, x, y, rr);
  p.arcTo(x, y, x + w, y, rr);
  p.closePath();
  return p;
}

/** Grid lines inside the hoop; every 10 mm (or every 5th line) is stronger. */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  step: number,
  hw: number,
  hh: number,
  scale: number,
  minor: string,
  major: string,
) {
  const px = 1 / scale;
  const majorEvery = Number.isInteger(100 / step) ? Math.round(100 / step) : 5;
  const drawMinor = step * scale >= 5;
  ctx.lineWidth = px;
  for (const pass of drawMinor ? ['minor', 'major'] : ['major']) {
    ctx.strokeStyle = pass === 'major' ? major : minor;
    ctx.beginPath();
    for (let i = 0; i * step <= Math.max(hw, hh) + step; i++) {
      const isMajor = i % majorEvery === 0;
      if ((pass === 'major') !== isMajor) continue;
      const t = i * step;
      for (const x of i === 0 ? [0] : [t, -t]) {
        if (Math.abs(x) > hw) continue;
        ctx.moveTo(x, -hh);
        ctx.lineTo(x, hh);
      }
      for (const y of i === 0 ? [0] : [t, -t]) {
        if (Math.abs(y) > hh) continue;
        ctx.moveTo(-hw, y);
        ctx.lineTo(hw, y);
      }
    }
    ctx.stroke();
  }
}

export function Canvas({ readOnly, onImportFile, onImportClick, onOpenStitchFile, simCmd }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const project = useEditor((s) => s.project)!;
  const plan = useEditor((s) => s.plan);
  const view = useEditor((s) => s.view);
  const zoom = useEditor((s) => s.zoom);
  const pan = useEditor((s) => s.pan);
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const sim = useEditor((s) => s.sim);
  const computing = useEditor((s) => s.computing);
  const warnings = useEditor((s) => s.warnings);
  const fitRequest = useEditor((s) => s.fitRequest);
  const dirtyIds = useEditor((s) => s.dirtyIds);
  const grid = useEditor((s) => s.grid);
  const [guides, setGuides] = useState<Guides>({ x: null, y: null });
  const planFor = useEditor((s) => s.planFor);
  const [xf, setXf] = useState<DragXf | null>(null);
  const xfRef = useRef<DragXf | null>(null);
  const setDragXf = (x: DragXf | null) => {
    xfRef.current = x;
    setXf(x);
  };

  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [hover, setHover] = useState<P | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rect');
  const [measure, setMeasure] = useState<{ start: P; end: P } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [startBlank, setStartBlank] = useState(() => blankChosen(project.id));
  const chooseBlank = () => {
    setStartBlank(true);
    rememberBlank(project.id);
  };

  // Size tracking.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Fit to hoop on load / request.
  const hoopKey = `${project.hoop.width}x${project.hoop.height}`;
  useEffect(() => {
    if (!size.w || !size.h) return;
    useEditor.getState().setZoom(fitZoom(size.w, size.h, project.hoop), { x: 0, y: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest, size.w > 0, hoopKey]);

  const v: View = makeView(size.w, size.h, zoom, pan);
  const realistic = view === 'realistic' || sim.active;
  const showStitches = view === 'stitches' || realistic;

  // Reset drafts when the tool changes.
  useEffect(() => {
    setDraft([]);
    if (tool !== 'measure') setMeasure(null);
  }, [tool]);

  const editingTextId = useEditor((s) => s.editingTextId);
  const editingIndex = editingTextId ? project.objects.findIndex((o) => o.id === editingTextId) : -1;
  // Text being edited in place is drawn by the live editor, not as stitches.
  // Stitch paths are only built for the view on screen: Artwork and Objects never pay for them,
  // and Stitches/Realistic build them when you switch there (stitches themselves come from the worker).
  const needStitches = view === 'stitches' || view === 'realistic' || sim.active;
  // Objects being dragged are drawn separately (transformed) on top of a cached scene.
  const dragKey = xf && !xf.backdrop ? xf.ids.join(',') : '';
  const dragIdx = useMemo(() => {
    if (!dragKey || !plan) return null;
    const ids = new Set(dragKey.split(','));
    const idx = new Set<number>();
    plan.objectStats.forEach((st, i) => ids.has(st.id) && idx.add(i));
    return idx;
  }, [dragKey, plan]);
  const cache = useMemo(() => {
    if (!plan || !needStitches) return null;
    const hidden = new Set<number>(dragIdx ?? []);
    if (editingIndex >= 0) hidden.add(editingIndex);
    return buildPathCache(project, plan, hidden.size ? hidden : undefined);
  }, [plan, project.threads, editingIndex, needStitches, dragIdx]); // eslint-disable-line react-hooks/exhaustive-deps
  const dragCache = useMemo(
    () => (plan && needStitches && dragIdx ? buildPathCache(project, plan, undefined, dragIdx) : null),
    [plan, project.threads, needStitches, dragIdx], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // After a drop, keep showing the moved stitches until the worker has the new ones.
  useEffect(() => {
    if (xf?.phase === 'settle' && (!needStitches || planFor === project)) setDragXf(null);
  }, [xf, planFor, project, needStitches]);

  // ---------- Canvas2D layer ----------
  // The scene (hoop, fabric, grid, stitches not being dragged) is drawn once into an offscreen
  // canvas; each drag frame only copies it and redraws the dragged stitches transformed.
  const sceneRef = useRef<HTMLCanvasElement | null>(null);
  const [sceneVersion, setSceneVersion] = useState(0);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(size.w * dpr) || c.height !== Math.round(size.h * dpr)) {
      c.width = Math.round(size.w * dpr);
      c.height = Math.round(size.h * dpr);
    }
    if (!sceneRef.current) sceneRef.current = document.createElement('canvas');
    const scene = sceneRef.current;
    if (scene.width !== c.width || scene.height !== c.height) {
      scene.width = c.width;
      scene.height = c.height;
    }
    const ctx = scene.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.cx, dpr * v.cy);
    const hw = project.hoop.width / 2;
    const hh = project.hoop.height / 2;
    const px = 1 / v.s;
    const outer = roundRect(-hw - 50, -hh - 50, project.hoop.width + 100, project.hoop.height + 100, 160);
    const inner = roundRect(-hw, -hh, project.hoop.width, project.hoop.height, 110);
    ctx.fillStyle = cssVar('--sb-hoop-frame');
    ctx.fill(outer);
    ctx.lineWidth = px;
    ctx.strokeStyle = cssVar('--sb-hoop-stroke');
    ctx.stroke(outer);
    if (realistic) {
      fillFabric(ctx, project.fabricPreset, inner, v.s);
      ctx.save();
      ctx.clip(inner);
      if (grid.show) drawGrid(ctx, grid.size, hw, hh, v.s, 'rgba(0,0,0,.07)', 'rgba(0,0,0,.14)');
      ctx.strokeStyle = 'rgba(0,0,0,.16)';
      ctx.lineWidth = 12;
      ctx.stroke(inner);
      ctx.restore();
      // Center marks.
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -hh + 20);
      ctx.lineTo(0, -hh + 60);
      ctx.moveTo(0, hh - 60);
      ctx.lineTo(0, hh - 20);
      ctx.moveTo(-hw + 20, 0);
      ctx.lineTo(-hw + 60, 0);
      ctx.moveTo(hw - 60, 0);
      ctx.lineTo(hw - 20, 0);
      ctx.stroke();
    } else {
      ctx.fillStyle = cssVar('--sb-hoop-objects-bg');
      ctx.fill(inner);
      ctx.save();
      ctx.clip(inner);
      if (grid.show) drawGrid(ctx, grid.size, hw, hh, v.s, 'rgba(255,255,255,.035)', cssVar('--sb-hoop-grid'));
      ctx.setLineDash([6 * px, 4 * px]);
      ctx.strokeStyle = cssVar('--sb-hoop-stroke');
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(0, hh);
      ctx.moveTo(-hw, 0);
      ctx.lineTo(hw, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.lineWidth = px;
      ctx.strokeStyle = cssVar('--sb-hoop-stroke');
      ctx.stroke(inner);
    }
    if (showStitches && cache) {
      const blocks = sim.active ? partialBlocks(project, cache, simCmd) : cache.blocks;
      drawBlocks(ctx, blocks, realistic ? 'realistic' : 'stitches', v.s);
    }
    setSceneVersion((n) => n + 1);
  }, [size, v.s, v.cx, v.cy, project.hoop, project.fabricPreset, realistic, showStitches, cache, sim.active, simCmd, project, grid.show, grid.size]);

  useEffect(() => {
    const c = canvasRef.current;
    const scene = sceneRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !scene || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(scene, 0, 0);
    if (showStitches && dragCache && xf && !xf.backdrop) {
      const dpr = window.devicePixelRatio || 1;
      const m = xf.m;
      ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.cx, dpr * v.cy);
      ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      drawBlocks(ctx, dragCache.blocks, realistic ? 'realistic' : 'stitches', v.s * Math.abs(m[0]));
    }
  }, [sceneVersion, xf, dragCache, showStitches, realistic, v.s, v.cx, v.cy]);

  // ---------- Interaction helpers ----------
  const screenPoint = (e: { clientX: number; clientY: number }): P => {
    const r = wrapRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const worldPoint = (e: { clientX: number; clientY: number }): P => toWorld(v, screenPoint(e));
  const toPt = (p: P): Pt => [Math.round(p[0]), Math.round(p[1])];
  const tol = 6 / v.s;

  /** Snap settings for a gesture; ⌘/Ctrl held skips snapping. */
  const snapOpts = (exclude: string[], bypass = false): SnapOptions => ({
    grid: !bypass && grid.snap ? grid.size : null,
    lines: !bypass && grid.smart ? snapLines(project, new Set(exclude)) : null,
    tol: 6 / v.s,
  });
  const snapAt = (p: P, exclude: string[], bypass: boolean): P => {
    const r = snapPoint(p, snapOpts(exclude, bypass));
    setGuides(r.guides);
    return r.p;
  };

  const editable = !readOnly && !sim.active;
  const sel = useMemo(() => selectedObjects({ project, selection }), [project, selection]);
  const single = sel.length === 1 ? sel[0] : null;

  const ensureActiveThread = (): string => {
    const s = useEditor.getState();
    const p = s.project!;
    if (s.activeThread && p.threads.some((t) => t.id === s.activeThread)) return s.activeThread;
    if (p.threads.length) return p.threads[0].id;
    const res = ensureThread(p.threads, '#24357A', 'Navy');
    s.update((pp) => ({ ...pp, threads: res.threads }));
    s.setActiveThread(res.id);
    return res.id;
  };

  const commitObject = (o: StitchObject | null) => {
    if (!o) return;
    const s = useEditor.getState();
    s.addObjects([o]);
    s.setTool('select');
    if (s.view === 'realistic' || s.view === 'stitches') return;
    s.setView('objects');
  };

  const finishPath = useCallback(
    (closed: boolean) => {
      const n = (useEditor.getState().project?.objects.length ?? 0) + 1;
      if (tool === 'satin') commitObject(objectFromSatinClicks(draft, ensureActiveThread(), n));
      else if (tool === 'pen' || tool === 'run' || tool === 'fill' || tool === 'applique') {
        commitObject(objectFromPath(tool as PathTool, draft, closed, ensureActiveThread(), n));
      }
      setDraft([]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, tool],
  );

  // Keyboard for drafts and space-panning.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Escape' && !draft.length && useEditor.getState().project?.objects.length === 0 && !startBlank) chooseBlank();
      if (e.key === ' ' && !spaceDown) {
        setSpaceDown(true);
        if (!useEditor.getState().sim.active) e.preventDefault();
      }
      if (!draft.length) {
        // Enter starts editing the selected lettering in place.
        const st = useEditor.getState();
        const only = st.selection.length === 1 ? st.project?.objects.find((o) => o.id === st.selection[0]) : null;
        if (e.key === 'Enter' && only?.text && !only.locked && !st.sim.active && !st.editingTextId && !readOnly) {
          e.preventDefault();
          st.setEditingText(only.id);
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        finishPath(tool === 'fill' || tool === 'applique');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setDraft([]);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setDraft((d) => d.slice(0, -1));
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceDown(false);
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up);
    };
  }, [draft, finishPath, spaceDown, tool]);

  const addText = async (at: P) => {
    const thread = ensureActiveThread();
    const spec = defaultTextSpec(Math.round(at[0]), Math.round(at[1]));
    try {
      const font = await loadSpecFont(spec);
      const o = makeTextObject(spec, layoutText(font, spec), thread);
      useEditor.getState().addObjects([o]);
      useEditor.getState().setTool('select');
      useEditor.getState().setEditingText(o.id);
    } catch {
      toast('Could not load the lettering font.', 'error');
    }
  };

  // ---------- Pointer handlers ----------
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const sp = screenPoint(e);
    const wp = toWorld(v, sp);
    const s = useEditor.getState();
    if (e.button === 1 || spaceDown || (sim.active && e.button === 0)) {
      setDrag({ kind: 'pan', start: sp, pan: s.pan });
      return;
    }
    if (s.pickPoint && editable) {
      s.setSewPoint(s.pickPoint.id, s.pickPoint.which, toPt(wp));
      return;
    }
    const handle = (e.target as Element).closest('[data-handle]') as HTMLElement | SVGElement | null;
    if (handle && editable) {
      const h = handle.getAttribute('data-handle')!;
      if (h === 'angle' && single) {
        setDrag({ kind: 'angle', id: single.id, center: objectCenter(single)! });
        return;
      }
      if (h.startsWith('corner:')) {
        const b = objectsBounds(sel)!;
        // The handle's own corner; scaling pivots on the opposite one.
        const [cx, cy] = h.slice(7).split(',').map(Number);
        const anchor: P = [cx ? b.minX : b.maxX, cy ? b.minY : b.maxY];
        setDrag({
          kind: 'scale',
          anchor,
          startDist: Math.hypot(wp[0] - anchor[0], wp[1] - anchor[1]) || 1,
          orig: sel,
          b0: objectsBounds(sel),
          lines: grid.smart ? snapLines(project, new Set(sel.map((o) => o.id))) : null,
        });
        return;
      }
      if (h.startsWith('node:') && single) {
        const key = h.slice(5);
        if (e.altKey) {
          s.replaceObject({ ...single, geometry: deleteVertex(single.geometry, key), text: undefined });
          return;
        }
        setDrag({ kind: 'node', id: single.id, key });
        return;
      }
    }
    switch (tool) {
      case 'select':
      case 'node': {
        const hit = hitTest(project, wp, tol);
        if (hit) {
          let ids = selection;
          if (e.shiftKey || e.metaKey || e.ctrlKey) {
            s.select([hit.id], true);
            ids = useEditor.getState().selection;
          } else if (!selection.includes(hit.id)) {
            s.select([hit.id]);
            ids = [hit.id];
          }
          // Snapshot the objects being dragged; every move is computed from this, so fast
          // pointer events can never apply the same offset twice.
          const orig = project.objects.filter((o) => ids.includes(o.id) && !o.locked);
          if (editable && !hit.locked && orig.length) {
            // Snap targets are computed once per drag, not on every pointer move.
            setDrag({
              kind: 'move',
              start: wp,
              orig,
              b0: objectsBounds(orig),
              lines: grid.smart ? snapLines(project, new Set(orig.map((o) => o.id))) : null,
            });
          }
        } else if (editable && project.backdrop && project.backdrop.visible && !project.backdrop.locked && inBackdrop(wp)) {
          setDrag({ kind: 'backdrop', start: wp, origX: project.backdrop.x, origY: project.backdrop.y });
        } else {
          setDrag({ kind: 'marquee', start: wp, end: wp, additive: e.shiftKey || e.metaKey || e.ctrlKey });
        }
        return;
      }
      case 'pen':
      case 'run':
      case 'fill':
      case 'applique': {
        if (!editable) return;
        let p = toPt(snapAt(wp, [], e.metaKey || e.ctrlKey));
        if (e.shiftKey && draft.length) p = snap45(draft[draft.length - 1], p);
        if (draft.length >= 3 && Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]) * v.s < 8) {
          finishPath(true);
          return;
        }
        if (e.detail >= 2 && draft.length >= 2) {
          finishPath(tool === 'fill' || tool === 'applique');
          return;
        }
        setDraft([...draft, p]);
        return;
      }
      case 'satin': {
        if (!editable) return;
        if (e.detail >= 2 && draft.length >= 4) {
          finishPath(false);
          return;
        }
        setDraft([...draft, toPt(snapAt(wp, [], e.metaKey || e.ctrlKey))]);
        return;
      }
      case 'shapes': {
        const sp0 = snapAt(wp, [], e.metaKey || e.ctrlKey);
        if (editable) setDrag({ kind: 'shape', start: sp0, end: sp0 });
        return;
      }
      case 'measure':
        setDrag({ kind: 'measure', start: wp, end: wp });
        setMeasure({ start: wp, end: wp });
        return;
      case 'lettering':
        if (editable) void addText(snapAt(wp, [], e.metaKey || e.ctrlKey));
        return;
      default:
        return;
    }
  };

  const inBackdrop = (p: P) => {
    const b = project.backdrop;
    return !!b && p[0] >= b.x && p[0] <= b.x + b.width && p[1] >= b.y && p[1] <= b.y + b.height;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const sp = screenPoint(e);
    const wp = toWorld(v, sp);
    // Only drawing previews need the hover point; skip re-renders otherwise.
    if (draft.length) setHover(wp);
    if (!drag) return;
    const s = useEditor.getState();
    switch (drag.kind) {
      case 'pan':
        s.setPan({ x: drag.pan.x + sp[0] - drag.start[0], y: drag.pan.y + sp[1] - drag.start[1] });
        return;
      case 'move': {
        // Visual only: the document is updated once, on release.
        let dx = wp[0] - drag.start[0];
        let dy = wp[1] - drag.start[1];
        const bypass = e.metaKey || e.ctrlKey;
        if (drag.b0) {
          const r = snapMove(drag.b0, dx, dy, { grid: !bypass && grid.snap ? grid.size : null, lines: bypass ? null : drag.lines, tol: 6 / v.s });
          dx = r.dx;
          dy = r.dy;
          setGuides(r.guides);
        }
        setDragXf({ ids: drag.orig.map((o) => o.id), m: [1, 0, 0, 1, Math.round(dx), Math.round(dy)], phase: 'drag' });
        return;
      }
      case 'backdrop': {
        setDragXf({ ids: [], backdrop: true, m: [1, 0, 0, 1, Math.round(wp[0] - drag.start[0]), Math.round(wp[1] - drag.start[1])], phase: 'drag' });
        return;
      }
      case 'marquee':
        setDrag({ ...drag, end: wp });
        return;
      case 'angle':
        s.setParams([drag.id], { angleDeg: angleFromDrag(drag.center, wp) }, 'angle-drag');
        return;
      case 'scale': {
        // Uniform scale about the opposite corner, always from the original objects.
        const bypass = e.metaKey || e.ctrlKey;
        const snapped = snapPoint(wp, { grid: !bypass && grid.snap ? grid.size : null, lines: bypass ? null : drag.lines, tol: 6 / v.s });
        setGuides(snapped.guides);
        const corner = snapped.p;
        const d = Math.hypot(corner[0] - drag.anchor[0], corner[1] - drag.anchor[1]);
        const ob = drag.b0;
        const maxF = ob ? MAX_OBJECT_SIZE / Math.max(1, ob.maxX - ob.minX, ob.maxY - ob.minY) : 10;
        const f = Math.min(maxF, Math.max(0.05, d / drag.startDist));
        const [ax, ay] = drag.anchor;
        setDragXf({ ids: drag.orig.map((o) => o.id), m: [f, 0, 0, f, ax * (1 - f), ay * (1 - f)], phase: 'drag' });
        return;
      }
      case 'node': {
        const o = s.project?.objects.find((x) => x.id === drag.id);
        if (!o) return;
        s.replaceObject({ ...o, geometry: moveVertex(o.geometry, drag.key, toPt(snapAt(wp, [o.id], e.metaKey || e.ctrlKey))), text: undefined }, `node-${drag.id}`);
        return;
      }
      case 'shape':
        {
          const end = snapAt(wp, [], e.metaKey || e.ctrlKey);
          setDrag({ ...drag, end: e.shiftKey ? (constrainSquare(toPt(drag.start), toPt(end)) as P) : end });
        }
        return;
      case 'measure':
        setDrag({ ...drag, end: wp });
        setMeasure({ start: drag.start, end: wp });
        return;
    }
  };

  const onPointerUp = () => {
    setGuides({ x: null, y: null });
    if (!drag) return;
    const s = useEditor.getState();
    const x = xfRef.current;
    if (x && (drag.kind === 'move' || drag.kind === 'scale' || drag.kind === 'backdrop')) {
      // Commit the whole drag as one change (one undo step).
      const m = x.m;
      if (drag.kind === 'backdrop') {
        const b = s.project?.backdrop;
        if (b && (m[4] || m[5])) s.updateBackdrop({ x: b.x + m[4], y: b.y + m[5] });
        setDragXf(null);
      } else if (drag.kind === 'move' && (m[4] || m[5])) {
        s.replaceObjects(drag.orig.map((o) => translateObject(o, m[4], m[5])));
        setDragXf(needStitches ? { ...x, phase: 'settle' } : null);
      } else if (drag.kind === 'scale' && m[0] !== 1) {
        const [ax, ay] = drag.anchor;
        s.replaceObjects(drag.orig.map((o) => scaleObject(o, m[0], m[0], ax, ay)));
        setDragXf(needStitches ? { ...x, phase: 'settle' } : null);
      } else {
        setDragXf(null);
      }
      setDrag(null);
      return;
    }
    if (drag.kind === 'marquee') {
      const r = normRect(drag.start, drag.end);
      if ((r.maxX - r.minX) * v.s < 3 && (r.maxY - r.minY) * v.s < 3) {
        if (!drag.additive) s.select([]);
      } else {
        const ids = project.objects
          .filter((o) => o.visible && !o.locked)
          .filter((o) => {
            const b = geometryBounds(o.geometry);
            return b && boundsIntersect(b, r);
          })
          .map((o) => o.id);
        s.select(ids, drag.additive);
      }
    } else if (drag.kind === 'shape') {
      commitObject(objectFromShape(shapeKind, toPt(drag.start), toPt(drag.end), ensureActiveThread(), project.objects.length + 1));
    }
    setDrag(null);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool === 'select' && editable) {
      const hit = hitTest(project, worldPoint(e), tol);
      if (hit?.text) {
        useEditor.getState().setEditingText(hit.id);
        return;
      }
    }
    if (tool !== 'node' || !single || !editable) return;
    const wp = toPt(worldPoint(e));
    const seg = nearestSegment(single.geometry, wp);
    if (seg && seg.dist * v.s < 10) s_insert(single, seg.key, wp);
  };
  const s_insert = (o: StitchObject, key: string, p: Pt) =>
    useEditor.getState().replaceObject({ ...o, geometry: insertVertexAfter(o.geometry, key, p), text: undefined });

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const s = useEditor.getState();
      const r = wrapRef.current!.getBoundingClientRect();
      const at: P = [e.clientX - r.left, e.clientY - r.top];
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        const z = zoomAt(r.width, r.height, s.zoom, s.pan, s.zoom * factor, at);
        s.setZoom(z.zoom, z.pan);
      } else {
        s.setPan({ x: s.pan.x - e.deltaX, y: s.pan.y - e.deltaY });
      }
    },
    [],
  );
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // ---------- Drag & drop import ----------
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !readOnly) onImportFile(f);
  };

  // ---------- Overlay content ----------
  const hoopOut = warnings.some((w) => w.kind === 'out-of-hoop');
  const outW = hoopOut && plan?.bounds ? plan.bounds.maxX - plan.bounds.minX : 0;
  const outH = hoopOut && plan?.bounds ? plan.bounds.maxY - plan.bounds.minY : 0;
  const threadHex = (id: string) => project.threads.find((t) => t.id === id)?.hex ?? '#888';
  const worldTransform = `matrix(${v.s} 0 0 ${v.s} ${v.cx} ${v.cy})`;

  // Artwork and Objects draw every object with a live picture of its stitch type.
  const showArt = (view === 'objects' || view === 'artwork') && !sim.active;
  const showBackdrop = !!project.backdrop?.visible && (view === 'artwork' || view === 'objects') && !sim.active;

  const objectsLayer: ReactNode[] = [];
  if (showArt) {
    for (const o of project.objects) {
      if (!o.visible || o.id === editingTextId) continue;
      const art = <ObjectArt key={o.id} o={o} color={threadHex(o.thread)} fabricId={project.fabricPreset} scale={v.s} />;
      objectsLayer.push(
        xf?.phase === 'drag' && !xf.backdrop && xf.ids.includes(o.id) ? (
          <g key={o.id} transform={`matrix(${xf.m.join(' ')})`}>
            {art}
          </g>
        ) : (
          art
        ),
      );
    }
  }

  // Ghost outlines of objects not yet sewn (simulator).
  const ghosts: ReactNode[] = [];
  if (sim.active && plan) {
    project.objects.forEach((o, i) => {
      const st = plan.objectStats[i];
      if (!o.visible || !st || st.stitches === 0 || st.end <= simCmd) return;
      ghosts.push(
        <path key={o.id} d={geometryPath(o.geometry)} fill="none" stroke="rgba(60,52,40,.55)" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" fillRule="evenodd" />,
      );
    });
  }

  // Needle position (simulator).
  let needle: P | null = null;
  if (sim.active && plan && simCmd > 0) {
    const i = Math.min(simCmd, plan.cmds.length) - 1;
    needle = toScreen(v, [plan.xs[i], plan.ys[i]]);
  }

  // Selection overlays in screen space.
  const overlays: ReactNode[] = [];
  if (!sim.active && sel.length) {
    let b = objectsBounds(sel);
    const dragging = xf?.phase === 'drag' && !xf.backdrop;
    if (b && dragging) {
      // Live box while dragging: transform the original bounds.
      const p0 = applyMat(xf.m, [b.minX, b.minY]);
      const p1 = applyMat(xf.m, [b.maxX, b.maxY]);
      b = { minX: Math.min(p0[0], p1[0]), minY: Math.min(p0[1], p1[1]), maxX: Math.max(p0[0], p1[0]), maxY: Math.max(p0[1], p1[1]) };
    }
    if (b) {
      const [x0, y0] = toScreen(v, [b.minX, b.minY]);
      const [x1, y1] = toScreen(v, [b.maxX, b.maxY]);
      overlays.push(
        <rect key="selbox" className="selbox" x={x0 - 4} y={y0 - 4} width={x1 - x0 + 8} height={y1 - y0 + 8} fill="none" stroke="var(--sb-handle)" strokeWidth={1} strokeDasharray="4 3" />,
      );
      // Dimensions of the selection, live while moving or scaling.
      const dims = `${fmtLen(b.maxX - b.minX, project.units)} × ${fmtLen(b.maxY - b.minY, project.units)} ${project.units}`;
      const dw = dims.length * 6.6 + 14;
      const dimY = Math.min(size.h - 24, y1 + 12);
      overlays.push(
        <g key="dims" className="sel-dims" pointerEvents="none" transform={`translate(${(x0 + x1) / 2 - dw / 2} ${dimY})`}>
          <rect width={dw} height={18} rx={4} fill="var(--sb-accent)" />
          <text x={dw / 2} y={13} textAnchor="middle" fontSize={11} fill="#fff" fontFamily="var(--sb-font-mono)">
            {dims}
          </text>
        </g>,
      );
      if (editable && tool === 'select' && !editingTextId && sel.every((o) => !o.locked)) {
        for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const hx = cx ? x1 + 4 : x0 - 4;
          const hy = cy ? y1 + 4 : y0 - 4;
          overlays.push(
            <rect
              key={`c${cx}${cy}`}
              data-handle={`corner:${cx},${cy}`}
              className={cx === cy ? 'h-nwse' : 'h-nesw'}
              x={hx - 4}
              y={hy - 4}
              width={8}
              height={8}
              fill="#fff"
              stroke="var(--sb-accent)"
            />,
          );
        }
      }
    }
    if (!dragging && single && (single.type === 'tatami' || single.type === 'contour') && tool === 'select') {
      const c = objectCenter(single);
      const ob = geometryBounds(single.geometry);
      if (c && ob) {
        const [sx, sy] = toScreen(v, c);
        const R = Math.max(40, Math.min(ob.maxX - ob.minX, ob.maxY - ob.minY) * v.s * 0.42);
        const ang = single.type === 'tatami' ? single.params.angleDeg ?? 45 : 0;
        const rad = (ang * Math.PI) / 180;
        const kx = sx + Math.cos(rad) * R;
        const ky = sy - Math.sin(rad) * R;
        if (single.type === 'tatami') {
          const ar = 18;
          overlays.push(
            <g key="angle" className="angle-handle">
              <path d={`M${sx} ${sy}L${kx} ${ky}`} stroke="#fff" strokeWidth={1.4} />
              <path d={`M${sx + ar} ${sy}A${ar} ${ar} 0 0 0 ${sx + Math.cos(rad) * ar} ${sy - Math.sin(rad) * ar}`} fill="none" stroke="#fff" strokeWidth={1.4} />
              <circle cx={sx} cy={sy} r={3} fill="#fff" />
              <circle data-handle="angle" cx={kx} cy={ky} r={7} fill="var(--sb-accent)" stroke="#fff" strokeWidth={1.6} className="h-grab" />
              <g transform={`translate(${kx + 12} ${ky - 22})`} pointerEvents="none">
                <rect width={38} height={18} rx={4} fill="var(--sb-accent)" />
                <text x={19} y={13} textAnchor="middle" fontSize={11} fill="#fff" fontFamily="var(--sb-font-mono)">
                  {ang}°
                </text>
              </g>
            </g>,
          );
        }
      }
    }
    if (!dragging && single && single.geometry.kind === 'satin' && (view === 'objects' || view === 'artwork')) {
      const g = single.geometry;
      const col = columnFromRails(g.railA, g.railB);
      const step = Math.max(1, Math.round(30 / Math.max(0.05, v.s) / 2)); // ~ every 30 px
      const rungs: ReactNode[] = [];
      let k = 0;
      for (let i = 0; i < col.a.length; i += step, k++) {
        const a = toScreen(v, col.a[i]);
        const bb = toScreen(v, col.b[i]);
        rungs.push(<line key={`r${i}`} x1={a[0]} y1={a[1]} x2={bb[0]} y2={bb[1]} stroke="var(--sb-handle-light)" strokeWidth={1} opacity={0.7} />);
        if (k % 2 === 0) {
          for (const q of [a, bb]) rungs.push(<rect key={`q${i}-${q[0]}`} x={q[0] - 3} y={q[1] - 3} width={6} height={6} fill="#fff" stroke="var(--sb-accent)" transform={`rotate(45 ${q[0]} ${q[1]})`} />);
        }
      }
      const w = satinWidth(single) ?? 0;
      const ob = geometryBounds(g)!;
      const lp = toScreen(v, [ob.maxX, (ob.minY + ob.maxY) / 2]);
      overlays.push(
        <g key="satin" pointerEvents="none">
          <g transform={worldTransform}>
            <path d={railPath(g, 'A')} fill="none" stroke="var(--sb-handle)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
            <path d={railPath(g, 'B')} fill="none" stroke="var(--sb-handle)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          </g>
          {rungs}
          <line x1={lp[0]} y1={lp[1]} x2={lp[0] + 30} y2={lp[1]} stroke="var(--sb-handle)" />
          <rect x={lp[0] + 30} y={lp[1] - 9} width={54} height={18} rx={3} fill="var(--sb-accent)" />
          <text x={lp[0] + 57} y={lp[1] + 4} textAnchor="middle" fontSize={11} fill="#fff" fontFamily="var(--sb-font-mono)">
            {fmtLen(w, project.units)} {project.units}
          </text>
        </g>,
      );
    }
    if (single && !dragging) {
      for (const which of ['entry', 'exit'] as const) {
        const pt = single[which];
        if (!pt) continue;
        const [x, y] = toScreen(v, pt);
        overlays.push(
          <g key={which} pointerEvents="none">
            {which === 'entry' ? (
              <circle cx={x} cy={y} r={6} fill="var(--sb-success)" stroke="#111" strokeWidth={1.5} />
            ) : (
              <rect x={x - 5.5} y={y - 5.5} width={11} height={11} fill="var(--sb-error)" stroke="#111" strokeWidth={1.5} />
            )}
            <text x={x + 9} y={y + 4} fontSize={10} fill="var(--sb-text)" fontFamily="var(--sb-font-sans)">
              {which === 'entry' ? 'Start' : 'End'}
            </text>
          </g>,
        );
      }
    }
    if (!dragging && single && tool === 'node' && editable && !single.locked) {
      for (const vx of listVertices(single.geometry)) {
        const [x, y] = toScreen(v, vx.pt);
        overlays.push(
          <rect key={`n-${vx.key}`} data-handle={`node:${vx.key}`} x={x - 4} y={y - 4} width={8} height={8} fill="#fff" stroke="var(--sb-accent)" className="h-grab" />,
        );
      }
    }
  }

  // Drawing previews.
  const previews: ReactNode[] = [];
  if (draft.length && (tool === 'pen' || tool === 'run' || tool === 'fill' || tool === 'applique')) {
    const pts = draft.map((p) => toScreen(v, p));
    const h = hover ? toScreen(v, hover) : null;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('') + (h ? `L${h[0]} ${h[1]}` : '');
    const color = threadHex(useEditor.getState().activeThread ?? '');
    previews.push(<path key="draft" d={d} fill={tool === 'run' ? 'none' : `${color}33`} stroke="var(--sb-handle)" strokeWidth={1.5} />);
    pts.forEach((p, i) => previews.push(<rect key={`dp${i}`} x={p[0] - 3.5} y={p[1] - 3.5} width={7} height={7} fill={i === 0 ? 'var(--sb-accent)' : '#fff'} stroke="var(--sb-accent)" />));
  }
  if (draft.length && tool === 'satin') {
    const a = draft.filter((_, i) => i % 2 === 0).map((p) => toScreen(v, p));
    const b = draft.filter((_, i) => i % 2 === 1).map((p) => toScreen(v, p));
    const line = (pts: P[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('');
    previews.push(<path key="ra" d={line(a)} fill="none" stroke="var(--sb-handle)" strokeWidth={1.6} />);
    previews.push(<path key="rb" d={line(b)} fill="none" stroke="var(--sb-handle)" strokeWidth={1.6} />);
    for (let i = 0; i < b.length; i++) previews.push(<line key={`rg${i}`} x1={a[i][0]} y1={a[i][1]} x2={b[i][0]} y2={b[i][1]} stroke="var(--sb-handle-light)" />);
    draft.forEach((p, i) => {
      const q = toScreen(v, p);
      previews.push(<rect key={`sp${i}`} x={q[0] - 3.5} y={q[1] - 3.5} width={7} height={7} fill="#fff" stroke="var(--sb-accent)" />);
    });
  }
  if (drag?.kind === 'shape') {
    const a = toScreen(v, drag.start);
    const b = toScreen(v, drag.end);
    const x = Math.min(a[0], b[0]);
    const y = Math.min(a[1], b[1]);
    const w = Math.abs(b[0] - a[0]);
    const h = Math.abs(b[1] - a[1]);
    previews.push(
      shapeKind === 'rect' ? (
        <rect key="shape" x={x} y={y} width={w} height={h} fill="rgba(108,151,255,.15)" stroke="var(--sb-handle)" />
      ) : (
        <ellipse key="shape" cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="rgba(108,151,255,.15)" stroke="var(--sb-handle)" />
      ),
    );
  }
  if (drag?.kind === 'marquee') {
    const a = toScreen(v, drag.start);
    const b = toScreen(v, drag.end);
    previews.push(
      <rect key="marquee" x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} fill="rgba(108,151,255,.08)" stroke="var(--sb-handle)" strokeDasharray="3 3" />,
    );
  }
  if (measure) {
    const a = toScreen(v, measure.start);
    const b = toScreen(v, measure.end);
    const len = Math.hypot(measure.end[0] - measure.start[0], measure.end[1] - measure.start[1]);
    const mid: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    previews.push(
      <g key="measure" pointerEvents="none">
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--sb-warning)" strokeWidth={1.5} />
        <circle cx={a[0]} cy={a[1]} r={3} fill="var(--sb-warning)" />
        <circle cx={b[0]} cy={b[1]} r={3} fill="var(--sb-warning)" />
        <rect x={mid[0] + 8} y={mid[1] - 20} width={70} height={18} rx={4} fill="var(--sb-bg-panel)" stroke="var(--sb-warning)" />
        <text x={mid[0] + 43} y={mid[1] - 7} textAnchor="middle" fontSize={11} fill="var(--sb-text)" fontFamily="var(--sb-font-mono)">
          {fmtLen(len, project.units)} {project.units}
        </text>
      </g>,
    );
  }

  const hw = project.hoop.width / 2;
  const hh = project.hoop.height / 2;
  const innerTL = toScreen(v, [-hw, -hh]);
  const innerBR = toScreen(v, [hw, hh]);
  const empty = project.objects.length === 0 && project.source !== 'stitch-file' && !startBlank;
  const picking = useEditor((st) => st.pickPoint);
  const cursor =
    picking ? 'crosshair' : drag?.kind === 'pan' || spaceDown ? 'grabbing' : tool === 'select' || tool === 'node' ? 'default' : tool === 'lettering' ? 'text' : 'crosshair';
  const updating = computing && (dirtyIds.length > 0 || !plan);

  return (
    <div
      ref={wrapRef}
      className={`canvas-wrap${dropping ? ' dropping' : ''}`}
      onDragOver={(e) => {
        if (readOnly) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      <canvas ref={canvasRef} className="canvas-layer" style={{ width: size.w, height: size.h }} aria-hidden="true" />
      <svg
        className="overlay-layer"
        width={size.w}
        height={size.h}
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={onDoubleClick}
        role="img"
        aria-label={`Design canvas: ${project.objects.length} objects in a ${hoopLabel(project.hoop)} mm hoop, ${view} view`}
      >
        <g transform={worldTransform}>
          {showBackdrop && project.backdrop && (
            <image
              transform={xf?.phase === 'drag' && xf.backdrop ? `translate(${xf.m[4]} ${xf.m[5]})` : undefined}
              href={project.backdrop.dataUrl}
              x={project.backdrop.x}
              y={project.backdrop.y}
              width={project.backdrop.width}
              height={project.backdrop.height}
              opacity={project.backdrop.opacity}
              preserveAspectRatio="none"
            />
          )}
          {objectsLayer}
          {ghosts}
        </g>
        {hoopOut && !sim.active && (
          <g pointerEvents="none">
            <rect
              x={innerTL[0]}
              y={innerTL[1]}
              width={innerBR[0] - innerTL[0]}
              height={innerBR[1] - innerTL[1]}
              rx={110 * v.s}
              fill="none"
              stroke="var(--sb-error)"
              strokeWidth={2}
            />
            <rect
              x={innerTL[0] - 50 * v.s}
              y={innerTL[1] - 50 * v.s}
              width={innerBR[0] - innerTL[0] + 100 * v.s}
              height={innerBR[1] - innerTL[1] + 100 * v.s}
              rx={160 * v.s}
              fill="none"
              stroke="var(--sb-error)"
              strokeOpacity={0.5}
              strokeDasharray="4 3"
            />
          </g>
        )}
        {overlays}
        {previews}
        {(guides.x !== null || guides.y !== null) && (
          <g className="snap-guides" pointerEvents="none">
            {guides.x !== null && <line x1={toScreen(v, [guides.x, 0])[0]} x2={toScreen(v, [guides.x, 0])[0]} y1={0} y2={size.h} stroke="var(--sb-guide)" strokeWidth={1} />}
            {guides.y !== null && <line y1={toScreen(v, [0, guides.y])[1]} y2={toScreen(v, [0, guides.y])[1]} x1={0} x2={size.w} stroke="var(--sb-guide)" strokeWidth={1} />}
          </g>
        )}
        {needle && (
          <g pointerEvents="none" stroke="#fff" strokeWidth={1.4}>
            <circle cx={needle[0]} cy={needle[1]} r={9} fill="none" />
            <path d={`M${needle[0]} ${needle[1] - 14}v8M${needle[0]} ${needle[1] + 6}v8M${needle[0] - 14} ${needle[1]}h8M${needle[0] + 6} ${needle[1]}h8`} />
          </g>
        )}
      </svg>

      <div className="canvas-chips">
        {hoopOut && !sim.active ? (
          <span className="chip boxed error-chip" role="alert">
            <Icon name="warning" small />
            {outW / project.hoop.width >= outH / project.hoop.height
              ? `Design is ${fmtLenCompact(outW, project.units)} ${project.units} wide — this hoop allows ${fmtLenCompact(project.hoop.width, project.units)} ${project.units}`
              : `Design is ${fmtLenCompact(outH, project.units)} ${project.units} tall — this hoop allows ${fmtLenCompact(project.hoop.height, project.units)} ${project.units}`}
          </span>
        ) : (
          <>
            <span className="chip boxed">Hoop {hoopLabel(project.hoop)} mm</span>
            <span className="chip boxed">{sim.active ? 'Editing paused while simulating' : getFabric(project.fabricPreset).name}</span>
          </>
        )}
        {readOnly && !sim.active && <span className="chip boxed">Stitch file · recolor only</span>}
        {picking && <span className="chip boxed accent-chip">Click to set the {picking.which} point · Esc to cancel</span>}
      </div>

      {tool === 'shapes' && !sim.active && (
        <div className="canvas-toolopts">
          <SegmentedControl<ShapeKind>
            label="Shape"
            value={shapeKind}
            onChange={setShapeKind}
            options={[
              { value: 'rect', label: 'Rectangle' },
              { value: 'ellipse', label: 'Ellipse' },
            ]}
          />
          <span className="meta">Drag on the canvas · Shift for square / circle</span>
        </div>
      )}
      {(tool === 'pen' || tool === 'run' || tool === 'fill' || tool === 'satin' || tool === 'applique' || tool === 'lettering' || tool === 'node' || tool === 'measure') &&
        !sim.active && (
          <div className="canvas-toolopts hint-only">
            <span className="meta">{TOOL_HINTS[tool]}</span>
          </div>
        )}

      {single?.text && !sim.active && !readOnly && !single.locked && xf?.phase !== 'drag' && (
        <TextToolbar
          o={single}
          v={v}
          units={project.units}
          editing={editingTextId === single.id}
          onEdit={() => useEditor.getState().setEditingText(single.id)}
        />
      )}
      {editingTextId && !sim.active && (() => {
        const o = project.objects.find((x) => x.id === editingTextId);
        if (!o?.text) return null;
        return (
          <InlineTextEditor
            key={o.id}
            o={o}
            v={v}
            color={threadHex(o.thread)}
            onDone={() => useEditor.getState().setEditingText(null)}
          />
        );
      })()}

      {updating && needStitches && !sim.active && (
        <div className="updating-pill" role="status">
          <Spinner size={12} />
          Updating stitches
        </div>
      )}

      {empty && !sim.active && size.w > 0 && (tool === 'select' || tool === 'auto-digitize') && (
        <div
          className="dropzone"
          style={{
            left: (innerTL[0] + innerBR[0]) / 2,
            top: (innerTL[1] + innerBR[1]) / 2,
            maxWidth: Math.max(220, (innerBR[0] - innerTL[0]) * 0.8),
          }}
        >
          <div className="dz-icon">
            <Icon name="upload" />
          </div>
          <h3>Start with your artwork</h3>
          <p>Drop an SVG to turn each shape into stitches, or a PNG / JPG to trace over.</p>
          <button className="btn pri block dz-btn" onClick={onImportClick}>
            Import artwork…
          </button>
          <button className="btn block dz-btn" onClick={onOpenStitchFile}>
            Open a DST or PES file
          </button>
          <button className="btn block dz-btn" onClick={chooseBlank}>
            Start with a blank canvas
          </button>
          <p className="dz-hint">
            Or pick a drawing tool on the left: <b>P</b> pen, <b>S</b> satin, <b>F</b> fill
          </p>
        </div>
      )}

      <div className={`grid-ctl${sim.active ? ' top' : ''}`} role="group" aria-label="Grid and snapping">
        <IconButton icon="grid" label="Show grid" shortcut="G" size="xs" tipSide="top" aria-pressed={grid.show} className={grid.show ? 'toggle-on' : ''} onClick={() => useEditor.getState().setGrid({ show: !grid.show })} />
        <select className="grid-size" aria-label="Grid size" value={grid.size} onChange={(e) => useEditor.getState().setGrid({ size: Number(e.target.value) })}>
          {gridSizes(project.units).map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
        <IconButton icon="magnet" label="Snap to grid" size="xs" tipSide="top" aria-pressed={grid.snap} className={grid.snap ? 'toggle-on' : ''} onClick={() => useEditor.getState().setGrid({ snap: !grid.snap })} />
        <IconButton icon="guides" label="Smart snap to objects and hoop" hint="Hold ⌘/Ctrl to skip" size="xs" tipSide="top" aria-pressed={grid.smart} className={grid.smart ? 'toggle-on' : ''} onClick={() => useEditor.getState().setGrid({ smart: !grid.smart })} />
      </div>
      <div className={`zoom-ctl${sim.active ? ' top' : ''}`}>
        <IconButton icon="zoom-out" label="Zoom out" size="xs" onClick={() => useEditor.getState().setZoom(zoom / 1.25)} tipSide="top" />
        <span className="mono zoom-val">{Math.round(zoom * 100)}%</span>
        <IconButton icon="zoom-in" label="Zoom in" size="xs" onClick={() => useEditor.getState().setZoom(zoom * 1.25)} tipSide="top" />
        <IconButton icon="fit" label="Fit hoop to screen" shortcut="0" size="xs" onClick={() => useEditor.getState().requestFit()} tipSide="top" />
      </div>
    </div>
  );
}

const TOOL_HINTS: Record<string, string> = {
  pen: 'Click to add points · click the first point to close a fill · double-click or Enter to finish a line',
  run: 'Click to add points · double-click or Enter to finish',
  fill: 'Click to add points · Enter or click the first point to close',
  applique: 'Click the outline of the patch · Enter to close',
  satin: 'Click left and right rail points in turn · Enter to finish',
  lettering: 'Click where the text should go',
  node: 'Drag points · double-click an edge to add one · Alt-click to delete',
  measure: 'Drag to measure',
};

