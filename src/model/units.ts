/** Geometry is stored in 0.1 mm; these helpers convert for display only. */
export type Units = 'mm' | 'in';

export function toDisplay(units01mm: number, u: Units): number {
  return u === 'mm' ? units01mm / 10 : units01mm / 254;
}

export function fromDisplay(v: number, u: Units): number {
  return Math.round(u === 'mm' ? v * 10 : v * 254);
}

export function fmtLen(units01mm: number, u: Units, decimals = u === 'mm' ? 1 : 2): string {
  return toDisplay(units01mm, u).toFixed(decimals);
}

/** Like fmtLen but drops a trailing ".0" (e.g. "130 mm", "140.1 mm"). */
export function fmtLenCompact(units01mm: number, u: Units): string {
  return fmtLen(units01mm, u).replace(/\.0+$/, '');
}

export function fmtSize(w: number, h: number, u: Units): string {
  return `${fmtLen(w, u)} × ${fmtLen(h, u)}`;
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Sew time estimate in minutes (stitches ÷ machine speed). */
export function sewMinutes(stitches: number, spm: number): number {
  return stitches / Math.max(1, spm);
}

export function fmtClock(minutes: number): string {
  const total = Math.max(0, Math.round(minutes * 60));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fmtRelative(ts: number, now = Date.now()): string {
  const d = now - ts;
  if (d < 60_000) return 'Edited just now';
  if (d < 3_600_000) return `Edited ${Math.floor(d / 60_000)} min ago`;
  const date = new Date(ts);
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) return 'Today';
  const y = new Date(now - 86_400_000);
  if (date.toDateString() === y.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
