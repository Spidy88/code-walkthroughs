import { expect, test } from '@playwright/test';

test.describe('Blueprint Tier-1 surfaces', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Code Walkthroughs', { exact: true })).toBeVisible();
  });

  test('renders the title block primitive with cells', async ({ page }) => {
    // Title block at the top of the page; scope to its DRAWING label to avoid the
    // surfaces showcase D.3 secondary title block.
    const titleBlock = page.locator('div', { hasText: 'DRAWING · CODE_WALKTHROUGHS' }).first();
    await expect(titleBlock).toBeVisible();
    await expect(page.getByText(/^chunk-1[A-Z]$/)).toBeVisible();
    await expect(page.getByText('01 / 22', { exact: true })).toBeVisible();
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
