import { expect, test } from '@playwright/test';
import { openSample } from './helpers';

test('the top bar keeps its layout while working', async ({ page }) => {
  await openSample(page);
  const view = page.getByRole('group', { name: 'View' });
  const exportBtn = page.getByRole('button', { name: 'Export' });
  const where = async () => [(await view.boundingBox())!.x, (await exportBtn.boundingBox())!.x];
  const before = await where();
  await expect(page.getByText('Saved in this browser')).toHaveCount(0);
  await page.getByRole('button', { name: 'Simulate' }).click();
  expect(await where()).toEqual(before);
  await page.getByRole('button', { name: 'Simulating' }).click();
  await page.locator('.name-btn').click();
  await page.getByLabel('Design name').fill('A much longer design name than before');
  await page.getByLabel('Design name').press('Enter');
  expect(await where()).toEqual(before);
});
