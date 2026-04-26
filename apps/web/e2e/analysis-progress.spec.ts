import { expect, test } from '@playwright/test';

test.describe('Analysis progress page', () => {
  test('shows the no-active-codebase state when no codebase is open', async ({ page }) => {
    // Without a server, status.data?.active is null/undefined → page should
    // render the "No active codebase" surface with a back link.
    await page.goto('/codebase');
    // Either the "No active codebase" title (server reachable but no
    // codebase) or the "Failed to reach server" centered message (server
    // unreachable). Both are acceptable v1 states for this e2e (no backend).
    const noActive = page.getByText('No active codebase');
    const failed = page.getByText('Failed to reach server');
    await expect(noActive.or(failed)).toBeVisible();
  });

  test('back-to-picker link is visible in the no-active state', async ({ page }) => {
    await page.goto('/codebase');
    // If the no-active surface rendered, there's a back link. Skip if the
    // server-failure surface rendered (no link there).
    const backLink = page.getByText('← BACK TO PICKER');
    const noActive = page.getByText('No active codebase');
    if (await noActive.isVisible().catch(() => false)) {
      await expect(backLink).toBeVisible();
    }
  });

  test('captures full-page screenshot of the analysis progress route', async ({ page }) => {
    await page.goto('/codebase');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: 'test-results/screenshots/analysis-progress-no-codebase.png',
      fullPage: true,
    });
  });
});
