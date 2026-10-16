import { describe, expect, it } from 'vitest';
import { fmtClock, fmtLenCompact, fmtInt, fmtLen, fmtRelative, fromDisplay, sewMinutes, toDisplay } from './units';

describe('units', () => {
  it('converts 0.1 mm to mm and inches', () => {
    expect(toDisplay(1300, 'mm')).toBe(130);
    expect(toDisplay(254, 'in')).toBe(1);
    expect(fromDisplay(5, 'in')).toBe(1270);
    expect(fmtLen(824, 'mm')).toBe('82.4');
    expect(fmtLen(1270, 'in')).toBe('5.00');
    expect(fmtLenCompact(1300, 'mm')).toBe('130');
    expect(fmtLenCompact(1401, 'mm')).toBe('140.1');
  });
  it('formats counts, clocks and sew times', () => {
    expect(fmtInt(8412)).toBe('8,412');
    expect(sewMinutes(8000, 800)).toBe(10);
    expect(fmtClock(8.77)).toBe('08:46');
  });
  it('formats relative edit times', () => {
    const now = new Date('2026-10-16T12:00:00').getTime();
    expect(fmtRelative(now - 5_000, now)).toBe('Edited just now');
    expect(fmtRelative(now - 86_400_000, now)).toBe('Yesterday');
    expect(fmtRelative(new Date('2026-10-03T12:00:00').getTime(), now)).toBe('Oct 3');
  });
});
