/**
 * Verifies Chunk 16: /rules page renders, the author form posts a
 * shell rule, the rule appears in the list with a TIER chip, and a
 * delete removes it.
 */
import { mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const WEB_PORT = process.env.CW_WEB_PORT ?? '5179';
const REPO_PATH = process.argv[2];
if (!REPO_PATH) {
  console.error('usage: capture-rules-page.ts <codebase-path>');
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
  await page.getByTestId('project-overview-rules-link').click();
  await page.waitForURL(/\/rules$/);
  await page.waitForSelector('[data-testid="rules-empty"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/rules-page-1-empty.png`, fullPage: true });

  await page.getByTestId('rules-author-classification').fill('repository');
  await page
    .getByTestId('rules-author-title')
    .fill('repo emits a domain error, not a raw DB error');
  await page.getByTestId('rules-author-command').fill('printf \'%s\' \'{"kind":"pass"}\'');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/rules-page-2-author-filled.png`, fullPage: true });
  await page.getByTestId('rules-author-submit').click();

  await page.waitForSelector('[data-testid="rules-list"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/rules-page-3-rule-listed.png`, fullPage: true });

  await page.locator('[data-testid^="rules-remove-"]').first().click();
  await page.waitForSelector('[data-testid="rules-empty"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/rules-page-4-removed.png`, fullPage: true });

  const v = page.video();
  await ctx.close();
  await browser.close();
  if (v) {
    const raw = await v.path();
    try {
      renameSync(raw, `${VIDS}/rules-page-flow.webm`);
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
