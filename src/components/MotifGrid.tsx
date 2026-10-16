import { MOTIFS } from '../engine/motifs';

/** Motif chooser: each motif drawn as two chained cells. */
export function MotifGrid({ value, onChange }: { value: string; onChange(id: string): void }) {
  return (
    <div className="motif-grid" role="radiogroup" aria-label="Motif">
      {MOTIFS.map((m) => {
        const h = m.aspect;
        const d = [0, 1]
          .map((i) => m.pts.map(([u, v], j) => `${i === 0 && j === 0 ? 'M' : 'L'}${(i + u).toFixed(3)} ${(v * h).toFixed(3)}`).join(''))
          .join('');
        return (
          <button key={m.id} type="button" role="radio" aria-checked={m.id === value} aria-label={m.name} title={m.name} className={`motif${m.id === value ? ' on' : ''}`} onClick={() => onChange(m.id)}>
            <svg viewBox={`-0.1 ${-0.1 - (1 - h) / 2} 2.2 1.2`} aria-hidden="true">
              <path d={d} fill="none" stroke="currentColor" strokeWidth={0.06} strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
