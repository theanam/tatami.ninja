import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { SegmentedControl, Select, Spinner } from '../../components/ui';
import { geometryBounds } from '../../engine/geom';
import { ensureCssFont, fontDisplayName, isGoogleFont, loadCatalog, nearestWeight, type FontEntry } from '../../importers/fontCatalog';
import { fontMetrics, loadSpecFont } from '../../importers/lettering';
import type { StitchObject, TextSpec } from '../../model/types';
import type { Units } from '../../model/units';
import { useEditor } from '../../store/editor';
import { toScreen, type View } from './canvasMath';
import { FontPicker } from './FontPicker';
import { applyTextSpec } from './textOps';
import { LenRow } from './PanelRows';

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

  // Focus and select once, on open. (Re-selecting when the font arrives would eat typing.)
  useEffect(() => {
    const el = inputRef.current;
    el?.focus();
    el?.select();
  }, []);

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

/** Lettering settings in the Properties panel: font, weight, size, spacing, arc. */
export function LetteringSection({ o, units }: { o: StitchObject; units: Units }) {
  const spec = o.text!;
  const fontBtn = useRef<HTMLButtonElement>(null);
  const [picker, setPicker] = useState<DOMRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<FontEntry[] | null>(null);
  const live = useLiveFont(spec);

  useEffect(() => {
    let alive = true;
    void loadCatalog().then((c) => alive && setCatalog(c));
    return () => {
      alive = false;
    };
  }, []);

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
  const b = geometryBounds(o.geometry);
  const textWidth = b ? b.maxX - b.minX : 400;

  return (
    <div className="lettering" role="group" aria-label="Lettering">
      <div className="prop-grid two">
        <span className="prop-label">Font</span>
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
          <>
            <span className="prop-label">Weight</span>
            <Select
              label="Font weight"
              value={String(spec.weight ?? nearestWeight(weights))}
              options={weights.map((w) => ({ value: String(w), label: String(w) }))}
              onChange={(w) => void apply({ weight: Number(w) })}
            />
          </>
        )}
      </div>
      <div className="prop-grid">
        <LenRow label="Height" name="Letter height" value={spec.height} min={30} max={1200} step={1} units={units} onChange={(v) => void apply({ height: v }, `h-${o.id}`)} />
        <LenRow label="Spacing" name="Letter spacing" value={spec.spacing} min={-50} max={200} step={1} units={units} onChange={(v) => void apply({ spacing: v }, `sp-${o.id}`)} />
      </div>
      <div className="prop-grid two">
        <span className="prop-label">Baseline</span>
        <SegmentedControl
          label="Baseline"
          grid
          value={arcMode}
          onChange={(m) => void apply({ arc: m === 'straight' ? 0 : (m === 'up' ? 1 : -1) * (Math.abs(spec.arc) || Math.max(400, Math.round(textWidth / 10) * 10)) }, 'arcmode')}
          options={[
            { value: 'straight', label: 'Straight' },
            { value: 'up', label: 'Arc ↑' },
            { value: 'down', label: 'Arc ↓' },
          ]}
        />
      </div>
      {spec.arc !== 0 && (
        <div className="prop-grid">
          <LenRow label="Radius" name="Arc radius" value={Math.abs(spec.arc)} min={150} max={3000} step={10} units={units} onChange={(v) => void apply({ arc: Math.sign(spec.arc) * v }, `arc-${o.id}`)} />
        </div>
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
