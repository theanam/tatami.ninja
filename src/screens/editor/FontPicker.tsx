import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/Icon';
import {
  BUILTIN_FONTS,
  FONT_CATEGORIES,
  filterFonts,
  loadCatalog,
  loadPreview,
  type FontCategory,
  type FontEntry,
} from '../../importers/fontCatalog';
import { fmtInt } from '../../model/units';

const ROW = 38;
const VIEW = 342;
const CAT_LABEL: Record<FontCategory, string> = { builtin: 'built-in', sans: 'sans', serif: 'serif', display: 'display', script: 'script', mono: 'mono' };

/**
 * Popover listing every Google Font (plus the bundled ones), each set in its own face.
 * The list is virtualized and previews load only for visible rows (css2 with `text=`).
 */
export function FontPicker({
  value,
  anchor,
  onPick,
  onClose,
}: {
  value: string;
  anchor: DOMRect;
  onPick(entry: FontEntry): void;
  onClose(): void;
}) {
  const [catalog, setCatalog] = useState<FontEntry[] | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'all' | FontCategory>('all');
  const [active, setActive] = useState(0);
  const [scroll, setScroll] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void loadCatalog().then((c) => alive && setCatalog(c));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [onClose]);

  const list = useMemo(() => filterFonts(catalog ?? BUILTIN_FONTS, q, cat), [catalog, q, cat]);

  // Start scrolled to the current font when nothing is filtered.
  useEffect(() => {
    if (!catalog || q || cat !== 'all') return;
    const i = list.findIndex((f) => f.id === value);
    if (i > 0 && listRef.current) {
      listRef.current.scrollTop = Math.max(0, i * ROW - VIEW / 2);
      setActive(i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  useEffect(() => {
    setActive(0);
    if (listRef.current) listRef.current.scrollTop = 0;
    setScroll(0);
  }, [q, cat]);

  const move = (to: number) => {
    const i = Math.max(0, Math.min(list.length - 1, to));
    setActive(i);
    const el = listRef.current;
    if (!el) return;
    if (i * ROW < el.scrollTop) el.scrollTop = i * ROW;
    else if ((i + 1) * ROW > el.scrollTop + VIEW) el.scrollTop = (i + 1) * ROW - VIEW;
  };

  const first = Math.max(0, Math.floor(scroll / ROW) - 4);
  const last = Math.min(list.length, Math.ceil((scroll + VIEW) / ROW) + 4);
  const visible = list.slice(first, last);

  const width = 360;
  const height = VIEW + 116;
  const below = window.innerHeight - anchor.bottom > height + 12;
  const style = {
    left: Math.max(8, Math.min(window.innerWidth - width - 8, anchor.left)),
    top: below ? anchor.bottom + 6 : Math.max(8, anchor.top - height - 6),
    width,
  };

  return createPortal(
    <div ref={rootRef} className="popover font-picker" style={style} role="dialog" aria-label="Choose a font">
      <div className="fp-search">
        <Icon name="search" small />
        <input
          autoFocus
          placeholder={catalog ? `Search ${fmtInt(catalog.length)} fonts` : 'Search fonts'}
          aria-label="Search fonts"
          aria-controls="fp-list"
          aria-activedescendant={list[active] ? `fp-${list[active].id}` : undefined}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              move(active + 1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              move(active - 1);
            } else if (e.key === 'Enter' && list[active]) onPick(list[active]);
          }}
        />
      </div>
      <div className="fp-chips" role="group" aria-label="Font category">
        {FONT_CATEGORIES.map((c) => (
          <button key={c.id} className="seg" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div ref={listRef} id="fp-list" className="fp-list" role="listbox" aria-label="Fonts" style={{ height: VIEW }} onScroll={(e) => setScroll(e.currentTarget.scrollTop)}>
        {list.length === 0 ? (
          <div className="fp-empty">No fonts match.</div>
        ) : (
          <div style={{ height: list.length * ROW, position: 'relative' }}>
            {visible.map((f, k) => {
              const i = first + k;
              const on = f.id === value;
              return (
                <button
                  key={f.id}
                  id={`fp-${f.id}`}
                  role="option"
                  aria-selected={on}
                  className={`fp-row${i === active ? ' active' : ''}${on ? ' on' : ''}`}
                  style={{ top: i * ROW }}
                  title={f.family}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => onPick(f)}
                >
                  <span className="fp-name" style={{ fontFamily: `'${loadPreview(f)}', var(--sb-font-sans)` }}>
                    {f.family}
                  </span>
                  <span className="fp-cat">{on ? '✓' : CAT_LABEL[f.category]}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="fp-foot meta">{catalog && catalog.length > BUILTIN_FONTS.length ? 'Google Fonts load when you pick them. Built-in fonts also work offline.' : 'Loading the Google Fonts list…'}</div>
    </div>,
    document.body,
  );
}
