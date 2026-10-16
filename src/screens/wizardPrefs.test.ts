import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_WIZARD, loadWizardPrefs, saveWizardPrefs } from './wizardPrefs';

beforeEach(() => localStorage.clear());

describe('wizard preferences', () => {
  it('defaults when nothing was saved', () => {
    expect(loadWizardPrefs()).toEqual(DEFAULT_WIZARD);
  });

  it('remembers the last machine, hoop, fabric and units', () => {
    saveWizardPrefs({ machine: 'other', hoopId: 'custom', custom: { w: 120, h: 90 }, fabric: 'denim', units: 'in' });
    expect(loadWizardPrefs()).toEqual({ machine: 'other', hoopId: 'custom', custom: { w: 120, h: 90 }, fabric: 'denim', units: 'in' });
  });

  it('ignores unknown or broken values', () => {
    localStorage.setItem('tatami.wizardPrefs', JSON.stringify({ machine: 'toaster', hoopId: 'nope', fabric: 'silk', custom: { w: 1, h: 1 } }));
    expect(loadWizardPrefs()).toEqual(DEFAULT_WIZARD);
    localStorage.setItem('tatami.wizardPrefs', '{broken');
    expect(loadWizardPrefs()).toEqual(DEFAULT_WIZARD);
  });
});
