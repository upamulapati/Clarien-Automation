import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';

// -------------------------------------------------------------------
// SP #172 | Call ID: INC000001227660 | Menu: HTDITCI
// TUA/TDA — Issue: When clicking searcher in the menu, instead of TD
// it is showing loan table codes.
// Expected: Now searcher showing TD table codes.
// -------------------------------------------------------------------

test('HTDITCI - SP #172 INC000001227660 - TD interest table code searcher validation', async ({ page }) => {
  test.setTimeout(300000);
  const spPage = new ServicePackPage(page);
  const result = await spPage.servicePackHtditciSearcherValidation();
  console.log('HTDITCI searcher validation result:', result);
  expect(result.success, result.message).toBe(true);
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
