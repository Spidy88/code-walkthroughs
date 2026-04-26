import { expect, test } from '@playwright/test';

test.describe('Blueprint Tier-0 primitives', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Code Walkthroughs', { exact: true })).toBeVisible();
  });

  test('renders the title block with drafting labels', async ({ page }) => {
    // Arrange — page already navigated in beforeEach.
    // Act — locate the title block via its drawing label.
    const titleDrawingLabel = page.getByText('DRAWING · CODE_WALKTHROUGHS');
    // Assert
    await expect(titleDrawingLabel).toBeVisible();
    await expect(page.getByText('Walk the path, not the diff.')).toBeVisible();
  });

  test('renders chips for every state-style variant', async ({ page }) => {
    for (const label of ['APPROVED', 'REJECTED', 'INFO REQUESTED', 'NEVER REVIEWED']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    for (const label of ['NEW', 'MODIFIED', 'STALE']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    for (const label of ['CONTRACT CHANGE', 'INDIRECT IMPACT', 'COSMETIC']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('renders chips for every classification variant', async ({ page }) => {
    for (const label of [
      'ROUTE HANDLER',
      'SERVICE',
      'CLIENT',
      'REPOSITORY',
      'HELPER',
      'MIDDLEWARE',
      'COMPONENT',
      'PAGE',
      'HOOK',
      'CONFIG',
      'SCRIPT',
      'SEED',
      'FIXTURE',
      'TEST',
      'TYPE ONLY',
      'UNCLASSIFIED',
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('renders corner ticks on the showcase panels', async ({ page }) => {
    await expect(page.getByText('FIG. D · PRIMARY TICKS')).toBeVisible();
    await expect(page.getByText('FIG. E · NEUTRAL TICKS')).toBeVisible();
  });

  test('captures full-page screenshot of the primitives showcase', async ({ page }) => {
    // Wait for fonts to settle so the screenshot is consistent
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: 'test-results/screenshots/blueprint-primitives-full.png',
      fullPage: true,
    });
  });

  test('captures focused screenshot of the chip showcase section', async ({ page }) => {
    await page.evaluate(() => document.fonts.ready);
    const showcase = page
      .locator('section', { hasText: '§ C · BLUEPRINT PRIMITIVES (TIER-0)' })
      .first();
    await expect(showcase).toBeVisible();
    await showcase.screenshot({
      path: 'test-results/screenshots/blueprint-primitives-chips.png',
    });
  });
});
