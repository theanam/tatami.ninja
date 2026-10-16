import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Dialog, ParamRow, SegmentedControl, Spinner, toast } from '../../components/ui';
import type { AutoDigitizeResult, RasterImage } from '../../importers/autoDigitize';
import { imageToRaster, pickFile, readAsDataUrl } from '../../importers/files';
import { TraceClient } from '../../importers/traceClient';
import { rgbToHex } from '../../model/project';
import { useEditor } from '../../store/editor';
import { backdropFromImage } from '../actions';

type Mode = 'colors' | 'threshold';

/** Trace an image into stitch objects: color reduction or a black-and-white threshold. */
export function AutoDigitizeDialog({ onClose }: { onClose(): void }) {
  const project = useEditor((s) => s.project)!;
  const traceSource = useEditor((s) => s.traceSource);
  const [source, setSource] = useState<string | null>(traceSource ?? project.backdrop?.dataUrl ?? null);
  const [keepBackdrop, setKeepBackdrop] = useState(false);
  const [raster, setRaster] = useState<RasterImage | null>(null);
  const [mode, setMode] = useState<Mode>('colors');
  const [colors, setColors] = useState(4);
  const [removeBg, setRemoveBg] = useState(true);
  const [fillUnder, setFillUnder] = useState(true);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [invert, setInvert] = useState(false);
  const [lineColor, setLineColor] = useState('#1A1A1A');
  const [sizeMm, setSizeMm] = useState(Math.round((Math.min(project.hoop.width, project.hoop.height) * 0.6) / 10));
  const [speck, setSpeck] = useState(2);
  const [show, setShow] = useState<'trace' | 'original'>('trace');
  const [outlines, setOutlines] = useState(true);
  const [result, setResult] = useState<AutoDigitizeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const client = useMemo(() => new TraceClient(), []);
  useEffect(() => () => client.dispose(), [client]);

  useEffect(() => {
    if (!source) return;
    let alive = true;
    setBusy(true);
    imageToRaster(source, 1600)
      .then((r) => alive && setRaster(r))
      .catch(() => {
        toast('Could not read that image.', 'error');
        setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [source]);

  // Re-trace (debounced, in the worker) whenever an option changes.
  useEffect(() => {
    if (!raster) return;
    setBusy(true);
    const t = window.setTimeout(() => {
      const req = client.trace(raster, {
        mode,
        colors,
        removeBackground: removeBg,
        fillUnder,
        threshold,
        invert,
        lineColor,
        size: sizeMm * 10,
        minAreaMm2: speck,
        threads: project.threads,
      });
      const mine = client.latest;
      req
        .then((r) => {
          if (mine !== client.latest) return;
          setResult(r);
          setBusy(false);
        })
        .catch(() => {
          if (mine === client.latest) setBusy(false);
        });
    }, 180);
    return () => window.clearTimeout(t);
  }, [raster, mode, colors, removeBg, fillUnder, threshold, invert, lineColor, sizeMm, speck, project.threads, client]);

  // Draw the trace preview (or the original) at full trace resolution.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !raster) return;
    const img = show === 'original' || !result ? raster : result.preview;
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  }, [raster, result, show]);

  const outlinePath = useMemo(
    () => (result?.outlines ?? []).map((r) => `M${r.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}Z`).join(''),
    [result],
  );

  const choose = async () => {
    const f = await pickFile('.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp');
    if (f) {
      setResult(null);
      setSource(await readAsDataUrl(f));
    }
  };

  const add = async () => {
    if (!result || !result.objects.length) return;
    const s = useEditor.getState();
    s.addObjects(result.objects, result.threads);
    if (keepBackdrop && source) s.setBackdrop(await backdropFromImage(source, project.hoop));
    s.setView('artwork');
    toast(`Added ${result.objects.length} objects. Review them in the Sequence list.`);
    onClose();
  };

  /** Place the image as a tracing backdrop instead of converting it. */
  const useAsBackdrop = async () => {
    if (!source) return;
    const s = useEditor.getState();
    s.setBackdrop(await backdropFromImage(source, project.hoop));
    s.setView('artwork');
    s.select([]);
    toast('Image added as a backdrop. Its settings are in the Backdrop section on the right.');
    onClose();
  };

  const fills = result?.objects.filter((o) => o.type === 'tatami').length ?? 0;
  const satins = result?.objects.filter((o) => o.type === 'satin').length ?? 0;

  return (
    <Dialog
      title="Trace image"
      onClose={onClose}
      maxWidth={980}
      footer={
        <>
          <span className="meta">Traced at high resolution, then scaled to your design.</span>
          <div className="spacer" />
          <button className="btn page" onClick={onClose}>
            Cancel
          </button>
          <button className="btn page" disabled={!source} onClick={() => void useAsBackdrop()}>
            Use as backdrop
          </button>
          <button className="btn page pri" disabled={busy || !result?.objects.length} onClick={() => void add()}>
            Add {result?.objects.length ?? 0} objects
          </button>
        </>
      }
    >
      <div className="ad-body">
        {!source ? (
          <div className="ad-empty">
            <Icon name="image" />
            <p>Choose a PNG or JPG — a logo or drawing with clear shapes works best.</p>
            <button className="btn pri page" onClick={choose} data-autofocus>
              Choose image…
            </button>
          </div>
        ) : (
          <>
            <div className="ad-preview">
              <div className="ad-stage">
                <canvas ref={canvasRef} aria-label={show === 'original' ? 'Original image' : 'Trace preview'} role="img" />
                {outlines && show === 'trace' && raster && (
                  <svg className="ad-outlines" viewBox={`0 0 ${raster.width} ${raster.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                    <path d={outlinePath} fill="none" stroke="var(--sb-handle)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                  </svg>
                )}
                {busy && (
                  <div className="ad-busy" role="status">
                    <Spinner size={14} /> Tracing…
                  </div>
                )}
              </div>
              <div className="ad-preview-bar">
                <SegmentedControl<'trace' | 'original'>
                  label="Preview"
                  value={show}
                  onChange={setShow}
                  options={[
                    { value: 'trace', label: 'Trace' },
                    { value: 'original', label: 'Original' },
                  ]}
                />
                <label className="check">
                  <input type="checkbox" checked={outlines} onChange={(e) => setOutlines(e.target.checked)} />
                  Outlines
                </label>
                <div className="spacer" />
                <button className="btn small" onClick={choose}>
                  Another image…
                </button>
              </div>
            </div>
            <div className="ad-controls">
              <SegmentedControl<Mode>
                label="Trace mode"
                grid
                tall
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'colors', label: 'Colors' },
                  { value: 'threshold', label: 'Threshold' },
                ]}
              />
              {mode === 'colors' ? (
                <>
                  <div className="prop-grid">
                    <ParamRow label="Colors" value={colors} min={2} max={12} step={1} unit="" decimals={0} numLabel="Number of colors" onChange={(v) => setColors(Math.round(v))} />
                  </div>
                  {result && (
                    <div className="ad-palette" aria-label="Colors found">
                      {result.palette.map((c, i) => (
                        <span
                          key={i}
                          className={`swatch-dot lg${i === result.background ? ' removed' : ''}`}
                          style={{ background: rgbToHex(...c) }}
                          title={i === result.background ? `${rgbToHex(...c)} · background (not stitched)` : rgbToHex(...c)}
                        />
                      ))}
                    </div>
                  )}
                  <label className="check">
                    <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} />
                    Leave the background color unstitched
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={fillUnder} onChange={(e) => setFillUnder(e.target.checked)} />
                    Fill under details (no gaps between colors)
                  </label>
                </>
              ) : (
                <>
                  <div className="prop-grid">
                    <ParamRow
                      label="Threshold"
                      value={threshold ?? result?.threshold ?? 128}
                      min={1}
                      max={254}
                      step={1}
                      unit=""
                      decimals={0}
                      numLabel="Threshold gray level"
                      onChange={(v) => setThreshold(Math.round(v))}
                    />
                  </div>
                  <div className="prop-line">
                    <button className="btn small" aria-pressed={threshold === null} onClick={() => setThreshold(null)}>
                      {threshold === null ? 'Auto contrast ✓' : 'Auto contrast'}
                    </button>
                    <label className="check">
                      <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
                      Invert
                    </label>
                    <label className="check">
                      Thread
                      <input type="color" aria-label="Thread color" value={lineColor.toLowerCase()} onChange={(e) => setLineColor(e.target.value)} />
                    </label>
                  </div>
                </>
              )}
              <div className="prop-grid">
                <ParamRow
                  label="Size"
                  value={sizeMm}
                  min={10}
                  max={Math.round(Math.max(project.hoop.width, project.hoop.height) / 10)}
                  step={1}
                  unit="mm"
                  decimals={0}
                  numLabel="Longest side in millimetres"
                  onChange={(v) => setSizeMm(Math.round(v))}
                />
                <ParamRow label="Drop specks" value={speck} min={0.5} max={20} step={0.5} unit="mm²" decimals={1} numLabel="Drop areas smaller than square millimetres" onChange={setSpeck} />
              </div>
              <label className="check">
                <input type="checkbox" checked={keepBackdrop} onChange={(e) => setKeepBackdrop(e.target.checked)} />
                Keep the image as a backdrop
              </label>
              {result && (
                <p className="note">
                  {result.objects.length} objects: {fills} fills, {satins} satin.{result.dropped ? ` ${result.dropped} specks dropped.` : ''}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
