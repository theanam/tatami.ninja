import { useState } from 'react';
import { IconButton, NumberInput, Select } from '../../components/ui';
import type { BackgroundKind } from '../../model/arrange';
import { fromDisplay, toDisplay } from '../../model/units';
import { selectedObjects, useEditor } from '../../store/editor';

/** Flip, align, distribute, group and arranged copies for the selection. */
export function ArrangePanel({ readOnly }: { readOnly: boolean }) {
  const project = useEditor((s) => s.project)!;
  const selection = useEditor((s) => s.selection);
  const [count, setCount] = useState(6);
  const [radius, setRadius] = useState(300);
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(3);
  const [gap, setGap] = useState(50);
  const [echoes, setEchoes] = useState(3);
  const [echoGap, setEchoGap] = useState(40);
  const [bgKind, setBgKind] = useState<BackgroundKind>('stipple');
  const [bgMargin, setBgMargin] = useState(30);
  const sel = selectedObjects({ project, selection });
  if (!sel.length || readOnly || sel.every((o) => o.type === 'stitches')) return null;
  const s = useEditor.getState();
  const units = project.units;
  const groups = new Set(sel.map((o) => o.group ?? o.id));
  const grouped = sel.some((o) => o.group);
  const locked = sel.some((o) => o.locked);
  const dec = units === 'mm' ? 1 : 2;
  return (
    <section className="props arrange" aria-labelledby="arrh">
      <div className="panel-head inline">
        <h2 id="arrh" className="label-caps">
          Arrange
        </h2>
      </div>
      <fieldset className="props-body" disabled={locked}>
        <div className="icon-row" role="toolbar" aria-label="Transform">
          <IconButton icon="flip-h" label="Flip horizontally" onClick={() => s.flipSelected('horizontal')} />
          <IconButton icon="flip-v" label="Flip vertically" onClick={() => s.flipSelected('vertical')} />
          <IconButton icon="rotate" label="Rotate 90°" onClick={() => s.rotateSelected(90)} />
          {(groups.size >= 2 || grouped) && <span className="icon-sep" />}
          {groups.size >= 2 && <IconButton icon="group" label="Group" shortcut="⌘G" onClick={() => s.groupSelected()} />}
          {grouped && <IconButton icon="ungroup" label="Ungroup" shortcut="⇧⌘G" onClick={() => s.ungroupSelected()} />}
        </div>
        <div className="icon-row" role="toolbar" aria-label={groups.size >= 2 ? 'Align' : 'Align to hoop'}>
          <IconButton icon="align-left" label="Align left" onClick={() => s.alignSelected('left')} />
          <IconButton icon="align-center" label="Align centers" onClick={() => s.alignSelected('center')} />
          <IconButton icon="align-right" label="Align right" onClick={() => s.alignSelected('right')} />
          <IconButton icon="align-top" label="Align top" onClick={() => s.alignSelected('top')} />
          <IconButton icon="align-middle" label="Align middles" onClick={() => s.alignSelected('middle')} />
          <IconButton icon="align-bottom" label="Align bottom" onClick={() => s.alignSelected('bottom')} />
          {groups.size >= 3 && (
            <>
              <span className="icon-sep" />
              <IconButton icon="distribute-h" label="Distribute horizontally" onClick={() => s.distributeSelected('horizontal')} />
              <IconButton icon="distribute-v" label="Distribute vertically" onClick={() => s.distributeSelected('vertical')} />
            </>
          )}
        </div>
        <div className="copy-row">
          <span className="prop-label">Circle</span>
          <NumberInput label="Copies around the circle" value={count} decimals={0} min={2} max={60} unit="×" onChange={(v) => setCount(Math.round(v))} />
          <NumberInput label="Circle radius" value={toDisplay(radius, units)} decimals={dec} min={toDisplay(10, units)} max={toDisplay(3000, units)} unit={units} onChange={(v) => setRadius(fromDisplay(v, units))} />
          <IconButton icon="copy-circle" label="Copy around a circle" onClick={() => s.copyAroundCircle(count, radius)} />
        </div>
        <div className="copy-row">
          <span className="prop-label">Grid</span>
          <div className="rc">
            <NumberInput label="Grid rows" value={rows} decimals={0} min={1} max={30} onChange={(v) => setRows(Math.round(v))} />
            <span className="meta">×</span>
            <NumberInput label="Grid columns" value={cols} decimals={0} min={1} max={30} onChange={(v) => setCols(Math.round(v))} />
          </div>
          <NumberInput label="Grid gap" value={toDisplay(gap, units)} decimals={dec} min={0} max={toDisplay(1000, units)} unit={units} onChange={(v) => setGap(fromDisplay(v, units))} />
          <IconButton icon="copy-grid" label="Copy in a grid" onClick={() => s.copyInGrid(rows, cols, gap, gap)} />
        </div>
        <div className="copy-row">
          <span className="prop-label">Echo</span>
          <NumberInput label="Echo lines" value={echoes} decimals={0} min={1} max={30} unit="×" onChange={(v) => setEchoes(Math.round(v))} />
          <NumberInput label="Echo spacing" value={toDisplay(echoGap, units)} decimals={dec} min={toDisplay(10, units)} max={toDisplay(300, units)} unit={units} onChange={(v) => setEchoGap(fromDisplay(v, units))} />
          <IconButton icon="echo" label="Add echo lines" onClick={() => s.addEcho(echoes, echoGap)} />
        </div>
        <div className="copy-row">
          <span className="prop-label">Fill</span>
          <Select<BackgroundKind>
            label="Background pattern"
            value={bgKind}
            onChange={setBgKind}
            options={[
              { value: 'stipple', label: 'Stipple' },
              { value: 'echo', label: 'Echo' },
              { value: 'cross', label: 'Cross-hatch' },
              { value: 'lines', label: 'Lines' },
            ]}
          />
          <NumberInput label="Background margin" value={toDisplay(bgMargin, units)} decimals={dec} min={0} max={toDisplay(300, units)} unit={units} onChange={(v) => setBgMargin(fromDisplay(v, units))} />
          <IconButton icon="background" label="Fill the hoop around the selection" onClick={() => s.addBackground(bgKind, bgMargin)} />
        </div>
      </fieldset>
    </section>
  );
}
