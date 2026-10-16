import { describe, expect, it } from 'vitest';
import { importSvg } from '../importers/svg';
import { LIBRARY, LIBRARY_CATEGORIES } from './library';
import { objectsBounds } from './transform';

describe('design library', () => {
  it('every item imports as stitch objects at its size', () => {
    expect(new Set(LIBRARY.map((i) => i.id)).size).toBe(LIBRARY.length);
    for (const c of LIBRARY_CATEGORIES) expect(LIBRARY.some((i) => i.category === c.id)).toBe(true);
    for (const item of LIBRARY) {
      const res = importSvg(item.svg, { hoop: { width: 1300, height: 1800 }, threads: [] });
      expect(res.objects.length, item.id).toBeGreaterThan(0);
      const b = objectsBounds(res.objects)!;
      const side = Math.max(b.maxX - b.minX, b.maxY - b.minY);
      expect(side, item.id).toBeGreaterThan(item.mm * 10 * 0.7);
      expect(side, item.id).toBeLessThan(item.mm * 10 * 1.05);
    }
  });
});
