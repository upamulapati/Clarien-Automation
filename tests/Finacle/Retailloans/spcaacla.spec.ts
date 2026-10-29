import { test, expect } from '@playwright/test';
import { getSharedValue } from '../../helpers/sharedState';
import { ServicePackPage } from '../../pages/servicepackpage';
import { RETAIL_LOAN_DATA } from '../../config/excelTestData';

// Loan account used for the SPCAACLA close-and-verify scenario.
const STEP = RETAIL_LOAN_DATA[0]?.data ?? {};
const LOAN_KEY = STEP.sharedKey ?? 'payoffLoanAccountId';
const LOAN_ACCOUNT_NUMBER = getSharedValue<string>((state) => (state as any)[String(LOAN_KEY)] as string);
if (!LOAN_ACCOUNT_NUMBER) throw new Error(`Payoff loan account for shared key '${LOAN_KEY}' must be available from the creation spec`);
console.log(`[SharedState] Using loan account (key: ${LOAN_KEY}):`, LOAN_ACCOUNT_NUMBER);

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