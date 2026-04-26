import { expect, test } from '@playwright/test';

test.describe('Blueprint Tier-1 surfaces', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/styles');
    await expect(page.getByText('Blueprint Draft — Reference')).toBeVisible();
  });

  test('renders the title block primitive with cells', async ({ page }) => {
    await expect(page.getByText('DRAWING · DEV / STYLES')).toBeVisible();
    await expect(page.getByText('phase-A', { exact: true })).toBeVisible();
    await expect(page.getByText('reference', { exact: true })).toBeVisible();
  });

  test('renders panel variants in the surfaces showcase', async ({ page }) => {
    await expect(page.getByText('FIG. P · DEFAULT PANEL')).toBeVisible();
    await expect(page.getByText('FIG. Q · TICKED PANEL')).toBeVisible();
  });

  test('renders the path breadcrumb with current segment highlighted', async ({ page }) => {
    const breadcrumbCalls = page.getByText('billing.charge', { exact: true });
    await expect(breadcrumbCalls.first()).toBeVisible();
    await expect(page.getByText('handlePurchase').first()).toBeVisible();
    await expect(page.getByText('routes/purchase.ts').first()).toBeVisible();
  });

  test('renders line gutter with new and modified states', async ({ page }) => {
    await expect(
      page.getByText('const { items, paymentMethod } = req.body', { exact: false }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('const charge = await billing.charge({', { exact: false }).first(),
    ).toBeVisible();
  });

  test('renders the kitchen-sink walkthrough composition', async ({ page }) => {
    const kitchenSink = page.locator('section', { hasText: '§ E · KITCHEN SINK' });
    await expect(kitchenSink.getByText('handlePurchase(req, res)', { exact: true })).toBeVisible();
    await expect(kitchenSink.getByText('Authenticates request')).toBeVisible();
    await expect(kitchenSink.getByText('Validates input schema')).toBeVisible();
    await expect(kitchenSink.getByText('Handles errors consistently')).toBeVisible();
  });

  test('captures full-page screenshot of the surfaces showcase', async ({ page }) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: 'test-results/screenshots/blueprint-surfaces-full.png',
      fullPage: true,
    });
  });

  test('captures focused screenshot of the kitchen sink', async ({ page }) => {
    await page.evaluate(() => document.fonts.ready);
    const kitchenSink = page.locator('section', { hasText: '§ E · KITCHEN SINK' }).first();
    await expect(kitchenSink).toBeVisible();
    await kitchenSink.screenshot({
      path: 'test-results/screenshots/blueprint-surfaces-kitchen-sink.png',
    });
  });
});
