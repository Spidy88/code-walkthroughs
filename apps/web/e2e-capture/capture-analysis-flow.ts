/**
 * One-off capture script. Drives the picker → analysis-progress → completed
 * flow against a running backend and saves screenshots at each state.
 *
 * Run with: pnpm exec tsx e2e-capture/capture-analysis-flow.ts <repo-path>
 *
 * Requires:
 *   - The backend running on CW_SERVER_PORT (defaults 4099 here).
 *   - The web dev server running on CW_WEB_PORT (defaults 5179 here).
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const WEB_PORT = process.env.CW_WEB_PORT ?? '5179';
const REPO_PATH = process.argv[2] ?? resolve(import.meta.dirname, '..', '..', '..');
const OUT_DIR = resolve(import.meta.dirname, '..', 'test-results', 'screenshots');

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on('console', (msg) => console.log(`  [browser/${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => console.log(`  [browser/pageerror] ${err.message}`));
  page.on('requestfailed', (req) => {
    console.log(
      `  [browser/requestfailed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`,
    );
  });
  page.on('request', (req) => {
    if (req.url().includes('/trpc/')) {
      const url = new URL(req.url());
      const procedures = url.pathname.split('/').pop();
      console.log(`  [browser/trpc-req] ${req.method()} ${procedures}`);
    }
  });
  page.on('response', (res) => {
    if (res.url().includes('/trpc/')) {
      const url = new URL(res.url());
      const procedures = url.pathname.split('/').pop();
      console.log(`  [browser/trpc-res] ${res.status()} ${procedures}`);
    }
  });

  console.log('→ Navigating to picker');
  await page.goto(`http://localhost:${WEB_PORT}/`);
  await page.waitForSelector('text=§ A · OPEN A CODEBASE');
  await page.evaluate(() => document.fonts.ready);

  console.log('→ Capturing picker (empty)');
  await page.screenshot({
    path: `${OUT_DIR}/analysis-flow-1-picker.png`,
    fullPage: true,
  });

  console.log(`→ Opening codebase at ${REPO_PATH}`);
  await page.getByTestId('codebase-picker-path-input').fill(REPO_PATH);
  await page.getByTestId('codebase-picker-open-button').click();

  // Wait for navigation to /codebase.
  await page.waitForURL(/\/codebase$/);
  await page.waitForSelector('text=§ B · ANALYSIS PROGRESS');
  await page.evaluate(() => document.fonts.ready);

  // Capture serial screenshots over the analysis duration so at least one
  // frame catches the in-flight state. The pipeline is fast on small repos
  // so racing the poll cycle is the failure mode we need to mitigate.
  console.log('→ Capturing progress (sampled)');
  let inflightCaptured = false;
  for (let i = 0; i < 30; i += 1) {
    const probe = await page.evaluate(() => ({
      hasCancel: document.querySelector('[data-testid="analysis-progress-cancel"]') !== null,
      hasSummary: document.querySelector('[data-testid="analysis-progress-summary"]') !== null,
      stageLabel:
        document
          .querySelector('[data-testid="analysis-progress-stages"]')
          ?.parentElement?.parentElement?.querySelector('span:last-child')?.textContent ?? null,
      bodyHead: document.body.innerText.slice(0, 200),
    }));
    if (probe.hasCancel && !inflightCaptured) {
      await page.screenshot({
        path: `${OUT_DIR}/analysis-flow-2-progress.png`,
        fullPage: true,
      });
      inflightCaptured = true;
      console.log(`  frame ${i}: in-flight (cancel button visible) — captured`);
    } else {
      console.log(
        `  frame ${i}: cancel=${probe.hasCancel} summary=${probe.hasSummary} stageLabel=${probe.stageLabel} body=${probe.bodyHead.replace(/\s+/g, ' ').slice(0, 80)}`,
      );
    }
    if (probe.hasSummary) break;
    await page.waitForTimeout(150);
  }
  if (!inflightCaptured) {
    console.warn('  (no in-flight frame captured — pipeline ran sub-poll-interval)');
  }

  // Wait for the completed surface to render.
  console.log('→ Waiting for completion');
  await page.waitForSelector('[data-testid="analysis-progress-summary"]', { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);

  console.log('→ Capturing completed');
  await page.screenshot({
    path: `${OUT_DIR}/analysis-flow-3-completed.png`,
    fullPage: true,
  });

  // Continue to project overview
  console.log('→ Continuing to project overview');
  await page.getByTestId('analysis-progress-continue').click();
  await page.waitForURL(/\/project\//);
  await page.waitForSelector('[data-testid="project-overview-summary"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);

  console.log('→ Capturing project overview');
  await page.screenshot({
    path: `${OUT_DIR}/analysis-flow-4-project-overview.png`,
    fullPage: true,
  });

  await browser.close();
  console.log(`✓ Screenshots saved to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
