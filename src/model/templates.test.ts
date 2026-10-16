import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { generatePlan } from '../engine/plan';
import { checkWarnings } from '../engine/warnings';
import { LETTERING_FONTS, loadFont } from '../importers/lettering';
import { createFromTemplate, TEMPLATES } from './templates';

beforeAll(async () => {
  // Warm the font cache from disk (no network in tests).
  for (const f of LETTERING_FONTS) {
    await loadFont(f.id, async () => {
      const buf = readFileSync(resolve(__dirname, '../../public/lettering', f.file));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    });
  }
});

describe('templates', () => {
  for (const t of TEMPLATES) {
    it(`builds "${t.name}" that sews inside its hoop without warnings`, async () => {
      const p = await createFromTemplate(t.id);
      expect(p.objects.length).toBeGreaterThan(0);
      const plan = generatePlan(p);
      expect(plan.stitchCount).toBeGreaterThan(500);
      expect(checkWarnings(p, plan)).toEqual([]);
    });
  }
});
