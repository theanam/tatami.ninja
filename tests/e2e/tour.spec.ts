import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { TOUR_STEPS } from '../../src/components/tour/steps';

test.describe('first-run tour', () => {
  // A brand-new visitor: nothing in storage.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('shows once, can be skipped, and never comes back by itself', async ({ page }) => {
    await page.goto('/');
    const tour = page.getByRole('dialog', { name: 'Welcome tour' });
    await expect(tour).toBeVisible();
    await expect(tour.getByRole('img')).toBeVisible();
    await tour.getByRole('button', { name: 'Skip tour' }).click();
    await expect(tour).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your designs' })).toBeVisible();
    await expect(tour).toHaveCount(0);
    // Help can replay it.
    await page.goto('/#/help');
    await page.getByRole('button', { name: 'Take the tour' }).click();
    await expect(tour).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tour).toHaveCount(0);
  });

  test('walks through every step with pictures, then opens the sample', async ({ page }) => {
    await page.goto('/');
    const tour = page.getByRole('dialog', { name: 'Welcome tour' });
    await tour.getByRole('button', { name: 'Take the tour' }).click();
    for (let i = 1; i < TOUR_STEPS.length - 1; i++) {
      await expect(tour.getByRole('heading', { name: TOUR_STEPS[i].title })).toBeVisible();
      const img = tour.locator('img.tour-shot');
      await expect(img).toHaveAttribute('alt', TOUR_STEPS[i].alt);
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      await page.keyboard.press('ArrowRight');
    }
    await expect(tour.getByRole('heading', { name: 'Start stitching' })).toBeVisible();
    await expect(tour.locator('.tour-tile')).toHaveCount(TOUR_STEPS.length - 1);
    await tour.getByRole('button', { name: 'Open the sample design' }).click();
    await page.waitForURL(/#\/design\//);
    await expect(page.locator('.statusbar')).toContainText(/[1-9][\d,]* stitches/);
    await expect(tour).toHaveCount(0);
  });

  test('every tour picture is in the build', () => {
    for (const s of TOUR_STEPS) if (s.image) expect(existsSync(new URL(`../../public/tour/${s.image}`, import.meta.url))).toBe(true);
  });
});
