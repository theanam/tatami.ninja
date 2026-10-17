import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOUR_STEPS } from './steps';
import { markTourSeen, TOUR_KEY, tourSeen } from './tourState';

describe('first-run tour state', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('is unseen until marked, then stays seen', () => {
    expect(tourSeen()).toBe(false);
    markTourSeen();
    expect(localStorage.getItem(TOUR_KEY)).toBe('1');
    expect(tourSeen()).toBe(true);
  });

  it('does not nag when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(tourSeen()).toBe(true);
  });

  it('every step has a picture except the closing one', () => {
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(8);
    expect(TOUR_STEPS.slice(0, -1).every((s) => s.image && s.alt && s.chips.length)).toBe(true);
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].image).toBeNull();
  });
});
