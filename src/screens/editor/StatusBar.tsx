import { useEffect, useRef } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/ui';
import type { Warning } from '../../engine/warnings';
import { fmtInt, fmtLen, sewMinutes } from '../../model/units';
import { useEditor } from '../../store/editor';

export function StatusBar() {
  const project = useEditor((s) => s.project)!;
  const plan = useEditor((s) => s.plan);
  const warnings = useEditor((s) => s.warnings);
  const open = useEditor((s) => s.warningsOpen);
  const s = useEditor.getState();
  const units = project.units;
  const stitches = plan?.stitchCount ?? 0;
  const colors = plan?.colorBlocks.length ?? 0;
  const b = plan?.bounds;
  const outOfHoop = warnings.some((w) => w.kind === 'out-of-hoop');
  const minutes = Math.max(1, Math.round(sewMinutes(stitches, project.spm ?? 800)));
  return (
    <footer className="statusbar">
      <span className="chip">
        <span className="mono strong">{fmtInt(stitches)}</span> stitches
      </span>
      <span className="chip">
        <span className="mono strong">{colors}</span> colors
      </span>
      {b && stitches > 0 ? (
        <>
          <span className={`chip${outOfHoop ? ' error-text' : ''}`}>
            <span className={`mono ${outOfHoop ? '' : 'strong'}`}>
              {fmtLen(b.maxX - b.minX, units)} × {fmtLen(b.maxY - b.minY, units)}
            </span>{' '}
            {units}
          </span>
          <span className="chip">
            ≈ <span className="mono strong">{minutes}</span> min sew time
          </span>
        </>
      ) : (
        <span className="chip">—</span>
      )}
      <div className="spacer" />
      {stitches === 0 ? (
        <span className="chip">Autosaves to this browser</span>
      ) : warnings.length === 0 ? (
        <button className="chip status-ok" onClick={() => s.setWarningsOpen(!open)} aria-expanded={open}>
          <Icon name="check-circle" small />
          No warnings
        </button>
      ) : (
        <button className="chip status-bad" onClick={() => s.setWarningsOpen(!open)} aria-expanded={open} aria-haspopup="dialog">
          <Icon name="warning" small />
          {warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}
        </button>
      )}
      {open && <WarningsPopover warnings={warnings} />}
    </footer>
  );
}

function WarningsPopover({ warnings }: { warnings: Warning[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const s = useEditor.getState();
  useEffect(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest('.status-bad, .status-ok')) s.setWarningsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [s]);
  const show = (w: Warning) => {
    s.select(w.objectIds);
    s.setTool('select');
    s.setWarningsOpen(false);
  };
  return (
    <div className="popover warnings-pop" ref={ref} role="dialog" aria-labelledby="wh">
      <div className="wp-head">
        <h2 id="wh">{warnings.length ? `${warnings.length} ${warnings.length === 1 ? 'issue' : 'issues'} to check` : 'No issues found'}</h2>
        <IconButton icon="close" label="Close warnings" size="xs" onClick={() => s.setWarningsOpen(false)} />
      </div>
      {warnings.length === 0 ? (
        <p className="wp-empty">The design fits the hoop and has no density or short-stitch problems.</p>
      ) : (
        <ul role="list" className="wp-list">
          {warnings.map((w) => (
            <li key={w.id} className="warn">
              <Icon name={w.severity === 'error' ? 'error' : 'warning'} className={w.severity === 'error' ? 'issue-error' : 'issue-warning'} label={w.severity === 'error' ? 'Error' : 'Warning'} />
              <div className="warn-body">
                <div className="warn-title">{w.title}</div>
                <div className="warn-msg">{w.message}</div>
                {w.kind === 'out-of-hoop' && (
                  <div className="warn-actions">
                    <button className="btn pri small" onClick={() => s.scaleToFitHoop()}>
                      Scale to fit
                    </button>
                    <button
                      className="btn small"
                      onClick={() => {
                        s.select([]);
                        s.setWarningsOpen(false);
                        window.setTimeout(() => document.getElementById('hoop')?.focus(), 30);
                      }}
                    >
                      Change hoop
                    </button>
                  </div>
                )}
              </div>
              {w.kind !== 'out-of-hoop' && (
                <button className="btn small" onClick={() => show(w)}>
                  Show
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
