import { Fragment, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton, SegmentedControl } from '../../components/ui';
import { blockStarts } from '../../render/stitchRender';
import { CMD, type StitchPlan } from '../../model/types';
import { fmtClock, fmtInt, sewMinutes } from '../../model/units';
import { useEditor } from '../../store/editor';

export const SPEEDS = [1, 2, 5, 10, 20];

/** stitchAt[i] = number of STITCH commands in [0, i). */
export function stitchPrefix(plan: StitchPlan): Int32Array {
  const out = new Int32Array(plan.cmds.length + 1);
  for (let i = 0; i < plan.cmds.length; i++) out[i + 1] = out[i] + (plan.cmds[i] === CMD.STITCH ? 1 : 0);
  return out;
}

/** Smallest command count that includes `n` stitches. */
export function cmdForStitch(prefix: Int32Array, n: number): number {
  let lo = 0;
  let hi = prefix.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prefix[mid] < n) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Drives playback: advances `sim.position` (in stitches) in real time × speed. */
export function useSimulation(plan: StitchPlan | null) {
  const sim = useEditor((s) => s.sim);
  const spm = useEditor((s) => s.project?.spm ?? 800);
  const prefix = useMemo(() => (plan ? stitchPrefix(plan) : null), [plan]);
  const total = plan?.stitchCount ?? 0;
  const raf = useRef(0);
  useEffect(() => {
    if (!sim.active || !sim.playing || !prefix) return;
    let last = performance.now();
    let pos = useEditor.getState().sim.position;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      pos = Math.min(total, pos + (spm / 60) * sim.speed * dt);
      useEditor.getState().setSim({ position: pos, playing: pos < total });
      if (pos < total) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [sim.active, sim.playing, sim.speed, prefix, total, spm]);
  const stitchPos = Math.floor(sim.position);
  const cmd = prefix ? (stitchPos >= total ? plan!.cmds.length : cmdForStitch(prefix, stitchPos)) : 0;
  return { cmd, stitchPos, total, prefix };
}

export function SimulatorBar({ plan, stitchPos, cmd }: { plan: StitchPlan; stitchPos: number; cmd: number }) {
  const project = useEditor((s) => s.project)!;
  const sim = useEditor((s) => s.sim);
  const s = useEditor.getState();
  const spm = project.spm ?? 800;
  const total = plan.stitchCount;
  const prefix = useMemo(() => stitchPrefix(plan), [plan]);
  const starts = useMemo(() => blockStarts(plan), [plan]);
  const blockStitch = starts.map((c) => prefix[c]);
  const blockIdx = Math.max(0, blockStitch.findIndex((b, i) => stitchPos >= b && (i + 1 >= blockStitch.length || stitchPos < blockStitch[i + 1])));
  const thread = project.threads.find((t) => t.id === plan.colorBlocks[blockIdx]);
  const objIndex = cmd > 0 ? plan.obj[Math.min(cmd, plan.cmds.length) - 1] : plan.obj[0];
  const objName = project.objects[objIndex]?.name;
  const pct = total ? (stitchPos / total) * 100 : 0;

  const nextColor = () => {
    const next = blockStitch.find((b) => b > stitchPos);
    s.setSim({ position: next ?? total });
  };

  return (
    <div role="region" aria-label="Simulator controls" className="simbar">
      <div className="sim-row">
        <IconButton icon="restart" label="Restart" onClick={() => s.setSim({ position: 0, playing: true })} />
        <button className="play-btn" aria-label={sim.playing ? 'Pause' : 'Play'} onClick={() => s.setSim({ playing: !sim.playing, position: stitchPos >= total ? 0 : sim.position })}>
          <Icon name={sim.playing ? 'pause' : 'play'} />
        </button>
        <IconButton icon="skip-forward" label="Jump to next color" onClick={nextColor} />
        <span className="mono sim-time">{fmtClock(sewMinutes(stitchPos, spm))}</span>
        <div className="scrub">
          <div className="scrub-track" aria-hidden="true">
            {blockStitch.map((b, i) => {
              const end = i + 1 < blockStitch.length ? blockStitch[i + 1] : total;
              const hex = project.threads.find((t) => t.id === plan.colorBlocks[i])?.hex ?? '#888';
              const w = total ? ((end - b) / total) * 100 : 0;
              const sewn = Math.max(0, Math.min(end, stitchPos) - b);
              const sewnPct = end > b ? (sewn / (end - b)) * 100 : 0;
              return (
                <div key={i} className="scrub-seg" style={{ width: `${w}%`, background: hex }}>
                  <div className="scrub-unsewn" style={{ left: `${sewnPct}%` }} />
                </div>
              );
            })}
          </div>
          {blockStitch.slice(1).map((b, i) => (
            <div key={i} className="scrub-divider" style={{ left: `${(b / Math.max(1, total)) * 100}%` }} aria-hidden="true" />
          ))}
          <div className="scrub-thumb" style={{ left: `calc(${pct}% - 8px)` }} aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={total}
            value={stitchPos}
            aria-label="Stitch position"
            aria-valuetext={`${fmtInt(stitchPos)} of ${fmtInt(total)} stitches`}
            onChange={(e) => s.setSim({ position: Number(e.target.value), playing: false })}
          />
        </div>
        <span className="mono sim-total">{fmtClock(sewMinutes(total, spm))}</span>
      </div>
      <div className="sim-row wrap">
        <span className="chip sim-color">
          <span className="swatch-dot sm" style={{ background: thread?.hex }} />
          Color {blockIdx + 1} of {plan.colorBlocks.length} · {thread?.name}
          {objName ? ` · ${objName}` : ''}
        </span>
        <span className="mono sim-count">
          {fmtInt(stitchPos)} / {fmtInt(total)} stitches
        </span>
        <div className="spacer" />
        <span id="spd" className="meta">
          Speed
        </span>
        <SegmentedControl
          label="Speed"
          className="speed"
          value={String(sim.speed)}
          onChange={(v) => s.setSim({ speed: Number(v) })}
          options={SPEEDS.map((x) => ({ value: String(x), label: `${x}×` }))}
        />
        <IconButton icon="close" label="Close simulator" onClick={() => s.setSim({ active: false, playing: false })} />
      </div>
    </div>
  );
}

export function SimPanel({ plan, cmd }: { plan: StitchPlan; cmd: number }) {
  const project = useEditor((s) => s.project)!;
  const spm = project.spm ?? 800;
  const items = project.objects
    .map((o, i) => ({ o, st: plan.objectStats[i], i }))
    .filter((x) => x.o.visible && x.st && x.st.stitches > 0);
  return (
    <aside aria-label="Sewing progress" className="panel sim-panel">
      <section aria-labelledby="sewh">
        <div className="panel-head">
          <h2 id="sewh" className="label-caps">
            Sewing order
          </h2>
        </div>
        <ol className="sew-list">
          {items.map(({ o, st, i }, k) => {
            const hex = project.threads.find((t) => t.id === o.thread)?.hex;
            const done = cmd >= st.end;
            const now = !done && cmd > st.start;
            let sewn = 0;
            if (now) for (let c = st.start; c < cmd; c++) if (plan.cmds[c] === CMD.STITCH && plan.obj[c] === i) sewn++;
            const prev = items[k - 1];
            const colorChange = prev && prev.o.thread !== o.thread;
            const next = project.threads.find((t) => t.id === o.thread);
            return (
              <Fragment key={o.id}>
                {colorChange && (
                  <li className="machine-event">
                    <Icon name="close" small />
                    Trim · stop · change to {next?.name}
                  </li>
                )}
                <li className={`row sew-row${now ? ' sel now' : ''}${done ? ' done' : ''}`}>
                  {done ? (
                    <Icon name="check" small className="ok-icon" label="Sewn" />
                  ) : now ? (
                    <Icon name="play" small className="now-icon" label="Sewing now" />
                  ) : (
                    <Icon name="circle-empty" small className="pending-icon" label="Not sewn yet" />
                  )}
                  <span className="row-swatch" style={{ background: hex }} />
                  <span className="row-name">{o.name}</span>
                  <span className="mono row-count">{now ? `${fmtInt(sewn)} / ${fmtInt(st.stitches)}` : fmtInt(st.stitches)}</span>
                  {now && (
                    <div className="mini-progress" aria-hidden="true">
                      <div style={{ width: `${(sewn / st.stitches) * 100}%`, background: hex }} />
                    </div>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </section>
      <section aria-labelledby="runh" className="this-run">
        <h2 id="runh" className="label-caps">
          This run
        </h2>
        <div>
          <div className="meta">Color changes</div>
          <div className="mono run-val">{plan.colorChanges}</div>
        </div>
        <div>
          <div className="meta">Trims</div>
          <div className="mono run-val">{plan.trims}</div>
        </div>
        <div>
          <div className="meta">Jumps</div>
          <div className="mono run-val">{plan.jumps}</div>
        </div>
        <div>
          <div className="meta">Est. sew time</div>
          <div className="mono run-val">{Math.max(1, Math.round(sewMinutes(plan.stitchCount, spm)))} min</div>
        </div>
        <p className="meta run-note">Sew-time estimate assumes {spm} stitches per minute.</p>
      </section>
    </aside>
  );
}
