/**
 * Verifies Chunk 17: /progress dashboard shows codebase + per-path
 * coverage, and the codebase Reset clears every active review row.
 */
import { mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const WEB_PORT = process.env.CW_WEB_PORT ?? '5179';
const REPO_PATH = process.argv[2];
if (!REPO_PATH) {
  console.error('usage: capture-progress.ts <codebase-path>');
  process.exit(64);
}
const SHOTS = resolve(import.meta.dirname, '..', 'test-results', 'screenshots');
const VIDS = resolve(import.meta.dirname, '..', 'test-results', 'videos');

async function main(): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  mkdirSync(VIDS, { recursive: true });
  const viewport = { width: 1440, height: 1100 };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, recordVideo: { dir: VIDS, size: viewport } });
  const page = await ctx.newPage();

  await page.goto(`http://localhost:${WEB_PORT}/`);
  await page.waitForSelector('text=§ A · OPEN A CODEBASE');
  await page.getByTestId('codebase-picker-path-input').fill(REPO_PATH);
  await page.getByTestId('codebase-picker-open-button').click();
  await page.waitForURL(/\/codebase$/);
  await page.waitForSelector('[data-testid="analysis-progress-summary"]', { timeout: 60_000 });
  await page.getByTestId('analysis-progress-continue').click();
  await page.waitForURL(/\/project\//);

  // Approve the focused node on the first path so the dashboard
  // has something to show.
  await page.getByTestId('project-overview-path-link').first().click();
  await page.waitForURL(/\/path\//);
  await page.waitForSelector('[data-testid="walkthrough-canvas"]');
  await page.getByTestId('walkthrough-action-approve').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="walkthrough-sequence-row-0"]')
        ?.getAttribute('data-runtime-state') === 'reviewed_current',
    { timeout: 5000 },
  );

  await page.goto(`http://localhost:${WEB_PORT}/progress`);
  await page.waitForSelector('[data-testid="progress-codebase-counts"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/progress-1-initial.png`, fullPage: true });

  await page.getByTestId('progress-reset-codebase').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="progress-codebase-counts"]')
        ?.textContent?.includes('0') ?? false,
    { timeout: 5000 },
  );
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/progress-2-after-reset.png`, fullPage: true });

  const v = page.video();
  await ctx.close();
  await browser.close();
  if (v) {
    const raw = await v.path();
    try {
      renameSync(raw, `${VIDS}/progress-flow.webm`);
    } catch (err) {
      console.warn('rename failed:', err);
    }
  }
  console.log('✓ saved');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
