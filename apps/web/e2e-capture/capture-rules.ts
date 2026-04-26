/**
 * Verifies Chunk 15: built-in rule results show in the walkthrough
 * checklist sidebar — labels flip from UNCHECKED to PASS/FAIL/SKIP
 * with the rule message inline.
 */
import { mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const WEB_PORT = process.env.CW_WEB_PORT ?? '5179';
const REPO_PATH = process.argv[2];
if (!REPO_PATH) {
  console.error('usage: capture-rules.ts <codebase-path>');
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
  await page.getByTestId('project-overview-path-link').first().click();
  await page.waitForURL(/\/path\//);
  await page.waitForSelector('[data-testid="walkthrough-checklist-items"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/rules-1-walkthrough.png`, fullPage: true });

  // Move focus to the second path node — typically a service or
  // repository — to show a different rule set.
  await page.keyboard.press('j');
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${SHOTS}/rules-2-second-node.png`, fullPage: true });

  const v = page.video();
  await ctx.close();
  await browser.close();
  if (v) {
    const raw = await v.path();
    try {
      renameSync(raw, `${VIDS}/rules-flow.webm`);
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
