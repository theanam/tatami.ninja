import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseFile, LOGO_SVG, makePng, openSample, withoutFilePickers } from './helpers';

const stitchTotal = async (page: Page) => Number((await page.locator('.statusbar .chip').first().innerText()).replace(/[^\d]/g, ''));

test.describe('editor', () => {
  test('switches views and edits object properties with undo/redo', async ({ page }) => {
    await openSample(page);
    for (const v of ['Artwork', 'Objects', 'Stitches', 'Realistic']) {
      await page.getByRole('group', { name: 'View' }).getByRole('button', { name: v }).click();
      await expect(page.getByRole('group', { name: 'View' }).getByRole('button', { name: v })).toHaveAttribute('aria-pressed', 'true');
    }
    await page.locator('.row', { hasText: 'Badge fill' }).click();
    await expect(page.getByRole('region', { name: 'Properties' })).toContainText('Badge fill');
    // Global settings are not repeated per object; they stay in the Design section.
    await expect(page.getByRole('region', { name: 'Properties' }).getByText('Fabric', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Design' }).getByLabel('Fabric', { exact: true })).toBeVisible();
    const angle = page.getByLabel('Angle in degrees');
    await expect(angle).toHaveValue('45');
    await angle.fill('90');
    await angle.press('Enter');
    await expect(page.locator('.topbar[data-save-state="saved"]')).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(angle).toHaveValue('45');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(angle).toHaveValue('90');
    await page.getByRole('group', { name: 'Stitch type' }).getByRole('button', { name: 'Contour' }).click();
    await expect(page.getByLabel('Contour spacing in millimetres')).toBeVisible();
  });

  test('hides, locks and reorders objects', async ({ page }) => {
    await openSample(page);
    const before = await stitchTotal(page);
    await page.getByRole('button', { name: 'Hide Inner ring' }).click();
    await expect.poll(() => stitchTotal(page)).toBeLessThan(before);
    await page.getByRole('button', { name: 'Show Inner ring' }).click();
    await page.getByRole('button', { name: 'Lock Star' }).click();
    await expect(page.getByRole('button', { name: 'Unlock Star' })).toBeVisible();
    await page.locator('.row', { hasText: 'Star' }).click();
    await expect(page.getByRole('region', { name: 'Properties' }).getByText('Locked', { exact: true })).toBeVisible();
    // Move Border up with Alt+ArrowUp.
    await page.locator('.row', { hasText: 'Border' }).click();
    await page.keyboard.press('Alt+ArrowUp');
    const names = await page.locator('.row .row-name').allInnerTexts();
    expect(names.indexOf('Border')).toBeLessThan(names.indexOf('Star'));
    await page.getByRole('button', { name: 'Auto-order by color' }).click();
  });

  test('renames objects and the design, and autosaves across reloads', async ({ page }) => {
    await openSample(page);
    await page.locator('.row-name', { hasText: 'Star' }).dblclick();
    await page.getByLabel('Object name').fill('Gold star');
    await page.getByLabel('Object name').press('Enter');
    await page.getByRole('button', { name: 'Harbor Club Badge' }).click();
    await page.getByLabel('Design name').fill('Harbor Badge v2');
    await page.getByLabel('Design name').press('Enter');
    await expect(page.locator('.topbar[data-save-state="saved"]')).toHaveCount(1);
    await page.reload();
    await expect(page.getByText('Gold star')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Harbor Badge v2' })).toBeVisible();
  });

  test('recolors threads and assigns threads to the selection', async ({ page }) => {
    await openSample(page);
    await page.locator('.thread-chip', { hasText: 'Gold' }).dblclick();
    await page.getByRole('dialog', { name: /Edit thread Gold/ }).getByLabel('Name').fill('Sun');
    await page.getByRole('dialog', { name: /Edit thread/ }).getByLabel(/Madeira #/).fill('1024');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('.thread-chip', { hasText: 'Sun' })).toBeVisible();
    await page.locator('.row', { hasText: 'Star' }).click();
    await page.locator('.thread-chip', { hasText: 'Navy' }).click();
    // Navy, Gold, Navy (star), Gold: four color blocks now.
    await expect(page.locator('.block-head')).toHaveCount(4);
  });

  test('the thread picker in Properties shows thread colors and works with the keyboard', async ({ page }) => {
    await openSample(page);
    await page.locator('.row', { hasText: 'Star' }).click();
    const picker = page.getByRole('region', { name: 'Properties' }).getByRole('button', { name: 'Thread: Gold' });
    await expect(picker.locator('.swatch-dot')).toHaveCSS('background-color', 'rgb(212, 164, 58)');
    await picker.click();
    const list = page.getByRole('listbox', { name: 'Thread' });
    await expect(list.getByRole('option')).toHaveCount(2);
    await expect(list.getByRole('option', { name: /Navy/ }).locator('.swatch-dot')).toHaveCSS('background-color', 'rgb(36, 53, 122)');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Properties' }).getByRole('button', { name: 'Thread: Navy' })).toBeVisible();
    // Multi-selection with different threads shows "Mixed".
    await page.locator('.row', { hasText: 'Border' }).click({ modifiers: ['Shift'] });
    await expect(page.getByRole('button', { name: 'Thread: mixed' })).toBeVisible();
  });

  test('threads can be edited and removed from the strip', async ({ page }) => {
    await openSample(page);
    // Edit via the pencil button.
    await page.getByRole('button', { name: 'Edit Navy' }).click();
    await page.getByRole('dialog', { name: /Edit thread Navy/ }).getByLabel('Name').fill('Midnight');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('.thread-chip', { hasText: 'Midnight' })).toBeVisible();
    // An unused thread is removed straight away.
    await page.getByRole('button', { name: 'Add thread color' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('.thread-chip')).toHaveCount(3);
    const added = (await page.locator('.thread-chip').nth(2).innerText()).replace(/^\d+ · /, '');
    await page.getByRole('button', { name: `Remove ${added}` }).click();
    await expect(page.locator('.thread-chip')).toHaveCount(2);
    // A used thread asks for a replacement.
    await page.getByRole('button', { name: 'Remove Gold' }).click();
    const dlg = page.getByRole('dialog', { name: /Edit thread Gold/ });
    await expect(dlg.getByText('3 objects use Gold')).toBeVisible();
    await dlg.getByRole('button', { name: 'Remove thread' }).click();
    await expect(page.locator('.thread-chip')).toHaveCount(1);
    await expect(page.locator('.block-head')).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('.thread-chip')).toHaveCount(2);
  });

  test('exports PES with a color sheet and DST', async ({ page }) => {
    await openSample(page);
    await page.getByRole('button', { name: 'Export' }).click();
    const dialog = page.getByRole('dialog', { name: 'Export design' });
    await expect(dialog.getByText('Your machine', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Ready for your Brother/)).toBeVisible();
    const downloads: string[] = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));
    const first = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download PES' }).click();
    const pes = await first;
    const bytes = readFileSync((await pes.path())!);
    expect(bytes.subarray(0, 8).toString('latin1')).toBe('#PES0001');
    await expect.poll(() => downloads).toEqual(['harbor-club-badge.pes', 'harbor-club-badge-color-sheet.pdf']);

    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('button', { name: /^DST/ }).click();
    await expect(page.getByText(/does not store thread colors/)).toBeVisible();
    await page.getByLabel('Also download a printable color sheet (PDF)').uncheck();
    const dst = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download DST' }).click();
    expect((await dst).suggestedFilename()).toBe('harbor-club-badge.dst');
  });

  test('simulates the stitch-out', async ({ page }) => {
    await openSample(page);
    await page.getByRole('button', { name: 'Simulate' }).click();
    await expect(page.getByRole('region', { name: 'Simulator controls' })).toBeVisible();
    await expect(page.getByText('Editing paused while simulating')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select (V)' })).toBeDisabled();
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByLabel('Stitch position').fill('4000');
    await expect(page.locator('.sim-count')).toContainText('4,000 /');
    await expect(page.locator('.sim-color')).toContainText('Color 2 of 2 · Gold');
    await page.getByRole('group', { name: 'Speed' }).getByRole('button', { name: '20×' }).click();
    await page.getByRole('button', { name: 'Jump to next color' }).click();
    await page.getByRole('button', { name: 'Restart' }).click();
    await expect(page.locator('.sim-color')).toContainText('Color 1 of 2');
    await page.getByRole('button', { name: 'Close simulator' }).click();
    await expect(page.getByRole('region', { name: 'Simulator controls' })).toHaveCount(0);
  });

  test('warns when the design is outside the hoop and scales it to fit', async ({ page }) => {
    await openSample(page);
    await page.getByLabel('Hoop', { exact: true }).selectOption('100x100');
    await page.keyboard.press('ControlOrMeta+a');
    const width = page.getByLabel('Selection width in mm');
    await width.fill('110');
    await width.press('Enter');
    await expect(page.getByRole('button', { name: /warning/ })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: /this hoop allows 100 mm/ })).toBeVisible();
    await page.getByRole('button', { name: /warning/ }).click();
    await expect(page.getByRole('dialog').getByText('Outside the hoop')).toBeVisible();
    await page.getByRole('button', { name: 'Scale to fit', exact: true }).click();
    await expect(page.getByRole('button', { name: 'No warnings' })).toBeVisible();
  });

  test('sets an entry point from the Advanced panel', async ({ page }) => {
    await openSample(page);
    await page.locator('.row', { hasText: 'Star' }).click();
    await page.getByRole('button', { name: /Advanced/ }).click();
    await page.locator('.prop-line', { hasText: 'Entry point' }).getByRole('button', { name: 'Set' }).click();
    await expect(page.getByText(/Click to set the entry point/)).toBeVisible();
    const box = (await page.locator('.overlay-layer').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.prop-line', { hasText: 'Entry point' })).toContainText('0.0, 0.0');
    await expect(page.locator('.overlay-layer text', { hasText: 'Start' })).toBeVisible();
    await page.locator('.prop-line', { hasText: 'Entry point' }).getByRole('button', { name: 'Clear' }).click();
    await expect(page.locator('.prop-line', { hasText: 'Entry point' })).toContainText('Auto');
  });

  test('an imported image opens the tracer: trace in colors/threshold, or use it as a backdrop', async ({ page }) => {
    await openSample(page);
    const png = makePng(80, 80, (x, y) => (x > 15 && x < 65 && y > 15 && y < 65 ? [200, 30, 40] : y > 70 && x > 10 && x < 70 ? [30, 50, 160] : [255, 255, 255]));
    await page.getByRole('button', { name: 'Design menu' }).click();
    await chooseFile(page, () => page.getByRole('menuitem', { name: /Import artwork/ }).click(), { name: 'art.png', mimeType: 'image/png', buffer: png });
    const dialog = page.getByRole('dialog', { name: 'Trace image' });
    await expect(dialog.getByText(/\d+ objects: \d+ fills?, \d+ satin/)).toBeVisible();
    // Only real colors: white (background), red and blue.
    await expect(dialog.locator('.ad-palette .swatch-dot')).toHaveCount(3);
    // Threshold mode with automatic contrast, then a manual cut-off.
    await dialog.getByRole('group', { name: 'Trace mode' }).getByRole('button', { name: 'Threshold' }).click();
    await expect(dialog.getByRole('button', { name: 'Auto contrast ✓' })).toBeVisible();
    const t = dialog.getByLabel('Threshold gray level');
    await t.fill('200');
    await t.press('Enter');
    await expect(dialog.getByRole('button', { name: 'Auto contrast', exact: true })).toBeVisible();
    // Use the image as a backdrop instead.
    await dialog.getByRole('button', { name: 'Use as backdrop' }).click();
    const panel = page.getByRole('region', { name: 'Backdrop' });
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Hidden' }).or(panel.getByRole('button', { name: 'Visible' })).first().click();
    // Trace from the backdrop panel and keep the backdrop.
    await panel.getByRole('button', { name: 'Trace…' }).click();
    await expect(dialog.getByText(/\d+ objects: /)).toBeVisible();
    await dialog.getByLabel('Keep the image as a backdrop').check();
    await dialog.getByRole('button', { name: /^Add \d+ objects/ }).click();
    await expect(page.locator('.row', { hasText: /Red fill/ })).toBeVisible();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Remove' }).click();
    await expect(panel).toHaveCount(0);
  });

  test('a transparent PNG: transparency is background, white inside the artwork is stitched', async ({ page }) => {
    await openSample(page);
    // Transparent canvas, black disk, white square.
    const png = makePng(120, 120, (x, y) =>
      (x - 35) ** 2 + (y - 60) ** 2 <= 25 * 25 ? [10, 10, 10, 255] : x >= 75 && x <= 110 && y >= 40 && y <= 80 ? [255, 255, 255, 255] : [0, 0, 0, 0],
    );
    await page.getByRole('button', { name: 'Import (I)' }).click();
    await chooseFile(page, () => page.getByRole('menu', { name: 'Import' }).getByRole('menuitem', { name: /Image/ }).click(), {
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: png,
    });
    const dialog = page.getByRole('dialog', { name: 'Trace image' });
    await expect(dialog.getByText('Transparent areas are not stitched.')).toBeVisible();
    await expect(dialog.getByText(/^2 objects: /)).toBeVisible();
    await expect(dialog.locator('.ad-palette .swatch-dot.removed')).toHaveCount(0);
    await dialog.getByRole('button', { name: /^Add 2 objects/ }).click();
    await expect(page.locator('.row', { hasText: /^White/ }).or(page.locator('.row', { hasText: /White/ }))).toHaveCount(1);
  });

  test('the tool rail Import item imports SVG directly or opens the tracer for images', async ({ page }) => {
    await openSample(page);
    await page.getByRole('button', { name: 'Import (I)' }).click();
    const menu = page.getByRole('menu', { name: 'Import' });
    await chooseFile(page, () => menu.getByRole('menuitem', { name: /SVG artwork/ }).click(), {
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(LOGO_SVG),
    });
    await expect(page.locator('.row', { hasText: 'Stripe' })).toBeVisible();
    await page.keyboard.press('i');
    await expect(menu).toBeVisible();
    const png = makePng(40, 40, (x) => (x < 20 ? [0, 0, 0] : [255, 255, 255]));
    await chooseFile(page, () => menu.getByRole('menuitem', { name: /Image/ }).click(), { name: 'a.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByRole('dialog', { name: 'Trace image' })).toBeVisible();
  });
});

test.describe('saving and opening .xtatami files', () => {
  test('falls back to a download, and the file opens again with all its objects', async ({ page }) => {
    await withoutFilePickers(page);
    await openSample(page);
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save' }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toBe('harbor-club-badge.xtatami');
    await expect(page.getByText('Downloaded harbor-club-badge.xtatami')).toBeVisible();
    const buffer = readFileSync(await file.path());

    await page.goto('/');
    await chooseFile(page, () => page.getByRole('button', { name: 'Open file' }).click(), { name: 'harbor-club-badge.xtatami', mimeType: '', buffer });
    await page.waitForURL(/#\/design\//);
    await expect(page.locator('.seq-list .row')).toHaveCount(4);
    await expect(page.locator('.name-btn')).toHaveText('Harbor Club Badge');
    await expect(page.locator('.statusbar')).toContainText(/[1-9][\d,]* stitches/);
  });

  test('saves through the save picker and writes back without asking again', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__writes = [] as string[];
      w.__picks = 0;
      w.showSaveFilePicker = async () => {
        w.__picks = (w.__picks as number) + 1;
        return {
          name: 'mine.xtatami',
          getFile: async () => new File([], 'mine.xtatami'),
          createWritable: async () => ({
            write: async (b: Blob) => void (w.__writes as string[]).push(await b.text()),
            close: async () => {},
          }),
        };
      };
    });
    await openSample(page);
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByText('Saved to mine.xtatami')).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __writes: string[] }).__writes.length)).toBe(2);
    expect(await page.evaluate(() => (window as unknown as { __picks: number }).__picks)).toBe(1);
    const saved = JSON.parse(await page.evaluate(() => (window as unknown as { __writes: string[] }).__writes[1]));
    expect(saved.format).toBe('tatami-project');
    expect(saved.objects).toHaveLength(4);
  });
});

test('arrange: group, flip, align and arranged copies', async ({ page }) => {
  await openSample(page);
  await page.locator('.seq-list .row').first().click();
  const arrange = page.getByRole('region', { name: 'Arrange' }).or(page.locator('section.arrange'));
  await expect(arrange).toBeVisible();
  await page.getByRole('button', { name: 'Flip horizontally' }).click();
  await page.getByRole('button', { name: 'Align left' }).click();
  await page.getByRole('button', { name: 'Copy around a circle' }).click();
  await expect(page.locator('.seq-list .row')).toHaveCount(9);
  await page.keyboard.press('ControlOrMeta+g');
  await expect(page.getByRole('button', { name: 'Ungroup (⇧⌘G)' })).toBeVisible();
  await page.getByRole('button', { name: 'Copy in a grid' }).click();
  await expect(page.locator('.seq-list .row')).toHaveCount(9 + 6 * 5);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.seq-list .row')).toHaveCount(9);
});

test('run objects can use decorative styles (candlewick shows knot settings)', async ({ page }) => {
  await openSample(page);
  await page.locator('.seq-list .row').filter({ hasText: 'Inner ring' }).click();
  const before = await stitchTotal(page);
  await page.getByLabel('Style', { exact: true }).selectOption('candlewick');
  await expect(page.getByLabel('Knot spacing', { exact: false }).first()).toBeVisible();
  await expect.poll(() => stitchTotal(page)).toBeGreaterThan(before);
  await page.getByLabel('Style', { exact: true }).selectOption('chain');
  await expect(page.getByLabel('Knot spacing', { exact: false })).toHaveCount(0);
  await expect(page.getByLabel(/Stitch width/).first()).toBeVisible();
});

test('fill patterns: radial, net and random shift', async ({ page }) => {
  await openSample(page);
  await page.locator('.seq-list .row').filter({ hasText: 'Badge fill' }).click();
  await expect(page.getByLabel('Random shift')).toBeVisible();
  const before = await stitchTotal(page);
  await page.getByLabel('Pattern', { exact: true }).selectOption('radial');
  await expect(page.locator('[data-pattern="radial"]')).toHaveCount(1);
  await expect(page.getByLabel('Angle in degrees')).toHaveCount(0);
  await expect.poll(() => stitchTotal(page)).not.toBe(before);
  await page.getByLabel('Pattern', { exact: true }).selectOption('net');
  await expect(page.getByLabel('Pattern spacing in millimetres')).toBeVisible();
  await expect(page.getByLabel('Random shift')).toHaveCount(0);
  await expect.poll(() => stitchTotal(page)).toBeLessThan(before);
});

test('motif fills and motif runs use the motif library', async ({ page }) => {
  await openSample(page);
  await page.locator('.seq-list .row').filter({ hasText: 'Badge fill' }).click();
  await page.getByLabel('Pattern', { exact: true }).selectOption('motif');
  await page.getByRole('radio', { name: 'Heart' }).click();
  await expect(page.getByRole('radio', { name: 'Heart' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Motif row gap in millimetres')).toBeVisible();
  await expect(page.locator('[data-pattern="motif"]')).toHaveCount(1);
  await page.locator('.seq-list .row').filter({ hasText: 'Inner ring' }).click();
  const before = await stitchTotal(page);
  await page.getByLabel('Style', { exact: true }).selectOption('motif');
  await page.getByRole('radio', { name: 'Scallop' }).click();
  await expect(page.getByLabel('Motif size in millimetres')).toBeVisible();
  await expect.poll(() => stitchTotal(page)).not.toBe(before);
});

test('quilting: stipple fill, echo lines and a background around the design', async ({ page }) => {
  await openSample(page);
  await page.locator('.seq-list .row').filter({ hasText: 'Star' }).click();
  await page.getByLabel('Pattern', { exact: true }).selectOption('stipple');
  await expect(page.getByLabel('Angle in degrees')).toHaveCount(0);
  await page.getByRole('button', { name: 'New meander' }).click();
  await page.getByRole('button', { name: 'Add echo lines' }).click();
  await expect(page.locator('.seq-list .row').filter({ hasText: 'Echo' })).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+a');
  await page.getByLabel('Background pattern').selectOption('echo');
  await page.getByRole('button', { name: 'Fill the hoop around the selection' }).click();
  await expect(page.locator('.seq-list .row').first()).toContainText('Background (echo)');
  await expect(page.locator('.statusbar')).toContainText(/[1-9][\d,]* stitches/);
});

test('region to line turns a fill into a spiral run line', async ({ page }) => {
  await openSample(page);
  await page.locator('.seq-list .row').filter({ hasText: 'Star' }).click();
  await page.getByRole('button', { name: /^Advanced/ }).click();
  await page.getByRole('button', { name: 'Region to line (spiral)' }).click();
  await expect(page.locator('.seq-list .row').filter({ hasText: 'Star line' })).toHaveCount(1);
  await expect(page.getByLabel('Style', { exact: true })).toBeVisible();
  await page.getByLabel('Style', { exact: true }).selectOption('chain');
});

test('removing hidden stitches is a design setting', async ({ page }) => {
  await openSample(page);
  const sw = page.getByRole('switch', { name: 'Remove hidden stitches' });
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  const before = await stitchTotal(page);
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => stitchTotal(page)).not.toBe(before);
});

test('appliqué: tack-down and cover choices, cut file in the panel and at export', async ({ page }) => {
  await openSample(page);
  await page.locator('.seq-list .row').filter({ hasText: 'Star' }).click();
  await page.getByRole('group', { name: 'Stitch type' }).getByRole('button', { name: 'Appliqué' }).click();
  await page.getByLabel('Tack-down').selectOption('zigzag');
  await page.getByLabel('Cover', { exact: true }).selectOption('e');
  await expect(page.getByLabel('Satin spacing in millimetres')).toHaveCount(0);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Cut file (SVG)' }).click();
  expect((await dl).suggestedFilename()).toBe('star-cut.svg');
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByLabel('Appliqué cut file (SVG)')).toBeChecked();
});

test('the tracer can turn an image into cross stitch', async ({ page }) => {
  await openSample(page);
  const png = makePng(80, 80, (x, y) => (x > 15 && x < 65 && y > 15 && y < 65 ? [200, 30, 40] : [255, 255, 255]));
  await page.getByRole('button', { name: 'Design menu' }).click();
  await chooseFile(page, () => page.getByRole('menuitem', { name: /Import artwork/ }).click(), { name: 'art.png', mimeType: 'image/png', buffer: png });
  const dialog = page.getByRole('dialog', { name: 'Trace image' });
  await dialog.getByRole('group', { name: 'Trace mode' }).getByRole('button', { name: 'Cross stitch' }).click();
  await expect(dialog.getByText('1 colors of cross stitch.')).toBeVisible();
  await dialog.getByLabel('Cross size in millimetres').fill('3');
  await dialog.getByLabel('Cross size in millimetres').press('Enter');
  await dialog.getByRole('button', { name: /^Add 1 objects/ }).click();
  await page.locator('.seq-list .row', { hasText: 'cross stitch' }).click();
  await expect(page.getByLabel('Pattern', { exact: true })).toHaveValue('x-stitch');
  await expect(page.getByLabel('Cross stitch cell size in millimetres')).toHaveValue('3.0');
});

test('the tracer can make a photo stitch in color or mono', async ({ page }) => {
  await openSample(page);
  const png = makePng(80, 80, (x, y) => [Math.round((x / 79) * 255), 80, Math.round((y / 79) * 255)]);
  await page.getByRole('button', { name: 'Design menu' }).click();
  await chooseFile(page, () => page.getByRole('menuitem', { name: /Import artwork/ }).click(), { name: 'photo.png', mimeType: 'image/png', buffer: png });
  const dialog = page.getByRole('dialog', { name: 'Trace image' });
  await dialog.getByRole('group', { name: 'Trace mode' }).getByRole('button', { name: 'Photo' }).click();
  await expect(dialog.getByText(/\d+ photo layers\./)).toBeVisible();
  await dialog.getByRole('group', { name: 'Photo style' }).getByRole('button', { name: 'Mono' }).click();
  await expect(dialog.getByText('1 photo layers.')).toBeVisible();
  await dialog.getByRole('button', { name: /^Add 1 objects/ }).click();
  await expect(page.locator('.seq-list .row', { hasText: 'Photo ·' })).toHaveCount(1);
});
