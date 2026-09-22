import { Page, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Capture a full-page screenshot and attach it (plus optional JSON data) to the
 * current Playwright test result. The screenshot and data file end up in the
 * test output folder and are picked up by the allure-playwright / HTML reporter.
 */
export async function captureEvidence(
  page: Page,
  step: string,
  data?: Record<string, unknown>
): Promise<void> {
  const info = test.info();
  const safeStep = step.replace(/[^a-zA-Z0-9_-]+/g, '_');
  const timestamp = Date.now();
  const screenshotFile = `evidence-${safeStep}-${timestamp}.png`;
  const screenshotPath = info.outputPath(screenshotFile);

  // Ensure the test-specific output directory exists.
  await fs.promises.mkdir(path.dirname(screenshotPath), { recursive: true }).catch(() => {});

  // Wait for any async data to finish loading before taking the screenshot.
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});

  // Take a full-page screenshot and attach it to the test report.
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  await info.attach(`${step} - screenshot`, { path: screenshotPath, contentType: 'image/png' });

  // Attach the optional data payload as a JSON snippet.
  if (data !== undefined) {
    await info.attach(`${step} - data`, {
      body: JSON.stringify(data, null, 2),
      contentType: 'application/json',
    });
  }

  console.log(`📸 Evidence captured: ${step}`);
}
