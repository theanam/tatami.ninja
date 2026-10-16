import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/ui';
import { useEditor, type ToolId } from '../../store/editor';

interface ToolDef {
  id: ToolId;
  icon: string;
  label: string;
  hint: string;
  key?: string;
  /** Allowed on recolor-only stitch files. */
  readOnlyOk?: boolean;
}

export const TOOL_GROUPS: ToolDef[][] = [
  [
    { id: 'select', icon: 'select', label: 'Select', hint: 'Select, move and resize objects', key: 'V', readOnlyOk: true },
    { id: 'node', icon: 'node-edit', label: 'Node edit', hint: 'Drag the points of a shape', key: 'A' },
    { id: 'pen', icon: 'pen', label: 'Pen', hint: 'Draw a fill or a line', key: 'P' },
  ],
  [
    { id: 'run', icon: 'run-stitch', label: 'Run stitch', hint: 'Draw a line of stitches', key: 'R' },
    { id: 'satin', icon: 'satin-column', label: 'Satin column', hint: 'Click left and right rail points', key: 'S' },
    { id: 'fill', icon: 'fill', label: 'Fill', hint: 'Draw a tatami-filled shape', key: 'F' },
    { id: 'shapes', icon: 'shapes', label: 'Shapes', hint: 'Rectangles and ellipses', key: 'U' },
    { id: 'lettering', icon: 'lettering', label: 'Lettering', hint: 'Click to add text', key: 'T' },
    { id: 'applique', icon: 'applique', label: 'Appliqué', hint: 'Placement, tack-down and cover satin' },
  ],
  [
    { id: 'auto-digitize', icon: 'image-add', label: 'Import', hint: 'SVG artwork, or an image to trace', key: 'I' },
    { id: 'measure', icon: 'measure', label: 'Measure', hint: 'Drag to measure a distance', key: 'M', readOnlyOk: true },
  ],
];

export function ToolRail({ readOnly, onImportSvg, onAddImage }: { readOnly: boolean; onImportSvg(): void; onAddImage(): void }) {
  const tool = useEditor((s) => s.tool);
  const simActive = useEditor((s) => s.sim.active);
  const setTool = useEditor((s) => s.setTool);
  const [importOpen, setImportOpen] = useState(false);
  const flyRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!importOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!flyRef.current?.contains(t) && !btnRef.current?.contains(t)) setImportOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setImportOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [importOpen]);

  // I opens the import choices.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key.toLowerCase() !== 'i' || e.metaKey || e.ctrlKey || e.altKey || readOnly || simActive) return;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
      if (useEditor.getState().dialog) return;
      setImportOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readOnly, simActive]);

  return (
    <nav aria-label="Tools" className={`toolrail${simActive ? ' disabled' : ''}`}>
      {TOOL_GROUPS.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <div className="rail-divider" />}
          {group.map((t) =>
            t.id === 'auto-digitize' ? (
              <div key={t.id} className="import-wrap" ref={btnRef}>
                <IconButton
                  icon={t.icon}
                  label={t.label}
                  hint={t.hint}
                  shortcut={t.key}
                  size="tool"
                  tipSide="right"
                  active={importOpen}
                  aria-haspopup="menu"
                  aria-expanded={importOpen}
                  disabled={simActive || readOnly}
                  onClick={() => setImportOpen(!importOpen)}
                />
                {importOpen &&
                  createPortal(
                  <div
                    ref={flyRef}
                    className="popover import-fly"
                    role="menu"
                    aria-label="Import"
                    style={(() => {
                      // Fixed beside the button: the rail scrolls and would clip it.
                      const r = btnRef.current?.getBoundingClientRect();
                      return r ? { left: r.right + 8, top: Math.min(r.top, window.innerHeight - 160) } : undefined;
                    })()}
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        setImportOpen(false);
                        onImportSvg();
                      }}
                    >
                      <Icon name="shapes" />
                      <span>
                        <b>SVG artwork</b>
                        <span className="meta">Every shape becomes stitches, in its own colors</span>
                      </span>
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setImportOpen(false);
                        onAddImage();
                      }}
                    >
                      <Icon name="image" />
                      <span>
                        <b>Image (PNG / JPG)</b>
                        <span className="meta">Trace it into stitches, or use it as a backdrop</span>
                      </span>
                    </button>
                  </div>,
                  document.body,
                )}
              </div>
            ) : (
              <IconButton
                key={t.id}
                icon={t.icon}
                label={t.label}
                hint={t.hint}
                shortcut={t.key}
                size="tool"
                tipSide="right"
                active={tool === t.id && !simActive}
                aria-pressed={tool === t.id}
                disabled={simActive || (readOnly && !t.readOnlyOk)}
                onClick={() => setTool(t.id)}
              />
            ),
          )}
        </Fragment>
      ))}
    </nav>
  );
}
