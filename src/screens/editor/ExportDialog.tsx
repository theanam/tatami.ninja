import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Dialog, toast } from '../../components/ui';
import { colorBlockStats, colorSheetPdf, downloadBytes, downloadProjectJson, encodeFormat, fileBaseName } from '../../export/export';
import { FORMATS } from '../../formats';
import type { FileFormat } from '../../model/types';
import { fmtInt, fmtLen, sewMinutes } from '../../model/units';
import { getMachine, hoopLabel, THREAD_CHARTS } from '../../presets';
import { renderThumbnail } from '../../render/stitchRender';
import { useEditor } from '../../store/editor';

const ORDER: FileFormat[] = ['PES', 'DST', 'JEF', 'EXP', 'VP3', 'XXX', 'HUS'];

export function ExportDialog({ onClose }: { onClose(): void }) {
  const project = useEditor((s) => s.project)!;
  const plan = useEditor((s) => s.plan)!;
  const warnings = useEditor((s) => s.warnings);
  const machineFormat = project.machine.defaultFormat;
  const [format, setFormat] = useState<FileFormat>(machineFormat ?? 'PES');
  const [name, setName] = useState(fileBaseName(project));
  const [sheet, setSheet] = useState(true);
  const [json, setJson] = useState(false);
  const thumb = useMemo(() => renderThumbnail(project, plan, 480, 360), [project, plan]);
  const info = FORMATS[format];
  const b = plan.bounds;
  const w = b ? b.maxX - b.minX : 0;
  const h = b ? b.maxY - b.minY : 0;
  const units = project.units;
  const outOfHoop = warnings.find((x) => x.kind === 'out-of-hoop');
  const machine = getMachine(project.machine.brand);
  const chart = THREAD_CHARTS.find((c) => c.id === project.threadChart)?.name ?? 'Madeira';
  const blocks = colorBlockStats(project, plan);
  const size = `${fmtLen(w, units)} × ${fmtLen(h, units)} ${units}`;

  const download = async () => {
    try {
      const base = name.trim() || 'design';
      downloadBytes(encodeFormat(format, project, plan), `${base}.${info.ext}`);
      if (sheet) downloadBytes(await colorSheetPdf(project, plan, thumb), `${base}-color-sheet.pdf`, 'application/pdf');
      if (json) downloadProjectJson({ ...project, name: project.name });
      toast(`Downloaded ${base}.${info.ext}`);
      onClose();
    } catch (e) {
      toast(`Export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  return (
    <Dialog
      title="Export design"
      onClose={onClose}
      footer={
        <>
          <Icon name="usb" className="muted-icon" />
          <span className="usb-hint">Copy the file to a USB stick, then open it from your machine's USB menu.</span>
          <div className="spacer" />
          <button className="btn page" onClick={onClose}>
            Cancel
          </button>
          <button className="btn page pri" onClick={download} disabled={!plan.stitchCount}>
            <Icon name="export" small />
            Download {format}
          </button>
        </>
      }
    >
      <div className="export-body">
        <div className="export-left">
          <h3 className="ex-h">File format</h3>
          <div className="format-grid" role="group" aria-label="File format">
            {ORDER.map((f) => (
              <button
                key={f}
                className={`opt fmt${format === f ? ' on' : ''}`}
                aria-pressed={format === f}
                data-autofocus={format === f ? true : undefined}
                onClick={() => setFormat(f)}
              >
                <span className="fmt-top">
                  <span className="fmt-ext">{f}</span>
                  {machineFormat === f && <span className="pill-accent">Your machine</span>}
                </span>
                <span className="meta">{FORMATS[f].machines}</span>
              </button>
            ))}
          </div>
          {outOfHoop ? (
            <div className="compat bad" role="alert">
              <Icon name="error" />
              <div>
                <b>Too big for the hoop</b>
                <p>
                  The design ({size}) does not fit the {hoopLabel(project.hoop)} mm hoop. Your machine will refuse the file — scale it to fit or choose a larger hoop first.
                </p>
              </div>
            </div>
          ) : (
            <div className="compat ok">
              <Icon name="check-circle" />
              <div>
                <b>{machineFormat === format && project.machine.brand !== 'other' ? `Ready for your ${machine.name}` : `Ready to export as ${format}`}</b>
                <p>
                  The design ({size}) fits the {hoopLabel(project.hoop)} mm hoop.{' '}
                  {info.keepsColors
                    ? `${format} keeps your thread colors.`
                    : `${format} does not store thread colors, so your machine shows its own. Use the color sheet to pick threads.`}
                </p>
              </div>
            </div>
          )}
          <label htmlFor="fname" className="ex-h">
            File name
          </label>
          <div className="fname">
            <input id="fname" value={name} onChange={(e) => setName(e.target.value.replace(/[\\/:*?"<>|]/g, ''))} onKeyDown={(e) => e.stopPropagation()} />
            <span className="mono ext">.{info.ext}</span>
          </div>
          <label className="check">
            <input type="checkbox" checked={sheet} onChange={(e) => setSheet(e.target.checked)} />
            Also download a printable color sheet (PDF)
          </label>
          <label className="check">
            <input type="checkbox" checked={json} onChange={(e) => setJson(e.target.checked)} />
            Include the editable project file (.json)
          </label>
        </div>
        <div className="export-right">
          <h3 className="ex-h">Summary</h3>
          {thumb ? <img className="ex-thumb" src={thumb} alt={`Preview of ${project.name}`} /> : <div className="ex-thumb" />}
          <dl className="ex-stats">
            <dt>Stitches</dt>
            <dd className="mono">{fmtInt(plan.stitchCount)}</dd>
            <dt>Size</dt>
            <dd className="mono">{size}</dd>
            <dt>Sew time</dt>
            <dd className="mono">≈ {Math.max(1, Math.round(sewMinutes(plan.stitchCount, project.spm ?? 800)))} min</dd>
            <dt>Trims</dt>
            <dd className="mono">{plan.trims}</dd>
          </dl>
          <div className="meta thread-order-h">Thread order · {chart}</div>
          <ol className="thread-order">
            {blocks.map((t, i) => (
              <li key={`${t.id}-${i}`}>
                <span className="meta idx">{i + 1}</span>
                <span className="swatch-dot" style={{ background: t.hex }} />
                <span className="t-name">{t.name}</span>
                <span className="meta mono">{t.chartCode ?? '—'}</span>
              </li>
            ))}
          </ol>
          {blocks.some((t) => !t.chartCode) && <p className="meta small-note">Add {chart} thread numbers by double-clicking a thread in the Threads strip.</p>}
        </div>
      </div>
    </Dialog>
  );
}
