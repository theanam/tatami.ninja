import { expect, test, type Page } from '@playwright/test';
import { chooseFile, makePng, openSample } from './helpers';

const view = (page: Page) => page.getByRole('group', { name: 'View' });

async function rectDesign(page: Page) {
  await page.goto('/#/new');
  await page.getByRole('button', { name: 'Create design' }).click();
  await page.getByRole('button', { name: 'Start with a blank canvas' }).click();
  await page.keyboard.press('u');
  const box = (await page.locator('.overlay-layer').boundingBox())!;
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(c.x - 90, c.y - 70);
  await page.mouse.down();
  await page.mouse.move(c.x - 20, c.y - 30, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator('.row', { hasText: 'Rectangle 1' })).toBeVisible();
  return c;
}

test.describe('canvas behaviour', () => {
  test('the empty-canvas card goes away for good once you import from it', async ({ page }) => {
    await page.goto('/#/new');
    await page.getByRole('button', { name: 'Create design' }).click();
    const card = page.getByText('Start with your artwork');
    await expect(card).toBeVisible();
    const png = makePng(40, 40, (x, y) => (x > 10 && x < 30 && y > 10 && y < 30 ? [200, 30, 40] : [255, 255, 255]));
    await chooseFile(page, () => page.getByRole('button', { name: 'Import artwork…' }).click(), { name: 'logo.png', mimeType: 'image/png', buffer: png });
    // Images open the tracer; even cancelling it leaves the card gone.
    await expect(page.getByRole('dialog', { name: 'Trace image' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Trace image' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.canvas-wrap')).toBeVisible();
    await expect(card).toHaveCount(0);
  });

  test('picking any tool dismisses the empty-canvas card, even after going back to Select', async ({ page }) => {
    await page.goto('/#/new');
    await page.getByRole('button', { name: 'Create design' }).click();
    await expect(page.getByText('Start with your artwork')).toBeVisible();
    await page.keyboard.press('p');
    await page.keyboard.press('v');
    await expect(page.getByText('Start with your artwork')).toHaveCount(0);
  });

  test('designs always open in the Artwork view', async ({ page }) => {
    await openSample(page);
    await expect(view(page).getByRole('button', { name: 'Artwork' })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(view(page).getByRole('button', { name: 'Artwork' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('changing the stitch type changes how the object looks in Artwork', async ({ page }) => {
    await openSample(page);
    await page.locator('.row', { hasText: 'Badge fill' }).click();
    const art = page.locator('.overlay-layer [data-type]').first();
    await expect(art).toHaveAttribute('data-type', 'tatami');
    const before = await page.locator('.overlay-layer').innerHTML();
    await page.getByRole('group', { name: 'Stitch type' }).getByRole('button', { name: 'Contour' }).click();
    await expect(page.locator('.overlay-layer [data-type="contour"]')).toHaveCount(1);
    await page.getByRole('group', { name: 'Stitch type' }).getByRole('button', { name: 'Satin' }).click();
    await expect(page.locator('.overlay-layer [data-type="satin"]')).toHaveCount(2); // badge + border
    await page.getByRole('group', { name: 'Stitch type' }).getByRole('button', { name: 'Tatami' }).click();
    // Angle changes are visible immediately, too.
    const angle = page.getByLabel('Angle in degrees');
    await angle.fill('10');
    await angle.press('Enter');
    expect(await page.locator('.overlay-layer').innerHTML()).not.toBe(before);
    await expect(page.locator('.overlay-layer pattern[patternTransform="rotate(-10)"]')).toHaveCount(1);
  });

  test('dragging commits on release as a single undo step', async ({ page }) => {
    const c = await rectDesign(page);
    await expect(page.getByText('Saved in this browser')).toBeVisible();
    const box = (await page.locator('.overlay-layer rect.selbox').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 8 });
    // Mid-drag the box follows the pointer but the document is untouched (nothing to save).
    const mid = (await page.locator('.overlay-layer rect.selbox').boundingBox())!;
    expect(mid.x - box.x).toBeGreaterThan(50);
    await expect(page.getByText('Saved in this browser')).toBeVisible();
    await page.mouse.up();
    const after = (await page.locator('.overlay-layer rect.selbox').boundingBox())!;
    expect(Math.round(after.x - box.x)).toBeGreaterThan(50);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => Math.round((await page.locator('.overlay-layer rect.selbox').boundingBox())!.x)).toBe(Math.round(box.x));
    void c;
  });

  test('grid toggles and snap-to-grid lands on grid lines', async ({ page }) => {
    await rectDesign(page);
    const gridBtn = page.getByRole('button', { name: 'Show grid (G)' });
    await expect(gridBtn).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('g');
    await expect(gridBtn).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('g');
    await page.getByLabel('Grid size').selectOption('100'); // 10 mm
    await page.getByRole('button', { name: 'Smart snap to objects and hoop' }).click(); // off: pure grid
    await page.getByRole('button', { name: 'Snap to grid' }).click();
    const box = (await page.locator('.overlay-layer rect.selbox').boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 47, box.y + 23, { steps: 5 });
    await page.mouse.up();
    // The shape's top-left corner sits on a 10 mm grid line: check via the Selection panel geometry.
    const pos = await page.evaluate(() => {
      // Read the store through the dims label anchor: the selbox is 4 px outside the bounds.
      const r = document.querySelector('.overlay-layer rect.selbox')!.getBoundingClientRect();
      const svg = document.querySelector('.overlay-layer')!.getBoundingClientRect();
      return { x: r.left - svg.left + 4, y: r.top - svg.top + 4, w: svg.width, h: svg.height };
    });
    const zoom = Number((await page.locator('.zoom-val').innerText()).replace('%', '')) / 100; // px per mm
    const mmX = (pos.x - pos.w / 2) / zoom;
    const mmY = (pos.y - pos.h / 2) / zoom;
    expect(Math.abs(mmX - Math.round(mmX / 10) * 10)).toBeLessThan(0.6);
    expect(Math.abs(mmY - Math.round(mmY / 10) * 10)).toBeLessThan(0.6);
    // Restore defaults for other tests in this browser profile.
    await page.getByRole('button', { name: 'Snap to grid' }).click();
    await page.getByRole('button', { name: 'Smart snap to objects and hoop' }).click();
  });

  test('smart snap aligns to the hoop center and shows a guide', async ({ page }) => {
    await rectDesign(page);
    const svg = (await page.locator('.overlay-layer').boundingBox())!;
    const box = (await page.locator('.overlay-layer rect.selbox').boundingBox())!;
    const cx = box.x + box.width / 2;
    // Drag so the shape's center lands ~2 px right of the hoop's vertical center line.
    const targetX = svg.x + svg.width / 2 + 2;
    await page.mouse.move(cx, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetX, box.y + box.height / 2 + 1, { steps: 6 });
    await expect(page.locator('.snap-guides line')).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator('.snap-guides')).toHaveCount(0);
    const after = (await page.locator('.overlay-layer rect.selbox').boundingBox())!;
    expect(Math.abs(after.x + after.width / 2 - (svg.x + svg.width / 2))).toBeLessThan(1.5);
  });
});
