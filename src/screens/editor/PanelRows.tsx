import { ParamRow } from '../../components/ui';
import { fromDisplay, toDisplay, type Units } from '../../model/units';

/** A length parameter shown in project units, stored in 0.1 mm. */
export function LenRow({
  label,
  value,
  min,
  max,
  step,
  units,
  onChange,
  name,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  units: Units;
  onChange(v: number): void;
  name: string;
}) {
  const d = (v: number) => toDisplay(v, units);
  return (
    <ParamRow
      label={label}
      value={d(value)}
      min={d(min)}
      max={d(max)}
      step={units === 'mm' ? step / 10 : step / 254}
      unit={units}
      decimals={units === 'mm' ? (step < 1 ? 2 : step < 10 ? 1 : 0) : 3}
      numLabel={`${name} in ${units === 'mm' ? 'millimetres' : 'inches'}`}
      onChange={(v) => onChange(fromDisplay(v, units))}
    />
  );
}
