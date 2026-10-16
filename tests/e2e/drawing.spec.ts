import { expect, test, type Page } from '@playwright/test';

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

  test('lettering tool adds editable text', async ({ page }) => {
    await newEmptyDesign(page);
    await page.keyboard.press('t');
    const c = await canvasCenter(page);
    await page.mouse.click(c.x, c.y);
    await expect(page.locator('.row', { hasText: '“Text”' })).toBeVisible();
    await page.getByLabel('Text', { exact: true }).fill('Hello');
    await expect(page.locator('.row', { hasText: '“Hello”' })).toBeVisible();
    await page.getByLabel('Font').selectOption('pacifico');
    await page.getByRole('group', { name: 'Baseline' }).getByRole('button', { name: 'Arc up' }).click();
    await expect(page.getByLabel('Arc radius in millimetres')).toBeVisible();
    const h = page.getByLabel('Letter height in millimetres');
    await h.fill('4');
    await h.press('Enter');
    await page.getByRole('button', { name: /\d+ warnings?/ }).click();
    await expect(page.getByRole('dialog').getByText('Lettering too small')).toBeVisible();
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
    // Editing the text keeps the new size.
    await page.getByLabel('Text', { exact: true }).fill('Texts');
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
