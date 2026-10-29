

import { test, expect } from '@playwright/test';

test.skip('HCAACVTU - verify deleted related party details for top-up deposit account', async () => {
  // Placeholder: implement verification of deleted related party details.
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
