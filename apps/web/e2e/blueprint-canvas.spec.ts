import { expect, test } from '@playwright/test';

test.describe('Blueprint Tier-2 canvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/styles');
    await expect(page.getByText('Blueprint Draft — Reference')).toBeVisible();
  });

  test('renders the canvas showcase section', async ({ page }) => {
    await expect(page.getByText('§ F · CANVAS (TIER-2)')).toBeVisible();
    await expect(page.getByText('F.1 · WALKTHROUGH CANVAS — fixture path')).toBeVisible();
  });

  test('renders the walkthrough canvas with the focused code node', async ({ page }) => {
    const showcase = page.locator('section', { hasText: '§ F · CANVAS (TIER-2)' });
    const canvas = showcase.locator('[data-testid="blueprint-canvas"]').first();
    await expect(canvas).toBeVisible();
    // Wait for xyflow to compute layout + render nodes
    await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length > 0, {
      timeout: 5000,
    });
    // The focused code node carries the figure label and the file path.
    await expect(canvas.getByText('FIG. A')).toBeVisible();
    await expect(canvas.getByText('handlePurchase(req, res)', { exact: true })).toBeVisible();
    await expect(canvas.getByText('src/routes/purchase.ts')).toBeVisible();
    // Summary nodes downstream
    await expect(canvas.getByText('billing.charge(payload)', { exact: true })).toBeVisible();
    await expect(canvas.getByText('orders.create(input)', { exact: true })).toBeVisible();
    // Dispatcher node upstream
    await expect(canvas.getByText('POST /checkout', { exact: true })).toBeVisible();
  });

  test('renders the paired canvas with base and head labels', async ({ page }) => {
    const paired = page.locator('[data-testid="blueprint-paired-canvas"]').first();
    await expect(paired).toBeVisible();
    await expect(paired.getByText('BASE · main', { exact: true })).toBeVisible();
    await expect(paired.getByText('HEAD · feat/checkout-v2', { exact: true })).toBeVisible();
  });

  test('canvas controls (zoom + fit) are reachable', async ({ page }) => {
    const canvas = page.locator('[data-testid="blueprint-canvas"]').first();
    await expect(canvas.locator('.react-flow__controls')).toBeVisible();
    // The zoom-in button has an aria-label.
    await expect(canvas.getByRole('button', { name: /zoom in/i })).toBeVisible();
    await expect(canvas.getByRole('button', { name: /zoom out/i })).toBeVisible();
    await expect(canvas.getByRole('button', { name: /fit view/i })).toBeVisible();
  });

  test('captures full-page screenshot of the canvas showcase', async ({ page }) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length > 0, {
      timeout: 5000,
    });
    // Give the canvas a beat to settle its fitView animation.
    await page.waitForTimeout(400);
    const showcase = page.locator('section', { hasText: '§ F · CANVAS (TIER-2)' }).first();
    await expect(showcase).toBeVisible();
    await showcase.screenshot({
      path: 'test-results/screenshots/blueprint-canvas-showcase.png',
    });
  });

  test('captures focused screenshot of the walkthrough canvas only', async ({ page }) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length > 0, {
      timeout: 5000,
    });
    await page.waitForTimeout(400);
    const canvas = page.locator('[data-testid="blueprint-canvas"]').first();
    await expect(canvas).toBeVisible();
    await canvas.screenshot({
      path: 'test-results/screenshots/blueprint-canvas-walkthrough.png',
    });
  });

  test('captures focused screenshot of the paired comparison canvas', async ({ page }) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length > 0, {
      timeout: 5000,
    });
    await page.waitForTimeout(600);
    const paired = page.locator('[data-testid="blueprint-paired-canvas"]').first();
    await expect(paired).toBeVisible();
    await paired.screenshot({
      path: 'test-results/screenshots/blueprint-canvas-paired.png',
    });
  });
});
