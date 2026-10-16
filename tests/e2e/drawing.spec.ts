import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockFontNetwork } from './helpers';

async function newEmptyDesign(page: Page) {
  await page.goto('/#/new');
  await page.getByRole('button', { name: 'Create design' }).click();
  await expect(page.getByText('Start with your artwork')).toBeVisible();
}

/** Canvas center in page coordinates (the hoop center). */
async function canvasCenter(page: Page) {
  const box = (await page.locator('.overlay-layer').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('drawing tools', () => {
  test('pen draws a closed fill', async ({ page }) => {
    await newEmptyDesign(page);
    await page.keyboard.press('p');
    const c = await canvasCenter(page);
    await page.mouse.click(c.x - 60, c.y - 40);
    await page.mouse.click(c.x + 60, c.y - 40);
    await page.mouse.click(c.x, c.y + 60);
    await page.mouse.click(c.x - 60, c.y - 40); // close on the first point
    await expect(page.locator('.row', { hasText: 'Fill 1' })).toBeVisible();
    await expect(page.locator('.statusbar')).toContainText(/[1-9][\d,]* stitches/);
  });

  test('run tool draws an open line finished with Enter', async ({ page }) => {
    await newEmptyDesign(page);
    await page.keyboard.press('r');
    const c = await canvasCenter(page);
    await page.mouse.click(c.x - 80, c.y);
    await page.mouse.click(c.x, c.y - 30);
    await page.mouse.click(c.x + 80, c.y);
    await page.keyboard.press('Enter');
    await expect(page.locator('.row', { hasText: 'Run' })).toBeVisible();
  });

  test('satin tool builds a column from rail clicks', async ({ page }) => {
    await newEmptyDesign(page);
    await page.keyboard.press('s');
    const c = await canvasCenter(page);
    for (const [x, y] of [[-80, -10], [-80, 10], [0, -14], [0, 14], [80, -10], [80, 10]]) await page.mouse.click(c.x + x, c.y + y);
    await page.keyboard.press('Enter');
    await expect(page.locator('.row', { hasText: 'Satin 1' })).toBeVisible();
    await expect(page.getByLabel('Satin width in millimetres')).toBeVisible();
  });

  test('selections show their dimensions, live while scaling', async ({ page }) => {
    await newEmptyDesign(page);
    await page.keyboard.press('u');
    const c = await canvasCenter(page);
    const zoom = Number((await page.locator('.zoom-val').innerText()).replace('%', '')) / 100; // px per mm
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 40 * zoom, c.y + 20 * zoom, { steps: 4 });
    await page.mouse.up();
    const dims = page.locator('.sel-dims text');
    await expect(dims).toHaveText(/^40\.\d × 20\.\d mm$/);
    const handle = (await page.locator('[data-handle="corner:1,1"]').boundingBox())!;
    await page.mouse.move(handle.x + 4, handle.y + 4);
    await page.mouse.down();
    await page.mouse.move(handle.x + 4 + 40 * zoom, handle.y + 4 + 20 * zoom, { steps: 4 });
    // Roughly double (the drag starts at the handle, a few px off the corner).
    await expect
      .poll(async () => ((await dims.textContent()) ?? "").match(/[\d.]+/g)!.map(Number))
      .toEqual([expect.closeTo(80, -1), expect.closeTo(40, -1)]);
    await page.mouse.up();
  });

  test('shapes tool drags a rectangle; select tool moves and nudges it', async ({ page }) => {
    await newEmptyDesign(page);
    await page.keyboard.press('u');
    const c = await canvasCenter(page);
    await page.mouse.move(c.x - 50, c.y - 50);
    await page.mouse.down();
    await page.mouse.move(c.x + 50, c.y + 30, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('.row', { hasText: 'Rectangle 1' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ControlOrMeta+d');
    await expect(page.locator('.row', { hasText: 'Rectangle 1 copy' })).toBeVisible();
    await page.keyboard.press('Delete');
    await expect(page.locator('.row', { hasText: 'copy' })).toHaveCount(0);
  });

  test('lettering tool types text in place on the canvas', async ({ page }) => {
    await newEmptyDesign(page);
    await page.keyboard.press('t');
    const c = await canvasCenter(page);
    await page.mouse.click(c.x, c.y);
    const inline = page.getByLabel('Edit text');
    await expect(inline).toBeFocused();
    await page.keyboard.type('Hello');
    await page.keyboard.press('Enter');
    await expect(inline).toHaveCount(0);
    await expect(page.locator('.row', { hasText: '“Hello”' })).toBeVisible();
    // The right panel no longer holds a text field.
    await expect(page.getByRole('region', { name: 'Properties' }).getByRole('textbox', { name: 'Text', exact: true })).toHaveCount(0);
    // Double-click to edit again; Escape restores the text.
    const box = (await page.locator('.overlay-layer rect.selbox').boundingBox())!;
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByLabel('Edit text')).toHaveValue('Hello');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Bye');
    await page.keyboard.press('Escape');
    await expect(page.locator('.row', { hasText: '“Hello”' })).toBeVisible();
    // Enter on a selected text starts editing too.
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Edit text')).toBeFocused();
    await page.keyboard.press('Escape');
  });

  test('lettering settings live in the Properties panel (nothing floats) and warn about tiny text', async ({ page }) => {
    await newEmptyDesign(page);
    await page.keyboard.press('t');
    const c = await canvasCenter(page);
    await page.mouse.click(c.x, c.y);
    await page.keyboard.press('Enter');
    await expect(page.locator('.canvas-cell').getByRole('toolbar')).toHaveCount(0);
    const toolbar = page.getByRole('region', { name: 'Properties' }).getByRole('group', { name: 'Lettering' });
    await toolbar.getByLabel('Baseline').selectOption('up');
    await expect(toolbar.getByLabel('Arc radius in millimetres')).toBeVisible();
    const h = toolbar.getByLabel('Letter height in millimetres');
    await h.fill('4');
    await h.press('Enter');
    await page.getByRole('button', { name: /\d+ warnings?/ }).click();
    await expect(page.getByRole('dialog').getByText('Lettering too small')).toBeVisible();
  });

  test('font picker lists every Google Font with previews and applies the choice', async ({ page }) => {
    await mockFontNetwork(page);
    await newEmptyDesign(page);
    await page.keyboard.press('t');
    const c = await canvasCenter(page);
    await page.mouse.click(c.x, c.y);
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /^Font: Geist/ }).click();
    const picker = page.getByRole('dialog', { name: 'Choose a font' });
    await expect(picker.getByPlaceholder(/Search 1,\d{3} fonts/)).toBeVisible();
    // Rows are set in their own face.
    await expect(picker.getByRole('option', { name: 'Oswald' }).locator('.fp-name')).toHaveCSS('font-family', /Oswald|tn-oswald/);
    await picker.getByRole('button', { name: 'Script' }).click();
    await expect(picker.getByRole('option').first()).toContainText(/\w/);
    await picker.getByRole('button', { name: 'All' }).click();
    await picker.getByLabel('Search fonts').fill('lobster');
    await expect(picker.getByRole('option').first()).toHaveText(/Lobster/);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /^Font: Lobster/ })).toBeVisible();
    await expect(page.locator('.statusbar')).toContainText(/[1-9][\d,]* stitches/);
    // Keyboard navigation.
    await page.getByRole('button', { name: /^Font: Lobster/ }).click();
    await page.getByLabel('Search fonts').fill('open sans');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Choose a font' })).toHaveCount(0);
  });

  test('node tool moves a vertex', async ({ page }) => {
    await newEmptyDesign(page);
    await page.keyboard.press('u');
    const c = await canvasCenter(page);
    await page.mouse.move(c.x - 50, c.y - 50);
    await page.mouse.down();
    await page.mouse.move(c.x + 50, c.y + 50, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.press('a');
    const handles = page.locator('[data-handle^="node:"]');
    await expect(handles).toHaveCount(4);
    const box = (await handles.first().boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + 4);
    await page.mouse.down();
    await page.mouse.move(box.x - 40, box.y - 40, { steps: 4 });
    await page.mouse.up();
    const after = (await handles.first().boundingBox())!;
    expect(after.x).toBeLessThan(box.x - 30);
  });

  test('measure tool shows a distance', async ({ page }) => {
    await newEmptyDesign(page);
    await page.keyboard.press('m');
    const c = await canvasCenter(page);
    await page.mouse.move(c.x - 50, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 50, c.y, { steps: 3 });
    await page.mouse.up();
    await expect(page.locator('.overlay-layer text', { hasText: / mm$/ })).toBeVisible();
  });
});

test.describe('transforming lettering', () => {
  async function addText(page: Page) {
    await newEmptyDesign(page);
    await page.keyboard.press('t');
    const c = await canvasCenter(page);
    await page.mouse.click(c.x, c.y);
    await expect(page.locator('.row', { hasText: '“Text”' })).toBeVisible();
    // The text opens for in-place editing; keep it as is.
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Edit text')).toHaveCount(0);
  }
  const height = (page: Page) => page.getByLabel('Letter height in millimetres');
  const selBox = async (page: Page) => (await page.locator('.overlay-layer rect.selbox').boundingBox())!;

  test('corner drag scales proportionally about the opposite corner', async ({ page }) => {
    await addText(page);
    const before = await selBox(page);
    const handle = (await page.locator('[data-handle="corner:1,1"]').boundingBox())!;
    await page.mouse.move(handle.x + 4, handle.y + 4);
    await page.mouse.down();
    // A fast drag with few events must not compound the scale.
    await page.mouse.move(handle.x + 4 + before.width / 2, handle.y + 4 + before.height / 2, { steps: 3 });
    await page.mouse.up();
    const after = await selBox(page);
    expect(Math.abs(after.x - before.x)).toBeLessThan(2);
    expect(Math.abs(after.y - before.y)).toBeLessThan(2);
    expect(after.width / before.width).toBeGreaterThan(1.3);
    expect(after.width / before.width).toBeLessThan(1.7);
    const h = Number(await height(page).inputValue());
    expect(h).toBeGreaterThan(13);
    expect(h).toBeLessThan(17);
    // Editing the text in place keeps the new size.
    await page.keyboard.press('Enter');
    await page.keyboard.press('End');
    await page.keyboard.type('s');
    await page.keyboard.press('Enter');
    await expect(page.locator('.row', { hasText: '“Texts”' })).toBeVisible();
    expect(Number(await height(page).inputValue())).toBeCloseTo(h, 1);
    // Undo restores the original size in one step.
    await page.keyboard.press('Escape');
    await page.locator('.overlay-layer').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+z');
    await page.keyboard.press('ControlOrMeta+z');
    await page.locator('.row', { hasText: '“Text”' }).click();
    await expect(height(page)).toHaveValue('10.0');
  });

  test('text can be dragged by grabbing between its letters', async ({ page }) => {
    await addText(page);
    const box = await selBox(page);
    // Release the selection first, then grab the middle of the text box.
    await page.keyboard.press('Escape');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 2 });
    await page.mouse.up();
    const after = await selBox(page);
    expect(after.x - box.x).toBeGreaterThan(75);
    expect(after.x - box.x).toBeLessThan(85);
    expect(after.y - box.y).toBeGreaterThan(35);
    expect(after.y - box.y).toBeLessThan(45);
  });
});

test.describe('lettering shapes and monograms', () => {
  test('text can run around a circle or a spiral and be warped', async ({ page }) => {
    await newEmptyDesign(page);
    await page.keyboard.press('t');
    const c = await canvasCenter(page);
    await page.mouse.click(c.x, c.y);
    await page.keyboard.type('ROUND AND ROUND WE GO');
    await page.keyboard.press('Enter');
    const lettering = page.getByRole('region', { name: 'Properties' }).getByRole('group', { name: 'Lettering' });
    const status = page.locator('.statusbar');
    await lettering.getByLabel('Baseline').selectOption('circle');
    await expect(lettering.getByLabel(/Arc radius/)).toHaveCount(0);
    await lettering.getByLabel('Baseline').selectOption('spiral');
    await expect(lettering.getByLabel('Spiral radius in millimetres')).toBeVisible();
    await lettering.getByLabel('Warp').selectOption('arch');
    await expect(lettering.getByLabel('Warp amount in percent')).toHaveValue('50');
    await expect(status).toContainText(/[1-9][\d,]* stitches/);
  });

  test('the lettering tool builds a grouped three-letter monogram', async ({ page }) => {
    await newEmptyDesign(page);
    await page.keyboard.press('t');
    const opts = page.getByRole('region', { name: 'Monogram' }).or(page.locator('section').filter({ has: page.getByRole('heading', { name: 'Monogram' }) }));
    await opts.getByLabel('Initials').fill('jdk');
    await expect(opts.getByLabel('Initials')).toHaveValue('JDK');
    await opts.getByRole('button', { name: 'Add monogram' }).click();
    await expect(page.locator('.seq-list .row')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Ungroup (⇧⌘G)' })).toBeVisible();
  });
});

test('export can make one file per name (batch names)', async ({ page }) => {
  await newEmptyDesign(page);
  await page.keyboard.press('t');
  const c = await canvasCenter(page);
  await page.mouse.click(c.x, c.y);
  await page.keyboard.type('NAME');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export design' });
  await dialog.getByLabel('Batch names (one file per name)').check();
  await dialog.getByLabel('Names, one per line').fill('Ava\nNoah\nMia\nAva');
  await expect(dialog.getByText('3 names')).toBeVisible();
  const dl = page.waitForEvent('download');
  await dialog.getByRole('button', { name: /^Download 3 \w+ files/ }).click();
  expect((await dl).suggestedFilename()).toMatch(/-3-names\.zip$/);
});

test('lettering can use a font file you add', async ({ page }) => {
  await mockFontNetwork(page);
  await newEmptyDesign(page);
  await page.keyboard.press('t');
  const c = await canvasCenter(page);
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /^Font: Geist/ }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a font' });
  const ttf = readFileSync(new URL('../../public/lettering/pacifico.ttf', import.meta.url));
  const chooser = page.waitForEvent('filechooser');
  await picker.getByRole('button', { name: 'Add font file…' }).click();
  await (await chooser).setFiles({ name: 'MyScript.ttf', mimeType: 'font/ttf', buffer: ttf });
  await expect(page.getByRole('button', { name: /^Font: Pacifico/ })).toBeVisible();
  await page.getByRole('button', { name: /^Font: Pacifico/ }).click();
  await picker.getByRole('button', { name: 'Yours' }).click();
  await expect(picker.getByRole('option', { name: /Pacifico/ })).toHaveCount(1);
});
