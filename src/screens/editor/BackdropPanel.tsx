import { ParamRow } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { fmtLen } from '../../model/units';
import { useEditor } from '../../store/editor';

/** The tracing backdrop (an imported image under the design), as its own panel section. */
export function BackdropPanel({ onTrace, onReplace }: { onTrace(): void; onReplace(): void }) {
  const b = useEditor((s) => s.project?.backdrop);
  const units = useEditor((s) => s.project?.units ?? 'mm');
  const s = useEditor.getState();
  if (!b) return null;
  return (
    <section className="backdrop-panel" aria-labelledby="bdh">
      <div className="panel-head">
        <h2 id="bdh" className="label-caps">
          Backdrop
        </h2>
        <span className="meta">
          {fmtLen(b.width, units)} × {fmtLen(b.height, units)} {units}
        </span>
      </div>
      <div className="bd-body">
        <div className="bd-row">
          <img className="bd-thumb" src={b.dataUrl} alt="Backdrop image" style={{ opacity: b.visible ? 1 : 0.4 }} />
          <div className="chips-row">
            <button className="toggle-chip" aria-pressed={b.visible} onClick={() => s.updateBackdrop({ visible: !b.visible })}>
              <Icon name="eye" small /> {b.visible ? 'Visible' : 'Hidden'}
            </button>
            <button className="toggle-chip" aria-pressed={b.locked} onClick={() => s.updateBackdrop({ locked: !b.locked })}>
              <Icon name={b.locked ? 'lock-closed' : 'lock-open'} small /> {b.locked ? 'Locked' : 'Unlocked'}
            </button>
          </div>
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
        <div className="bd-actions">
          <button className="btn small" onClick={onTrace}>
            <Icon name="auto-digitize" small /> Trace…
          </button>
          <button className="btn small" onClick={onReplace}>
            Replace…
          </button>
          <button className="btn small" onClick={() => s.setBackdrop(null)}>
            Remove
          </button>
        </div>
        <p className="note">Shown in Artwork and Objects. Unlock it to drag it into place.</p>
      </div>
    </section>
  );
}
