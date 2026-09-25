import { test, expect } from '@playwright/test';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { ServicePackPage } from '../../pages/servicepackpage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

// Verifier user who authorises the retail-loan rescheduling.
const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

// Test data: same loan account used in the rescheduling creation spec.
const LOAN_ACCOUNT_NUMBER = '3200000053';

test('HLARA - rescheduling verification for retail loan', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const loanPage = new AccountPage(page);

  try {
    // Step 1: Login with a different user (verifier)
    // Step 2: Type menu option "HLARA" in finacle
    console.log('Selecting Core Server...');
    await loanPage.selectCoreServer();

    console.log('Searching for HLARA...');
    await loanPage.searchMenu('HLARA');
    await page.waitForTimeout(3000);

    // Step 3: Function - V - Verify
    console.log('Selecting Verify function...');
    await loanPage.selectFunction('Verify');

    // Step 4: Enter loan A/c ID, click Go
    console.log('Entering loan account ID...');
    const accountFilled = await loanPage.fillByLabel('A/c Id', LOAN_ACCOUNT_NUMBER);
    if (!accountFilled) {
      await loanPage.enterHacmAccountId(LOAN_ACCOUNT_NUMBER);
    }

    console.log('Clicking Go button...');
    await loanPage.clickGo();

    // Step 5: Visit Payment Details tab
    console.log('Visiting Payment Details tab...');
    await loanPage.visitLoanTab('Payment Details');

    const servicePackPage = new ServicePackPage(page);

    // Step 6: Click amortization schedule, assert first installment interest amount, click OK
    console.log('Generating and validating first installment interest...');
    await servicePackPage.servicePackRetailLoanReschedulingFirstInstallmentInterestValidation();

    // Step 7: View Audit service pack validation before submitting
    console.log('Starting View Audit service pack validation...');
    await servicePackPage.servicePackRetailLoanReschedulingAuditValidation();

    // Step 8: Click submit - rescheduling has been verified
    console.log('Clicking Submit button...');
    await loanPage.clickSubmit();
    await loanPage.acceptWarningPopup();

    const message = await loanPage.getStatusMessage();
    console.log('====================================');
    console.log('Rescheduling verification message:', message);
    console.log('====================================');

    // Step 10: Revert to HAITINQ, validate Next Interest Calculation Date (Dr.) and logout
    console.log('Reverting to HAITINQ for Next Interest Calculation Date validation...');
    await servicePackPage.servicePackRetailLoanReschedulingNextInterestCalculationDateValidation(LOAN_ACCOUNT_NUMBER);

    await homePage.logout().catch(() => {});
  } finally {
    await homePage.logout().catch(() => {});
  }
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
