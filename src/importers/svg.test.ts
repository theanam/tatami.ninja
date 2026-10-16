import { describe, expect, it } from 'vitest';
import { geometryBounds } from '../engine/geom';
import { importSvg, parseColor } from './svg';
import { parsePath, parseTransform, simplify, simplifyRing } from './svgPath';

const hoop = { width: 1300, height: 1800 };

describe('svg path parsing', () => {
  it('parses absolute and relative lines and closes subpaths', () => {
    const subs = parsePath('M0 0 L10 0 l0 10 h-10 z');
    expect(subs).toHaveLength(1);
    expect(subs[0].closed).toBe(true);
    expect(subs[0].points).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
  });

  it('handles implicit lineto after moveto and multiple subpaths', () => {
    const subs = parsePath('M0,0 10,0 10,10 Z M20 20 30 20');
    expect(subs).toHaveLength(2);
    expect(subs[1].closed).toBe(false);
    expect(subs[1].points).toEqual([[20, 20], [30, 20]]);
  });

  it('flattens cubic curves through the end point', () => {
    const subs = parsePath('M0 0 C 0 10 10 10 10 0');
    const pts = subs[0].points;
    expect(pts.length).toBeGreaterThan(4);
    expect(pts[pts.length - 1][0]).toBeCloseTo(10);
    expect(Math.max(...pts.map((p) => p[1]))).toBeCloseTo(7.5, 0);
  });

  it('flattens arcs', () => {
    const pts = parsePath('M0 0 A 10 10 0 0 1 20 0')[0].points;
    expect(pts[pts.length - 1][0]).toBeCloseTo(20);
    expect(Math.min(...pts.map((p) => p[1]))).toBeCloseTo(-10, 0);
  });

  it('parses exponent numbers and compact syntax', () => {
    const pts = parsePath('M1e1-5L.5.5')[0].points;
    expect(pts).toEqual([[10, -5], [0.5, 0.5]]);
  });

  it('parses transforms', () => {
    expect(parseTransform('translate(10 20)')).toEqual([1, 0, 0, 1, 10, 20]);
    expect(parseTransform('scale(2)')).toEqual([2, 0, 0, 2, 0, 0]);
    const r = parseTransform('rotate(90)');
    expect(r[1]).toBeCloseTo(1);
  });

  it('simplifies closed rings without collapsing them', () => {
    const ring: [number, number][] = [];
    for (let i = 0; i <= 64; i++) ring.push([Math.cos((i / 64) * Math.PI * 2) * 100, Math.sin((i / 64) * Math.PI * 2) * 100]);
    const out = simplifyRing(ring, 0.5);
    expect(out.length).toBeGreaterThan(16);
    expect(out.length).toBeLessThan(65);
  });

  it('simplifies collinear points', () => {
    expect(simplify([[0, 0], [1, 0], [2, 0], [3, 0]], 0.1)).toEqual([[0, 0], [3, 0]]);
  });
});

describe('svg colors', () => {
  it('parses hex, short hex, rgb and names', () => {
    expect(parseColor('#abc')).toBe('#AABBCC');
    expect(parseColor('rgb(255, 0, 0)')).toBe('#FF0000');
    expect(parseColor('navy')).toBe('#000080');
    expect(parseColor('none')).toBeNull();
  });
});

describe('svg import', () => {
  it('turns filled shapes into tatami and strokes into run objects, centered in the hoop', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle id="badge" cx="50" cy="50" r="40" fill="#24357A"/>
      <path d="M30 50 L70 50" stroke="#D4A43A" stroke-width="1" fill="none"/>
    </svg>`;
    const res = importSvg(svg, { hoop, threads: [] });
    expect(res.objects.map((o) => o.type)).toEqual(['tatami', 'run']);
    expect(res.objects[0].name).toBe('Badge');
    expect(res.threads.map((t) => t.hex)).toEqual(['#24357A', '#D4A43A']);
    const b = geometryBounds(res.objects[0].geometry)!;
    expect(Math.abs(b.minX + b.maxX)).toBeLessThan(2);
    // Fits 60% of the 130 mm side.
    expect(b.maxX - b.minX).toBeGreaterThan(770);
    expect(b.maxX - b.minX).toBeLessThan(790);
  });

  it('keeps physical size when declared in mm', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="50mm" viewBox="0 0 50 50"><rect x="0" y="0" width="50" height="20" fill="red"/></svg>`;
    const res = importSvg(svg, { hoop, threads: [] });
    const b = geometryBounds(res.objects[0].geometry)!;
    expect(b.maxX - b.minX).toBe(500);
  });

  it('creates holes for even-odd and opposite-winding subpaths', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path fill-rule="evenodd" d="M0 0H100V100H0Z M25 25H75V75H25Z" fill="#000"/></svg>`;
    const res = importSvg(svg, { hoop, threads: [] });
    const g = res.objects[0].geometry;
    expect(g.kind).toBe('compound');
    if (g.kind === 'compound') expect(g.parts[0].holes?.length).toBe(1);
  });

  it('applies group transforms, inherited fills and CSS classes', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <style>.gold{fill:#D4A43A}</style>
      <g fill="#ff0000" transform="translate(10,0)"><rect width="10" height="10"/><rect class="gold" x="20" width="10" height="10"/></g>
    </svg>`;
    const res = importSvg(svg, { hoop, threads: [] });
    expect(res.threads.map((t) => t.hex)).toEqual(['#FF0000', '#D4A43A']);
  });

  it('makes thick strokes satin columns', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><path d="M10 50H90" stroke="#000" stroke-width="3" fill="none"/></svg>`;
    const res = importSvg(svg, { hoop, threads: [] });
    expect(res.objects[0].type).toBe('satin');
  });

  it('skips hidden and defs content', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><rect width="5" height="5"/></defs><rect width="5" height="5" display="none"/><rect width="10" height="10" fill="blue"/></svg>`;
    expect(importSvg(svg, { hoop, threads: [] }).objects).toHaveLength(1);
  });

  it('reuses existing threads with the same color', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#24357A"/></svg>`;
    const threads = [{ id: 't1', name: 'Navy', hex: '#24357A', chartCode: null }];
    const res = importSvg(svg, { hoop, threads });
    expect(res.threads).toBe(threads);
    expect(res.objects[0].thread).toBe('t1');
  });

  it('rejects invalid files', () => {
    expect(() => importSvg('<html></html>', { hoop, threads: [] })).toThrow();
    expect(() => importSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>', { hoop, threads: [] })).toThrow(/No shapes/);
  });
});
