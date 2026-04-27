/**
 * Verifies Chunk 25: walkthrough flow works against a directory
 * that is NOT a git repository. The COMPARISON link in the project
 * overview footer should also surface as disabled with a "no git"
 * tag.
 */
import { mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const WEB_PORT = process.env.CW_WEB_PORT ?? '5179';
const REPO_PATH = process.argv[2];
if (!REPO_PATH) {
  console.error('usage: capture-non-git.ts <non-git-codebase-path>');
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
  await page.waitForSelector('[data-testid="project-overview-summary"]');
  await page.waitForSelector('[data-testid="project-overview-comparison-link-disabled"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/non-git-overview.png`, fullPage: true });

  const v = page.video();
  await ctx.close();
  await browser.close();
  if (v) {
    const raw = await v.path();
    try {
      renameSync(raw, `${VIDS}/non-git-flow.webm`);
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
