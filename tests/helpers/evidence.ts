import { Frame, Page, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

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

  // Wait for any async data to finish loading and the UI to settle
  // before taking the screenshot so the entered data is fully rendered.
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(800).catch(() => {});

  // Take a full-page screenshot and attach it to the test report.
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  if (fs.existsSync(screenshotPath)) {
    await info.attach(`${step} - screenshot`, { path: screenshotPath, contentType: 'image/png' });
  }

  // Attach the optional data payload as a JSON snippet.
  if (data !== undefined) {
    await info.attach(`${step} - data`, {
      body: JSON.stringify(data, null, 2),
      contentType: 'application/json',
    });
  }

  console.log(`📸 Evidence captured: ${step}`);
}
