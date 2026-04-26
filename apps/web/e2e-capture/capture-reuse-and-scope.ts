/**
 * Drives the picker → analysis → walkthrough flow against a running
 * backend, then exercises Chunk 7B affordances:
 *
 *   1. Find a path with at least one off-path callee.
 *   2. Path-scope approve the callee (radio toggle → APPLIES TO: This
 *      path) so it carries a path-scoped status.
 *   3. Click the dig-into edge to that callee → reuse prompt appears
 *      (Skip / Re-examine), since the callee already has prior status.
 *   4. Click SKIP → no dig happens; prompt dismisses.
 *   5. Click the dig-into edge again → reuse prompt re-appears.
 *   6. Click RE-EXAMINE → dig advances to the callee.
 *   7. On the dug-in callee, the action row shows a PATH SCOPED chip
 *      and a PROMOTE TO GLOBAL button; click promote.
 *   8. Reload — verify the callee now reports global scope (no PATH
 *      SCOPED chip).
 *
 * Records both per-step screenshots AND a webm video, with deliberate
 * beats between actions so the recording is watchable.
 *
 * Run via: bash scripts/e2e-capture.sh \
 *   apps/web/e2e-capture/capture-reuse-and-scope.ts \
 *   <codebase-path>
 */
import { mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const WEB_PORT = process.env.CW_WEB_PORT ?? '5179';
const REPO_PATH = process.argv[2];
if (!REPO_PATH) {
  console.error('usage: capture-reuse-and-scope.ts <codebase-path>');
  process.exit(64);
}
const SHOTS_DIR = resolve(import.meta.dirname, '..', 'test-results', 'screenshots');
const VIDEO_DIR = resolve(import.meta.dirname, '..', 'test-results', 'videos');

const BEAT_SHORT = 700;
const BEAT_LONG = 1500;

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

  console.log('→ Pick the first path with off-path callees');
  await page.getByTestId('project-overview-path-link').first().waitFor();
  const totalPaths = await page.getByTestId('project-overview-path-link').count();
  let landed = false;
  for (let i = 0; i < totalPaths; i++) {
    if (i > 0) {
      await page.goBack();
      await page.waitForSelector('[data-testid="project-overview-summary"]');
      await page.waitForTimeout(BEAT_SHORT);
    }
    await page.getByTestId('project-overview-path-link').nth(i).click();
    await page.waitForURL(/\/path\//);
    await page.waitForSelector('[data-testid="walkthrough-canvas"]');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(BEAT_SHORT);
    const calleeCount = await page.locator('[data-id^="callee-edge:"]').count();
    if (calleeCount > 0) {
      console.log(`  picked path #${i + 1}`);
      landed = true;
      break;
    }
  }
  if (!landed) {
    throw new Error('no path with off-path callees found in this fixture');
  }
  await page.waitForTimeout(BEAT_LONG);

  // Capture the dig-edge target identity now so we can dig into it
  // directly later (after path-scoping it from the focused path node).
  const targetCalleeIdentity = await page.evaluate(() => {
    const edge = document.querySelector('[data-id^="callee-edge:"]');
    const dataId = edge?.getAttribute('data-id') ?? '';
    // data-id format: callee-edge:<source>-><target>
    const arrowIdx = dataId.indexOf('->');
    return arrowIdx > 0 ? dataId.slice(arrowIdx + 2) : null;
  });
  console.log(`  off-path callee: ${targetCalleeIdentity}`);

  console.log('→ Capture initial state');
  await page.screenshot({ path: `${SHOTS_DIR}/reuse-1-initial.png`, fullPage: true });
  await page.waitForTimeout(BEAT_LONG);

  // Step A: dig into the callee (no prior status yet — no prompt).
  console.log('→ Dig into the callee (no prior status — straight in)');
  await page.evaluate(() => {
    const edge = document.querySelector('[data-id^="callee-edge:"]');
    edge?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="walkthrough-canvas"]')
        ?.getAttribute('data-dig-depth') === '1',
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);

  // Step B: path-scope approve the dug-in callee.
  console.log('→ Path-scope APPROVE the callee');
  await page.getByTestId('walkthrough-action-scope-path').click();
  await page.waitForTimeout(BEAT_SHORT);
  await page.getByTestId('walkthrough-action-comment').fill('Trusted on this path only.');
  await page.getByTestId('walkthrough-action-approve').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="walkthrough-action-promote"]') !== null,
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/reuse-2-path-approved.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  // Pop back so the dig edge to the now-reviewed callee fires the
  // reuse prompt on next click.
  console.log('→ Pop back to the path level');
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="walkthrough-canvas"]')
        ?.getAttribute('data-dig-depth') === '0',
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);

  // Step C: click the dig edge → reuse prompt appears.
  console.log('→ Click dig edge to reviewed callee — reuse prompt');
  await page.evaluate(() => {
    const edge = document.querySelector('[data-id^="callee-edge:"]');
    edge?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('[data-testid="walkthrough-reuse-prompt"]', { timeout: 5000 });
  // Dig depth should still be 0 — the prompt gates the dig.
  const depthDuringPrompt = await page
    .locator('[data-testid="walkthrough-canvas"]')
    .getAttribute('data-dig-depth');
  console.log(`  prompt visible; dig-depth still ${depthDuringPrompt} (expected 0)`);
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/reuse-3-prompt.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  // Step D: SKIP — prompt dismisses, no dig.
  console.log('→ SKIP — prompt dismisses without diving in');
  await page.getByTestId('walkthrough-reuse-skip').click();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="walkthrough-reuse-prompt"]'),
    { timeout: 3000 },
  );
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({ path: `${SHOTS_DIR}/reuse-4-skipped.png`, fullPage: true });
  await page.waitForTimeout(BEAT_LONG);

  // Step E: click again → prompt → RE-EXAMINE → dig advances.
  console.log('→ Click again → RE-EXAMINE → dig advances');
  await page.evaluate(() => {
    const edge = document.querySelector('[data-id^="callee-edge:"]');
    edge?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('[data-testid="walkthrough-reuse-prompt"]');
  await page.waitForTimeout(BEAT_SHORT);
  await page.getByTestId('walkthrough-reuse-reexamine').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="walkthrough-canvas"]')
        ?.getAttribute('data-dig-depth') === '1',
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/reuse-5-reexamined.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  // Step F: PROMOTE TO GLOBAL.
  console.log('→ PROMOTE TO GLOBAL');
  await page.getByTestId('walkthrough-action-promote').click();
  // After promote, the path-scoped chip should disappear; status remains.
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="walkthrough-action-promote"]'),
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({ path: `${SHOTS_DIR}/reuse-6-promoted.png`, fullPage: true });
  await page.waitForTimeout(BEAT_LONG);

  // Step G: reload — promotion persists.
  console.log('→ Reload — verify promote persisted via state.db');
  await page.reload();
  await page.waitForSelector('[data-testid="walkthrough-canvas"]');
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="walkthrough-canvas"]')
        ?.getAttribute('data-dig-depth') === '1',
    { timeout: 5000 },
  );
  await page.waitForTimeout(BEAT_LONG);
  await page.screenshot({
    path: `${SHOTS_DIR}/reuse-7-after-reload.png`,
    fullPage: true,
  });
  await page.waitForTimeout(BEAT_LONG);

  const videoHandle = page.video();
  await context.close();
  await browser.close();

  if (videoHandle) {
    const rawPath = await videoHandle.path();
    const stablePath = `${VIDEO_DIR}/reuse-and-scope-flow.webm`;
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
