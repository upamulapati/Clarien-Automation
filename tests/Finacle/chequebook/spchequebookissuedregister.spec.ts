import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';

test.describe('HCHBIR - Cheque Book Issued Register Service Pack', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  test('HCHBIR - SOL ID matches Service Outlet in HPR Print Queue', async ({ page }) => {
    test.setTimeout(300000);

    const spPage = new ServicePackPage(page);
    const result = await spPage.servicePackChequeBookIssuedRegisterValidation();

    expect(
      result.solId,
      `SOL ID was not captured. Status: ${result.status}; Error: ${result.error}`
    ).toBeTruthy();

    expect(
      result.serviceOutlet,
      `Service Outlet was not captured. Status: ${result.status}; Error: ${result.error}`
    ).toBeTruthy();

    expect(
      result.solId,
      `SOL ID (${result.solId}) does not match Service Outlet (${result.serviceOutlet})`
    ).toBe(result.serviceOutlet);

    console.log('SOL ID is present in Print Queue Inquiry report');
  });
});

test.afterEach(async ({ page }) => {
  const html = (await page.content().catch(() => '')).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
