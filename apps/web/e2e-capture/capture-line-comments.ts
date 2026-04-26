/**
 * Drives the picker → analysis → walkthrough flow, then exercises
 * Chunk 8B's line-range comment affordance:
 *
 *   1. Land on the walkthrough; the focused canvas code panel renders
 *      lines with a clickable line-number gutter.
 *   2. Click a line number → 1-line selection; FIG. M · COMMENT ON
 *      composer banner appears above the action row.
 *   3. Shift-click another line → range extends.
 *   4. Submit a comment → comment list shows it with an "L X–Y"
 *      badge; the gutter highlights those lines (info color).
 *   5. Reload — the line-anchored comment survives via state.db; the
 *      gutter highlight returns.
 *   6. Click another line → 1-line selection on a different line; the
 *      first comment's gutter still shows.
 *
 * Records both per-step screenshots AND a webm video.
 *
 * Run via: bash scripts/e2e-capture.sh \
 *   apps/web/e2e-capture/capture-line-comments.ts \
 *   <codebase-path>
 */
import { mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const WEB_PORT = process.env.CW_WEB_PORT ?? '5179';
const REPO_PATH = process.argv[2];
if (!REPO_PATH) {
  console.error('usage: capture-line-comments.ts <codebase-path>');
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

  console.log('→ Entering the first walkthrough');
  await page.getByTestId('project-overview-path-link').first().click();
  await page.waitForURL(/\/path\//);
  await page.waitForSelector('[data-testid="canvas-code-body"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(BEAT_LONG);

  // Discover the line numbers visible in the gutter. Earlier lines are
  // typically the function signature; pick a few rows in to land on
  // body lines (more interesting comment targets).
  const gutterLines = await page.evaluate(() => {
    const buttons = Array.from(
      document.querySelectorAll('[data-testid^="canvas-line-gutter-"]'),
    ) as HTMLElement[];
    return buttons
      .map((b) => Number(b.getAttribute('data-testid')?.replace('canvas-line-gutter-', '')))
      .filter((n) => Number.isFinite(n));
  });
  if (gutterLines.length < 4) {
    throw new Error('expected at least 4 selectable lines in the focused code body');
  }
  const lineA = gutterLines[2];
  const lineB = gutterLines[5] ?? gutterLines[gutterLines.length - 1];
  if (lineA === undefined || lineB === undefined) {
    throw new Error('gutter line indices were not assigned');
  }
  console.log(`  initial range will be: L${lineA}–L${lineB}`);

  await page.screenshot({ path: `${SHOTS_DIR}/line-1-initial.png`, fullPage: true });
  await page.waitForTimeout(BEAT_LONG);

  console.log(`→ Click L${lineA} — single-line selection`);
  await page.getByTestId(`canvas-line-gutter-${lineA}`).click();
  await page.waitForSelector('[data-testid="walkthrough-line-composer"]');
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/line-2-single-selected.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  console.log(`→ Shift-click L${lineB} — extend the range`);
  await page.getByTestId(`canvas-line-gutter-${lineB}`).click({ modifiers: ['Shift'] });
  await page.waitForFunction(
    ({ a, b }) => {
      const composer = document.querySelector('[data-testid="walkthrough-line-composer"]');
      const start = Number(composer?.getAttribute('data-line-start'));
      const end = Number(composer?.getAttribute('data-line-end'));
      return start === Math.min(a, b) && end === Math.max(a, b);
    },
    { a: lineA, b: lineB },
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/line-3-range-extended.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Submit the line-range comment');
  await page
    .getByTestId('walkthrough-line-composer-draft')
    .fill('Auth check happens before this block — confirm.');
  await page.getByTestId('walkthrough-line-composer-submit').click();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="walkthrough-line-composer"]'),
    { timeout: 5000 },
  );
  await page.waitForSelector('[data-testid^="walkthrough-comment-line-badge-"]', {
    timeout: 5000,
  });
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/line-4-submitted.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Reload — line-anchored comment + gutter highlight survive');
  await page.reload();
  await page.waitForSelector('[data-testid="canvas-code-body"]');
  await page.waitForSelector('[data-testid^="walkthrough-comment-line-badge-"]', {
    timeout: 5000,
  });
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/line-5-after-reload.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Click another line — selection moves; first comment gutter persists');
  const lineC = gutterLines[1] ?? lineA;
  await page.getByTestId(`canvas-line-gutter-${lineC}`).click();
  await page.waitForSelector('[data-testid="walkthrough-line-composer"]');
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/line-6-second-selection.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  const videoHandle = page.video();
  await context.close();
  await browser.close();

  if (videoHandle) {
    const rawPath = await videoHandle.path();
    const stablePath = `${VIDEO_DIR}/line-comments-flow.webm`;
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
