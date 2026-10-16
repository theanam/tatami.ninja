import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from '../../components/ui';
import { downloadProjectJson } from '../../export/export';
import { artworkKind, pickFile, readAsDataUrl, readAsText, ARTWORK_ACCEPT } from '../../importers/files';
import { importSvg } from '../../importers/svg';
import { loadProject } from '../../storage/db';
import { useEditor } from '../../store/editor';
import { NotFound } from '../NotFound';
import { backdropFromImage, persistNew, pickStitchFile, projectFromFile } from '../actions';
import { AutoDigitizeDialog } from './AutoDigitizeDialog';
import { Canvas } from './Canvas';
import { ExportDialog } from './ExportDialog';
import { useAutosave, useEditorKeyboard, useEngine } from './hooks';
import { PropertiesPanel } from './PropertiesPanel';
import { RulerX, RulerY } from './Rulers';
import { SequencePanel } from './SequencePanel';
import { SimPanel, SimulatorBar, useSimulation } from './Simulator';
import { StatusBar } from './StatusBar';
import { ThreadStrip } from './ThreadStrip';
import { ToolRail } from './ToolRail';
import { TopBar } from './TopBar';
import './editor.css';

export function Editor() {
  const { id } = useParams();
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const project = useEditor((s) => s.project);

  useEffect(() => {
    let alive = true;
    setState('loading');
    loadProject(id ?? '')
      .then((p) => {
        if (!alive) return;
        if (!p) return setState('missing');
        useEditor.getState().load(p);
        setState('ready');
      })
      .catch(() => alive && setState('missing'));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (project) document.title = `${project.name} — tatami.ninja`;
  }, [project?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'missing') return <NotFound message="This design is not saved in this browser. It may have been deleted, or it was created in another browser." />;
  if (state === 'loading' || !project || project.id !== id) return <div className="page-loading">Loading design…</div>;
  return <EditorShell />;
}

function EditorShell() {
  const navigate = useNavigate();
  const project = useEditor((s) => s.project)!;
  const plan = useEditor((s) => s.plan);
  const dialog = useEditor((s) => s.dialog);
  const simActive = useEditor((s) => s.sim.active);
  const readOnly = project.source === 'stitch-file';
  useEngine();
  useAutosave();
  useEditorKeyboard({ readOnly });
  const { cmd, stitchPos } = useSimulation(plan);
  const s = useEditor.getState();

  // Leave simulation if the plan disappears (e.g. everything hidden).
  useEffect(() => {
    if (simActive && !plan?.stitchCount) s.setSim({ active: false, playing: false });
  }, [simActive, plan, s]);

  const openAsNewProject = useCallback(
    async (file: File) => {
      const res = await projectFromFile(file);
      const newId = await persistNew(res.project);
      if (res.note) toast(res.note);
      navigate(`/design/${newId}`);
    },
    [navigate],
  );

  const importFile = useCallback(
    async (file: File) => {
      try {
        const kind = artworkKind(file.name, file.type);
        const st = useEditor.getState();
        const p = st.project!;
        if (kind === 'svg') {
          const res = importSvg(await readAsText(file), { hoop: p.hoop, threads: p.threads });
          st.addObjects(res.objects, res.threads);
          if (st.view === 'artwork') st.setView('objects');
          toast(`Imported ${res.objects.length} ${res.objects.length === 1 ? 'object' : 'objects'} from ${file.name}`);
        } else if (kind === 'raster') {
          st.setBackdrop(await backdropFromImage(await readAsDataUrl(file), p.hoop));
          st.setView('artwork');
          st.select([]);
          toast('Image added as a tracing backdrop. Trace it with the drawing tools, or use Auto-digitize.');
        } else if (kind === 'stitch' || kind === 'project') {
          await openAsNewProject(file);
        } else {
          toast('Unsupported file. Use an SVG, PNG or JPG.', 'error');
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'error');
      }
    },
    [openAsNewProject],
  );

  const pickImport = async () => {
    const f = await pickFile(ARTWORK_ACCEPT);
    if (f) await importFile(f);
  };
  const pickStitch = async () => {
    const f = await pickStitchFile();
    if (!f) return;
    try {
      await openAsNewProject(f);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <div className="editor">
      <TopBar
        readOnly={readOnly}
        onExport={() => s.setDialog('export')}
        onImport={pickImport}
        onAutoDigitize={() => s.setDialog('auto-digitize')}
        onDownloadProject={() => downloadProjectJson(project)}
      />
      <div className="editor-mid">
        <ToolRail readOnly={readOnly} onAutoDigitize={() => s.setDialog('auto-digitize')} />
        <main className="editor-main">
          <div className="canvas-grid">
            <div className="ruler-corner" aria-hidden="true">
              mm
            </div>
            <RulerX />
            <RulerY />
            <div className="canvas-cell">
              <Canvas readOnly={readOnly} onImportFile={importFile} onImportClick={pickImport} onOpenStitchFile={pickStitch} simCmd={cmd} />
              {simActive && plan && <SimulatorBar plan={plan} stitchPos={stitchPos} cmd={cmd} />}
            </div>
          </div>
          {!simActive && <ThreadStrip />}
        </main>
        {simActive && plan ? (
          <SimPanel plan={plan} cmd={cmd} />
        ) : (
          <aside aria-label="Sequence and properties" className="panel">
            <SequencePanel readOnly={readOnly} />
            <PropertiesPanel readOnly={readOnly} />
          </aside>
        )}
      </div>
      <StatusBar />
      {dialog === 'export' && plan && <ExportDialog onClose={() => s.setDialog(null)} />}
      {dialog === 'auto-digitize' && <AutoDigitizeDialog onClose={() => s.setDialog(null)} />}
    </div>
  );
}
