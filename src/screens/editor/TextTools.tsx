import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { NumberInput, SegmentedControl, Select, Spinner } from '../../components/ui';
import { geometryBounds } from '../../engine/geom';
import { ensureCssFont, fontDisplayName, isGoogleFont, loadCatalog, nearestWeight, type FontEntry } from '../../importers/fontCatalog';
import { fontMetrics, loadSpecFont } from '../../importers/lettering';
import type { StitchObject, TextSpec } from '../../model/types';
import { fromDisplay, toDisplay, type Units } from '../../model/units';
import { useEditor } from '../../store/editor';
import { toScreen, type View } from './canvasMath';
import { FontPicker } from './FontPicker';
import { applyTextSpec } from './textOps';

interface Metrics {
  unitsPerEm: number;
  capHeight: number;
  ascender: number;
  descender: number;
}

/** CSS family + vertical metrics for a spec's font, so live text lines up with the stitches. */
function useLiveFont(spec: TextSpec) {
  const [state, setState] = useState<{ css: string; m: Metrics } | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([ensureCssFont(spec.font, isGoogleFont(spec.font) ? spec.weight ?? 400 : undefined), loadSpecFont(spec)])
      .then(([css, font]) => alive && setState({ css, m: fontMetrics(font) }))
      .catch(() => alive && setState(null));
    return () => {
      alive = false;
    };
  }, [spec.font, spec.weight]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

/**
 * Edit lettering directly on the canvas: an input set in the real font, sized and placed on
 * the text's baseline. Enter or clicking away keeps the text; Escape restores it.
 */
export function InlineTextEditor({ o, v, color, onDone }: { o: StitchObject; v: View; color: string; onDone(): void }) {
  const spec = o.text!;
  const [value, setValue] = useState(spec.content);
  const original = useRef(spec.content);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const live = useLiveFont(spec);

  useEffect(() => {
    const el = inputRef.current;
    el?.focus();
    el?.select();
  }, [live !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = (revert: boolean) => {
    if (done.current) return;
    done.current = true;
    const s = useEditor.getState();
    if (revert) {
      if (value !== original.current) void applyTextSpec(o.id, { content: original.current }).catch(() => undefined);
    } else if (!value.trim()) {
      // Empty lettering is removed.
      s.select([o.id]);
      s.deleteSelected();
    }
    onDone();
  };

  const m = live?.m;
  const fontPx = m ? ((spec.height * m.unitsPerEm) / m.capHeight) * v.s : spec.height * 1.4 * v.s;
  const asc = m ? (m.ascender / m.unitsPerEm) * fontPx : fontPx * 0.9;
  const desc = m ? (-m.descender / m.unitsPerEm) * fontPx : fontPx * 0.25;
  const [bx, by] = toScreen(v, [spec.x, spec.y]);
  const letter = spec.spacing * v.s;
  const width = useMemo(() => {
    if (typeof document === 'undefined') return 100;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return 100;
    ctx.font = `${fontPx}px '${live?.css ?? 'sans-serif'}'`;
    return ctx.measureText(value || ' ').width + letter * Math.max(0, value.length - 1) + fontPx * 0.4;
  }, [value, fontPx, letter, live?.css]);

  return (
    <input
      ref={inputRef}
      className="inline-text"
      aria-label="Edit text"
      spellCheck={false}
      value={value}
      style={{
        left: bx - width / 2,
        top: by - asc,
        width,
        height: asc + desc,
        fontSize: fontPx,
        lineHeight: `${asc + desc}px`,
        letterSpacing: letter,
        fontFamily: live ? `'${live.css}'` : 'var(--sb-font-sans)',
        color,
      }}
      onChange={(e) => {
        setValue(e.target.value);
        if (e.target.value.trim()) void applyTextSpec(o.id, { content: e.target.value }, `text-${o.id}`).catch(() => undefined);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(false);
        if (e.key === 'Escape') finish(true);
      }}
      onBlur={() => finish(false)}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

/** Floating lettering controls above the selected text: font, weight, size, spacing, arc. */
export function TextToolbar({ o, v, units, editing, onEdit }: { o: StitchObject; v: View; units: Units; editing: boolean; onEdit(): void }) {
  const spec = o.text!;
  const ref = useRef<HTMLDivElement>(null);
  const fontBtn = useRef<HTMLButtonElement>(null);
  const [picker, setPicker] = useState<DOMRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<FontEntry[] | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const live = useLiveFont(spec);

  useEffect(() => {
    let alive = true;
    void loadCatalog().then((c) => alive && setCatalog(c));
    return () => {
      alive = false;
    };
  }, []);

  const b = geometryBounds(o.geometry);
  const top = b ? toScreen(v, [b.minX, b.minY]) : toScreen(v, [spec.x, spec.y]);
  const bottom = b ? toScreen(v, [b.maxX, b.maxY]) : top;
  const cx = (top[0] + bottom[0]) / 2;

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(parent.clientWidth - w - 8, cx - w / 2));
    const above = top[1] - h - 14;
    setPos({ left, top: above > 40 ? above : Math.min(parent.clientHeight - h - 8, bottom[1] + 14) });
  }, [cx, top[1], bottom[1], spec, catalog]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async (patch: Partial<TextSpec>, key?: string) => {
    setBusy(true);
    try {
      await applyTextSpec(o.id, patch, key);
    } catch {
      /* toast shown by applyTextSpec */
    } finally {
      setBusy(false);
    }
  };

  const entry = catalog?.find((f) => f.id === spec.font);
  const weights = isGoogleFont(spec.font) ? entry?.weights ?? [spec.weight ?? 400] : [];
  const arcMode = spec.arc === 0 ? 'straight' : spec.arc > 0 ? 'up' : 'down';
  const d = (x: number) => toDisplay(x, units);
  const textWidth = b ? b.maxX - b.minX : 400;

  return (
    <div
      ref={ref}
      className="text-toolbar"
      role="toolbar"
      aria-label="Lettering"
      style={pos ?? { left: -9999, top: -9999 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        ref={fontBtn}
        className="btn tt-font"
        aria-haspopup="dialog"
        aria-label={`Font: ${fontDisplayName(spec.font, catalog)}`}
        onClick={() => setPicker(picker ? null : fontBtn.current!.getBoundingClientRect())}
      >
        <span style={{ fontFamily: live ? `'${live.css}'` : undefined }}>{fontDisplayName(spec.font, catalog)}</span>
        {busy ? <Spinner size={12} /> : <Icon name="chevron-down" small />}
      </button>
      {weights.length > 1 && (
        <div className="tt-weight">
          <Select
            label="Font weight"
            value={String(spec.weight ?? nearestWeight(weights))}
            options={weights.map((w) => ({ value: String(w), label: String(w) }))}
            onChange={(w) => void apply({ weight: Number(w) })}
          />
        </div>
      )}
      <label className="tt-field" title="Letter height">
        <Icon name="lettering" small />
        <NumberInput
          label="Letter height in millimetres"
          value={d(spec.height)}
          unit={units}
          decimals={units === 'mm' ? 1 : 2}
          min={d(30)}
          max={d(1200)}
          onChange={(x) => void apply({ height: fromDisplay(x, units) })}
        />
      </label>
      <label className="tt-field" title="Letter spacing">
        <span className="tt-glyph" aria-hidden="true">
          A|A
        </span>
        <NumberInput
          label="Letter spacing in millimetres"
          value={d(spec.spacing)}
          unit={units}
          decimals={units === 'mm' ? 1 : 2}
          min={d(-50)}
          max={d(200)}
          onChange={(x) => void apply({ spacing: fromDisplay(x, units) })}
        />
      </label>
      <SegmentedControl
        label="Baseline"
        value={arcMode}
        onChange={(m) => void apply({ arc: m === 'straight' ? 0 : (m === 'up' ? 1 : -1) * (Math.abs(spec.arc) || Math.max(400, Math.round(textWidth / 10) * 10)) }, 'arcmode')}
        options={[
          { value: 'straight', label: 'Straight' },
          { value: 'up', label: 'Arc ↑' },
          { value: 'down', label: 'Arc ↓' },
        ]}
      />
      {spec.arc !== 0 && (
        <label className="tt-field" title="Arc radius">
          <span className="tt-glyph" aria-hidden="true">
            r
          </span>
          <NumberInput
            label="Arc radius in millimetres"
            value={d(Math.abs(spec.arc))}
            unit={units}
            decimals={0}
            min={d(150)}
            max={d(3000)}
            onChange={(x) => void apply({ arc: Math.sign(spec.arc) * fromDisplay(x, units) })}
          />
        </label>
      )}
      {!editing && (
        <button className="btn tt-edit" onClick={onEdit} title="Edit text (double-click the text, or press Enter)">
          <Icon name="pen" small />
          Edit text
        </button>
      )}
      {picker && (
        <FontPicker
          value={spec.font}
          anchor={picker}
          onClose={() => setPicker(null)}
          onPick={(f) => {
            setPicker(null);
            void apply({ font: f.id, weight: f.category === 'builtin' ? undefined : nearestWeight(f.weights, spec.weight ?? 700) });
          }}
        />
      )}
    </div>
  );
}
