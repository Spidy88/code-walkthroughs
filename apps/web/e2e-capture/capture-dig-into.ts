/**
 * Drives the picker → analysis → walkthrough flow against a running
 * backend, then exercises the spatial dig-into navigation:
 *
 *   1. Land on the walkthrough; the focused path node fans out callee
 *      summary nodes connected by dig-into-active edges.
 *   2. Click a callee edge → callee renders as the active code node;
 *      its own callees fan out behind it. URL gains ?dig=<identity>.
 *   3. Click again to dig a level deeper. URL extends with a 2nd dig
 *      entry; breadcrumb shows path → dig0 → dig1.
 *   4. Press Escape → pops the deepest dig; URL drops the last entry.
 *   5. Reload — the remaining dig depth survives because the URL
 *      carries the full focus history (spec §6.3 deep-linking).
 *
 * Run via: bash scripts/e2e-capture.sh \
 *   apps/web/e2e-capture/capture-dig-into.ts \
 *   <codebase-path>
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const WEB_PORT = process.env.CW_WEB_PORT ?? '5179';
const REPO_PATH = process.argv[2];
if (!REPO_PATH) {
  console.error('usage: capture-dig-into.ts <codebase-path>');
  process.exit(64);
}
const OUT_DIR = resolve(import.meta.dirname, '..', 'test-results', 'screenshots');

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
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

  console.log('→ Entering walkthrough — pick the first path with off-path callees');
  // Some paths are fully linear (every callee is the next path step), so
  // the dig-into affordance has nothing to render. Walk path links in
  // turn until we land on one with at least one callee edge.
  await page.getByTestId('project-overview-path-link').first().waitFor();
  const totalPaths = await page.getByTestId('project-overview-path-link').count();
  console.log(`  found ${totalPaths} path link(s) on overview`);
  let landed = false;
  for (let i = 0; i < totalPaths; i++) {
    if (i > 0) {
      await page.goBack();
      await page.waitForSelector('[data-testid="project-overview-summary"]');
    }
    await page.getByTestId('project-overview-path-link').nth(i).click();
    await page.waitForURL(/\/path\//);
    await page.waitForSelector('[data-testid="walkthrough-canvas"]');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const calleeCount = await page.locator('[data-id^="callee-edge:"]').count();
    console.log(`  path #${i + 1}: ${calleeCount} dig-into edge(s)`);
    if (calleeCount > 0) {
      landed = true;
      break;
    }
  }
  if (!landed) {
    throw new Error('no path with off-path callees found in this fixture');
  }
  await page.waitForTimeout(400);

  console.log('→ Capturing initial state with callee fan-out');
  await page.screenshot({
    path: `${OUT_DIR}/dig-into-1-initial.png`,
    fullPage: true,
  });

  // ReactFlow nodes overlay edges with higher stacking, so a normal
  // .click() on the edge wrapper gets intercepted. Dispatch the click
  // via the DOM — React picks it up at the root listener regardless.
  const clickFirstCalleeEdge = async (): Promise<string | null> =>
    page.evaluate(() => {
      const edge = document.querySelector('[data-id^="callee-edge:"]');
      if (!edge) return null;
      edge.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return edge.getAttribute('data-id');
    });

  console.log('→ Dig level 1: click first callee edge');
  await clickFirstCalleeEdge();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="walkthrough-canvas"]')
        ?.getAttribute('data-dig-depth') === '1',
    { timeout: 5000 },
  );
  await page.waitForSelector('[data-testid="walkthrough-dig-breadcrumb"]');
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `${OUT_DIR}/dig-into-2-level-1.png`,
    fullPage: true,
  });

  console.log('→ Dig level 2: click another callee edge');
  // After the first dig, the active node is the dug-in callee — its
  // own callees now fan out as the new dig-into-active edges.
  const moreEdges = await page.locator('[data-id^="callee-edge:"]').count();
  if (moreEdges === 0) {
    console.log('  (no further callees — skipping level-2 capture)');
  } else {
    await clickFirstCalleeEdge();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="walkthrough-canvas"]')
          ?.getAttribute('data-dig-depth') === '2',
      { timeout: 5000 },
    );
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${OUT_DIR}/dig-into-3-level-2.png`,
      fullPage: true,
    });
  }

  console.log('→ Pop one level via Escape key');
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="walkthrough-canvas"]')
        ?.getAttribute('data-dig-depth') === '1',
    { timeout: 5000 },
  );
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `${OUT_DIR}/dig-into-4-after-escape.png`,
    fullPage: true,
  });

  console.log('→ Reload — verify dig stack survives via URL');
  await page.reload();
  await page.waitForSelector('[data-testid="walkthrough-canvas"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="walkthrough-canvas"]')
        ?.getAttribute('data-dig-depth') === '1',
    { timeout: 5000 },
  );
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `${OUT_DIR}/dig-into-5-after-reload.png`,
    fullPage: true,
  });

  console.log('→ Pop back to path level via breadcrumb');
  await page.getByTestId('walkthrough-dig-pop').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="walkthrough-canvas"]')
        ?.getAttribute('data-dig-depth') === '0',
    { timeout: 5000 },
  );
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `${OUT_DIR}/dig-into-6-popped-to-path.png`,
    fullPage: true,
  });

  await browser.close();
  console.log(`✓ Screenshots saved to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
