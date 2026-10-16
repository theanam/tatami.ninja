import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseFile, makePng, openSample } from './helpers';

const stitchTotal = async (page: Page) => Number((await page.locator('.statusbar .chip').first().innerText()).replace(/[^\d]/g, ''));

test.describe('editor', () => {
  test('switches views and edits object properties with undo/redo', async ({ page }) => {
    await openSample(page);
    for (const v of ['Artwork', 'Objects', 'Stitches', 'Realistic']) {
      await page.getByRole('group', { name: 'View' }).getByRole('button', { name: v }).click();
      await expect(page.getByRole('group', { name: 'View' }).getByRole('button', { name: v })).toHaveAttribute('aria-pressed', 'true');
    }
    await page.locator('.row', { hasText: 'Badge fill' }).click();
    await expect(page.locator('.props')).toContainText('Badge fill');
    const angle = page.getByLabel('Angle in degrees');
    await expect(angle).toHaveValue('45');
    await angle.fill('90');
    await angle.press('Enter');
    await expect(page.getByText('Saving…')).toBeVisible();
    await expect(page.getByText('Saved in this browser')).toBeVisible();
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
    await expect(page.getByText(/Locked\. Unlock it/)).toBeVisible();
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
    await expect(page.getByText('Saved in this browser')).toBeVisible();
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

  test('imports a PNG as a backdrop and auto-digitizes it', async ({ page }) => {
    await openSample(page);
    const png = makePng(80, 80, (x, y) => (x > 15 && x < 65 && y > 15 && y < 65 ? [200, 30, 40] : y > 70 && x > 10 && x < 70 ? [30, 50, 160] : [255, 255, 255]));
    await page.getByRole('button', { name: 'Design menu' }).click();
    await chooseFile(page, () => page.getByRole('menuitem', { name: /Import artwork/ }).click(), { name: 'art.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByText('Artwork backdrop')).toBeVisible();
    await page.getByRole('button', { name: 'Auto-digitize' }).click();
    const dialog = page.getByRole('dialog', { name: 'Auto-digitize' });
    await expect(dialog.getByText(/objects: \d+ fills?, \d+ satin/)).toBeVisible();
    await dialog.getByRole('button', { name: /^Add \d+ objects/ }).click();
    await expect(page.locator('.row', { hasText: /Red fill/ })).toBeVisible();
  });
});
