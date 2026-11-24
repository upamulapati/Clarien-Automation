import { Frame, Page, test } from '@playwright/test';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const testScreenshotHashes = new Map<string, Set<string>>();

function getTestKey(): string {
  try {
    const info = test.info();
    return info.testId || `${info.title}_${info.retry ?? 0}`;
  } catch {
    return 'unknown';
  }
}

async function waitForUiToSettle(page: Page): Promise<void> {
  const start = Date.now();
  const timeout = 4000;
  while (Date.now() - start < timeout) {
    try {
      const busy = await page.evaluate(() => {
        const selectors = [
          '.loading', '.spinner', '.progress', '.busy', '.x-loading',
          '[class*="loading"]', '[class*="spinner"]', '[class*="progress"]',
          '[aria-busy="true"]'
        ];
        const indicators = Array.from(document.querySelectorAll(selectors.join(', ')));
        for (const el of indicators) {
          const style = window.getComputedStyle(el as Element);
          const htmlEl = el as HTMLElement;
          if (style.display !== 'none' && style.visibility !== 'hidden' && htmlEl.offsetParent !== null) {
            return true;
          }
        }
        return false;
      });
      if (!busy) break;
    } catch {
      break;
    }
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(600);
}

// Suppress rapid duplicate evidence captures for the same logical step within a test.
const recentCaptures = new Map<string, number>();
const MIN_DUPLICATE_INTERVAL_MS = 5000;

/**
 * Collect the current values of all visible input, select and textarea
 * elements across every non-detached frame on the page. The returned
 * record uses the best available label (label text, previous cell text,
 * aria-label or name/id) as the key and the control value as the value.
 */
export async function gatherPageInputData(page: Page): Promise<Record<string, string>> {
  const allFields: Record<string, string> = {};

  for (const frame of page.frames()) {
    if (frame.isDetached()) continue;
    try {
      const frameFields = await (frame as Frame).evaluate(() => {
        const out: Record<string, string> = {};
        const elements = Array.from(document.querySelectorAll('input, select, textarea')) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[];
        let index = 0;
        for (const el of elements) {
          const input = el as HTMLInputElement;
          if (input.type === 'hidden') continue;

          const rect = (el as HTMLElement).getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || (rect.width === 0 && rect.height === 0)) {
            continue;
          }

          const elId = el.id || '';
          let key = '';
          if (elId) {
            try {
              const label = document.querySelector(`label[for="${elId.replace(/"/g, '\\"')}"]`);
              if (label && label.textContent) {
                key = label.textContent.trim();
              }
            } catch {
              // ignore
            }
          }
          if (!key) {
            key = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '';
          }
          if (!key) {
            const cell = el.closest('td, th, label') as HTMLElement | null;
            const prev = cell?.previousElementSibling as HTMLElement | null;
            if (prev && prev.textContent) {
              key = prev.textContent.trim();
            }
          }
          if (!key) {
            key = el.getAttribute('name') || elId || `field_${index}`;
          }

          let value = '';
          if (el.tagName === 'SELECT') {
            const sel = el as HTMLSelectElement;
            value = sel.options[sel.selectedIndex]?.text?.trim() || sel.value;
          } else if (input.type === 'checkbox' || input.type === 'radio') {
            value = input.checked ? 'Yes' : 'No';
          } else {
            value = el.value || '';
          }

          if (value) {
            out[key] = value;
          }
          index++;
        }
        return out;
      });
      for (const [k, v] of Object.entries(frameFields)) {
        if (!(k in allFields)) allFields[k] = v;
      }
    } catch {
      // Ignore frames that cannot be evaluated (e.g. cross-origin).
    }
  }

  return allFields;
}

/**
 * Capture a full-page screenshot and attach it (plus optional JSON data) to the
 * current Playwright test result. The screenshot and data file end up in the
 * test output folder and are picked up by the allure-playwright / HTML reporter.
 */
export async function captureEvidence(
  page: Page | null,
  step: string,
  data?: Record<string, unknown>
): Promise<void> {
  if (!page || page.isClosed?.()) return;
  const info = test.info();

  // Skip rapid duplicate captures of the same step in the same test to avoid
  // bloating the Allure report with redundant screenshots.
  const testKey = (info as any).testId || info.title || 'unknown';
  const dedupeKey = `${testKey}:${step}`;
  const now = Date.now();
  const last = recentCaptures.get(dedupeKey);
  if (last && now - last < MIN_DUPLICATE_INTERVAL_MS) {
    console.log(`📸 Evidence skipped (recent duplicate): ${step}`);
    return;
  }
  recentCaptures.set(dedupeKey, now);

  const safeStep = step.replace(/[^a-zA-Z0-9_-]+/g, '_');
  const timestamp = now;
  const screenshotFile = `evidence-${safeStep}-${timestamp}.png`;
  const screenshotPath = info.outputPath(screenshotFile);

  // Ensure the test-specific output directory exists.
  await fs.promises.mkdir(path.dirname(screenshotPath), { recursive: true }).catch(() => {});

  // Wait for any async data to finish loading and the UI to settle
  // before taking the screenshot so the entered data is fully rendered.
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  await waitForUiToSettle(page);

  // Capture the screenshot at device scale so text is sharper and easier to read.
  await page.screenshot({ path: screenshotPath, fullPage: true, scale: 'device' }).catch(() => {});
  if (!fs.existsSync(screenshotPath)) {
    return;
  }

  // Deduplicate exact duplicate screenshots within the same test.
  const testKey = getTestKey();
  const screenshotBuffer = await fs.promises.readFile(screenshotPath);
  const hash = createHash('sha256').update(screenshotBuffer).digest('hex');
  if (!testScreenshotHashes.has(testKey)) {
    testScreenshotHashes.set(testKey, new Set<string>());
  }
  const hashes = testScreenshotHashes.get(testKey)!;
  if (hashes.has(hash)) {
    await fs.promises.unlink(screenshotPath).catch(() => {});
    console.log(`📸 Skipping duplicate evidence: ${step}`);
    return;
  }
  hashes.add(hash);

  // Auto-capture the visible page data when none is supplied so business users
  // can see the values that were entered or displayed at that step.
  let payload = data;
  if (payload === undefined) {
    try {
      payload = await gatherPageInputData(page);
    } catch {
      payload = {};
    }
  }

  await info.attach(`${step} - screenshot`, { path: screenshotPath, contentType: 'image/png' });

  if (payload !== undefined && Object.keys(payload).length > 0) {
    await info.attach(`${step} - data`, {
      body: JSON.stringify(payload, null, 2),
      contentType: 'application/json',
    });
  }

  console.log(`📸 Evidence captured: ${step}`);
}
