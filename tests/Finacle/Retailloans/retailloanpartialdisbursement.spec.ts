import { test, expect } from '@playwright/test';
import { RetailLoanDisbursementPage } from '../../pages/CoreBanking/RetailLoanDisbursementPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

// Maker user who performs the partial retail-loan disbursement.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Test data: loan account to be partially disbursed.
const LOAN_ACCOUNT_NUMBER = '3200000043';

test('HLADISB - partial disbursement for retail loan', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const disbursementPage = new RetailLoanDisbursementPage(page);

  try {
    const result = await disbursementPage.createDisbursement({
      loanAccountNumber: LOAN_ACCOUNT_NUMBER,
      transactionType: 'transfer',
      modeOfDisbursement: 'a/c transfer',
      partial: true,
    });

    console.log('====================================');
    console.log('Partial disbursement message:', result.message);
  expect(result.message).toBeTruthy();
  expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
    console.log('====================================');

    // If the result is not successful, capture exact on-screen error text and stop.
    if (!result.message || !/successful/i.test(result.message)) {
      await disbursementPage.logScreenMessages();
      const finwFrame = page.frame({ name: 'FINW' });
      const bodyText = (await finwFrame?.locator('body').textContent().catch(() => '') ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1200);
      console.error('Disbursement failure details:', bodyText);
    }

    // Hard assertion: disbursement must report a successful message.
    expect(
      result.message,
      `Expected successful disbursement message, but got: ${result.message ?? 'no message'}`,
    ).toMatch(/successful/i);
  } finally {
    await homePage.logout().catch(() => {});
  }
});
