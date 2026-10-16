import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Brand } from '../components/PageChrome';
import { NumberInput, SegmentedControl, SelectableCard, toast } from '../components/ui';
import { createProject } from '../model/project';
import type { MachineBrand } from '../model/types';
import { FABRICS, getFabric, getMachine, HOOPS, MACHINES } from '../presets';
import { persistNew } from './actions';

const FABRIC_SWATCH: Record<string, string> = {
  cotton: 'repeating-linear-gradient(0deg,rgba(0,0,0,.06) 0 1px,transparent 1px 3px),repeating-linear-gradient(90deg,rgba(0,0,0,.06) 0 1px,transparent 1px 3px),#E8E4DC',
  'cotton-twill': 'repeating-linear-gradient(-38deg,rgba(0,0,0,.09) 0 1px,transparent 1px 4px),#D9D2C3',
  denim: 'repeating-linear-gradient(-38deg,rgba(255,255,255,.14) 0 1px,transparent 1px 3px),#3E5A86',
  knit: 'repeating-linear-gradient(90deg,rgba(0,0,0,.12) 0 2px,transparent 2px 4px),#9AA5B1',
  fleece: 'radial-gradient(circle,rgba(255,255,255,.18) 1px,transparent 1.6px) 0 0/5px 5px,#A8475A',
  towel: 'radial-gradient(circle,rgba(0,0,0,.12) 1px,transparent 1.8px) 0 0/4px 4px,#F0EDE6',
  felt: '#5C7F5C',
  canvas: 'repeating-linear-gradient(0deg,rgba(0,0,0,.1) 0 2px,transparent 2px 4px),repeating-linear-gradient(90deg,rgba(0,0,0,.08) 0 2px,transparent 2px 4px),#C9B999',
};

export function Wizard() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [machine, setMachine] = useState<MachineBrand>('brother');
  const [hoopId, setHoopId] = useState('130x180');
  const [custom, setCustom] = useState({ w: 150, h: 150 });
  const [fabric, setFabric] = useState('cotton-twill');
  const [units, setUnits] = useState<'mm' | 'in'>('mm');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    document.title = 'New design — tatami.ninja';
  }, []);

  const m = getMachine(machine);
  const f = getFabric(fabric);
  const hoop =
    hoopId === 'custom'
      ? { id: 'custom', width: Math.round(custom.w * 10), height: Math.round(custom.h * 10) }
      : (({ id, width, height }) => ({ id, width, height }))(HOOPS.find((h) => h.id === hoopId)!);

  const create = async () => {
    setBusy(true);
    try {
      const id = await persistNew(createProject({ name, machine, hoop, fabric, units }));
      navigate(`/design/${id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      setBusy(false);
    }
  };

  return (
    <div className="page-shell">
      <header className="page-header">
        <Brand />
        <div className="spacer" />
        <ol aria-label="Steps" className="steps">
          {['Machine', 'Hoop', 'Fabric'].map((s, i) => (
            <li key={s}>
              {i > 0 && <span className="step-line" aria-hidden="true" />}
              <span className="step-num">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <div className="spacer" />
        <Link to="/" aria-label="Close" className="tb">
          <Icon name="close" />
        </Link>
      </header>
      <div className="wizard">
        <main className="wizard-main">
          <div>
            <h1 className="wizard-title">New design</h1>
            <p className="wizard-sub">
              Pick your machine, hoop and fabric. tatami.ninja sets stitch density, underlay and file format for you — you can change any of it later.
            </p>
          </div>
          <section aria-labelledby="mh" className="wizard-section">
            <h2 id="mh">1 · Machine</h2>
            <div className="opt-grid machines">
              {MACHINES.map((mc) => (
                <SelectableCard key={mc.id} selected={machine === mc.id} onSelect={() => setMachine(mc.id)}>
                  <Icon name={mc.id === 'commercial' ? 'commercial' : mc.id === 'other' ? 'help' : 'machine'} className="muted-icon" />
                  <span className="opt-title">{mc.name}</span>
                  <span className="meta">{mc.hint}</span>
                </SelectableCard>
              ))}
            </div>
          </section>
          <section aria-labelledby="hh" className="wizard-section">
            <h2 id="hh">2 · Hoop</h2>
            <div className="opt-grid hoops">
              {HOOPS.map((h) => {
                const k = 66 / 3000;
                return (
                  <SelectableCard key={h.id} selected={hoopId === h.id} onSelect={() => setHoopId(h.id)} className="center">
                    <div className="hoop-preview">
                      <div style={{ width: Math.max(22, h.width * k), height: Math.max(22, h.height * k) }} />
                    </div>
                    <span className="opt-title mono">
                      {h.width / 10} × {h.height / 10}
                    </span>
                    <span className="meta">
                      {h.label} · {h.inches}
                    </span>
                  </SelectableCard>
                );
              })}
              <SelectableCard selected={hoopId === 'custom'} onSelect={() => setHoopId('custom')} className="center">
                <div className="hoop-preview">
                  <div className="custom">
                    <Icon name="plus" small />
                  </div>
                </div>
                <span className="opt-title">Custom</span>
                <span className="meta">Enter width × height</span>
              </SelectableCard>
            </div>
            {hoopId === 'custom' && (
              <div className="custom-hoop">
                <label>
                  Width
                  <NumberInput label="Custom hoop width in millimetres" value={custom.w} min={30} max={600} decimals={0} unit="mm" onChange={(w) => setCustom({ ...custom, w })} />
                </label>
                <label>
                  Height
                  <NumberInput label="Custom hoop height in millimetres" value={custom.h} min={30} max={600} decimals={0} unit="mm" onChange={(h) => setCustom({ ...custom, h })} />
                </label>
              </div>
            )}
          </section>
          <section aria-labelledby="fh" className="wizard-section">
            <h2 id="fh">3 · Fabric</h2>
            <div className="opt-grid fabrics">
              {FABRICS.map((fb) => (
                <SelectableCard key={fb.id} selected={fabric === fb.id} onSelect={() => setFabric(fb.id)}>
                  <div className="swatch" style={{ background: FABRIC_SWATCH[fb.id] }} />
                  <span className="opt-title sm">{fb.name}</span>
                  <span className="meta">{fb.hint}</span>
                </SelectableCard>
              ))}
            </div>
          </section>
        </main>
        <aside aria-labelledby="sumh" className="setup">
          <h2 id="sumh">Your setup</h2>
          <div className="field">
            <label htmlFor="dname">Design name</label>
            <input id="dname" className="input tall" placeholder="Untitled design" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <dl className="summary">
            <dt>Machine</dt>
            <dd>{m.name}</dd>
            <dt>File format</dt>
            <dd className="mono">{m.format ?? 'Choose at export'}</dd>
            <dt>Hoop</dt>
            <dd className="mono">
              {units === 'mm' ? `${hoop.width / 10} × ${hoop.height / 10} mm` : `${(hoop.width / 254).toFixed(1)} × ${(hoop.height / 254).toFixed(1)} in`}
            </dd>
            <dt>Fabric</dt>
            <dd>{f.name}</dd>
          </dl>
          <div className="units-row">
            <span id="uh">Units</span>
            <SegmentedControl<'mm' | 'in'>
              label="Units"
              tall
              value={units}
              onChange={setUnits}
              options={[
                { value: 'mm', label: 'mm' },
                { value: 'in', label: 'in' },
              ]}
            />
          </div>
          <p className="note">{f.note}</p>
          <button className="btn pri cta block" onClick={create} disabled={busy}>
            Create design
            <Icon name="arrow-right" />
          </button>
          <Link to="/" className="cancel-link">
            Cancel
          </Link>
        </aside>
      </div>
    </div>
  );
}
