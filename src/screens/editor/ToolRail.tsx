import { Fragment } from 'react';
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
    { id: 'auto-digitize', icon: 'auto-digitize', label: 'Auto-digitize', hint: 'Turn a PNG or JPG into objects' },
    { id: 'measure', icon: 'measure', label: 'Measure', hint: 'Drag to measure a distance', key: 'M', readOnlyOk: true },
  ],
];

export function ToolRail({ readOnly, onAutoDigitize }: { readOnly: boolean; onAutoDigitize(): void }) {
  const tool = useEditor((s) => s.tool);
  const simActive = useEditor((s) => s.sim.active);
  const setTool = useEditor((s) => s.setTool);
  return (
    <nav aria-label="Tools" className={`toolrail${simActive ? ' disabled' : ''}`}>
      {TOOL_GROUPS.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <div className="rail-divider" />}
          {group.map((t) => (
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
              onClick={() => (t.id === 'auto-digitize' ? onAutoDigitize() : setTool(t.id))}
            />
          ))}
        </Fragment>
      ))}
    </nav>
  );
}
