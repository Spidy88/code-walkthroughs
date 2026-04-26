import { expect, test } from '@playwright/test';

test.describe('Project overview', () => {
  test('renders the no-active-codebase surface when none is open', async ({ page }) => {
    await page.goto('/project/some-hash');
    const noActive = page.getByText('No active codebase');
    const failed = page.getByText('Failed to reach server');
    await expect(noActive.or(failed)).toBeVisible();
  });

  test('the path detail route renders the walkthrough surface (no-codebase fallback)', async ({
    page,
  }) => {
    await page.goto('/project/some-hash/path/some-path');
    const noActive = page.getByText('No active codebase');
    const failed = page.getByText('Failed to reach server');
    await expect(noActive.or(failed)).toBeVisible();
  });

  test('captures screenshot of the project route no-codebase state', async ({ page }) => {
    await page.goto('/project/some-hash');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: 'test-results/screenshots/project-overview-no-codebase.png',
      fullPage: true,
    });
  });
});
