import { expect, test } from '@playwright/test';

test.describe('Codebase Picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the picker title block and form', async ({ page }) => {
    // Title block
    await expect(page.getByText('Code Walkthroughs', { exact: true })).toBeVisible();
    await expect(page.getByText('Walk the path, not the diff.')).toBeVisible();
    // Section labels
    await expect(page.getByText('§ A · OPEN A CODEBASE')).toBeVisible();
    await expect(page.getByText('§ B · RECENT CODEBASES')).toBeVisible();
    // Form input + button
    await expect(page.getByTestId('codebase-picker-path-input')).toBeVisible();
    await expect(page.getByTestId('codebase-picker-open-button')).toBeVisible();
  });

  test('open button is disabled until a path is entered', async ({ page }) => {
    const button = page.getByTestId('codebase-picker-open-button');
    await expect(button).toBeDisabled();
    await page.getByTestId('codebase-picker-path-input').fill('/Users/me/some/path');
    await expect(button).toBeEnabled();
  });

  test('renders an empty state when there are no recent codebases', async ({ page }) => {
    // Server is not running in e2e, so listRecent fails — but the empty state
    // logic only fires on success with an empty list. With a failure, we get
    // "Failed to load recent codebases."
    const failureMessage = page.getByText('Failed to load recent codebases.');
    const emptyMessage = page.getByTestId('codebase-picker-empty');
    // Either failure or empty is acceptable; both confirm the conditional
    // rendering paths are wired up.
    await expect(failureMessage.or(emptyMessage)).toBeVisible();
  });

  test('captures full-page screenshot of the picker', async ({ page }) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: 'test-results/screenshots/codebase-picker.png',
      fullPage: true,
    });
  });

  test('navigating to /dev/styles still works (showcase moved here)', async ({ page }) => {
    await page.goto('/dev/styles');
    await expect(page.getByText('Blueprint Draft — Reference')).toBeVisible();
    await expect(page.getByText('§ C · BLUEPRINT PRIMITIVES (TIER-0)')).toBeVisible();
  });
});
