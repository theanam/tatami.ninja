/**
 * Screenshots for the first-run tour (public/tour/*.jpg), taken from the real app.
 * Run: npx playwright test -c playwright.tour.config.ts
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseFile, makePng, openSample, withoutFilePickers } from '../e2e/helpers';

const OUT = new URL('../../public/tour/', import.meta.url).pathname;
const sample = JSON.parse(readFileSync(new URL('../../src/model/harbor-club-badge.tatami.json', import.meta.url), 'utf8'));

async function shot(target: Page | Locator, name: string) {
  await target.screenshot({ path: `${OUT}${name}`, type: 'jpeg', quality: 82 });
}

async function settle(page: Page, ms = 2500) {
  await expect(page.locator('.statusbar')).toContainText(/[1-9][\d,]* stitches/);
  await page.waitForTimeout(ms);
}

async function realistic(page: Page) {
  await page.getByRole('button', { name: 'Realistic' }).click();
  await page.keyboard.press('Escape');
  await page.locator('.canvas-wrap').click({ position: { x: 20, y: 20 } });
}

/** Open a design built from JSON through Home → Open file. */
async function openDesign(page: Page, project: object) {
  await withoutFilePickers(page);
  await page.goto('/');
  await chooseFile(page, () => page.getByRole('button', { name: 'Open file' }).click(), {
    name: 'tour.xtatami',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.waitForURL(/#\/design\//);
}

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1440, height: 900 } });

test('welcome: the sample in realistic thread', async ({ page }) => {
  await openSample(page);
  await realistic(page);
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: /Zoom in/ }).click();
  await page.mouse.move(5, 5);
  await settle(page);
  await shot(page.locator('.canvas-cell'), 'welcome.jpg');
});

test('artwork: the editor with objects', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.locator('.seq-list .row').filter({ hasText: 'Star' }).click();
  await settle(page, 1200);
  await shot(page, 'artwork.jpg');
});

test('trace: cross stitch from a picture', async ({ page }) => {
  await openSample(page);
  // A sunset: sky gradient, sun, two hills.
  const png = makePng(200, 150, (x, y) => {
    const hill1 = y > 100 - 25 * Math.sin((x / 200) * Math.PI);
    const hill2 = y > 120 - 18 * Math.sin((x / 200) * Math.PI * 2 + 1);
    if (hill2) return [40, 70, 50];
    if (hill1) return [70, 110, 70];
    if ((x - 140) ** 2 + (y - 60) ** 2 < 22 ** 2) return [250, 210, 90];
    const t = y / 100;
    return [Math.round(240 - 60 * t), Math.round(140 + 40 * t), Math.round(90 + 120 * t)];
  });
  await page.getByRole('button', { name: 'Design menu' }).click();
  await chooseFile(page, () => page.getByRole('menuitem', { name: /Import artwork/ }).click(), { name: 'sunset.png', mimeType: 'image/png', buffer: png });
  const dialog = page.getByRole('dialog', { name: 'Trace image' });
  await dialog.getByRole('group', { name: 'Trace mode' }).getByRole('button', { name: 'Cross stitch' }).click();
  await dialog.getByLabel('Number of colors').fill('5');
  await dialog.getByLabel('Number of colors').press('Enter');
  await expect(dialog.getByText(/colors of cross stitch/)).toBeVisible();
  await page.waitForTimeout(800);
  await shot(dialog, 'trace.jpg');
});

test('stitches: a gallery of fill patterns', async ({ page }) => {
  const colors = ['#24357A', '#2E7DAF', '#C8323C', '#2F7D5B', '#D4A43A', '#7A4BA8'];
  const patterns: [string, object][] = [
    ['Radial', { fillPattern: 'radial' }],
    ['Spiral', { fillPattern: 'spiral' }],
    ['Diamonds', { fillPattern: 'motif', motif: 'diamond', motifSize: 60 }],
    ['Stipple', { fillPattern: 'stipple', patternSpacing: 25 }],
    ['Cross stitch', { fillPattern: 'x-stitch', patternSpacing: 25 }],
    ['Net', { fillPattern: 'net', patternSpacing: 30 }],
  ];
  const S = 340;
  const G = 40;
  const objects = patterns.map(([name, params], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = (col - 1) * (S + G) + G / 2 + (col === 0 ? 0 : 0);
    const y = (row - 1.5) * (S + G) + G / 2;
    const x0 = col === 0 ? -S - G / 2 : G / 2;
    return {
      id: `p${i}`,
      name,
      type: 'tatami',
      thread: `t${i}`,
      visible: true,
      locked: false,
      geometry: { kind: 'polygon', points: [[x0, y], [x0 + S, y], [x0 + S, y + S], [x0, y + S]].map(([a, b]) => [Math.round(a), Math.round(b)]) },
      params: { angleDeg: 30, ...params },
      advanced: { underlay: 'none' },
      _x: x,
    };
  });
  await openDesign(page, {
    ...sample,
    name: 'Fill patterns',
    threads: colors.map((hex, i) => ({ id: `t${i}`, name: hex, hex, chartCode: null })),
    objects: objects.map(({ _x, ...o }) => o),
  });
  await realistic(page);
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: /Zoom in/ }).click();
  await page.mouse.move(5, 5);
  await settle(page, 3000);
  await shot(page.locator('.canvas-cell'), 'stitches.jpg');
});

test('lettering: text around a circle and a monogram', async ({ page }) => {
  await page.goto('/#/new');
  await page.getByRole('button', { name: /100 × 100/ }).click();
  await page.getByRole('button', { name: 'Create design' }).click();
  await page.getByRole('button', { name: 'Start with a blank canvas' }).click();
  await page.keyboard.press('t');
  const b = (await page.locator('.canvas-wrap canvas').first().boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  const edit = page.getByLabel('Edit text');
  await edit.fill('STITCHED WITH CARE · MADE BY HAND · ');
  await edit.press('Enter');
  const l = page.getByRole('group', { name: 'Lettering' });
  const h = l.getByLabel('Letter height in millimetres');
  await h.fill('7');
  await h.press('Enter');
  await l.getByLabel('Baseline').selectOption('circle');
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.locator('.canvas-wrap').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('t');
  const mono = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Monogram' }) });
  await mono.getByLabel('Initials').fill('ATN');
  await mono.getByLabel('Monogram height in millimetres').fill('22');
  await mono.getByLabel('Monogram height in millimetres').press('Enter');
  await mono.getByRole('button', { name: 'Add monogram' }).click();
  await expect(page.locator('.seq-list .row')).toHaveCount(4);
  await page.keyboard.press('ControlOrMeta+a');
  await page.getByRole('button', { name: 'Align centers' }).click();
  await page.getByRole('button', { name: 'Align middles' }).click();
  // As one group, aligning centers it in the hoop.
  await page.keyboard.press('ControlOrMeta+g');
  await page.getByRole('button', { name: 'Align centers' }).click();
  await page.getByRole('button', { name: 'Align middles' }).click();
  await realistic(page);
  await settle(page, 3000);
  await shot(page.locator('.canvas-cell'), 'lettering.jpg');
});

test('arrange: echo lines and a stipple background', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('ControlOrMeta+a');
  await page.getByRole('button', { name: 'Add echo lines' }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.getByRole('button', { name: 'Fill the hoop around the selection' }).click();
  await realistic(page);
  await settle(page, 3000);
  await shot(page.locator('.canvas-cell'), 'arrange.jpg');
});

test('preview: the simulator part way through', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Simulate' }).click();
  const bar = page.getByRole('region', { name: 'Simulator controls' });
  await bar.getByRole('button', { name: 'Pause' }).click();
  const scrub = bar.getByLabel('Stitch position');
  const total = Number(await scrub.getAttribute('max'));
  await scrub.fill(String(Math.round(total * 0.72)));
  await page.waitForTimeout(1500);
  await shot(page, 'preview.jpg');
});

test('export: the export dialog', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export design' });
  await expect(dialog.locator('.ex-thumb')).toBeVisible();
  await page.waitForTimeout(2000);
  await shot(dialog, 'export.jpg');
});
