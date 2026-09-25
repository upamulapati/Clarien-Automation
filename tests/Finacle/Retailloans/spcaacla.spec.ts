import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';

// Loan account used for the SPCAACLA close-and-verify scenario.
const LOAN_ACCOUNT_NUMBER = '3200000052';

test('SPCAACLA - CAACLA retail loan close and verify', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  const servicePackPage = new ServicePackPage(page);

  const result = await servicePackPage.servicePackCAACLAClosureAndVerification(LOAN_ACCOUNT_NUMBER);

  console.log('====================================');
  console.log('CAACLA close message:', result.closeMessage);
  console.log('CAACLA verify message:', result.verifyMessage);
  console.log('Close Go screenshot:', result.closeGoScreenshotPath);
  console.log('Verify Submit screenshot:', result.verifySubmitScreenshotPath);
  console.log('====================================');

  // Hard assertion: verification must end with a success indicator.
  expect(result.verifyMessage, `CAACLA verification did not return a success message. Got: ${result.verifyMessage}`).toMatch(/success|verified|authorised|authorized/i);
});