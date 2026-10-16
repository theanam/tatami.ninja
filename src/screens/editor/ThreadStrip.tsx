import { useEffect, useMemo, useRef, useState } from 'react';
import { IconButton, Select } from '../../components/ui';
import { colorName, normalizeHex } from '../../model/project';
import type { Thread, ThreadChart } from '../../model/types';
import { THREAD_CHARTS } from '../../presets';
import { useEditor } from '../../store/editor';

/** Threads in sewing order (first use), then unused ones. */
export function orderedThreads(threads: Thread[], objectThreads: string[]): Thread[] {
  const order: string[] = [];
  for (const t of objectThreads) if (!order.includes(t)) order.push(t);
  for (const t of threads) if (!order.includes(t.id)) order.push(t.id);
  return order.map((id) => threads.find((t) => t.id === id)).filter((t): t is Thread => !!t);
}

export function ThreadStrip() {
  const project = useEditor((s) => s.project)!;
  const active = useEditor((s) => s.activeThread);
  const selection = useEditor((s) => s.selection);
  const simActive = useEditor((s) => s.sim.active);
  const [editing, setEditing] = useState<string | null>(null);
  const threads = useMemo(() => orderedThreads(project.threads, project.objects.map((o) => o.thread)), [project.threads, project.objects]);
  const s = useEditor.getState();

  const pick = (t: Thread) => {
    s.setActiveThread(t.id);
    if (selection.length && !simActive) s.setObjectThread(selection, t.id);
  };

  const addThread = () => {
    const palette = ['#C8282E', '#2C6B3A', '#F2D23C', '#FFFFFF', '#111111', '#2E55C4', '#EE7D2B', '#6A3A9A'];
    const hex = palette.find((h) => !project.threads.some((t) => t.hex.toUpperCase() === h)) ?? '#7C7D82';
    const id = s.addThread(hex, colorName(hex));
    s.setActiveThread(id);
    setEditing(id);
  };

  return (
    <div className="thread-strip">
      <span className="strip-label">Threads</span>
      <div className="thread-chips">
        {threads.map((t, i) => (
          <div key={t.id} className="thread-chip-wrap">
            <button
              className={`btn thread-chip${active === t.id ? ' active' : ''}`}
              aria-pressed={active === t.id}
              title={selection.length ? `Use ${t.name} for the selection (double-click to edit)` : `Draw with ${t.name} (double-click to edit)`}
              onClick={() => pick(t)}
              onDoubleClick={() => setEditing(t.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setEditing(t.id);
              }}
            >
              <span className="swatch-dot" style={{ background: t.hex }} />
              {i + 1} · {t.name}
            </button>
            {editing === t.id && <ThreadEditor thread={t} onClose={() => setEditing(null)} used={project.objects.some((o) => o.thread === t.id)} />}
          </div>
        ))}
        {!simActive && <IconButton icon="plus" label="Add thread color" size="xs" onClick={addThread} tipSide="top" />}
      </div>
      <div className="spacer" />
      <label htmlFor="chart" className="strip-label">
        Chart
      </label>
      <div className="chart-select">
        <Select<ThreadChart>
          id="chart"
          value={project.threadChart}
          options={THREAD_CHARTS.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(v) => s.setProjectFields({ threadChart: v })}
        />
      </div>
    </div>
  );
}

function ThreadEditor({ thread, onClose, used }: { thread: Thread; onClose(): void; used: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const s = useEditor.getState();
  const chart = useEditor((st) => st.project?.threadChart);
  const chartName = THREAD_CHARTS.find((c) => c.id === chart)?.name ?? 'Chart';
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);
  return (
    <div className="popover thread-editor" ref={ref} role="dialog" aria-label={`Edit thread ${thread.name}`}>
      <label className="te-row">
        <span>Color</span>
        <input type="color" value={thread.hex.toLowerCase()} onChange={(e) => s.updateThread(thread.id, { hex: normalizeHex(e.target.value) })} />
        <span className="mono meta">{thread.hex}</span>
      </label>
      <label className="te-row">
        <span>Name</span>
        <input className="input" value={thread.name} onChange={(e) => s.updateThread(thread.id, { name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
      </label>
      <label className="te-row">
        <span>{chartName} #</span>
        <input
          className="input mono"
          placeholder="Thread number"
          value={thread.chartCode ?? ''}
          onChange={(e) => s.updateThread(thread.id, { chartCode: e.target.value.trim() || null })}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </label>
      <div className="te-actions">
        <button
          className="btn small"
          disabled={used}
          title={used ? 'This thread is used by objects' : undefined}
          onClick={() => {
            s.removeThread(thread.id);
            onClose();
          }}
        >
          Remove
        </button>
        <button className="btn small pri" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
