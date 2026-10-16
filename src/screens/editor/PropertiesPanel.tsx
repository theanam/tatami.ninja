import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton, NumberInput, ParamRow, SegmentedControl, Select, Switch, toast } from '../../components/ui';
import { resolveParams } from '../../engine/objects';
import { ANGLED_PATTERNS, OPEN_PATTERNS } from '../../engine/patterns';
import { areasOf } from '../../engine/geom';
import { objectsBounds, satinWidth } from '../../model/transform';
import type { FillPattern, RunStyle, StitchObject, StitchType, UnderlayType } from '../../model/types';
import { fmtLen, fromDisplay, toDisplay } from '../../model/units';
import { FABRICS, HOOPS, hoopLabel, MACHINES, UNDERLAY_OPTIONS } from '../../presets';
import { MotifGrid } from '../../components/MotifGrid';
import { ThreadPicker } from '../../components/ThreadPicker';
import { LenRow } from './PanelRows';
import { gridSizes } from './snap';
import { LetteringSection } from './TextTools';
import { addMonogram, type MonogramStyle } from './textOps';
import { selectedObjects, useEditor } from '../../store/editor';

/** Settings of the selected object(s); nothing when nothing is selected. */
export function PropertiesPanel({ readOnly }: { readOnly: boolean }) {
  const project = useEditor((s) => s.project)!;
  const selection = useEditor((s) => s.selection);
  const sel = selectedObjects({ project, selection });
  if (sel.length === 0) return null;
  if (sel.length > 1) return <MultiSelection objects={sel} readOnly={readOnly} />;
  return <ObjectProperties o={sel[0]} readOnly={readOnly} />;
}

/** Options of the active drawing tool (only tools that have any). */
export function ToolOptions() {
  const tool = useEditor((s) => s.tool);
  const shapeKind = useEditor((s) => s.shapeKind);
  if (tool === 'lettering') return <MonogramOptions />;
  if (tool !== 'shapes') return null;
  return (
    <section className="props tool-options" aria-labelledby="toolh">
      <div className="panel-head inline">
        <h2 id="toolh" className="label-caps">
          Shapes
        </h2>
      </div>
      <SegmentedControl<'rect' | 'ellipse'>
        label="Shape"
        grid
        value={shapeKind}
        onChange={(k) => useEditor.getState().setShapeKind(k)}
        options={[
          { value: 'rect', label: 'Rectangle' },
          { value: 'ellipse', label: 'Ellipse' },
        ]}
      />
    </section>
  );
}

const FILL_PATTERNS: { value: FillPattern; label: string }[] = [
  { value: 'rows', label: 'Tatami rows' },
  { value: 'radial', label: 'Radial' },
  { value: 'spiral', label: 'Spiral' },
  { value: 'circles', label: 'Concentric circles' },
  { value: 'net', label: 'Net' },
  { value: 'zigzag-net', label: 'Zigzag net' },
  { value: 'cross', label: 'Cross-hatch' },
  { value: 'lines', label: 'Lines' },
  { value: 'motif', label: 'Motif' },
  { value: 'stipple', label: 'Stipple' },
  { value: 'echo', label: 'Echo' },
];

const RUN_STYLES: { value: RunStyle; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'triple', label: 'Triple (bean)' },
  { value: 'stem', label: 'Stem' },
  { value: 'chain', label: 'Chain' },
  { value: 'candlewick', label: 'Candlewick' },
  { value: 'e', label: 'E stitch' },
  { value: 'v', label: 'V stitch' },
  { value: 'motif', label: 'Motif' },
];

function MonogramOptions() {
  const units = useEditor((s) => s.project!.units);
  const [initials, setInitials] = useState('ABC');
  const [style, setStyle] = useState<MonogramStyle>('classic');
  const [height, setHeight] = useState(250);
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      await addMonogram(initials, style, height);
      useEditor.getState().setTool('select');
    } catch {
      toast('Could not load the lettering font.', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="props tool-options" aria-labelledby="monoh">
      <div className="panel-head inline">
        <h2 id="monoh" className="label-caps">
          Monogram
        </h2>
      </div>
      <div className="props-body">
        <div className="prop-grid two">
          <label htmlFor="mono" className="prop-label">
            Initials
          </label>
          <input id="mono" className="input" maxLength={3} value={initials} onChange={(e) => setInitials(e.target.value.toUpperCase())} onKeyDown={(e) => e.stopPropagation()} />
          <span className="prop-label">Style</span>
          <SegmentedControl<MonogramStyle>
            label="Monogram style"
            grid
            value={style}
            onChange={setStyle}
            options={[
              { value: 'classic', label: 'Classic' },
              { value: 'block', label: 'Block' },
            ]}
          />
        </div>
        <div className="prop-grid">
          <LenRow label="Height" name="Monogram height" value={height} min={60} max={1200} step={5} units={units} onChange={setHeight} />
        </div>
        <button className="btn block" disabled={busy || !initials.trim()} onClick={() => void add()}>
          Add monogram
        </button>
      </div>
    </section>
  );
}

function ObjectProperties({ o, readOnly }: { o: StitchObject; readOnly: boolean }) {
  const project = useEditor((s) => s.project)!;
  const [advanced, setAdvanced] = useState(false);
  const s = useEditor.getState();
  const units = project.units;
  const r = resolveParams(o, project.fabricPreset);
  const closed = areasOf(o.geometry).length > 0;
  const ids = [o.id];
  const disabled = o.locked;

  if (o.type === 'stitches') {
    return (
      <section className="props" aria-labelledby="proph">
        <div className="panel-head inline">
          <h2 id="proph" className="label-caps">
            Properties
          </h2>
          <span className="meta">{o.name}</span>
        </div>
        <ThreadRow ids={ids} value={o.thread} />
      </section>
    );
  }

  const types: { value: StitchType; label: string; disabled?: boolean }[] = [
    { value: 'run', label: 'Run' },
    { value: 'satin', label: 'Satin' },
    { value: 'tatami', label: 'Tatami', disabled: !closed && o.geometry.kind !== 'satin' },
    { value: 'contour', label: 'Contour', disabled: !closed && o.geometry.kind !== 'satin' },
  ];
  if (closed && !o.text) types.push({ value: 'applique', label: 'Appliqué' });

  return (
    <section className="props" aria-labelledby="proph">
      <div className="panel-head inline">
        <h2 id="proph" className="label-caps">
          Properties
        </h2>
        <span className="meta ellipsis">{o.name}</span>
      </div>
      {disabled && (
        <p className="note locked-note">
          <Icon name="lock-closed" small /> Locked
        </p>
      )}
      <fieldset disabled={disabled || readOnly} className="props-body">
        <SegmentedControl<StitchType>
          label="Stitch type"
          grid
          value={o.type}
          options={types}
          onChange={(t) => s.setObjectType(ids, t)}
        />
        {o.text && <LetteringSection o={o} units={units} />}
        <ThreadRow ids={ids} value={o.thread} />
        {o.type === 'tatami' && (
          <div className="prop-grid two">
            <label htmlFor="pattern" className="prop-label">
              Pattern
            </label>
            <div className={r.fillPattern === 'stipple' ? 'select-with-btn' : undefined}>
              <Select<FillPattern> id="pattern" value={r.fillPattern} options={FILL_PATTERNS} onChange={(v) => s.setParams(ids, { fillPattern: v })} />
              {r.fillPattern === 'stipple' && <IconButton icon="rotate" label="New meander" onClick={() => s.setParams(ids, { seed: r.seed + 1 })} />}
            </div>
          </div>
        )}
        <div className="prop-grid">
          {o.type === 'tatami' && (
            <>
              {ANGLED_PATTERNS.includes(r.fillPattern) && (
                <ParamRow
                  label="Angle"
                  value={r.angleDeg}
                  min={0}
                  max={180}
                  step={1}
                  unit="°"
                  decimals={0}
                  numLabel="Angle in degrees"
                  onChange={(v) => s.setParams(ids, { angleDeg: Math.round(v) }, 'angle')}
                />
              )}
              {r.fillPattern === 'motif' ? (
                <LenRow label="Row gap" name="Motif row gap" value={r.patternSpacing} min={0} max={100} step={1} units={units} onChange={(v) => s.setParams(ids, { patternSpacing: v }, 'patternSpacing')} />
              ) : OPEN_PATTERNS.includes(r.fillPattern) ? (
                <LenRow label="Spacing" name="Pattern spacing" value={r.patternSpacing} min={10} max={100} step={1} units={units} onChange={(v) => s.setParams(ids, { patternSpacing: v }, 'patternSpacing')} />
              ) : (
                <LenRow label="Density" name="Row spacing" value={r.rowSpacing} min={2} max={10} step={0.5} units={units} onChange={(v) => s.setParams(ids, { rowSpacing: v }, 'rowSpacing')} />
              )}
              <LenRow label="Stitch length" name="Stitch length" value={r.stitchLength} min={10} max={70} step={1} units={units} onChange={(v) => s.setParams(ids, { stitchLength: v }, 'stitchLength')} />
            </>
          )}
          {o.type === 'contour' && (
            <>
              <LenRow label="Spacing" name="Contour spacing" value={r.contourSpacing} min={2} max={20} step={0.5} units={units} onChange={(v) => s.setParams(ids, { contourSpacing: v }, 'contourSpacing')} />
              <LenRow label="Stitch length" name="Stitch length" value={r.stitchLength} min={10} max={70} step={1} units={units} onChange={(v) => s.setParams(ids, { stitchLength: v }, 'stitchLength')} />
            </>
          )}
          {o.type === 'run' && (
            <LenRow label="Stitch length" name="Stitch length" value={r.stitchLength} min={10} max={70} step={1} units={units} onChange={(v) => s.setParams(ids, { stitchLength: v }, 'stitchLength')} />
          )}
          {o.type === 'satin' && (o.geometry.kind === 'satin' || o.geometry.kind === 'polyline') && (
            <LenRow
              label="Width"
              name="Satin width"
              value={satinWidth(o) ?? r.width}
              min={10}
              max={100}
              step={1}
              units={units}
              onChange={(v) => s.setSatinWidth(ids, v, 'satinWidth')}
            />
          )}
          {o.type === 'applique' && (
            <LenRow label="Cover width" name="Cover satin width" value={r.width} min={10} max={60} step={1} units={units} onChange={(v) => s.setParams(ids, { width: v }, 'width')} />
          )}
          {(o.type === 'satin' || o.type === 'applique') && (
            <LenRow label="Density" name="Satin spacing" value={r.density} min={2} max={10} step={0.5} units={units} onChange={(v) => s.setParams(ids, { density: v }, 'density')} />
          )}
        </div>
        {o.type === 'run' && (
          <>
            <div className="prop-grid two">
              <label htmlFor="runstyle" className="prop-label">
                Style
              </label>
              <Select<RunStyle>
                id="runstyle"
                value={r.runStyle}
                options={RUN_STYLES}
                onChange={(v) => s.setParams(ids, { runStyle: v, repeats: v === 'triple' ? 3 : 1 })}
              />
            </div>
            {r.runStyle !== 'single' && r.runStyle !== 'triple' && r.runStyle !== 'motif' && (
              <div className="prop-grid">
                <LenRow
                  label={r.runStyle === 'candlewick' ? 'Knot size' : 'Width'}
                  name={r.runStyle === 'candlewick' ? 'Knot size' : 'Stitch width'}
                  value={r.styleWidth}
                  min={10}
                  max={60}
                  step={1}
                  units={units}
                  onChange={(v) => s.setParams(ids, { styleWidth: v }, 'styleWidth')}
                />
                {r.runStyle === 'candlewick' && (
                  <LenRow label="Spacing" name="Knot spacing" value={r.knotSpacing} min={20} max={200} step={5} units={units} onChange={(v) => s.setParams(ids, { knotSpacing: v }, 'knotSpacing')} />
                )}
              </div>
            )}
          </>
        )}
        {((o.type === 'tatami' && r.fillPattern === 'motif') || (o.type === 'run' && r.runStyle === 'motif')) && (
          <>
            <MotifGrid value={r.motif} onChange={(m) => s.setParams(ids, { motif: m })} />
            <div className="prop-grid">
              <LenRow label="Motif size" name="Motif size" value={r.motifSize} min={20} max={300} step={1} units={units} onChange={(v) => s.setParams(ids, { motifSize: v }, 'motifSize')} />
            </div>
          </>
        )}
        {o.type === 'tatami' && r.fillPattern === 'rows' && (
          <div className="prop-line">
            <label className="prop-label" htmlFor="rshift">
              Random shift
            </label>
            <Switch id="rshift" label="Random shift" checked={r.randomShift} onChange={(v) => s.setParams(ids, { randomShift: v })} />
          </div>
        )}
        {o.type === 'satin' && (
          <>
            <div className="prop-line">
              <label className="prop-label" htmlFor="shortst">
                Short stitches on curves
              </label>
              <Switch id="shortst" label="Short stitches on curves" checked={r.shortStitches} onChange={(v) => s.setParams(ids, { shortStitches: v })} />
            </div>
            <div className="prop-line">
              <span className="prop-label">Split satin wider than</span>
              <div className="num-fixed">
                <NumberInput
                  label="Split satin wider than"
                  value={toDisplay(r.splitAbove, units)}
                  unit={units}
                  decimals={units === 'mm' ? 1 : 2}
                  min={toDisplay(30, units)}
                  max={toDisplay(150, units)}
                  onChange={(v) => s.setParams(ids, { splitAbove: fromDisplay(v, units) })}
                />
              </div>
            </div>
          </>
        )}
        <button className="disclosure" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>
          <Icon name={advanced ? 'chevron-down' : 'chevron-right'} small />
          <span>
            <span className="d-title">Advanced</span>
            {!advanced && <span className="d-sub">Underlay, pull compensation, ties</span>}
          </span>
        </button>
        {advanced && <AdvancedSection o={o} />}
      </fieldset>
    </section>
  );
}

function AdvancedSection({ o }: { o: StitchObject }) {
  const project = useEditor((s) => s.project)!;
  const s = useEditor.getState();
  const ids = [o.id];
  const r = resolveParams(o, project.fabricPreset);
  const units = project.units;
  const [satinW, setSatinW] = useState(30);
  const underlayValue = o.advanced.underlay ?? 'inherit';
  const inherited = UNDERLAY_OPTIONS.find((u) => u.id === resolveParams({ ...o, advanced: { ...o.advanced, underlay: 'inherit' } }, project.fabricPreset).underlay)?.name;
  const closed = areasOf(o.geometry).length > 0;
  return (
    <div className="advanced">
      {o.type !== 'run' && (
        <div className="prop-grid two">
          <label htmlFor="und" className="prop-label">
            Underlay
          </label>
          <Select<'inherit' | UnderlayType>
            id="und"
            value={underlayValue}
            options={[{ value: 'inherit', label: `Preset (${inherited})` }, ...UNDERLAY_OPTIONS.map((u) => ({ value: u.id, label: u.name }))]}
            onChange={(v) => s.setAdvanced(ids, { underlay: v })}
          />
        </div>
      )}
      {o.type !== 'run' && (
        <div className="prop-grid">
          <LenRow label="Pull comp." name="Pull compensation" value={r.pullComp} min={0} max={10} step={0.5} units={units} onChange={(v) => s.setAdvanced(ids, { pullComp: v }, 'pullComp')} />
        </div>
      )}
      {o.type !== 'run' && o.advanced.pullComp !== undefined && o.advanced.pullComp !== 'inherit' && (
        <button className="link-btn small-link" onClick={() => s.setAdvanced(ids, { pullComp: 'inherit' })}>
          Use the preset's pull compensation
        </button>
      )}
      <div className="chips-row">
        {(
          [
            ['tieIn', 'Tie-in'],
            ['tieOff', 'Tie-off'],
            ['trimBefore', 'Trim before'],
            ['trimAfter', 'Trim after'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className="toggle-chip" aria-pressed={!!r[k]} onClick={() => s.setAdvanced(ids, { [k]: !r[k] })}>
            {label}
          </button>
        ))}
      </div>
      <SewPointRow o={o} which="entry" label="Entry point" />
      <SewPointRow o={o} which="exit" label="Exit point" />
      <div className="adv-actions">
        {o.type === 'run' && o.geometry.kind !== 'stitches' && (
          <div className="prop-line">
            <span className="prop-label">Convert to satin</span>
            <div className="num-fixed">
              <NumberInput label="Satin width" value={toDisplay(satinW, units)} unit={units} decimals={1} min={toDisplay(10, units)} max={toDisplay(100, units)} onChange={(v) => setSatinW(fromDisplay(v, units))} />
            </div>
            <button className="btn small" onClick={() => s.convertToSatin(ids, satinW)}>
              Convert
            </button>
          </div>
        )}
        {closed && (
          <button className="btn small" onClick={() => s.offsetOutline(o.id, 5)}>
            Add outline (run, 0.5 mm outside)
          </button>
        )}
        {closed && !o.text && (
          <button className="btn small" onClick={() => s.regionToLine(o.id, 30)}>
            Region to line (spiral)
          </button>
        )}
      </div>
    </div>
  );
}

function SewPointRow({ o, which, label }: { o: StitchObject; which: 'entry' | 'exit'; label: string }) {
  const picking = useEditor((st) => st.pickPoint?.id === o.id && st.pickPoint.which === which);
  const units = useEditor((st) => st.project!.units);
  const s = useEditor.getState();
  const pt = o[which];
  return (
    <div className="prop-line">
      <span className="prop-label">{label}</span>
      <span className="meta mono sew-pt">{pt ? `${fmtLen(pt[0], units)}, ${fmtLen(pt[1], units)}` : 'Auto'}</span>
      <div className="bool-btns">
        <button className={`btn small${picking ? ' pressed' : ''}`} aria-pressed={picking} onClick={() => s.setPickPoint(picking ? null : { id: o.id, which })}>
          {picking ? 'Click the canvas…' : 'Set'}
        </button>
        {pt && (
          <button className="btn small" onClick={() => s.setSewPoint(o.id, which, null)}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function ThreadRow({ ids, value }: { ids: string[]; value: string | null }) {
  const threads = useEditor((st) => st.project!.threads);
  return (
    <div className="prop-grid two">
      <span className="prop-label">Thread</span>
      <ThreadPicker threads={threads} value={value} onChange={(v) => useEditor.getState().setObjectThread(ids, v)} />
    </div>
  );
}

function MultiSelection({ objects, readOnly }: { objects: StitchObject[]; readOnly: boolean }) {
  const project = useEditor((s) => s.project)!;
  const plan = useEditor((s) => s.plan);
  const s = useEditor.getState();
  const units = project.units;
  const b = objectsBounds(objects);
  // Prefer stitched extents (includes pull compensation and satin width).
  let w = b ? b.maxX - b.minX : 0;
  let h = b ? b.maxY - b.minY : 0;
  if (plan) {
    const idx = new Set(objects.map((o) => o.id));
    let sb: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
    for (const st of plan.objectStats) {
      if (!idx.has(st.id) || !st.bounds) continue;
      sb = sb
        ? { minX: Math.min(sb.minX, st.bounds.minX), minY: Math.min(sb.minY, st.bounds.minY), maxX: Math.max(sb.maxX, st.bounds.maxX), maxY: Math.max(sb.maxY, st.bounds.maxY) }
        : { ...st.bounds };
    }
    if (sb) {
      w = sb.maxX - sb.minX;
      h = sb.maxY - sb.minY;
    }
  }
  const tooWide = w > project.hoop.width;
  const tooTall = h > project.hoop.height;
  const closedCount = objects.filter((o) => areasOf(o.geometry).length > 0 && o.type !== 'stitches').length;
  const editable = !readOnly && objects.every((o) => !o.locked);
  const allTypes = Array.from(new Set(objects.map((o) => o.type)));
  return (
    <section className="props" aria-labelledby="proph">
      <div className="panel-head inline">
        <h2 id="proph" className="label-caps">
          Selection
        </h2>
        <span className="meta">{objects.length} objects</span>
      </div>
      <fieldset className="props-body" disabled={!editable}>
        <div className="wh-grid">
          <label>
            <span className="prop-label">Width</span>
            <NumberInput
              label={`Selection width in ${units}`}
              value={toDisplay(w, units)}
              unit={units}
              decimals={units === 'mm' ? 1 : 2}
              error={tooWide}
              min={toDisplay(10, units)}
              max={toDisplay(6000, units)}
              onChange={(v) => w > 0 && s.scaleSelected(fromDisplay(v, units) / w, fromDisplay(v, units) / w)}
            />
          </label>
          <label>
            <span className="prop-label">Height</span>
            <NumberInput
              label={`Selection height in ${units}`}
              value={toDisplay(h, units)}
              unit={units}
              decimals={units === 'mm' ? 1 : 2}
              error={tooTall}
              min={toDisplay(10, units)}
              max={toDisplay(6000, units)}
              onChange={(v) => h > 0 && s.scaleSelected(fromDisplay(v, units) / h, fromDisplay(v, units) / h)}
            />
          </label>
        </div>
        {(tooWide || tooTall) && (
          <button className="btn pri block tall-btn" onClick={() => s.scaleToFitHoop()}>
            Scale to fit hoop ({fmtLen(tooWide ? project.hoop.width : project.hoop.height, units)} {units})
          </button>
        )}
        {allTypes.length === 1 && allTypes[0] !== 'stitches' && (
          <SegmentedControl<StitchType>
            label="Stitch type"
            grid
            value={allTypes[0]}
            options={[
              { value: 'run', label: 'Run' },
              { value: 'satin', label: 'Satin' },
              { value: 'tatami', label: 'Tatami', disabled: closedCount < objects.length },
              { value: 'contour', label: 'Contour', disabled: closedCount < objects.length },
            ]}
            onChange={(t) => s.setObjectType(objects.map((o) => o.id), t)}
          />
        )}
        {allTypes.length > 1 && !allTypes.includes('stitches') && (
          <div className="prop-grid two">
            <span className="prop-label">Stitch type</span>
            <Select<StitchType | 'mixed'>
              label="Stitch type for all selected"
              value="mixed"
              options={[
                { value: 'mixed', label: 'Mixed' },
                { value: 'run', label: 'Run' },
                { value: 'satin', label: 'Satin' },
                ...(closedCount === objects.length
                  ? ([
                      { value: 'tatami', label: 'Tatami' },
                      { value: 'contour', label: 'Contour' },
                    ] as { value: StitchType; label: string }[])
                  : []),
              ]}
              onChange={(t) => t !== 'mixed' && s.setObjectType(objects.map((o) => o.id), t)}
            />
          </div>
        )}
        <ThreadRow ids={objects.map((o) => o.id)} value={objects.every((o) => o.thread === objects[0].thread) ? objects[0].thread : null} />
        {closedCount >= 2 && (
          <div className="bool-row">
            <span className="prop-label">Combine shapes</span>
            <div className="bool-btns">
              <button className="btn small" onClick={() => s.booleanSelected('union')}>
                Union
              </button>
              <button className="btn small" onClick={() => s.booleanSelected('difference')} title="Cut the other shapes out of the first one in sewing order">
                Subtract
              </button>
              <button className="btn small" onClick={() => s.booleanSelected('intersection')}>
                Intersect
              </button>
            </div>
          </div>
        )}
        <div className="bool-row">
          <div className="bool-btns">
            <button className="btn small" onClick={() => s.duplicateSelected()}>
              Duplicate
            </button>
            <button className="btn small" onClick={() => s.deleteSelected()}>
              Delete
            </button>
          </div>
        </div>
      </fieldset>
    </section>
  );
}

/** Global settings for the whole design (never repeated per object). */
export function DesignSection() {
  const project = useEditor((s) => s.project)!;
  const grid = useEditor((s) => s.grid);
  const s = useEditor.getState();
  const hoopValue = HOOPS.some((h) => h.id === project.hoop.id) ? project.hoop.id : 'custom';
  return (
    <section className="props design-section" aria-labelledby="designh">
      <div className="panel-head inline">
        <h2 id="designh" className="label-caps">
          Design
        </h2>
      </div>
      <div className="props-body">
        <div className="prop-grid two">
          <label htmlFor="mach" className="prop-label">
            Machine
          </label>
          <Select
            id="mach"
            value={project.machine.brand}
            options={MACHINES.map((m) => ({ value: m.id, label: m.name }))}
            onChange={(v) => s.setProjectFields({ machine: { brand: v, defaultFormat: MACHINES.find((m) => m.id === v)?.format ?? null } })}
          />
          <label htmlFor="hoop" className="prop-label">
            Hoop
          </label>
          <Select
            id="hoop"
            value={hoopValue}
            options={[
              ...HOOPS.map((h) => ({ value: h.id, label: h.cap ? `${h.label} ${hoopLabel(h)} mm` : `${hoopLabel(h)} mm` })),
              ...(hoopValue === 'custom' ? [{ value: 'custom', label: `${hoopLabel(project.hoop)} mm (custom)` }] : []),
            ]}
            onChange={(v) => {
              const h = HOOPS.find((x) => x.id === v);
              if (h) s.setProjectFields({ hoop: { id: h.id, width: h.width, height: h.height } });
            }}
          />
          <label htmlFor="fabric" className="prop-label">
            Fabric
          </label>
          <Select id="fabric" value={project.fabricPreset} options={FABRICS.map((f) => ({ value: f.id, label: f.name }))} onChange={(v) => s.setProjectFields({ fabricPreset: v })} />
          <span className="prop-label">Units</span>
          <SegmentedControl
            label="Units"
            grid
            tall
            value={project.units}
            onChange={(u) => s.setProjectFields({ units: u })}
            options={[
              { value: 'mm', label: 'mm' },
              { value: 'in', label: 'in' },
            ]}
          />
          <label htmlFor="spm" className="prop-label">
            Speed
          </label>
          <NumberInput id="spm" label="Machine speed in stitches per minute" value={project.spm ?? 800} decimals={0} min={100} max={1500} unit="spm" onChange={(v) => s.setProjectFields({ spm: Math.round(v) })} />
          <label htmlFor="hidden" className="prop-label">
            Hidden stitches
          </label>
          <div className="grid-row">
            <Switch id="hidden" label="Remove hidden stitches" checked={!!project.removeHidden} onChange={(v) => s.setProjectFields({ removeHidden: v })} />
          </div>
          <label htmlFor="gridsize" className="prop-label">
            Grid
          </label>
          <div className="grid-row">
            <Switch label="Show grid" checked={grid.show} onChange={(v) => s.setGrid({ show: v })} />
            <Select
              id="gridsize"
              label="Grid size"
              value={String(grid.size)}
              options={gridSizes(project.units).map((g) => ({ value: String(g.value), label: g.label }))}
              onChange={(v) => s.setGrid({ size: Number(v) })}
            />
          </div>
          <span className="prop-label">Snap</span>
          <div className="chips-row">
            <button className="toggle-chip" aria-pressed={grid.snap} onClick={() => s.setGrid({ snap: !grid.snap })}>
              Grid
            </button>
            <button className="toggle-chip" aria-pressed={grid.smart} onClick={() => s.setGrid({ smart: !grid.smart })}>
              Objects &amp; hoop
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
