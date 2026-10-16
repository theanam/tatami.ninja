import { expect, test } from '@playwright/test';
import { chooseFile, LOGO_SVG, stitchFile } from './helpers';

test.describe('home and pages', () => {
  test('shows the home page with links to GitHub, help and about', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your designs' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Source code' })).toHaveAttribute('href', 'https://github.com/theanam/tatami.ninja');
    await expect(page.getByRole('link', { name: 'Report a bug' })).toHaveAttribute('href', 'https://github.com/theanam/tatami.ninja/issues');
    await page.getByRole('link', { name: 'Help' }).click();
    await expect(page.getByRole('heading', { name: 'Help', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Found a bug/ })).toHaveAttribute('href', /github\.com\/theanam\/tatami\.ninja\/issues/);
    await expect(page.getByRole('link', { name: /anam\.ahmed\.a@gmail\.com/ })).toHaveAttribute('href', 'mailto:anam.ahmed.a@gmail.com');
    await page.getByRole('link', { name: 'About' }).click();
    await expect(page.getByRole('heading', { name: 'About tatami.ninja' })).toBeVisible();
  });

  test('wizard creates a design that lands in the empty editor and is listed on Home', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'New design' }).click();
    await expect(page.getByRole('heading', { name: 'New design' })).toBeVisible();
    await page.getByRole('button', { name: /Janome/ }).click();
    await page.getByRole('button', { name: /100 × 100/ }).click();
    await page.getByRole('button', { name: /Denim/ }).click();
    await expect(page.locator('.summary')).toContainText('JEF');
    await page.getByLabel('Design name').fill('Denim patch');
    await page.getByRole('button', { name: 'Create design' }).click();
    await expect(page.getByText('Start with your artwork')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export' })).toBeDisabled();
    await expect(page.getByLabel('Machine', { exact: true })).toHaveValue('janome');
    await expect(page.getByLabel('Fabric', { exact: true })).toHaveValue('denim');
    await page.getByRole('link', { name: /back to your designs/ }).click();
    await expect(page.getByText('Denim patch')).toBeVisible();
    await page.getByPlaceholder('Search designs').fill('nothing');
    await expect(page.getByText('No designs match')).toBeVisible();
  });

  test('custom hoop size in the wizard', async ({ page }) => {
    await page.goto('/#/new');
    await page.getByRole('button', { name: /Custom/ }).click();
    await page.getByLabel('Custom hoop width in millimetres').fill('150');
    await page.getByLabel('Custom hoop width in millimetres').press('Enter');
    await expect(page.locator('.summary')).toContainText('150 × 150 mm');
  });

  test('templates open in the editor', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Shield crest/ }).click();
    await page.waitForURL(/#\/design\//);
    await expect(page.locator('.statusbar')).toContainText(/2\s+colors/);
    await page.goto('/');
    await page.getByRole('button', { name: /Name tape/ }).click();
    await page.waitForURL(/#\/design\//);
    await expect(page.getByText('“Your Name”')).toBeVisible();
  });

  test('imports an SVG from Home into a new design', async ({ page }) => {
    await page.goto('/');
    await chooseFile(page, () => page.getByRole('button', { name: 'Import artwork' }).click(), {
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(LOGO_SVG),
    });
    await page.waitForURL(/#\/design\//);
    await expect(page.getByText('Badge', { exact: true })).toBeVisible();
    await expect(page.getByText('Stripe', { exact: true })).toBeVisible();
  });

  test('opens a PES stitch file as recolor-only', async ({ page }) => {
    await page.goto('/');
    await chooseFile(page, () => page.getByRole('button', { name: 'Open stitch file' }).click(), {
      name: 'badge.pes',
      mimeType: 'application/octet-stream',
      buffer: stitchFile('PES'),
    });
    await page.waitForURL(/#\/design\//);
    await expect(page.getByText('Stitch file · recolor only')).toBeVisible();
    await expect(page.getByRole('button', { name: /Pen/ })).toBeDisabled();
    await page.getByRole('link', { name: /back to your designs/ }).click();
    await expect(page.locator('.tag')).toHaveText('Stitch file · recolor only');
  });

  test('deletes and duplicates designs', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open the sample design' }).click();
    await page.waitForURL(/#\/design\//);
    await page.goto('/');
    await page.locator('.card-wrap').first().hover();
    await page.getByRole('button', { name: 'Duplicate Harbor Club Badge' }).click();
    await expect(page.getByText('Harbor Club Badge copy')).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await page.locator('.card-wrap').filter({ hasText: 'copy' }).hover();
    await page.getByRole('button', { name: 'Delete Harbor Club Badge copy' }).click();
    await expect(page.getByText('Harbor Club Badge copy')).toHaveCount(0);
  });

  test('unknown design ids show a not-found page', async ({ page }) => {
    await page.goto('/#/design/nope');
    await expect(page.getByText(/not saved in this browser/)).toBeVisible();
  });
});
