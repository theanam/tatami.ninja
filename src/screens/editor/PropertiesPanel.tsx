import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { NumberInput, ParamRow, SegmentedControl, Select, Switch } from '../../components/ui';
import { resolveParams } from '../../engine/objects';
import { areasOf } from '../../engine/geom';
import { objectsBounds, satinWidth } from '../../model/transform';
import type { StitchObject, StitchType, UnderlayType } from '../../model/types';
import { fmtLen, fromDisplay, toDisplay, type Units } from '../../model/units';
import { FABRICS, getFabric, HOOPS, hoopLabel, MACHINES, UNDERLAY_OPTIONS } from '../../presets';
import { selectedObjects, useEditor } from '../../store/editor';

/** A length parameter shown in project units, stored in 0.1 mm. */
function LenRow({
  label,
  value,
  min,
  max,
  step,
  units,
  onChange,
  name,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  units: Units;
  onChange(v: number): void;
  name: string;
}) {
  const d = (v: number) => toDisplay(v, units);
  return (
    <ParamRow
      label={label}
      value={d(value)}
      min={d(min)}
      max={d(max)}
      step={units === 'mm' ? step / 10 : step / 254}
      unit={units}
      decimals={units === 'mm' ? (step < 1 ? 2 : step < 10 ? 1 : 0) : 3}
      numLabel={`${name} in ${units === 'mm' ? 'millimetres' : 'inches'}`}
      onChange={(v) => onChange(fromDisplay(v, units))}
    />
  );
}

export function PropertiesPanel({ readOnly }: { readOnly: boolean }) {
  const project = useEditor((s) => s.project)!;
  const selection = useEditor((s) => s.selection);
  const sel = selectedObjects({ project, selection });
  if (sel.length === 0) return <DesignSettings readOnly={readOnly} />;
  if (sel.length > 1) return <MultiSelection objects={sel} readOnly={readOnly} />;
  return <ObjectProperties o={sel[0]} readOnly={readOnly} />;
}

function ObjectProperties({ o, readOnly }: { o: StitchObject; readOnly: boolean }) {
  const project = useEditor((s) => s.project)!;
  const [advanced, setAdvanced] = useState(false);
  const s = useEditor.getState();
  const units = project.units;
  const r = resolveParams(o, project.fabricPreset);
  const fabric = getFabric(project.fabricPreset);
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
        <ThreadSelect ids={ids} value={o.thread} />
        <p className="note">Opened from a stitch file, so stitches can be recolored and reordered but not reshaped.</p>
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
          <Icon name="lock-closed" small /> Locked. Unlock it in the Sequence list to edit.
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
        {o.text && <LetteringNote o={o} />}
        <div className="prop-grid two">
          <label htmlFor="fab" className="prop-label">
            Fabric
          </label>
          <Select id="fab" value={project.fabricPreset} options={FABRICS.map((f) => ({ value: f.id, label: f.name }))} onChange={(v) => s.setProjectFields({ fabricPreset: v })} />
          <label htmlFor="thr" className="prop-label">
            Thread
          </label>
          <ThreadSelect ids={ids} value={o.thread} id="thr" bare />
        </div>
        <div className="prop-grid">
          {o.type === 'tatami' && (
            <>
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
              <LenRow label="Density" name="Row spacing" value={r.rowSpacing} min={2} max={10} step={0.5} units={units} onChange={(v) => s.setParams(ids, { rowSpacing: v }, 'rowSpacing')} />
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
          <div className="prop-line">
            <span className="prop-label">Repeats</span>
            <SegmentedControl
              label="Run repeats"
              value={r.repeats >= 3 ? '3' : '1'}
              onChange={(v) => s.setParams(ids, { repeats: Number(v) })}
              options={[
                { value: '1', label: 'Single' },
                { value: '3', label: 'Triple (bean)' },
              ]}
            />
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
        <p className="note">
          Density, underlay and pull compensation come from the {fabric.name} preset.
        </p>
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

/** Lettering is edited on the canvas; the panel only points there. */
function LetteringNote({ o }: { o: StitchObject }) {
  return (
    <div className="lettering-note">
      <p className="note">
        Lettering: double-click the text on the canvas (or press Enter) to type. Font, size, spacing and arc are in the toolbar above the text.
      </p>
      <button className="btn small" disabled={o.locked} onClick={() => useEditor.getState().setEditingText(o.id)}>
        <Icon name="pen" small />
        Edit text on canvas
      </button>
    </div>
  );
}

function ThreadSelect({ ids, value, id, bare }: { ids: string[]; value: string; id?: string; bare?: boolean }) {
  const threads = useEditor((st) => st.project!.threads);
  const sel = (
    <Select id={id} label="Thread" value={value} options={threads.map((t, i) => ({ value: t.id, label: `${i + 1} · ${t.name}` }))} onChange={(v) => useEditor.getState().setObjectThread(ids, v)} />
  );
  if (bare) return sel;
  return (
    <div className="prop-grid two">
      <span className="prop-label">Thread</span>
      {sel}
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
        <p className="note">Resizing re-generates stitches, so density stays the same at the new size.</p>
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
        <ThreadSelect ids={objects.map((o) => o.id)} value={objects[0].thread} />
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
          <span className="prop-label">Arrange</span>
          <div className="bool-btns">
            <button className="btn small" onClick={() => s.rotateSelected(90)}>
              Rotate 90°
            </button>
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

function DesignSettings({ readOnly }: { readOnly: boolean }) {
  const project = useEditor((s) => s.project)!;
  const s = useEditor.getState();
  const hoopValue = HOOPS.some((h) => h.id === project.hoop.id) ? project.hoop.id : 'custom';
  const b = project.backdrop;
  return (
    <section className="props" aria-labelledby="designh">
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
          <Select
            id="fabric"
            value={project.fabricPreset}
            disabled={readOnly && false}
            options={FABRICS.map((f) => ({ value: f.id, label: f.name }))}
            onChange={(v) => s.setProjectFields({ fabricPreset: v })}
          />
          <span className="prop-label" id="unitsl">
            Units
          </span>
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
        </div>
        <p className="note">{getFabric(project.fabricPreset).note}</p>
        {b && (
          <div className="backdrop-box">
            <div className="panel-head inline tight">
              <h3 className="label-caps">Artwork backdrop</h3>
            </div>
            <div className="prop-grid">
              <ParamRow
                label="Opacity"
                value={Math.round(b.opacity * 100)}
                min={5}
                max={100}
                step={5}
                unit="%"
                decimals={0}
                numLabel="Backdrop opacity in percent"
                onChange={(v) => s.updateBackdrop({ opacity: v / 100 }, 'backdrop-opacity')}
              />
            </div>
            <div className="chips-row">
              <button className="toggle-chip" aria-pressed={b.visible} onClick={() => s.updateBackdrop({ visible: !b.visible })}>
                {b.visible ? 'Visible' : 'Hidden'}
              </button>
              <button className="toggle-chip" aria-pressed={b.locked} onClick={() => s.updateBackdrop({ locked: !b.locked })}>
                {b.locked ? 'Locked' : 'Unlocked'}
              </button>
              <button className="btn small" onClick={() => s.setBackdrop(null)}>
                Remove
              </button>
            </div>
            <p className="note">Shown in the Artwork and Objects views. Unlock it to drag it into place.</p>
          </div>
        )}
      </div>
    </section>
  );
}
