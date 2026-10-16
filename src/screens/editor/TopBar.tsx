import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { GithubMark, Icon, Logo } from "../../components/Icon";
import { IconButton, SegmentedControl, useTooltip } from "../../components/ui";
import { REPO_URL } from "../../links";
import { useEditor, type ViewMode } from "../../store/editor";

interface Props {
  onExport(): void;
  onImport(): void;
  onSave(): void;
  onSaveAs(): void;
  onOpen(): void;
  onAddImage(): void;
  readOnly: boolean;
}

export function TopBar({
  onExport,
  onImport,
  onSave,
  onSaveAs,
  onOpen,
  onAddImage,
  readOnly,
}: Props) {
  const project = useEditor((s) => s.project)!;
  const saveState = useEditor((s) => s.saveState);
  const view = useEditor((s) => s.view);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const sim = useEditor((s) => s.sim);
  const plan = useEditor((s) => s.plan);
  const [editingName, setEditingName] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasStitches = (plan?.stitchCount ?? 0) > 0;
  const ghTip = useTooltip("tatami.ninja on GitHub");

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const s = useEditor.getState();
  const toggleSim = () => {
    if (sim.active) s.setSim({ active: false, playing: false });
    else s.setSim({ active: true, playing: true, position: 0 });
  };

  return (
    <header className="topbar" data-save-state={saveState}>
      <div className="tb-left">
        <Link
          to="/"
          className="topbar-brand"
          aria-label="tatami.ninja — back to your designs"
        >
          <Logo size={24} />
          <span>tatami.ninja</span>
        </Link>
        <div className="vdivider" />
        <div className="project-label">
          {editingName ? (
            <input
              className="input name-input"
              autoFocus
              defaultValue={project.name}
              aria-label="Design name"
              onBlur={(e) => {
                const n = e.target.value.trim();
                if (n && n !== project.name) s.setProjectFields({ name: n });
                setEditingName(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditingName(false);
                e.stopPropagation();
              }}
            />
          ) : (
            <button
              className="name-btn"
              onClick={() => setEditingName(true)}
              title="Rename design"
            >
              {project.name}
            </button>
          )}
        </div>
        <div className="undo-redo">
          <IconButton
            icon="undo"
            label="Undo"
            shortcut="⌘Z"
            size="xs"
            disabled={!canUndo || sim.active}
            onClick={() => s.undo()}
          />
          <IconButton
            icon="redo"
            label="Redo"
            shortcut="⇧⌘Z"
            size="xs"
            disabled={!canRedo || sim.active}
            onClick={() => s.redo()}
          />
        </div>
      </div>
      <SegmentedControl<ViewMode>
        label="View"
        value={sim.active ? "realistic" : view}
        disabled={sim.active}
        onChange={(vv) => s.setView(vv)}
        options={[
          { value: "artwork", label: "Artwork" },
          { value: "objects", label: "Objects" },
          { value: "stitches", label: "Stitches" },
          { value: "realistic", label: "Realistic" },
        ]}
      />
      <div className="tb-right">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="tb xs gh-link"
          aria-label="tatami.ninja on GitHub"
          {...ghTip}
        >
          <GithubMark size={15} />
        </a>
        <IconButton
          icon="save"
          label="Save"
          shortcut="⌘S"
          size="sm"
          onClick={onSave}
        />
        <div className="menu-wrap" ref={menuRef}>
          <IconButton
            icon="more"
            label="Design menu"
            size="sm"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          />
          {menu && (
            <div className="popover menu" role="menu">
              {!readOnly && (
                <button
                  role="menuitem"
                  onClick={() => (setMenu(false), onImport())}
                >
                  <Icon name="upload" small /> Import artwork…
                </button>
              )}
              {!readOnly && (
                <button
                  role="menuitem"
                  onClick={() => (setMenu(false), onAddImage())}
                >
                  <Icon name="image" small /> Add image (trace or backdrop)…
                </button>
              )}
              <button
                role="menuitem"
                onClick={() => (setMenu(false), onSave())}
              >
                <Icon name="save" small /> Save <kbd>⌘S</kbd>
              </button>
              <button
                role="menuitem"
                onClick={() => (setMenu(false), onSaveAs())}
              >
                <Icon name="download" small /> Save as… <kbd>⇧⌘S</kbd>
              </button>
              <button
                role="menuitem"
                onClick={() => (setMenu(false), onOpen())}
              >
                <Icon name="folder" small /> Open… <kbd>⌘O</kbd>
              </button>
              <Link role="menuitem" to="/help" target="_blank">
                <Icon name="help" small /> Help & shortcuts
              </Link>
            </div>
          )}
        </div>
        <button
          className={`btn sim-btn${sim.active ? " pressed" : ""}`}
          aria-pressed={sim.active}
          disabled={!hasStitches}
          onClick={toggleSim}
        >
          <Icon name={sim.active ? "pause" : "play"} small />
          {sim.active ? "Simulating" : "Simulate"}
        </button>
        <button className="btn pri" disabled={!hasStitches} onClick={onExport}>
          <Icon name="export" small />
          Export
        </button>
      </div>
    </header>
  );
}
