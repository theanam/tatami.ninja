import { useLayoutEffect, useRef, useState } from 'react';
import { useEditor } from '../../store/editor';

/** Pick tick spacing (mm) so minor ticks are at least ~6 px apart. */
export function tickSteps(pxPerMm: number): { minor: number; major: number; label: number } {
  const candidates = [1, 5, 10, 50, 100, 500];
  const minor = candidates.find((c) => c * pxPerMm >= 6) ?? 500;
  const major = minor === 1 ? 5 : minor * 2;
  const label = [10, 20, 50, 100, 200, 500, 1000].find((c) => c * pxPerMm >= 48) ?? 1000;
  return { minor, major, label };
}

function Ruler({ axis }: { axis: 'x' | 'y' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [len, setLen] = useState(0);
  const zoom = useEditor((s) => s.zoom);
  const pan = useEditor((s) => s.pan);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLen(axis === 'x' ? el.clientWidth : el.clientHeight));
    ro.observe(el);
    setLen(axis === 'x' ? el.clientWidth : el.clientHeight);
    return () => ro.disconnect();
  }, [axis]);
  const center = len / 2 + (axis === 'x' ? pan.x : pan.y);
  const { minor, major, label } = tickSteps(zoom);
  const start = Math.floor(-center / zoom / minor) * minor;
  const end = Math.ceil((len - center) / zoom / minor) * minor;
  const ticks: JSX.Element[] = [];
  for (let mm = start; mm <= end; mm += minor) {
    const p = Math.round(center + mm * zoom) + 0.5;
    const isMajor = Math.abs(mm % major) < 1e-9;
    const t = isMajor ? 9 : 5;
    ticks.push(
      axis === 'x' ? (
        <line key={mm} x1={p} x2={p} y1={20 - t} y2={20} stroke={isMajor ? 'var(--sb-ruler-major)' : 'var(--sb-ruler-minor)'} />
      ) : (
        <line key={mm} y1={p} y2={p} x1={20 - t} x2={20} stroke={isMajor ? 'var(--sb-ruler-major)' : 'var(--sb-ruler-minor)'} />
      ),
    );
    if (Math.abs(mm % label) < 1e-9 && mm !== 0) {
      ticks.push(
        axis === 'x' ? (
          <text key={`t${mm}`} x={p + 2} y={9} className="ruler-label">
            {mm}
          </text>
        ) : (
          <text key={`t${mm}`} x={9} y={p - 2} className="ruler-label" transform={`rotate(-90 9 ${p - 2})`}>
            {mm}
          </text>
        ),
      );
    }
  }
  return (
    <div ref={ref} className={`ruler ruler-${axis}`} aria-hidden="true">
      <svg width={axis === 'x' ? len : 20} height={axis === 'x' ? 20 : len}>
        {ticks}
      </svg>
    </div>
  );
}

export function RulerX() {
  return <Ruler axis="x" />;
}
export function RulerY() {
  return <Ruler axis="y" />;
}
