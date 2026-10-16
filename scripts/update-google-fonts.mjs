// Regenerates public/fonts/google-fonts.json from the Fontsource catalog of Google Fonts.
// Run with: node scripts/update-google-fonts.mjs
import { writeFileSync } from 'node:fs';

const res = await fetch('https://api.fontsource.org/v1/fonts?type=google');
if (!res.ok) throw new Error(`Fontsource API returned ${res.status}`);
const all = await res.json();
const CATEGORY = { 'sans-serif': 'sans', serif: 'serif', display: 'display', handwriting: 'script', monospace: 'mono' };

// Compact rows: [id, family, category, weights]. Latin-capable, upright styles, no icon fonts.
const rows = all
  .filter((f) => f.subsets.includes('latin') && f.styles.includes('normal') && CATEGORY[f.category])
  .sort((a, b) => a.family.localeCompare(b.family))
  .map((f) => [f.id, f.family, CATEGORY[f.category], f.weights]);

writeFileSync(new URL('../public/fonts/google-fonts.json', import.meta.url), JSON.stringify(rows));
console.log(`Wrote ${rows.length} fonts`);
