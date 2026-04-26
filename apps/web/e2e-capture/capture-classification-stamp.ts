/**
 * Quick capture verifying Chunk 11's classification stamp renders in
 * the walkthrough sequence and the file-detail view. Visible markers:
 * S1 / S2 / REV (source) and a confidence letter (H/M/L/N) tinted by
 * tier. With LLM off the express-tiny fixture should show S1 · M
 * everywhere.
 */
import { mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const WEB_PORT = process.env.CW_WEB_PORT ?? '5179';
const REPO_PATH = process.argv[2];
if (!REPO_PATH) {
  console.error('usage: capture-classification-stamp.ts <codebase-path>');
  process.exit(64);
}
const SHOTS_DIR = resolve(import.meta.dirname, '..', 'test-results', 'screenshots');
const VIDEO_DIR = resolve(import.meta.dirname, '..', 'test-results', 'videos');
const BEAT = 1100;

async function main(): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  mkdirSync(VIDEO_DIR, { recursive: true });
  const viewport = { width: 1440, height: 1100 };
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir: VIDEO_DIR, size: viewport },
  });
  const page = await context.newPage();

  await page.goto(`http://localhost:${WEB_PORT}/`);
  await page.waitForSelector('text=§ A · OPEN A CODEBASE');
  await page.getByTestId('codebase-picker-path-input').fill(REPO_PATH);
  await page.getByTestId('codebase-picker-open-button').click();
  await page.waitForURL(/\/codebase$/);
  await page.waitForSelector('[data-testid="analysis-progress-summary"]', { timeout: 60_000 });
  await page.getByTestId('analysis-progress-continue').click();
  await page.waitForURL(/\/project\//);
  await page.waitForSelector('[data-testid="project-overview-summary"]');

  await page.getByTestId('project-overview-path-link').first().click();
  await page.waitForURL(/\/path\//);
  await page.waitForSelector('[data-testid="walkthrough-canvas"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(BEAT);
  await page.screenshot({ path: `${SHOTS_DIR}/stamp-1-walkthrough.png`, fullPage: true });

  await page.goto(`${page.url().replace(/\/path\/.*$/, '')}/files/src/routes/orders.ts`);
  await page.waitForSelector('[data-testid="file-detail-source"]');
  await page.waitForTimeout(BEAT);
  await page.screenshot({ path: `${SHOTS_DIR}/stamp-2-file-detail.png`, fullPage: true });

  const v = page.video();
  await context.close();
  await browser.close();
  if (v) {
    const raw = await v.path();
    try {
      renameSync(raw, `${VIDEO_DIR}/classification-stamp-flow.webm`);
    } catch (err) {
      console.warn(`could not rename video ${raw}:`, err);
    }
  }
  console.log('✓ saved screenshots + video');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
