import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Thread } from '../model/types';
import { Icon } from './Icon';

/** Thread chooser that shows each thread's color (a native select cannot). */
export function ThreadPicker({
  threads,
  value,
  onChange,
  label = 'Thread',
  id,
}: {
  threads: Thread[];
  /** null = mixed (several objects with different threads). */
  value: string | null;
  onChange(id: string): void;
  label?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const cur = threads.findIndex((t) => t.id === value);
  const current = cur >= 0 ? threads[cur] : null;

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, cur));
    list.current?.focus();
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (i: number) => {
    const t = threads[i];
    if (t) onChange(t.id);
    setOpen(false);
    btn.current?.focus();
  };

  const r = open ? btn.current?.getBoundingClientRect() : null;
  const below = r ? window.innerHeight - r.bottom > Math.min(260, threads.length * 34 + 12) : true;

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        className="btn thread-picker"
        aria-label={`${label}: ${current ? current.name : 'mixed'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {current ? <span className="swatch-dot sm" style={{ background: current.hex }} /> : <span className="swatch-dot sm mixed" />}
        <span className="tp-name">{current ? `${cur + 1} · ${current.name}` : 'Mixed'}</span>
        <Icon name="chevron-down" small />
      </button>
      {open &&
        r &&
        createPortal(
          <div
            ref={list}
            className="popover thread-list"
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            aria-activedescendant={threads[active] ? `tp-${threads[active].id}` : undefined}
            style={{ left: r.left, width: Math.max(r.width, 180), top: below ? r.bottom + 4 : undefined, bottom: below ? undefined : window.innerHeight - r.top + 4 }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') {
                setOpen(false);
                btn.current?.focus();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(threads.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                pick(active);
              }
            }}
          >
            {threads.map((t, i) => (
              <div
                key={t.id}
                id={`tp-${t.id}`}
                role="option"
                aria-selected={t.id === value}
                className={`tl-row${i === active ? ' active' : ''}${t.id === value ? ' on' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(i)}
              >
                <span className="swatch-dot sm" style={{ background: t.hex }} />
                <span className="tp-name">
                  {i + 1} · {t.name}
                </span>
                {t.id === value && <Icon name="check" small />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
