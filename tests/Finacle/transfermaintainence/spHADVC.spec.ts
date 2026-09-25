import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';

test.describe('HADVC - Service Pack Validation', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  test('HADVC - report queue generated and criteria reset for account 7500001466', async ({ page }) => {
    test.setTimeout(300000);
    const spPage = new ServicePackPage(page);
    const result = await spPage.servicePackHADVCValidation();

    expect(result.reportGenerated, 'HADVC report page was not displayed.').toBe(true);
    console.log(`HADVC report page displayed. Screenshot: ${result.reportScreenshot}`);

    expect(result.criteriaFlushed, 'HADVC criteria fields were not flushed out after clicking OK.').toBe(true);
    console.log(`HADVC criteria reset screenshot: ${result.resetScreenshot}`);
  });
});
