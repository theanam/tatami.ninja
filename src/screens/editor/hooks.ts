import { useEffect, useRef } from 'react';
import { EngineClient } from '../../engine/client';
import { renderThumbnail } from '../../render/stitchRender';
import { saveProject } from '../../storage/db';
import { useEditor, type ToolId, type ViewMode } from '../../store/editor';

/** Recompute stitches in the worker whenever the document changes (debounced, latest wins). */
export function useEngine() {
  const project = useEditor((s) => s.project);
  const clientRef = useRef<EngineClient | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    clientRef.current = new EngineClient();
    return () => clientRef.current?.dispose();
  }, []);
  useEffect(() => {
    if (!project) return;
    const my = ++seq.current;
    useEditor.getState().setComputing(true);
    const t = window.setTimeout(() => {
      clientRef.current
        ?.run(project)
        .then(({ plan, warnings }) => {
          if (my !== seq.current) return;
          useEditor.getState().setEngineResult(plan, warnings, project);
        })
        .catch(() => {
          if (my === seq.current) useEditor.getState().setComputing(false);
        });
    }, 120);
    return () => window.clearTimeout(t);
  }, [project]);
}

/** Save to IndexedDB once stitches for the latest edit are ready ("Saving…" → "Saved in this browser"). */
export function useAutosave() {
  const project = useEditor((s) => s.project);
  const plan = useEditor((s) => s.plan);
  const planFor = useEditor((s) => s.planFor);
  const saveState = useEditor((s) => s.saveState);
  const latest = useRef(project);
  latest.current = project;

  useEffect(() => {
    if (!project || saveState !== 'saving') return;
    const ready = plan && planFor === project;
    const t = window.setTimeout(
      () => {
        const thumb = ready && plan.stitchCount ? renderThumbnail(project, plan) : undefined;
        saveProject(project, { thumbnail: thumb, stitchCount: ready ? plan.stitchCount : undefined })
          .then(() => {
            if (latest.current === project) useEditor.getState().setSaveState('saved');
          })
          .catch(() => {
            /* storage may be unavailable (private mode); keep "Saving…" */
          });
      },
      ready ? 300 : 1500,
    );
    return () => window.clearTimeout(t);
  }, [project, plan, planFor, saveState]);

  // Flush on tab close.
  useEffect(() => {
    const flush = () => {
      const s = useEditor.getState();
      if (s.project && s.saveState === 'saving') void saveProject(s.project);
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
    };
  }, []);
}

const TOOL_KEYS: Record<string, ToolId> = { v: 'select', a: 'node', p: 'pen', r: 'run', s: 'satin', f: 'fill', u: 'shapes', t: 'lettering', m: 'measure' };
const VIEW_KEYS: Record<string, ViewMode> = { '1': 'artwork', '2': 'objects', '3': 'stitches', '4': 'realistic' };

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Global editor shortcuts. Drawing tools handle Enter/Escape/Backspace themselves first. */
export function useEditorKeyboard(opts: { readOnly: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.defaultPrevented) return;
      const s = useEditor.getState();
      if (s.dialog) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && k === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (s.sim.active) {
        if (k === ' ') {
          e.preventDefault();
          s.setSim({ playing: !s.sim.playing });
        } else if (k === 'escape') s.setSim({ active: false, playing: false });
        return;
      }
      if (mod && k === 'd') {
        e.preventDefault();
        if (!opts.readOnly) s.duplicateSelected();
        return;
      }
      if (mod && k === 'a') {
        e.preventDefault();
        s.select(s.project?.objects.map((o) => o.id) ?? []);
        return;
      }
      if (mod) return;
      if ((k === 'delete' || k === 'backspace') && s.selection.length && !opts.readOnly) {
        e.preventDefault();
        s.deleteSelected();
        return;
      }
      if (k.startsWith('arrow') && s.selection.length && !opts.readOnly) {
        e.preventDefault();
        if (e.altKey && s.project && s.selection.length === 1) {
          const i = s.project.objects.findIndex((o) => o.id === s.selection[0]);
          s.moveObject(i, k === 'arrowup' ? i - 1 : k === 'arrowdown' ? i + 1 : i);
          return;
        }
        const step = e.shiftKey ? 10 : 1;
        const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
        const dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
        s.translateSelected(dx, dy, 'nudge');
        return;
      }
      if (k === 'escape') {
        if (s.pickPoint) return s.setPickPoint(null);
        s.select([]);
        s.setWarningsOpen(false);
        return;
      }
      if (k === '0') return s.requestFit();
      if (k === '=' || k === '+') return s.setZoom(s.zoom * 1.25);
      if (k === '-') return s.setZoom(s.zoom / 1.25);
      if (VIEW_KEYS[k]) return s.setView(VIEW_KEYS[k]);
      if (TOOL_KEYS[k] && !e.altKey) {
        if (opts.readOnly && k !== 'v' && k !== 'm') return;
        s.setTool(TOOL_KEYS[k]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opts.readOnly]);
}
