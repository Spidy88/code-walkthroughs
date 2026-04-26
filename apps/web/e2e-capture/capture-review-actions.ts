/**
 * Drives the picker → analysis → walkthrough flow against a running
 * backend, then exercises the review actions: approve the focused node,
 * advance, reject, advance, request info (with required comment).
 * Captures a screenshot at each step so we can verify the four-state
 * runtime behavior end-to-end.
 *
 * Run via: bash scripts/e2e-capture.sh \
 *   apps/web/e2e-capture/capture-review-actions.ts \
 *   <codebase-path>
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const WEB_PORT = process.env.CW_WEB_PORT ?? '5179';
const REPO_PATH = process.argv[2];
if (!REPO_PATH) {
  console.error('usage: capture-review-actions.ts <codebase-path>');
  process.exit(64);
}
const OUT_DIR = resolve(import.meta.dirname, '..', 'test-results', 'screenshots');

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();

  page.on('pageerror', (err) => console.log(`  [browser/pageerror] ${err.message}`));

  console.log('→ Opening codebase + analyzing');
  await page.goto(`http://localhost:${WEB_PORT}/`);
  await page.waitForSelector('text=§ A · OPEN A CODEBASE');
  await page.getByTestId('codebase-picker-path-input').fill(REPO_PATH);
  await page.getByTestId('codebase-picker-open-button').click();
  await page.waitForURL(/\/codebase$/);
  await page.waitForSelector('[data-testid="analysis-progress-summary"]', { timeout: 60_000 });

  console.log('→ Continuing to overview');
  await page.getByTestId('analysis-progress-continue').click();
  await page.waitForURL(/\/project\//);
  await page.waitForSelector('[data-testid="project-overview-summary"]');

  console.log('→ Entering walkthrough');
  await page.getByTestId('project-overview-path-link').first().click();
  await page.waitForURL(/\/path\//);
  await page.waitForSelector('[data-testid="walkthrough-canvas"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);

  console.log('→ Capturing initial state (never_reviewed)');
  await page.screenshot({
    path: `${OUT_DIR}/review-actions-1-initial.png`,
    fullPage: true,
  });

  console.log('→ Approve focused node (position 1)');
  await page.getByTestId('walkthrough-action-comment').fill('Looks good — auth check is upstream.');
  await page.getByTestId('walkthrough-action-approve').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="walkthrough-sequence-row-0"]')
        ?.getAttribute('data-runtime-state') === 'reviewed_current',
    { timeout: 5000 },
  );
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${OUT_DIR}/review-actions-2-approved.png`,
    fullPage: true,
  });

  console.log('→ Advance + reject position 2');
  await page.keyboard.press('j');
  await page.waitForTimeout(400);
  await page
    .getByTestId('walkthrough-action-comment')
    .fill('Service is too tightly coupled to the repo.');
  await page.getByTestId('walkthrough-action-reject').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="walkthrough-sequence-row-1"]')
        ?.getAttribute('data-runtime-state') === 'reviewed_current',
    { timeout: 5000 },
  );
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${OUT_DIR}/review-actions-3-rejected.png`,
    fullPage: true,
  });

  console.log('→ Advance + request info on position 3');
  await page.keyboard.press('j');
  await page.waitForTimeout(400);
  await page
    .getByTestId('walkthrough-action-comment')
    .fill('Why is the userId compared with === and not Number()?');
  await page.getByTestId('walkthrough-action-info').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="walkthrough-sequence-row-2"]')
        ?.getAttribute('data-runtime-state') === 'info_requested',
    { timeout: 5000 },
  );
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${OUT_DIR}/review-actions-4-info-requested.png`,
    fullPage: true,
  });

  console.log('→ Reload — verify status persists');
  await page.reload();
  await page.waitForSelector('[data-testid="walkthrough-canvas"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.screenshot({
    path: `${OUT_DIR}/review-actions-5-after-reload.png`,
    fullPage: true,
  });

  await browser.close();
  console.log(`✓ Screenshots saved to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
