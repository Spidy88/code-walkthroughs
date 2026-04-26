/**
 * Drives the picker → analysis → file browser flow, then exercises
 * Chunk 10B's file-level cascade in three modes:
 *
 *   1. No-conflict — open a fresh file, Approve file, all functions
 *      transition to APPROVED in one shot.
 *   2. Preserve — open a file with a function we'll first reject by
 *      itself, then trigger an Approve file. Conflict prompt fires;
 *      Preserve keeps the prior reject and applies approved to the
 *      rest.
 *   3. Override — repeat the conflict scenario but pick Override; the
 *      prior reject is replaced by approved.
 *
 * Run via: bash scripts/e2e-capture.sh \
 *   apps/web/e2e-capture/capture-file-cascade.ts \
 *   <codebase-path>
 */
import { mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const WEB_PORT = process.env.CW_WEB_PORT ?? '5179';
const REPO_PATH = process.argv[2];
if (!REPO_PATH) {
  console.error('usage: capture-file-cascade.ts <codebase-path>');
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

  console.log('→ Continuing to overview, then file browser');
  await page.getByTestId('analysis-progress-continue').click();
  await page.waitForURL(/\/project\//);
  await page.waitForSelector('[data-testid="project-overview-summary"]');
  await page.waitForTimeout(BEAT_LONG);
  await page.getByTestId('project-overview-files-link').click();
  await page.waitForURL(/\/files\/?$/);
  await page.waitForSelector('[data-testid="file-tree-list"]');
  await page.waitForTimeout(BEAT_LONG);

  // Mode 1: clean approval on src/db/orderRepo.ts (untouched).
  console.log('→ [no-conflict] open src/db/orderRepo.ts');
  await page.getByTestId('file-tree-row-src/db/orderRepo.ts').click();
  await page.waitForSelector('[data-testid="file-detail-source"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({ path: `${SHOTS_DIR}/cascade-1-fresh-file.png`, fullPage: true });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Approve file (no conflict)');
  await page.getByTestId('file-action-approve').click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-testid^="file-detail-fn-"]').length > 0 &&
      Array.from(document.querySelectorAll('[data-testid^="file-detail-fn-"]')).every((row) =>
        row.textContent?.includes('APPROVED'),
      ),
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/cascade-2-no-conflict-approved.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  // Setup the conflict scenario: open routes/users.ts, navigate to
  // the walkthrough for a path passing through it (or just use the
  // sequence row's data-runtime-state). Actually simpler: set a
  // function-level reject directly via the trpc API by opening the
  // walkthrough. That's heavy. Instead, navigate to a different file
  // and reject one of its functions before triggering the cascade.
  //
  // Simplest setup using only the file view: there is no per-function
  // approve in this view today. So we trigger a function-level
  // reject from the walkthrough and then come back. To keep this
  // capture self-contained, we use the prep queue approach:
  //   - Approve the file that currently shows a `prep classification`
  //     question (src/server.ts) — but that file has no conflicts
  //     yet either.
  //
  // Pragmatic: drive a function-level review via the walkthrough
  // page. We know listMyOrders is in src/routes/orders.ts and the
  // first path's first node is listMyOrders. Reject it from the
  // walkthrough, then come back to file detail for orders.ts and
  // try Approve file.
  console.log('→ Set up conflict — reject listMyOrders via the walkthrough');
  await page.goto(`http://localhost:${WEB_PORT}/`);
  // The picker should still show this codebase as recent — bounce
  // through analysis-progress to reach overview, which gives us the
  // walkthrough link list deterministically.
  await page.getByTestId('codebase-picker-path-input').fill(REPO_PATH);
  await page.getByTestId('codebase-picker-open-button').click();
  await page.waitForURL(/\/codebase$/);
  await page.waitForSelector('[data-testid="analysis-progress-summary"]', { timeout: 60_000 });
  await page.getByTestId('analysis-progress-continue').click();
  await page.waitForURL(/\/project\//);
  await page.getByTestId('project-overview-path-link').first().click();
  await page.waitForURL(/\/path\//);
  await page.waitForSelector('[data-testid="walkthrough-canvas"]');
  await page.getByTestId('walkthrough-action-comment').fill('handler missing rate limit');
  await page.getByTestId('walkthrough-action-reject').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="walkthrough-sequence-row-0"]')
        ?.getAttribute('data-runtime-state') === 'reviewed_current',
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Back to file detail for orders.ts');
  await page.goto(`${page.url().replace(/\/path\/.*$/, '')}/files/src/routes/orders.ts`);
  await page.waitForSelector('[data-testid="file-detail-source"]');
  await page.waitForFunction(
    () => {
      const rows = document.querySelectorAll('[data-testid^="file-detail-fn-"]');
      return Array.from(rows).some((r) => r.textContent?.includes('REJECTED'));
    },
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Trigger Approve file → conflict prompt');
  await page.getByTestId('file-action-approve').click();
  await page.waitForSelector('[data-testid="file-action-conflict-prompt"]');
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/cascade-3-conflict-prompt.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Pick Preserve');
  await page.getByTestId('file-action-conflict-preserve').click();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="file-action-conflict-prompt"]'),
    { timeout: 5000 },
  );
  await page.waitForFunction(
    () => {
      const rows = Array.from(document.querySelectorAll('[data-testid^="file-detail-fn-"]'));
      // listMyOrders should still be REJECTED, the others APPROVED.
      const stillRejected = rows.some((r) => r.textContent?.includes('REJECTED'));
      const someApproved = rows.some((r) => r.textContent?.includes('APPROVED'));
      return stillRejected && someApproved;
    },
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/cascade-4-preserve-applied.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Trigger Approve file again, this time Override');
  await page.getByTestId('file-action-approve').click();
  await page.waitForSelector('[data-testid="file-action-conflict-prompt"]');
  await page.waitForTimeout(BEAT_LONG);
  await page.getByTestId('file-action-conflict-override').click();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="file-action-conflict-prompt"]'),
    { timeout: 5000 },
  );
  await page.waitForFunction(
    () => {
      const rows = Array.from(document.querySelectorAll('[data-testid^="file-detail-fn-"]'));
      // No row should still be REJECTED after override.
      return rows.length > 0 && rows.every((r) => r.textContent?.includes('APPROVED'));
    },
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/cascade-5-override-applied.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  const videoHandle = page.video();
  await context.close();
  await browser.close();

  if (videoHandle) {
    const rawPath = await videoHandle.path();
    const stablePath = `${VIDEO_DIR}/file-cascade-flow.webm`;
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
