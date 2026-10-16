/** SVG path data → flattened subpaths. Pure (no DOM). */

export type V = [number, number];
export interface Subpath {
  points: V[];
  closed: boolean;
}

/** 2D affine matrix [a, b, c, d, e, f] as in SVG. */
export type Matrix = [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function apply(m: Matrix, p: V): V {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

/** Parse an SVG transform attribute. */
export function parseTransform(s: string | null | undefined): Matrix {
  let m: Matrix = IDENTITY;
  if (!s) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(s))) {
    const args = (match[2].match(/-?[\d.]+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    let t: Matrix = IDENTITY;
    switch (match[1]) {
      case 'matrix':
        if (args.length === 6) t = args as Matrix;
        break;
      case 'translate':
        t = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
        break;
      case 'scale':
        t = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const a = ((args[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const [cx, cy] = [args[1] ?? 0, args[2] ?? 0];
        t = multiply(multiply([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = multiply(m, t);
  }
  return m;
}

const CMD_RE = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

function tokenize(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  let m: RegExpExecArray | null;
  CMD_RE.lastIndex = 0;
  while ((m = CMD_RE.exec(d))) out.push(m[1] ? m[1] : Number(m[2]));
  return out;
}

/**
 * Parse path data into flattened subpaths.
 * `tol` is the max chord error in user units.
 */
export function parsePath(d: string, tol = 0.25): Subpath[] {
  const toks = tokenize(d);
  const subs: Subpath[] = [];
  let cur: V = [0, 0];
  let start: V = [0, 0];
  let pts: V[] = [];
  let lastCtrl: V | null = null;
  let lastCmd = '';
  let i = 0;
  const num = () => {
    const v = toks[i++];
    if (typeof v !== 'number') throw new Error('Bad path data');
    return v;
  };
  const flush = (closed: boolean) => {
    if (pts.length > 1) subs.push({ points: pts, closed });
    pts = [];
  };
  let cmd = '';
  while (i < toks.length) {
    const t = toks[i];
    if (typeof t === 'string') {
      cmd = t;
      i++;
    } else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    else if (!cmd) throw new Error('Bad path data');
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const base: V = rel ? cur : [0, 0];
    switch (C) {
      case 'M': {
        flush(false);
        cur = [base[0] + num(), base[1] + num()];
        start = cur;
        pts = [cur];
        break;
      }
      case 'L':
        cur = [base[0] + num(), base[1] + num()];
        pts.push(cur);
        break;
      case 'H':
        cur = [(rel ? cur[0] : 0) + num(), cur[1]];
        pts.push(cur);
        break;
      case 'V':
        cur = [cur[0], (rel ? cur[1] : 0) + num()];
        pts.push(cur);
        break;
      case 'C': {
        const c1: V = [base[0] + num(), base[1] + num()];
        const c2: V = [base[0] + num(), base[1] + num()];
        const e: V = [base[0] + num(), base[1] + num()];
        if (!pts.length) pts = [cur];
        cubic(pts, cur, c1, c2, e, tol);
        lastCtrl = c2;
        cur = e;
        break;
      }
      case 'S': {
        const c1: V = lastCtrl && 'CS'.includes(lastCmd) ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
        const c2: V = [base[0] + num(), base[1] + num()];
        const e: V = [base[0] + num(), base[1] + num()];
        if (!pts.length) pts = [cur];
        cubic(pts, cur, c1, c2, e, tol);
        lastCtrl = c2;
        cur = e;
        break;
      }
      case 'Q': {
        const c: V = [base[0] + num(), base[1] + num()];
        const e: V = [base[0] + num(), base[1] + num()];
        if (!pts.length) pts = [cur];
        quad(pts, cur, c, e, tol);
        lastCtrl = c;
        cur = e;
        break;
      }
      case 'T': {
        const c: V = lastCtrl && 'QT'.includes(lastCmd) ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
        const e: V = [base[0] + num(), base[1] + num()];
        if (!pts.length) pts = [cur];
        quad(pts, cur, c, e, tol);
        lastCtrl = c;
        cur = e;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = num();
        const sweep = num();
        const e: V = [base[0] + num(), base[1] + num()];
        if (!pts.length) pts = [cur];
        arc(pts, cur, rx, ry, rot, !!large, !!sweep, e, tol);
        cur = e;
        break;
      }
      case 'Z':
        cur = start;
        flush(true);
        pts = [cur];
        break;
    }
    lastCmd = C;
    if (!'CSQT'.includes(C)) lastCtrl = null;
  }
  flush(false);
  return subs.map((s) => dedupeClosing(s));
}

function dedupeClosing(s: Subpath): Subpath {
  const p = s.points;
  if (p.length > 2) {
    const a = p[0];
    const b = p[p.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) return { points: p.slice(0, -1), closed: true };
  }
  return s;
}

function segmentsFor(len: number, tol: number): number {
  return Math.max(2, Math.min(200, Math.ceil(Math.sqrt(len / Math.max(tol, 1e-6)) * 1.2)));
}

function cubic(out: V[], p0: V, p1: V, p2: V, p3: V, tol: number) {
  const approx = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
  const n = segmentsFor(approx, tol);
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

function quad(out: V[], p0: V, p1: V, p2: V, tol: number) {
  const approx = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const n = segmentsFor(approx, tol);
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
}

/** Elliptical arc per the SVG implementation notes (endpoint → center parameterization). */
function arc(out: V[], p0: V, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, p1: V, tol: number) {
  if (rx === 0 || ry === 0) {
    out.push(p1);
    return;
  }
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let co = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) co = -co;
  const cx1 = (co * rx * y1) / ry;
  const cy1 = (-co * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = segmentsFor(Math.abs(dt) * Math.max(rx, ry), tol);
  for (let k = 1; k <= n; k++) {
    const t = t1 + (dt * k) / n;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    out.push([cos * x - sin * y + cx, sin * x + cos * y + cy]);
  }
}

export function ellipsePoints(cx: number, cy: number, rx: number, ry: number, tol = 0.25): V[] {
  const n = segmentsFor(2 * Math.PI * Math.max(rx, ry), tol) * 2;
  const pts: V[] = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return pts;
}

/** Remove points closer than `eps` to the previous one, and nearly collinear points. */
export function simplify(points: V[], eps: number): V[] {
  if (points.length < 3) return points;
  // Ramer–Douglas–Peucker.
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1;
    let bd = eps;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((points[i][0] - ax) * dy - (points[i][1] - ay) * dx) / l;
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Simplify a closed ring: split at the point farthest from the start, simplify both halves. */
export function simplifyRing(points: V[], eps: number): V[] {
  let pts = points;
  if (pts.length > 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) pts = pts.slice(0, -1);
  }
  if (pts.length < 4) return pts;
  let far = 0;
  let fd = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const first = simplify(pts.slice(0, far + 1), eps);
  const second = simplify([...pts.slice(far), pts[0]], eps);
  return [...first, ...second.slice(1, -1)];
}
