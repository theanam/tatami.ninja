import { cumulative, dist, norm, pointAt, sub, type P } from './geom';

/**
 * A motif is one cell of a repeating pattern: a polyline in a unit cell that starts at
 * (0, 0.5) and ends at (1, 0.5), so cells chain into continuous rows (fills) or lines (runs).
 */
export interface Motif {
  id: string;
  name: string;
  /** Height / width of the cell. */
  aspect: number;
  pts: P[];
}

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 10): P[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as P;
  });

function star(): P[] {
  const out: P[] = [[0, 0.5]];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5 + Math.PI; // start at the left point
    const r = i % 2 === 0 ? 0.45 : 0.19;
    out.push([0.5 + r * Math.cos(a + Math.PI / 10), 0.5 + r * Math.sin(a + Math.PI / 10)]);
  }
  out.push([1, 0.5]);
  return out;
}

/** Classic parametric heart, traced from its top cleft and back. */
function heart(): P[] {
  const out: P[] = [];
  for (let i = 0; i <= 32; i++) {
    const t = (2 * Math.PI * i) / 32;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push([0.5 + (x / 16) * 0.42, 0.5 - ((y + 2.5) / 15) * 0.45]);
  }
  return out;
}

/** Leaf: upper edge, lower edge back, then the midrib. */
function leaf(): P[] {
  const n = 12;
  const top = Array.from({ length: n + 1 }, (_, i) => [i / n, 0.5 - 0.45 * Math.sin((Math.PI * i) / n)] as P);
  const bottom = Array.from({ length: n + 1 }, (_, i) => [1 - i / n, 0.5 + 0.45 * Math.sin((Math.PI * i) / n)] as P);
  return [...top, ...bottom.slice(1), [1, 0.5]];
}

export const MOTIFS: Motif[] = [
  { id: 'wave', name: 'Wave', aspect: 0.5, pts: Array.from({ length: 17 }, (_, i) => [i / 16, 0.5 - 0.45 * Math.sin((2 * Math.PI * i) / 16)] as P) },
  { id: 'scallop', name: 'Scallop', aspect: 0.5, pts: arc(0.5, 0.5, 0.5, Math.PI, 2 * Math.PI, 14) },
  { id: 'zigzag', name: 'Zigzag', aspect: 0.6, pts: [[0, 0.5], [0.25, 0.05], [0.75, 0.95], [1, 0.5]] },
  { id: 'diamond', name: 'Diamond', aspect: 1, pts: [[0, 0.5], [0.5, 0.05], [1, 0.5], [0.5, 0.95], [0, 0.5], [1, 0.5]] },
  { id: 'loop', name: 'Loops', aspect: 0.8, pts: [[0, 0.5], ...arc(0.55, 0.42, 0.32, Math.PI * 0.9, Math.PI * 2.75, 18), [1, 0.5]] },
  { id: 'heart', name: 'Heart', aspect: 1, pts: [[0, 0.5], ...heart(), [1, 0.5]] },
  { id: 'star', name: 'Star', aspect: 1, pts: star() },
  { id: 'leaf', name: 'Leaf', aspect: 0.5, pts: leaf() },
  { id: 'greek', name: 'Greek key', aspect: 1, pts: [[0, 0.5], [0, 0.1], [0.8, 0.1], [0.8, 0.7], [0.35, 0.7], [0.35, 0.4], [0.55, 0.4], [0.55, 0.5], [1, 0.5]] },
  { id: 'brick', name: 'Brick', aspect: 0.5, pts: [[0, 0.5], [0, 0.05], [0.5, 0.05], [0.5, 0.95], [1, 0.95], [1, 0.5]] },
];

export const getMotif = (id: string | undefined): Motif => MOTIFS.find((m) => m.id === id) ?? MOTIFS[0];

/** Rows of chained motifs (cell width w, height w·aspect, `gap` between rows) covering a circle. */
export function motifRows(m: Motif, cx: number, cy: number, r: number, w: number, gap: number, angleDeg: number): P[][] {
  const h = w * m.aspect;
  const pitch = h + gap;
  const t = (-angleDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const n = Math.ceil(r / pitch) + 1;
  const cells = Math.ceil((2 * r) / w) + 2;
  const out: P[][] = [];
  for (let k = -n; k <= n; k++) {
    const row: P[] = [];
    const y0 = k * pitch - h / 2;
    // Alternate rows start half a cell over, like bricks.
    const x0 = -r - w - (k % 2 ? w / 2 : 0);
    for (let i = 0; i < cells; i++) {
      for (let j = i === 0 ? 0 : 1; j < m.pts.length; j++) {
        const [u, v] = m.pts[j];
        const x = x0 + (i + u) * w;
        const y = y0 + v * h;
        row.push([cx + x * c - y * s, cy + x * s + y * c]);
      }
    }
    out.push(row);
  }
  return out;
}

/** Motifs repeated along a path: cell length `w`, height `h` across the path. */
export function motifAlong(path: P[], closed: boolean, m: Motif, w: number, h: number): P[] {
  const pts = closed ? [...path, path[0]] : path;
  const cum = cumulative(pts);
  const total = cum[cum.length - 1];
  if (total < 1) return pts;
  const n = Math.max(1, Math.round(total / w));
  const cell = total / n;
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i === 0 ? 0 : 1; j < m.pts.length; j++) {
      const [u, v] = m.pts[j];
      const sAt = Math.min(total, (i + u) * cell);
      const p = pointAt(pts, cum, sAt);
      const q = pointAt(pts, cum, Math.min(total, sAt + 2));
      const back = pointAt(pts, cum, Math.max(0, sAt - 2));
      const d = norm(sub(q, back));
      const off = (v - 0.5) * h;
      out.push([p[0] - d[1] * off, p[1] + d[0] * off]);
    }
  }
  // Drop zero-length steps (motif points that land on each other).
  return out.filter((p, i) => i === 0 || dist(p, out[i - 1]) > 0.5);
}
