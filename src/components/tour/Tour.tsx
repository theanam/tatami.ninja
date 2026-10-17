import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Icon, Logo } from '../Icon';
import type { Project } from '../../model/types';
import { TOUR_STEPS } from './steps';
import { markTourSeen, TOUR_EVENT, tourSeen } from './tourState';
import './tour.css';

const img = (file: string) => `${import.meta.env.BASE_URL}tour/${file}`;

/** First-run tour: shows once per browser (and again from Help). Skippable at any step. */
export function FirstRunTour() {
  const [open, setOpen] = useState(() => !tourSeen());
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(TOUR_EVENT, show);
    return () => window.removeEventListener(TOUR_EVENT, show);
  }, []);
  if (!open) return null;
  return (
    <Tour
      onClose={() => {
        markTourSeen();
        setOpen(false);
      }}
    />
  );
}

export function Tour({ onClose }: { onClose(): void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const navigate = useNavigate();
  const nextBtn = useRef<HTMLButtonElement>(null);
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length - 1;

  const go = useCallback(
    (to: number) => {
      const n = Math.max(0, Math.min(TOUR_STEPS.length - 1, to));
      setDir(n >= i ? 1 : -1);
      setI(n);
    },
    [i],
  );

  useEffect(() => {
    nextBtn.current?.focus();
  }, [i]);

  // Preload the next picture so steps change instantly.
  useEffect(() => {
    const next = TOUR_STEPS[i + 1]?.image;
    if (next) new Image().src = img(next);
  }, [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(i + 1);
      else if (e.key === 'ArrowLeft') go(i - 1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, i, onClose]);

  const openSample = async () => {
    const [{ default: sample }, { newId }, { persistNew }] = await Promise.all([
      import('../../model/harbor-club-badge.tatami.json'),
      import('../../model/project'),
      import('../../screens/actions'),
    ]);
    const id = await persistNew({ ...(structuredClone(sample) as unknown as Project), id: newId('p') });
    onClose();
    navigate(`/design/${id}`);
  };

  return createPortal(
    <div className="tour-backdrop" role="presentation">
      <div className="tour" role="dialog" aria-modal="true" aria-label="Welcome tour" aria-describedby="tour-body">
        <div className="tour-visual" aria-hidden={!step.image}>
          {step.image ? (
            <img key={step.id} className={`tour-shot in-${dir > 0 ? 'next' : 'prev'}`} src={img(step.image)} alt={step.alt} />
          ) : (
            <div key="collage" className="tour-collage">
              {TOUR_STEPS.filter((s) => s.image).map((s, k) => (
                <button key={s.id} className="tour-tile" style={{ animationDelay: `${k * 60}ms` }} onClick={() => go(k)} aria-label={`Back to: ${s.title}`}>
                  <img src={img(s.image!)} alt="" />
                  <span>{s.kicker}</span>
                </button>
              ))}
            </div>
          )}
          <div className="tour-visual-fade" />
        </div>
        <div className="tour-text">
          <div className="tour-top">
            <span className="tour-brand">
              <Logo size={18} /> tatami.ninja
            </span>
            {!last && (
              <button className="btn small tour-skip" onClick={onClose}>
                Skip tour
              </button>
            )}
          </div>
          <div key={step.id} className={`tour-copy in-${dir > 0 ? 'next' : 'prev'}`}>
            <div className="tour-kicker">
              {step.kicker} <span className="meta">· {i + 1} of {TOUR_STEPS.length}</span>
            </div>
            <h2 className="tour-title">{step.title}</h2>
            <p id="tour-body" className="tour-body">
              {step.body}
            </p>
            {step.chips.length > 0 && (
              <ul className="tour-chips" aria-label="Highlights">
                {step.chips.map((c) => (
                  <li key={c}>
                    <Icon name="check" small /> {c}
                  </li>
                ))}
              </ul>
            )}
            {last && (
              <div className="tour-cta">
                <button className="btn page pri cta" onClick={() => void openSample()}>
                  <Icon name="play" small /> Open the sample design
                </button>
                <button
                  className="btn page cta"
                  onClick={() => {
                    onClose();
                    navigate('/new');
                  }}
                >
                  <Icon name="plus" small /> New design
                </button>
              </div>
            )}
          </div>
          <div className="tour-nav">
            <div className="tour-dots" role="tablist" aria-label="Tour steps">
              {TOUR_STEPS.map((s, k) => (
                <button key={s.id} role="tab" aria-selected={k === i} aria-label={`Step ${k + 1}: ${s.kicker}`} className={`tour-dot${k === i ? ' on' : ''}${k < i ? ' done' : ''}`} onClick={() => go(k)} />
              ))}
            </div>
            <div className="tour-buttons">
              {i > 0 && (
                <button className="btn page" onClick={() => go(i - 1)}>
                  Back
                </button>
              )}
              <button ref={nextBtn} className="btn page pri" onClick={() => (last ? onClose() : go(i + 1))}>
                {last ? 'Done' : i === 0 ? 'Take the tour' : 'Next'}
                {!last && <Icon name="arrow-right" small />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
