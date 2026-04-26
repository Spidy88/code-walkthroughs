import { expect, test } from '@playwright/test';

test.describe('Blueprint Tier-0 primitives', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Code Walkthroughs', { exact: true })).toBeVisible();
  });

  test('renders the title block with drafting labels', async ({ page }) => {
    const titleDrawingLabel = page.getByText('DRAWING · CODE_WALKTHROUGHS');
    await expect(titleDrawingLabel).toBeVisible();
    await expect(page.getByText('Walk the path, not the diff.')).toBeVisible();
  });

  test('renders all chip-state variants in the primitives showcase', async ({ page }) => {
    const showcase = page.locator('section', { hasText: '§ C · BLUEPRINT PRIMITIVES (TIER-0)' });
    for (const label of [
      'APPROVED',
      'REJECTED',
      'INFO REQUESTED',
      'NEVER REVIEWED',
      'NEW',
      'MODIFIED',
      'STALE',
      'CONTRACT CHANGE',
      'INDIRECT IMPACT',
      'COSMETIC',
    ]) {
      await expect(showcase.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('renders all classification chip variants in the primitives showcase', async ({ page }) => {
    const showcase = page.locator('section', { hasText: '§ C · BLUEPRINT PRIMITIVES (TIER-0)' });
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
      await expect(showcase.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('captures full-page screenshot of the primitives showcase', async ({ page }) => {
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
