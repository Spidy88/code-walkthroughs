/**
 * Drives the picker → analysis → walkthrough flow, then exercises
 * Chunk 9B's mid-walkthrough path_branch prep injection:
 *
 *   1. Land on a path whose first node has multiple resolvable
 *      callees (the express-tiny placeOrder route — calls both
 *      createOrder and chargeOrder).
 *   2. The PREP · BRANCH banner appears inline above the canvas with
 *      a button per candidate.
 *   3. Click the non-default candidate (chargeOrder).
 *   4. The mutation persists the answer + kicks off re-analysis.
 *      Once it settles, the path_nodes table is rewritten so the
 *      path now traces through the chosen branch.
 *   5. The banner disappears (no pending question) and the path
 *      sequence reflects the new walk.
 *   6. Reload — the new path persists.
 *
 * Run via: bash scripts/e2e-capture.sh \
 *   apps/web/e2e-capture/capture-prep-branch.ts \
 *   <codebase-path>
 */
import { mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const WEB_PORT = process.env.CW_WEB_PORT ?? '5179';
const REPO_PATH = process.argv[2];
if (!REPO_PATH) {
  console.error('usage: capture-prep-branch.ts <codebase-path>');
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

  console.log('→ Find a walkthrough that surfaces a path_branch prompt');
  await page.getByTestId('project-overview-path-link').first().waitFor();
  const totalPaths = await page.getByTestId('project-overview-path-link').count();
  let landed = false;
  for (let i = 0; i < totalPaths; i++) {
    if (i > 0) {
      await page.goBack();
      await page.waitForSelector('[data-testid="project-overview-summary"]');
      await page.waitForTimeout(500);
    }
    await page.getByTestId('project-overview-path-link').nth(i).click();
    await page.waitForURL(/\/path\//);
    await page.waitForSelector('[data-testid="walkthrough-canvas"]');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const hasPrompt =
      (await page.locator('[data-testid="walkthrough-path-branch-prompt"]').count()) > 0;
    console.log(`  path #${i + 1}: prompt=${hasPrompt}`);
    if (hasPrompt) {
      landed = true;
      break;
    }
  }
  if (!landed) {
    throw new Error('no path with a path_branch prep prompt found in this fixture');
  }
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({ path: `${SHOTS_DIR}/branch-1-prompt.png`, fullPage: true });
  await page.waitForTimeout(BEAT_LONG);

  // Discover candidates so the capture targets a non-default one.
  // detectPaths follows the first resolvable callee, so picking the
  // last candidate guarantees a path change.
  const candidates = await page.evaluate(() => {
    const buttons = Array.from(
      document.querySelectorAll('[data-testid^="walkthrough-path-branch-candidate-"]'),
    ) as HTMLElement[];
    return buttons.map((b) => ({
      identity: b.getAttribute('data-testid')?.replace('walkthrough-path-branch-candidate-', ''),
      label: b.textContent?.trim() ?? '',
    }));
  });
  console.log(`  candidates: ${JSON.stringify(candidates)}`);
  if (candidates.length < 2 || !candidates[candidates.length - 1]?.identity) {
    throw new Error('expected at least two branch candidates');
  }
  const chosen = candidates[candidates.length - 1] as { identity: string; label: string };
  console.log(`  picking: ${chosen.label}`);

  console.log('→ Click the non-default candidate (re-analysis fires)');
  // Capture the path_nodes signature before the answer.
  const beforeNames = await sequenceNames(page);
  console.log(`  path before: ${beforeNames.join(' → ')}`);

  await page.locator(`[data-testid="walkthrough-path-branch-candidate-${chosen.identity}"]`).click();
  // re-analyzing… banner shows briefly while analysis.run completes.
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({ path: `${SHOTS_DIR}/branch-2-reanalyzing.png`, fullPage: true });

  // The answered question is no longer pending → banner goes away.
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="walkthrough-path-branch-prompt"]'),
    { timeout: 30_000 },
  );
  await page.waitForTimeout(BEAT_LONG);

  // Sanity-check the sequence shifted to the chosen branch.
  const afterNames = await sequenceNames(page);
  console.log(`  path after: ${afterNames.join(' → ')}`);
  if (JSON.stringify(beforeNames) === JSON.stringify(afterNames)) {
    throw new Error('path did not shift after answering the branch — re-analysis no-op?');
  }
  await page.screenshot({ path: `${SHOTS_DIR}/branch-3-rewalked.png`, fullPage: true });
  await page.waitForTimeout(BEAT_LONG);

  console.log('→ Reload — the new path persists');
  await page.reload();
  await page.waitForSelector('[data-testid="walkthrough-canvas"]');
  const reloadedNames = await sequenceNames(page);
  console.log(`  path after reload: ${reloadedNames.join(' → ')}`);
  if (JSON.stringify(reloadedNames) !== JSON.stringify(afterNames)) {
    throw new Error('path drifted between answer and reload — persistence broken?');
  }
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({ path: `${SHOTS_DIR}/branch-4-after-reload.png`, fullPage: true });
  await page.waitForTimeout(BEAT_LONG);

  const videoHandle = page.video();
  await context.close();
  await browser.close();

  if (videoHandle) {
    const rawPath = await videoHandle.path();
    const stablePath = `${VIDEO_DIR}/prep-branch-flow.webm`;
    try {
      renameSync(rawPath, stablePath);
      console.log(`✓ Video saved to ${stablePath}`);
    } catch (err) {
      console.warn(`could not rename video ${rawPath} → ${stablePath}:`, err);
    }
  }
  console.log(`✓ Screenshots saved to ${SHOTS_DIR}`);
}

async function sequenceNames(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll('[data-testid^="walkthrough-sequence-row-"]'),
    ) as HTMLElement[];
    return rows.map((row) => {
      const name = row.querySelector('.font-mono.text-sm')?.textContent ?? '';
      return name.trim();
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
