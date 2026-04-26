/**
 * Drives the picker → analysis flow, then exercises Chunk 10A's
 * file browser:
 *
 *   1. From overview, click FILE BROWSER → to enter /project/.../files.
 *   2. The tree lists every analyzed file with a classification chip
 *      and runtime-state count chips per file.
 *   3. Click a file (one with a known fork — src/routes/orders.ts) to
 *      enter the file detail view.
 *   4. The file view renders the source line by line with the
 *      function-level chip dropped at each function's signature row;
 *      the right-hand FIG. N · NODES sidebar lists every analyzed
 *      function with classification + runtime-state chips.
 *   5. Reload — page renders the same content.
 *
 * Run via: bash scripts/e2e-capture.sh \
 *   apps/web/e2e-capture/capture-file-browser.ts \
 *   <codebase-path>
 */
import { mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const WEB_PORT = process.env.CW_WEB_PORT ?? '5179';
const REPO_PATH = process.argv[2];
if (!REPO_PATH) {
  console.error('usage: capture-file-browser.ts <codebase-path>');
  process.exit(64);
}
const SHOTS_DIR = resolve(import.meta.dirname, '..', 'test-results', 'screenshots');
const VIDEO_DIR = resolve(import.meta.dirname, '..', 'test-results', 'videos');
const BEAT_LONG = 1300;

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
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Click FILE BROWSER → from overview');
  await page.getByTestId('project-overview-files-link').click();
  await page.waitForURL(/\/files$/);
  await page.waitForSelector('[data-testid="file-tree-list"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({ path: `${SHOTS_DIR}/file-1-tree.png`, fullPage: true });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Open src/routes/orders.ts');
  await page.getByTestId('file-tree-row-src/routes/orders.ts').click();
  await page.waitForSelector('[data-testid="file-detail-source"]');
  await page.waitForSelector('[data-testid="file-detail-functions"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({ path: `${SHOTS_DIR}/file-2-detail.png`, fullPage: true });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Reload — same content renders');
  await page.reload();
  await page.waitForSelector('[data-testid="file-detail-source"]');
  await page.waitForSelector('[data-testid="file-detail-functions"]');
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({ path: `${SHOTS_DIR}/file-3-after-reload.png`, fullPage: true });
  await page.waitForTimeout(BEAT_LONG);

  const videoHandle = page.video();
  await context.close();
  await browser.close();

  if (videoHandle) {
    const rawPath = await videoHandle.path();
    const stablePath = `${VIDEO_DIR}/file-browser-flow.webm`;
    try {
      renameSync(rawPath, stablePath);
      console.log(`✓ Video saved to ${stablePath}`);
    } catch (err) {
      console.warn(`could not rename video ${rawPath} → ${stablePath}:`, err);
    }
  }
  console.log(`✓ Screenshots saved to ${SHOTS_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
