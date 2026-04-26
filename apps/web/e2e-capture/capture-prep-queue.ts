/**
 * Drives the picker → analysis flow, then exercises Chunk 9A's prep
 * queue:
 *
 *   1. Land on the project overview; click PREP QUEUE → to enter /prep.
 *   2. List shows pending classification questions emitted by stage 3
 *      (the express-tiny fixture has one for src/server.ts).
 *   3. Pick a classification from the dropdown and Apply.
 *   4. Question disappears from the pending list.
 *   5. Toggle "Show answered" — the answered question reappears with
 *      an ANSWERED chip; pending count drops to 0.
 *   6. Reload — the answer persists via state.db.
 *
 * Records both per-step screenshots AND a webm video.
 *
 * Run via: bash scripts/e2e-capture.sh \
 *   apps/web/e2e-capture/capture-prep-queue.ts \
 *   <codebase-path>
 */
import { mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const WEB_PORT = process.env.CW_WEB_PORT ?? '5179';
const REPO_PATH = process.argv[2];
if (!REPO_PATH) {
  console.error('usage: capture-prep-queue.ts <codebase-path>');
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

  console.log('→ Navigate to /prep via the PREP QUEUE link');
  await page.getByTestId('project-overview-prep-link').click();
  await page.waitForURL(/\/prep$/);
  await page.waitForSelector('[data-testid="prep-queue-list"], [data-testid="prep-queue-empty"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({ path: `${SHOTS_DIR}/prep-1-queue-pending.png`, fullPage: true });
  await page.waitForTimeout(BEAT_LONG);

  // The fixture is expected to surface at least one classification
  // prep question for src/server.ts. If not, fail clearly.
  const pendingCount = await page.locator('[data-testid="prep-queue-list"] > li').count();
  console.log(`  ${pendingCount} pending question(s)`);
  if (pendingCount === 0) {
    throw new Error('expected at least 1 pending prep question in the fixture');
  }

  console.log('→ Pick a classification and Apply');
  // Use the first question's classification select.
  const select = page.locator('[data-testid="prep-question-classification-select"]').first();
  await select.selectOption('config');
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({ path: `${SHOTS_DIR}/prep-2-selected.png`, fullPage: true });
  await page.locator('[data-testid="prep-question-answer-submit"]').first().click();

  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="prep-queue-list"] > li').length === 0,
    { timeout: 5000 },
  );
  await page.waitForSelector('[data-testid="prep-queue-empty"]');
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({ path: `${SHOTS_DIR}/prep-3-empty.png`, fullPage: true });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Toggle "Show answered" — the answered question reappears');
  await page.getByTestId('prep-queue-include-answered').check();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="prep-queue-list"] > li').length === 1,
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({ path: `${SHOTS_DIR}/prep-4-answered-shown.png`, fullPage: true });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Reload — answer persists via state.db');
  await page.reload();
  await page.waitForSelector('[data-testid="prep-queue-controls"]');
  // Default state is "pending only" — empty after reload.
  await page.waitForSelector('[data-testid="prep-queue-empty"]');
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({ path: `${SHOTS_DIR}/prep-5-after-reload.png`, fullPage: true });
  await page.waitForTimeout(BEAT_LONG);

  const videoHandle = page.video();
  await context.close();
  await browser.close();

  if (videoHandle) {
    const rawPath = await videoHandle.path();
    const stablePath = `${VIDEO_DIR}/prep-queue-flow.webm`;
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
