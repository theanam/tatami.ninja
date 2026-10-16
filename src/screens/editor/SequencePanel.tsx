import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton, Spinner } from '../../components/ui';
import { colorBlocks } from '../../model/project';
import type { StitchObject, StitchType } from '../../model/types';
import { fmtInt } from '../../model/units';
import { getFabric } from '../../presets';
import { useEditor } from '../../store/editor';

export const TYPE_ICON: Record<StitchType, { icon: string; label: string }> = {
  run: { icon: 'run-stitch', label: 'Run' },
  satin: { icon: 'satin-column', label: 'Satin' },
  tatami: { icon: 'fill', label: 'Tatami fill' },
  contour: { icon: 'fill', label: 'Contour fill' },
  applique: { icon: 'applique', label: 'Appliqué' },
  stitches: { icon: 'run-stitch', label: 'Stitches' },
};

export function SequencePanel({ readOnly }: { readOnly: boolean }) {
  const project = useEditor((s) => s.project)!;
  const plan = useEditor((s) => s.plan);
  const selection = useEditor((s) => s.selection);
  const warnings = useEditor((s) => s.warnings);
  const dirtyIds = useEditor((s) => s.dirtyIds);
  const computing = useEditor((s) => s.computing);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const s = useEditor.getState();

  const stitches = (id: string) => plan?.objectStats.find((x) => x.id === id)?.stitches;
  const blocks = colorBlocks(project);
  const indexOf = (id: string) => project.objects.findIndex((o) => o.id === id);

  const onDrop = (to: number) => {
    if (dragId === null) return;
    const from = indexOf(dragId);
    s.moveObject(from, from < to ? to - 1 : to);
    setDragId(null);
    setOverIndex(null);
  };

  const issueFor = (id: string) => {
    const w = warnings.filter((x) => x.objectIds.includes(id));
    if (!w.length) return null;
    return w.some((x) => x.severity === 'error') ? 'error' : 'warning';
  };

  return (
    <section aria-labelledby="seqh" className="seq">
      <div className="panel-head">
        <h2 id="seqh" className="label-caps">
          Sequence
        </h2>
        {project.objects.length > 1 && !readOnly && (
          <div className="seq-actions">
            {getFabric(project.fabricPreset).cap && (
              <button className="btn small" title="Within each color: center out, then bottom up. Caps pucker less this way." onClick={() => s.orderForCaps()}>
                Order for caps
              </button>
            )}
            <button className="btn small" onClick={() => s.autoOrderByColor()}>
              Auto-order by color
            </button>
          </div>
        )}
        {readOnly && project.objects.some((o) => o.geometry.kind === 'stitches') && (
          <div className="seq-actions">
            <button className="btn small" onClick={() => s.makeEditable()}>
              Make editable
            </button>
          </div>
        )}
      </div>
      {project.objects.length === 0 ? (
        <div className="seq-empty">No objects yet. Shapes you import or draw appear here in sewing order.</div>
      ) : (
        <div className="seq-list">
          {blocks.map((b, bi) => {
            const subtotal = b.objects.reduce((n, o) => n + (stitches(o.id) ?? 0), 0);
            return (
              <div key={`${b.thread.id}-${bi}`} className="color-block">
                <div className="block-head">
                  <span className="block-swatch" style={{ background: b.thread.hex }} />
                  Color {bi + 1} · {b.thread.name}
                  <span className="mono block-total">{fmtInt(subtotal)}</span>
                </div>
                <ul role="list" className="rows">
                  {b.objects.map((o) => (
                    <ObjectRow
                      key={o.id}
                      o={o}
                      index={indexOf(o.id)}
                      hex={b.thread.hex}
                      selected={selection.includes(o.id)}
                      count={stitches(o.id)}
                      busy={computing && dirtyIds.includes(o.id)}
                      issue={issueFor(o.id)}
                      readOnly={readOnly}
                      dragOver={overIndex === indexOf(o.id)}
                      onDragStart={() => setDragId(o.id)}
                      onDragOver={(i) => setOverIndex(i)}
                      onDrop={onDrop}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverIndex(null);
                      }}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
          {dragId && (
            <div
              className={`drop-end${overIndex === project.objects.length ? ' over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIndex(project.objects.length);
              }}
              onDrop={() => onDrop(project.objects.length)}
            >
              Move to the end
            </div>
          )}
        </div>
      )}
    </section>
  );
}

interface RowProps {
  o: StitchObject;
  index: number;
  hex: string;
  selected: boolean;
  count: number | undefined;
  busy: boolean;
  issue: 'error' | 'warning' | null;
  readOnly: boolean;
  dragOver: boolean;
  onDragStart(): void;
  onDragOver(i: number): void;
  onDrop(i: number): void;
  onDragEnd(): void;
}

function ObjectRow({ o, index, hex, selected, count, busy, issue, readOnly, dragOver, onDragStart, onDragOver, onDrop, onDragEnd }: RowProps) {
  const [renaming, setRenaming] = useState(false);
  const s = useEditor.getState();
  const t = TYPE_ICON[o.type];
  return (
    <li
      className={`row${selected ? ' sel' : ''}${dragOver ? ' drag-over' : ''}${o.visible ? '' : ' hidden-row'}`}
      draggable={!readOnly || o.type === 'stitches'}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', o.id);
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(index);
      }}
      onDragEnd={onDragEnd}
      onClick={(e) => s.select([o.id], e.shiftKey || e.metaKey || e.ctrlKey)}
      aria-selected={selected}
    >
      <span className="grip" aria-hidden="true">
        <Icon name="grip" small />
      </span>
      <span className="row-swatch" style={{ background: hex }} />
      <Icon name={t.icon} small className="type-icon" label={t.label} />
      {renaming ? (
        <input
          className="input row-rename"
          autoFocus
          defaultValue={o.name}
          aria-label="Object name"
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            s.renameObject(o.id, e.target.value);
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <span className="row-name" onDoubleClick={() => setRenaming(true)} title="Double-click to rename">
          {o.name}
        </span>
      )}
      {issue && (
        <Icon name={issue === 'error' ? 'error' : 'warning'} small className={issue === 'error' ? 'issue-error' : 'issue-warning'} label={issue === 'error' ? 'Error' : 'Warning'} />
      )}
      {busy ? (
        <span className="row-count">
          <Spinner size={14} label="Updating stitches" />
        </span>
      ) : (
        <span className="mono row-count">{count === undefined ? '—' : fmtInt(count)}</span>
      )}
      <IconButton
        icon="eye"
        label={`${o.visible ? 'Hide' : 'Show'} ${o.name}`}
        size="xs"
        className={o.visible ? '' : 'off'}
        onClick={(e) => {
          e.stopPropagation();
          s.toggleVisible(o.id);
        }}
      />
      <IconButton
        icon={o.locked ? 'lock-closed' : 'lock-open'}
        label={`${o.locked ? 'Unlock' : 'Lock'} ${o.name}`}
        size="xs"
        className={o.locked ? 'locked' : ''}
        onClick={(e) => {
          e.stopPropagation();
          s.toggleLocked(o.id);
        }}
      />
    </li>
  );
}
