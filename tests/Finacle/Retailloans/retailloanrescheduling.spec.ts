import { test } from '@playwright/test';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

// Maker user who performs the retail-loan rescheduling.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Test data: update with the loan account to be rescheduled.
const LOAN_ACCOUNT_NUMBER = '3200000053';
const NEW_NO_OF_INSTALMENTS = '18';

function today(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

test('HLARA - rescheduling for retail loan', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const loanPage = new AccountPage(page);

  try {
    // Step 1: Select "core server" from the solution drop down
    console.log('Selecting Core Server...');
    await loanPage.selectCoreServer();

    // Step 2: Type menu option "HLARA" in finacle
    console.log('Searching for HLARA...');
    await loanPage.searchMenu('HLARA');
    await page.waitForTimeout(3000);

    // Step 3: Function - R - Rescheduling, Reschedule by - P - using parameters, A/c ID
    console.log('Selecting Rescheduling function...');
    await loanPage.selectFunction('Rescheduling');

    console.log('Selecting Reschedule by: using parameters...');
    await loanPage.selectOptionByLabel('Reschedule by', 'P');

    console.log('Entering loan account ID...');
    const accountFilled = await loanPage.fillByLabel('A/c Id', LOAN_ACCOUNT_NUMBER);
    if (!accountFilled) {
      await loanPage.enterHacmAccountId(LOAN_ACCOUNT_NUMBER);
    }

    // Step 4: Rescheduling date - today's date, then click Go
    console.log('Entering rescheduling date...');
    await loanPage.fillByLabel('Rescheduling Date', today());

    console.log('Clicking Go button...');
    await loanPage.clickGo();

    // Step 5: Visit Payment Parameters tab and enter no. of instalments
    console.log('Visiting Payment Parameters tab...');
    await loanPage.visitLoanTab('Payment Parameters');
    await loanPage.setNumberOfInstalments(NEW_NO_OF_INSTALMENTS);

    // Step 6: Visit Payment Details tab
    console.log('Visiting Payment Details tab...');
    await loanPage.visitLoanTab('Payment Details');

    // Step 7: Click Amortization schedule and OK
    console.log('Generating amortization schedule...');
    await loanPage.generateAmortizationSchedule();

    // Step 8: Click Submit, then accept
    console.log('Clicking Submit button...');
    await loanPage.clickSubmit();
    await loanPage.acceptWarningPopup();
    await loanPage.clickAccept();

    // Step 9: Click accept
    console.log('Clicking final Accept button...');
    await loanPage.clickAccept();

    const message = await loanPage.getStatusMessage();
    console.log('====================================');
    console.log('Rescheduling message:', message);
    console.log('====================================');
  } finally {
    await homePage.logout().catch(() => {});
  }
});
