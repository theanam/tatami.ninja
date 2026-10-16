import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Dialog, ParamRow, toast } from '../../components/ui';
import { autoDigitize, quantize, backgroundLabel, type RasterImage } from '../../importers/autoDigitize';
import { imageToRaster, pickFile, readAsDataUrl } from '../../importers/files';
import { rgbToHex } from '../../model/project';
import { useEditor } from '../../store/editor';

/** Flow D: PNG → color-reduced preview → proposed objects. */
export function AutoDigitizeDialog({ onClose }: { onClose(): void }) {
  const project = useEditor((s) => s.project)!;
  const [source, setSource] = useState<string | null>(project.backdrop?.dataUrl ?? null);
  const [raster, setRaster] = useState<RasterImage | null>(null);
  const [colors, setColors] = useState(4);
  const [removeBg, setRemoveBg] = useState(true);
  const [sizeMm, setSizeMm] = useState(Math.round((Math.min(project.hoop.width, project.hoop.height) * 0.6) / 10));
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!source) return;
    let alive = true;
    imageToRaster(source, 320)
      .then((r) => alive && setRaster(r))
      .catch(() => toast('Could not read that image.', 'error'));
    return () => {
      alive = false;
    };
  }, [source]);

  const quantized = useMemo(() => (raster ? quantize(raster, colors) : null), [raster, colors]);
  const bg = quantized && removeBg ? backgroundLabel(quantized) : null;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !quantized) return;
    c.width = quantized.width;
    c.height = quantized.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(quantized.width, quantized.height);
    for (let i = 0; i < quantized.labels.length; i++) {
      const l = quantized.labels[i];
      const k = i * 4;
      if (l < 0 || l === bg) {
        // Checkerboard for removed pixels.
        const x = i % quantized.width;
        const y = Math.floor(i / quantized.width);
        const v = ((x >> 3) + (y >> 3)) % 2 ? 60 : 44;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
      } else {
        const [r, g, b] = quantized.palette[l];
        img.data[k] = r;
        img.data[k + 1] = g;
        img.data[k + 2] = b;
      }
      img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [quantized, bg]);

  const proposal = useMemo(() => {
    if (!raster) return null;
    try {
      return autoDigitize(raster, { colors, removeBackground: removeBg, size: sizeMm * 10, threads: project.threads });
    } catch {
      return null;
    }
  }, [raster, colors, removeBg, sizeMm, project.threads]);

  const choose = async () => {
    const f = await pickFile('.png,.jpg,.jpeg,.webp,image/png,image/jpeg');
    if (f) setSource(await readAsDataUrl(f));
  };

  const add = () => {
    if (!proposal || !proposal.objects.length) return;
    const s = useEditor.getState();
    s.addObjects(proposal.objects, proposal.threads);
    if (project.backdrop) s.updateBackdrop({ visible: false });
    s.setView('objects');
    toast(`Added ${proposal.objects.length} objects. Review them in the Sequence list.`);
    onClose();
  };

  const fills = proposal?.objects.filter((o) => o.type === 'tatami').length ?? 0;
  const satins = proposal?.objects.filter((o) => o.type === 'satin').length ?? 0;

  return (
    <Dialog
      title="Auto-digitize"
      onClose={onClose}
      maxWidth={760}
      footer={
        <>
          <span className="meta">Narrow regions become satin, wide ones fill, tiny specks are dropped.</span>
          <div className="spacer" />
          <button className="btn page" onClick={onClose}>
            Cancel
          </button>
          <button className="btn page pri" disabled={!proposal?.objects.length} onClick={add}>
            Add {proposal?.objects.length ?? 0} objects
          </button>
        </>
      }
    >
      <div className="ad-body">
        {!source ? (
          <div className="ad-empty">
            <Icon name="image" />
            <p>Choose a PNG or JPG with a few flat colors, like a logo.</p>
            <button className="btn pri page" onClick={choose} data-autofocus>
              Choose image…
            </button>
          </div>
        ) : (
          <>
            <div className="ad-preview">
              <canvas ref={canvasRef} aria-label="Color-reduced preview" role="img" />
              <button className="btn small" onClick={choose}>
                Use another image…
              </button>
            </div>
            <div className="ad-controls">
              <div className="prop-grid">
                <ParamRow label="Colors" value={colors} min={2} max={12} step={1} unit="" decimals={0} numLabel="Number of colors" onChange={(v) => setColors(Math.round(v))} />
                <ParamRow label="Size" value={sizeMm} min={10} max={Math.round(Math.max(project.hoop.width, project.hoop.height) / 10)} step={1} unit="mm" decimals={0} numLabel="Longest side in millimetres" onChange={(v) => setSizeMm(Math.round(v))} />
              </div>
              <label className="check">
                <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} />
                Leave the background color unstitched
              </label>
              {quantized && (
                <div className="ad-palette" aria-label="Colors found">
                  {quantized.palette.map((c, i) => (
                    <span key={i} className={`swatch-dot lg${i === bg ? ' removed' : ''}`} style={{ background: rgbToHex(...c) }} title={i === bg ? 'Background (not stitched)' : rgbToHex(...c)} />
                  ))}
                </div>
              )}
              {proposal && (
                <p className="note">
                  {proposal.objects.length} objects: {fills} fills, {satins} satin. {proposal.dropped ? `${proposal.dropped} specks dropped.` : ''}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
