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
import { openFromDisk, persistNew, persistOpened, pickArtwork, projectFromFile, type Opened } from './actions';

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
  'club-badge': (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="14" fill="#24357A" />
      <circle cx="17" cy="17" r="14" fill="none" stroke="#D4A43A" strokeWidth="2.4" strokeDasharray=".5 .3" />
      <path d="M17 11l1.8 3.8 4.1.4-3.1 2.7.9 4-3.7-2.1-3.7 2.1.9-4-3.1-2.7 4.1-.4z" fill="#D4A43A" />
      <path d="M8.5 13.5a9.5 9.5 0 0117 0" fill="none" stroke="#D4A43A" strokeWidth="1.2" strokeDasharray="1.4 .9" />
    </svg>
  ),
  monogram: (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="13" fill="none" stroke="#5B7FB8" strokeWidth="2.2" strokeDasharray=".5 .3" />
      <text x="17" y="22.5" textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="Georgia, serif" fill="#C9D6EE">
        A
      </text>
    </svg>
  ),
  heart: (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <path d="M17 29C9 23 4 18 4 12c0-4 3-7 7-7 3 0 5 2 6 4 1-2 3-4 6-4 4 0 7 3 7 7 0 6-5 11-13 17z" fill="#C8282E" stroke="#7A1420" strokeWidth="1.4" />
    </svg>
  ),
  'mountain-patch': (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="13" fill="#8EC5E8" />
      <path d="M6 23l8-11 4 5 3-4 8 10c-3 4-7 6-12 6s-9-2-11-6z" fill="#6B7280" />
      <path d="M14 12l-2 3 2-.5 2 .8z" fill="#F7F7F5" />
      <circle cx="17" cy="17" r="13.5" fill="none" stroke="#F2EFE6" strokeWidth="1.8" strokeDasharray=".5 .3" />
    </svg>
  ),
  leaf: (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <path d="M5 29C7 14 19 6 30 5c-1 12-9 23-25 24z" fill="#3E8E4F" />
      <path d="M7 27C14 21 21 14 28 7" fill="none" stroke="#CFE8C8" strokeWidth="1" strokeDasharray="1.6 .8" />
    </svg>
  ),
  'rose-line': (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <g fill="none" stroke="#E0457E" strokeWidth="1">
        <circle cx="17" cy="11" r="2" />
        <circle cx="17" cy="11" r="4.5" />
        <circle cx="17" cy="11" r="7" />
      </g>
      <path d="M17 18v13M17 25c-3-2.5-6-2-8 0 2 1.6 5 1.6 8 0M17 28c3-2.5 6-2 8 0-2 1.6-5 1.6-8 0" fill="none" stroke="#4CAF50" strokeWidth="1" />
    </svg>
  ),
  'paw-print': (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <g fill="#A06A4A">
        <ellipse cx="8" cy="14" rx="3.2" ry="4" />
        <ellipse cx="14" cy="8" rx="3.2" ry="4" />
        <ellipse cx="21" cy="8" rx="3.2" ry="4" />
        <ellipse cx="27" cy="14" rx="3.2" ry="4" />
        <path d="M17.5 16c4.5 0 9 5 9 9.5 0 3.5-3 5-6 4-1.3-.4-2-1.2-3-1.2s-1.7.8-3 1.2c-3 1-6-.5-6-4 0-4.5 4.5-9.5 9-9.5z" />
      </g>
    </svg>
  ),
  'cap-front': (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <path d="M5 23c0-8 5-14 12-14s12 6 12 14z" fill="#2F3B52" />
      <path d="M3 23h28c0 2-2 3-4 3H7c-2 0-4-1-4-3z" fill="#27324A" />
      <path d="M11 18h12" stroke="#F4F4F0" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  ),
  'wide-cap': (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <path d="M4 22c0-7 6-12 13-12s13 5 13 12z" fill="#8A7A62" />
      <path d="M2 22h30c0 2-2 3-4 3H6c-2 0-4-1-4-3z" fill="#7A6B54" />
      <path d="M6 17.5h22" stroke="#1E2430" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  'hex-patch': (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <path d="M10 5h14l8 12-8 12H10L2 17z" fill="#1F6F6B" stroke="#F2D23C" strokeWidth="1.8" strokeDasharray=".5 .3" />
      <path d="M10 17h14" stroke="#F2D23C" strokeWidth="2" strokeLinecap="round" />
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
    document.title = 'tatami.ninja — free embroidery digitizer in your browser';
    refresh();
  }, [refresh]);

  const open = async (make: () => Promise<Opened | null>) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await make();
      if (!res) return;
      const id = await persistOpened(res);
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
            <button className="btn page cta" onClick={() => open(openFromDisk)} disabled={busy}>
              <Icon name="folder" small />
              Open file
            </button>
            <button className="btn page cta" onClick={fromPicked(pickArtwork)} disabled={busy}>
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
