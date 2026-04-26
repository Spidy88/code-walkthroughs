/**
 * Drives the picker → analysis → walkthrough flow against a running
 * backend, then exercises Chunk 8A's function-anchored comment
 * affordances:
 *
 *   1. Land on the walkthrough's first path; FIG. M · COMMENTS panel
 *      visible below the action row, empty state.
 *   2. Add the first comment via the composer.
 *   3. Add a second comment — both accumulate, ordered by createdAt.
 *   4. Edit the first comment in place — body changes; "edited"
 *      timestamp updates.
 *   5. Approve the focused node; comments are unaffected (status and
 *      comments are independent rows).
 *   6. Reload — comments survive via state.db.
 *   7. Delete the second comment; the first remains.
 *
 * Records both per-step screenshots AND a webm video.
 *
 * Run via: bash scripts/e2e-capture.sh \
 *   apps/web/e2e-capture/capture-comments.ts \
 *   <codebase-path>
 */
import { mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const WEB_PORT = process.env.CW_WEB_PORT ?? '5179';
const REPO_PATH = process.argv[2];
if (!REPO_PATH) {
  console.error('usage: capture-comments.ts <codebase-path>');
  process.exit(64);
}
const SHOTS_DIR = resolve(import.meta.dirname, '..', 'test-results', 'screenshots');
const VIDEO_DIR = resolve(import.meta.dirname, '..', 'test-results', 'videos');

const BEAT_LONG = 1200;

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

  console.log('→ Entering the first walkthrough');
  await page.getByTestId('project-overview-path-link').first().click();
  await page.waitForURL(/\/path\//);
  await page.waitForSelector('[data-testid="walkthrough-canvas"]');
  await page.waitForSelector('[data-testid="walkthrough-comment-draft"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/comments-1-initial.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Add first comment');
  await page
    .getByTestId('walkthrough-comment-draft')
    .fill('Auth check is upstream — confirmed via the middleware mount.');
  await page.getByTestId('walkthrough-comment-add').click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="walkthrough-comment-item-"]').length === 1,
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/comments-2-first-added.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Add second comment');
  await page
    .getByTestId('walkthrough-comment-draft')
    .fill('Should we add a rate-limit guard here? Open question.');
  await page.getByTestId('walkthrough-comment-add').click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="walkthrough-comment-item-"]').length === 2,
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/comments-3-two-comments.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Edit the first comment');
  // Click the first item's Edit button. Capture the IDs so the test is
  // resilient to ordering — earliest createdAt is the first item.
  const firstId = await page.evaluate(() => {
    const item = document.querySelector('[data-testid^="walkthrough-comment-item-"]');
    return item?.getAttribute('data-testid')?.replace('walkthrough-comment-item-', '') ?? null;
  });
  if (!firstId) throw new Error('expected a comment item');
  await page.getByTestId(`walkthrough-comment-edit-button-${firstId}`).click();
  await page.waitForSelector(`[data-testid="walkthrough-comment-edit-${firstId}"]`);
  await page.fill(
    `[data-testid="walkthrough-comment-edit-${firstId}"]`,
    'Auth check is upstream — confirmed via the middleware mount, see src/server.ts:14.',
  );
  await page.getByTestId(`walkthrough-comment-save-${firstId}`).click();
  await page.waitForFunction(
    (id) => !document.querySelector(`[data-testid="walkthrough-comment-edit-${id}"]`),
    firstId,
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/comments-4-edited.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Approve the focused node — comments must be unaffected');
  await page.getByTestId('walkthrough-action-approve').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="walkthrough-sequence-row-0"]')
        ?.getAttribute('data-runtime-state') === 'reviewed_current',
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/comments-5-approved-comments-intact.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Reload — comments persist via state.db');
  await page.reload();
  await page.waitForSelector('[data-testid="walkthrough-canvas"]');
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="walkthrough-comment-item-"]').length === 2,
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/comments-6-after-reload.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Delete the second comment');
  const secondId = await page.evaluate(() => {
    const items = document.querySelectorAll('[data-testid^="walkthrough-comment-item-"]');
    const second = items[1];
    return second?.getAttribute('data-testid')?.replace('walkthrough-comment-item-', '') ?? null;
  });
  if (!secondId) throw new Error('expected a second comment item');
  await page.getByTestId(`walkthrough-comment-delete-${secondId}`).click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="walkthrough-comment-item-"]').length === 1,
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/comments-7-deleted.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  const videoHandle = page.video();
  await context.close();
  await browser.close();

  if (videoHandle) {
    const rawPath = await videoHandle.path();
    const stablePath = `${VIDEO_DIR}/comments-flow.webm`;
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
