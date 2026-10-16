import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { Icon } from './Icon';

/* ---------- Tooltip ---------- */

interface TipState {
  rect: DOMRect;
  label: string;
  hint?: string;
  shortcut?: string;
  side: 'right' | 'bottom' | 'top';
}

const useTip = create<{ tip: TipState | null; show(t: TipState): void; hide(): void }>((set) => ({
  tip: null,
  show: (tip) => set({ tip }),
  hide: () => set({ tip: null }),
}));

export function TooltipLayer() {
  const tip = useTip((s) => s.tip);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!tip || !ref.current) return setPos(null);
    const el = ref.current.getBoundingClientRect();
    const r = tip.rect;
    let left = r.right + 8;
    let top = r.top + r.height / 2 - el.height / 2;
    if (tip.side === 'bottom') {
      left = r.left + r.width / 2 - el.width / 2;
      top = r.bottom + 6;
    } else if (tip.side === 'top') {
      left = r.left + r.width / 2 - el.width / 2;
      top = r.top - el.height - 6;
    }
    left = Math.max(6, Math.min(window.innerWidth - el.width - 6, left));
    top = Math.max(6, Math.min(window.innerHeight - el.height - 6, top));
    setPos({ left, top });
  }, [tip]);
  if (!tip) return null;
  return createPortal(
    <div ref={ref} className="tooltip" role="tooltip" style={pos ?? { left: -9999, top: -9999 }}>
      <b>{tip.label}</b>
      {(tip.hint || tip.shortcut) && (
        <span className="hint">
          {tip.hint}
          {tip.hint && tip.shortcut ? ' · ' : ''}
          {tip.shortcut}
        </span>
      )}
    </div>,
    document.body,
  );
}

export function useTooltip(label: string, opts: { hint?: string; shortcut?: string; side?: TipState['side'] } = {}) {
  const timer = useRef<number | undefined>(undefined);
  const show = useTip((s) => s.show);
  const hide = useTip((s) => s.hide);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onEnter = useCallback(
    (e: React.SyntheticEvent<HTMLElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => show({ rect, label, hint: opts.hint, shortcut: opts.shortcut, side: opts.side ?? 'bottom' }), 350);
    },
    [label, opts.hint, opts.shortcut, opts.side, show],
  );
  const onLeave = useCallback(() => {
    window.clearTimeout(timer.current);
    hide();
  }, [hide]);
  return { onMouseEnter: onEnter, onMouseLeave: onLeave, onFocus: onEnter, onBlur: onLeave, onMouseDown: onLeave };
}

/* ---------- IconButton ---------- */

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: string;
  label: string;
  hint?: string;
  shortcut?: string;
  size?: 'tool' | 'sm' | 'xs';
  active?: boolean;
  tipSide?: TipState['side'];
  iconSmall?: boolean;
}

export function IconButton({ icon, label, hint, shortcut, size = 'sm', active, tipSide, iconSmall, className = '', ...rest }: IconButtonProps) {
  const tip = useTooltip(label, { hint, shortcut, side: tipSide });
  const cls = ['tb', size === 'sm' ? 'sm' : size === 'xs' ? 'xs' : '', active ? 'on' : '', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} aria-label={shortcut ? `${label} (${shortcut})` : label} {...tip} {...rest}>
      <Icon name={icon} small={iconSmall ?? size === 'xs'} />
    </button>
  );
}

/* ---------- SegmentedControl ---------- */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  grid,
  tall,
  disabled,
  className = '',
}: {
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  value: T | null;
  onChange(v: T): void;
  label: string;
  grid?: boolean;
  tall?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`segs${grid ? ' grid' : ''}${tall ? ' tall' : ''} ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="seg"
          aria-pressed={o.value === value}
          disabled={disabled || o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- NumberInput / ParamRow ---------- */

export function NumberInput({
  value,
  onChange,
  unit,
  label,
  decimals = 1,
  min,
  max,
  error,
  id,
}: {
  value: number;
  onChange(v: number): void;
  unit?: string;
  label: string;
  decimals?: number;
  min?: number;
  max?: number;
  error?: boolean;
  id?: string;
}) {
  const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(decimals) : '');
  const [text, setText] = useState(fmt(value));
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!editing) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editing, decimals]);
  const commit = () => {
    setEditing(false);
    if (cancelled.current) {
      cancelled.current = false;
      return setText(fmt(value));
    }
    const v = parseFloat(text.replace(',', '.'));
    if (!Number.isFinite(v)) return setText(fmt(value));
    let c = v;
    if (min !== undefined) c = Math.max(min, c);
    if (max !== undefined) c = Math.min(max, c);
    onChange(c);
    setText(fmt(c));
  };
  return (
    <div className={`num${error ? ' error' : ''}`}>
      <input
        id={id}
        aria-label={label}
        inputMode="decimal"
        value={text}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            cancelled.current = true;
            (e.target as HTMLInputElement).blur();
          }
          e.stopPropagation();
        }}
      />
      {unit && <span className="unit">{unit}</span>}
    </div>
  );
}

export function ParamRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  decimals,
  onChange,
  numLabel,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  decimals: number;
  onChange(v: number): void;
  numLabel: string;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="prop-label">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <NumberInput value={value} onChange={onChange} unit={unit} label={numLabel} decimals={decimals} min={min} max={max} />
    </>
  );
}

/* ---------- Switch ---------- */

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange(v: boolean): void; label: string; id?: string }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

/* ---------- Select ---------- */

export function Select<T extends string>({
  value,
  options,
  onChange,
  id,
  label,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange(v: T): void;
  id?: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="select-wrap">
      <select id={id} aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" small />
    </div>
  );
}

/* ---------- Dialog (focus trap) ---------- */

export function Dialog({
  title,
  onClose,
  children,
  footer,
  maxWidth = 880,
  labelledBy,
}: {
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () =>
      Array.from(
        el?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])') ?? [],
      );
    // Prefer an explicit target, else the first control that is not the close button.
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables().find((f) => !f.closest('.dialog-head')) ?? focusables()[0];
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && (i <= 0 || i === -1)) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && i === f.length - 1) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? titleId} style={{ maxWidth }}>
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        {children}
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- SelectableCard ---------- */

export function SelectableCard({
  selected,
  onSelect,
  children,
  className = '',
  label,
}: {
  selected: boolean;
  onSelect(): void;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <button type="button" className={`opt ${selected ? 'on' : ''} ${className}`} aria-pressed={selected} aria-label={label} onClick={onSelect}>
      {children}
    </button>
  );
}

/* ---------- Toasts ---------- */

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

export const useToasts = create<{ toasts: Toast[]; push(text: string, kind?: Toast['kind']): void; dismiss(id: number): void }>((set, get) => ({
  toasts: [],
  push(text, kind = 'info') {
    const id = Date.now() + Math.random();
    set({ toasts: [...get().toasts, { id, text, kind }] });
    window.setTimeout(() => get().dismiss(id), kind === 'error' ? 6000 : 3500);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const toast = (text: string, kind?: Toast['kind']) => useToasts.getState().push(text, kind);

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ---------- Spinner ---------- */

export function Spinner({ size = 14, label }: { size?: number; label?: string }) {
  return (
    <svg className="spin" width={size} height={size} viewBox="0 0 16 16" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d="M8 2a6 6 0 1 1-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
