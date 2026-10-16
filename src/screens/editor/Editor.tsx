import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from '../../components/ui';
import { artworkKind, pickFile, readAsDataUrl, readAsText, ARTWORK_ACCEPT } from '../../importers/files';
import { importSvg } from '../../importers/svg';
import { loadProject } from '../../storage/db';
import { saveDesign } from '../../storage/projectFile';
import { useEditor } from '../../store/editor';
import { NotFound } from '../NotFound';
import { openFromDisk, persistOpened, pickStitchFile, projectFromFile, takePendingTrace, type Opened } from '../actions';
import { ArrangePanel } from './ArrangePanel';
import { AutoDigitizeDialog } from './AutoDigitizeDialog';
import { BackdropPanel } from './BackdropPanel';
import { Canvas } from './Canvas';
import { ExportDialog } from './ExportDialog';
import { useAutosave, useEditorKeyboard, useEngine } from './hooks';
import { DesignSection, PropertiesPanel, ToolOptions } from './PropertiesPanel';
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
  const save = useCallback(async (saveAs = false) => {
    const p = useEditor.getState().project;
    if (!p) return;
    try {
      const r = await saveDesign(p, { saveAs });
      if (r) toast(r.via === 'file' ? `Saved to ${r.name}` : `Downloaded ${r.name}`);
    } catch (e) {
      toast(`Save failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }, []);
  const openNew = useCallback(
    async (res: Opened) => {
      const newId = await persistOpened(res);
      if (res.note) toast(res.note);
      navigate(`/design/${newId}`);
    },
    [navigate],
  );
  const openFile = useCallback(async () => {
    try {
      const res = await openFromDisk();
      if (res) await openNew(res);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  }, [openNew]);
  useEditorKeyboard({ readOnly, onSave: save, onOpen: openFile });
  const { cmd, stitchPos } = useSimulation(plan);
  const s = useEditor.getState();

  // An image imported from Home opens straight in the tracer.
  useEffect(() => {
    const src = takePendingTrace(project.id);
    if (src) useEditor.getState().openTracer(src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leave simulation if the plan disappears (e.g. everything hidden).
  useEffect(() => {
    if (simActive && !plan?.stitchCount) s.setSim({ active: false, playing: false });
  }, [simActive, plan, s]);

  const openAsNewProject = useCallback(async (file: File) => openNew(await projectFromFile(file)), [openNew]);

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
          // Images open the tracer (which can also place the image as a backdrop).
          st.openTracer(await readAsDataUrl(file));
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

  const pickSvg = async () => {
    const f = await pickFile('.svg,image/svg+xml');
    if (f) await importFile(f);
  };
  const pickImage = async () => {
    const f = await pickFile('.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp');
    if (f) useEditor.getState().openTracer(await readAsDataUrl(f));
  };

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
        onAddImage={pickImage}
        onSave={() => save()}
        onSaveAs={() => save(true)}
        onOpen={openFile}
      />
      <div className="editor-mid">
        <ToolRail readOnly={readOnly} onImportSvg={pickSvg} onAddImage={pickImage} />
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
            {project.backdrop && <BackdropPanel onTrace={() => s.openTracer(project.backdrop?.dataUrl ?? null)} onReplace={pickImage} />}
            <ToolOptions />
            <PropertiesPanel readOnly={readOnly} />
            <ArrangePanel readOnly={readOnly} />
            <DesignSection />
          </aside>
        )}
      </div>
      <StatusBar />
      {dialog === 'export' && plan && <ExportDialog onClose={() => s.setDialog(null)} />}
      {dialog === 'auto-digitize' && <AutoDigitizeDialog onClose={() => s.setDialog(null)} />}
    </div>
  );
}
