import { expect, test } from '@playwright/test';

test.describe('Walkthrough page', () => {
  test('renders the no-active-codebase surface when none is open', async ({ page }) => {
    await page.goto('/project/some-hash/path/some-path');
    const noActive = page.getByText('No active codebase');
    const failed = page.getByText('Failed to reach server');
    await expect(noActive.or(failed)).toBeVisible();
  });

  test('captures full-page screenshot of the no-codebase surface', async ({ page }) => {
    await page.goto('/project/some-hash/path/some-path');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: 'test-results/screenshots/walkthrough-no-codebase.png',
      fullPage: true,
    });
  });
});
