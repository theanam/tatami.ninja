import { memo, useMemo } from 'react';
import { offsetAreas } from '../../engine/clip';
import { areasOf, pathsOf, principalAngle, type P } from '../../engine/geom';
import { resolveParams } from '../../engine/objects';
import { OPEN_PATTERNS, patternLines } from '../../engine/patterns';
import { columnFromPath, columnFromRails } from '../../engine/satin';
import type { StitchObject } from '../../model/types';
import { geometryPath } from './canvasMath';

const LINE = 'rgba(255,255,255,.26)';
const LINE_DARK = 'rgba(0,0,0,.28)';

/** Lines across a satin column every `step` world units. */
function rungs(a: P[], b: P[], step: number, sample: number): string {
  const every = Math.max(1, Math.round(step / sample));
  let d = '';
  for (let i = 0; i < a.length; i += every) d += `M${a[i][0].toFixed(1)} ${a[i][1].toFixed(1)}L${b[i][0].toFixed(1)} ${b[i][1].toFixed(1)}`;
  return d;
}

/**
 * How an object looks in the Artwork and Objects views: its thread color plus a cheap,
 * instant picture of its stitch type, so changing type, angle or density shows right away
 * without waiting for (or computing) real stitches.
 */
export const ObjectArt = memo(function ObjectArt({
  o,
  color,
  fabricId,
  scale,
}: {
  o: StitchObject;
  color: string;
  fabricId: string;
  /** Screen px per world unit (for dash lengths). */
  scale: number;
}) {
  const r = resolveParams(o, fabricId);
  const g = o.geometry;
  const d = useMemo(() => geometryPath(g), [g]);
  const pid = `art-${o.id}`;

  // Contour rings and satin rungs depend only on geometry and spacing: memoize them.
  const contour = useMemo(() => {
    if (o.type !== 'contour') return '';
    const areas = areasOf(g);
    const step = Math.max(10, r.contourSpacing * 5);
    let out = '';
    let cur = offsetAreas(areas, -step / 2);
    for (let k = 0; k < 60 && cur.length; k++) {
      for (const a of cur) for (const ring of [a.outer, ...a.holes]) out += `M${ring.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}Z`;
      cur = offsetAreas(cur, -step);
    }
    return out;
  }, [o.type, g, r.contourSpacing]);

  const pattern = useMemo(() => {
    if (o.type !== 'tatami' || r.fillPattern === 'rows') return '';
    const open = OPEN_PATTERNS.includes(r.fillPattern);
    const spacing = open ? r.patternSpacing : Math.max(10, r.rowSpacing * 5);
    return patternLines(areasOf(g), { pattern: r.fillPattern, spacing, angleDeg: r.angleDeg })
      .map((l) => `M${l.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}`)
      .join('');
  }, [o.type, g, r.fillPattern, r.patternSpacing, r.rowSpacing, r.angleDeg]);

  const satin = useMemo(() => {
    if (o.type !== 'satin' && o.type !== 'applique') return null;
    const step = Math.max(6, r.density * 3);
    if (o.type === 'satin' && g.kind === 'satin') {
      const col = columnFromRails(g.railA, g.railB);
      return { rungs: rungs(col.a, col.b, step, 2) };
    }
    if (o.type === 'satin' && g.kind === 'polyline') {
      const path = pathsOf(g)[0];
      const col = columnFromPath(path.points, false, r.width);
      const band = `M${col.a.map((p) => p.join(' ')).join('L')}L${[...col.b].reverse().map((p) => p.join(' ')).join('L')}Z`;
      return { band, rungs: rungs(col.a, col.b, step, 10) };
    }
    if (o.type === 'applique') {
      let band = '';
      let rg = '';
      for (const path of pathsOf(g)) {
        const col = columnFromPath(path.points, true, r.width);
        band += `M${col.a.map((p) => p.join(' ')).join('L')}Z M${col.b.map((p) => p.join(' ')).join('L')}Z`;
        rg += rungs(col.a, col.b, step, 10);
      }
      return { band, rungs: rg };
    }
    // Satin on a closed shape: stitches cross each part's short direction.
    return {
      angles: areasOf(g).map((a) => ((principalAngle(a.outer) + Math.PI / 2) * 180) / Math.PI),
    };
  }, [o.type, g, r.density, r.width]);

  if (g.kind === 'stitches') {
    return <path d={d} fill="none" stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />;
  }

  if (o.type === 'run') {
    const dash = Math.max(2, r.stitchLength * scale);
    return (
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={r.repeats >= 3 ? 3 : 1.6}
        strokeDasharray={`${dash * 0.82} ${Math.max(1.5, dash * 0.18)}`}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        fillRule="evenodd"
        data-type="run"
      />
    );
  }

  if (o.type === 'satin' && g.kind === 'polyline' && satin?.band) {
    return (
      <g data-type="satin">
        <path d={satin.band} fill={color} />
        <path d={satin.rungs} stroke={LINE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </g>
    );
  }

  if (o.type === 'applique') {
    return (
      <g data-type="applique">
        <pattern id={`${pid}-fab`} patternUnits="userSpaceOnUse" width={30} height={30} patternTransform="rotate(45)">
          <path d="M0 15H30M15 0V30" stroke={LINE_DARK} strokeWidth={3} />
        </pattern>
        <path d={d} fill={color} fillOpacity={0.55} fillRule="evenodd" />
        <path d={d} fill={`url(#${pid}-fab)`} fillRule="evenodd" />
        {satin?.band && <path d={satin.band} fill={color} fillRule="evenodd" />}
        {satin?.rungs && <path d={satin.rungs} stroke={LINE} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        <path d={d} fill="none" stroke="#fff" strokeOpacity={0.6} strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </g>
    );
  }

  if (o.type === 'contour') {
    return (
      <g data-type="contour">
        <path d={d} fill={color} fillRule="evenodd" />
        <path d={contour} fill="none" stroke={LINE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </g>
    );
  }

  if (o.type === 'satin') {
    if (g.kind === 'satin') {
      return (
        <g data-type="satin">
          <path d={d} fill={color} fillRule="evenodd" />
          <path d={satin?.rungs} stroke={LINE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </g>
      );
    }
    const spacing = Math.max(6, r.density * 3);
    const angle = satin?.angles?.[0] ?? 90;
    return (
      <g data-type="satin">
        <pattern id={`${pid}-sat`} patternUnits="userSpaceOnUse" width={200} height={spacing} patternTransform={`rotate(${angle})`}>
          <path d={`M0 ${spacing / 2}H200`} stroke={LINE} strokeWidth={Math.max(1, spacing * 0.3)} />
        </pattern>
        <path d={d} fill={color} fillRule="evenodd" />
        <path d={d} fill={`url(#${pid}-sat)`} fillRule="evenodd" />
      </g>
    );
  }

  if (pattern) {
    return (
      <g data-type="tatami" data-pattern={r.fillPattern}>
        <clipPath id={`${pid}-clip`}>
          <path d={d} fillRule="evenodd" />
        </clipPath>
        <path d={d} fill={color} fillRule="evenodd" />
        <path d={pattern} fill="none" stroke={LINE} strokeWidth={1} vectorEffect="non-scaling-stroke" clipPath={`url(#${pid}-clip)`} />
      </g>
    );
  }

  // Tatami: rows at the fill angle, spaced in proportion to the row spacing.
  const spacing = Math.max(8, r.rowSpacing * 5);
  return (
    <g data-type="tatami">
      <pattern id={`${pid}-tat`} patternUnits="userSpaceOnUse" width={spacing * 8} height={spacing} patternTransform={`rotate(${-r.angleDeg})`}>
        <path d={`M0 ${spacing / 2}H${spacing * 8}`} stroke={LINE} strokeWidth={Math.max(1, spacing * 0.28)} />
      </pattern>
      <path d={d} fill={color} fillRule="evenodd" />
      <path d={d} fill={`url(#${pid}-tat)`} fillRule="evenodd" />
    </g>
  );
});
