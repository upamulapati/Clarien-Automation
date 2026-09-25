import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';
import COMMON_DATA from '../../../data/common-data.json';

for (const acct of COMMON_DATA.servicePackValidation) {
  test.describe(`Service Pack Verification - ${acct.type}`, () => {
    test.beforeEach(async () => {
      test.setTimeout(300000);
    });

    test(acct.testLabel, async ({ page }) => {
      const spPage = new ServicePackPage(page);
      const result = await spPage.servicePackSavingsAccountVerification(acct);
      expect(result.statusMessage).toMatch(/verified|successful/i);
      expect(result.accountNumber).toBeTruthy();
      console.log('Service Pack Verification passed. Account number:', result.accountNumber);
    });
  });
}

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
