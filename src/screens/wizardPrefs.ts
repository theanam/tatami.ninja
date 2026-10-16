import type { MachineBrand } from '../model/types';
import { FABRICS, HOOPS, MACHINES } from '../presets';

export interface WizardPrefs {
  machine: MachineBrand;
  hoopId: string;
  custom: { w: number; h: number };
  fabric: string;
  units: 'mm' | 'in';
}

const KEY = 'tatami.wizardPrefs';
export const DEFAULT_WIZARD: WizardPrefs = { machine: 'brother', hoopId: '130x180', custom: { w: 150, h: 150 }, fabric: 'cotton-twill', units: 'mm' };

/** The last New-design choices (machine, hoop, fabric, units), validated against current presets. */
export function loadWizardPrefs(): WizardPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<WizardPrefs> | null;
    if (!raw) return { ...DEFAULT_WIZARD };
    return {
      machine: MACHINES.some((m) => m.id === raw.machine) ? raw.machine! : DEFAULT_WIZARD.machine,
      hoopId: raw.hoopId === 'custom' || HOOPS.some((h) => h.id === raw.hoopId) ? raw.hoopId! : DEFAULT_WIZARD.hoopId,
      custom:
        raw.custom && raw.custom.w >= 30 && raw.custom.h >= 30 && raw.custom.w <= 600 && raw.custom.h <= 600 ? raw.custom : DEFAULT_WIZARD.custom,
      fabric: FABRICS.some((f) => f.id === raw.fabric) ? raw.fabric! : DEFAULT_WIZARD.fabric,
      units: raw.units === 'in' ? 'in' : 'mm',
    };
  } catch {
    return { ...DEFAULT_WIZARD };
  }
}

export function saveWizardPrefs(p: WizardPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* not remembered */
  }
}
