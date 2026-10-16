import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageFooter, PageHeader } from '../components/PageChrome';
import { IconButton, toast } from '../components/ui';
import sample from '../model/harbor-club-badge.tatami.json';
import { newId } from '../model/project';
import { TEMPLATES, type TemplateInfo } from '../model/templateInfo';
import type { Project } from '../model/types';
import { fmtInt, fmtRelative } from '../model/units';
import { hoopLabel } from '../presets';
import { deleteProject, listProjects, loadProject, type ProjectSummary } from '../storage/db';
import { persistNew, pickArtwork, pickStitchFile, projectFromFile } from './actions';

const TEMPLATE_ICONS: Record<TemplateInfo['id'], JSX.Element> = {
  'round-patch': (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="13" fill="none" stroke="#D4A43A" strokeWidth="3" strokeDasharray=".5 .3" />
      <circle cx="17" cy="17" r="10.5" fill="#3D56B8" />
    </svg>
  ),
  'left-chest': (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <rect x="7" y="4" width="20" height="26" rx="3" fill="none" stroke="#6E6F76" strokeDasharray="2 1.5" />
      <rect x="11" y="9" width="12" height="8" rx="1.5" fill="#E07A5F" />
    </svg>
  ),
  'name-tape': (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <rect x="3" y="10" width="28" height="14" rx="7" fill="#2F7D5B" />
      <rect x="3" y="10" width="28" height="14" rx="7" fill="none" stroke="#F2EFE6" strokeWidth="1.8" strokeDasharray=".5 .3" />
      <path d="M10 17h14" stroke="#F2EFE6" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  'shield-crest': (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <path d="M17 5l11 4v9c0 6-5 10-11 12-6-2-11-6-11-12V9z" fill="#B3262E" />
      <path d="M17 5l11 4v9c0 6-5 10-11 12-6-2-11-6-11-12V9z" fill="none" stroke="#F2EFE6" strokeWidth="1.6" strokeDasharray=".5 .3" />
    </svg>
  ),
};

export function Home() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    listProjects()
      .then(setProjects)
      .catch(() => {
        setProjects([]);
        toast('This browser blocks storage, so designs cannot be saved.', 'error');
      });
  }, []);
  useEffect(() => {
    document.title = 'tatami.ninja — your designs';
    refresh();
  }, [refresh]);

  const open = async (make: () => Promise<{ project: Project; note?: string } | null>) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await make();
      if (!res) return;
      const id = await persistNew(res.project);
      if (res.note) toast(res.note);
      navigate(`/design/${id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const fromPicked = (pick: () => Promise<File | null>) => () =>
    open(async () => {
      const f = await pick();
      return f ? projectFromFile(f) : null;
    });

  const filtered = useMemo(
    () => (projects ?? []).filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())),
    [projects, query],
  );

  const remove = async (p: ProjectSummary) => {
    if (!window.confirm(`Delete “${p.name}” from this browser? This cannot be undone.`)) return;
    await deleteProject(p.id);
    refresh();
  };

  const duplicate = async (p: ProjectSummary) => {
    const proj = await loadProject(p.id);
    if (!proj) return;
    await persistNew({ ...proj, id: newId('p'), name: `${proj.name} copy` });
    refresh();
  };

  return (
    <div className="page-shell">
      <PageHeader />
      <main className="page-main">
        <section className="hero">
          <div className="hero-text">
            <h1>Your designs</h1>
            <p>Saved in this browser. No account, nothing uploaded.</p>
          </div>
          <div className="hero-actions">
            <button className="btn page" onClick={fromPicked(pickStitchFile)} disabled={busy}>
              <Icon name="folder" small />
              Open stitch file
            </button>
            <button className="btn page" onClick={fromPicked(pickArtwork)} disabled={busy}>
              <Icon name="upload" small />
              Import artwork
            </button>
            <Link to="/new" className="btn page pri cta">
              <Icon name="plus" />
              New design
            </Link>
          </div>
        </section>

        <section aria-labelledby="tplh" className="home-section">
          <h2 id="tplh">Start from a template</h2>
          <div className="tpl-grid">
            {TEMPLATES.map((t) => (
              <button key={t.id} className="tpl" disabled={busy} onClick={() => open(async () => ({ project: await (await import('../model/templates')).createFromTemplate(t.id) }))}>
                <div className="tpl-icon">{TEMPLATE_ICONS[t.id]}</div>
                <div>
                  <div className="tpl-name">{t.name}</div>
                  <div className="meta">{t.meta}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="rech" className="home-section">
          <div className="recent-head">
            <h2 id="rech">Recent</h2>
            <label className="search">
              <Icon name="search" small />
              <span className="sr-only">Search designs</span>
              <input placeholder="Search designs" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
          {projects === null ? null : projects.length === 0 ? (
            <div className="empty-recent">
              <p>No designs yet. Create one, import artwork, or open the sample badge to look around.</p>
              <button
                className="btn page"
                onClick={() => open(async () => ({ project: { ...(structuredClone(sample) as unknown as Project), id: newId('p') } }))}
              >
                Open the sample design
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="meta">No designs match “{query}”.</p>
          ) : (
            <div className="card-grid">
              {filtered.map((p) => (
                <div key={p.id} className="card-wrap">
                  <Link to={`/design/${p.id}`} className="card">
                    <div className="card-thumb">
                      {p.thumbnail ? <img src={p.thumbnail} alt={`Preview of ${p.name}`} /> : <div className="thumb-empty">Empty design</div>}
                    </div>
                    <div className="card-body">
                      <div className="card-title">
                        <span>{p.name}</span>
                        {p.isStitchFile && <span className="tag">Stitch file · recolor only</span>}
                      </div>
                      <div className="meta">
                        {hoopLabel(p.hoop)} · {fmtInt(p.stitchCount ?? 0)} stitches · {fmtRelative(p.updatedAt)}
                      </div>
                    </div>
                  </Link>
                  <div className="card-actions">
                    <IconButton icon="copy" label={`Duplicate ${p.name}`} size="xs" onClick={() => duplicate(p)} />
                    <IconButton icon="trash" label={`Delete ${p.name}`} size="xs" onClick={() => remove(p)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <PageFooter />
    </div>
  );
}
