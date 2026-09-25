import { test, expect } from '@playwright/test';
import { RetailLoanPayoffPage } from '../../pages/CoreBanking/RetailLoanPayoffPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

// Maker user who creates the retail-loan payoff.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Test data: update with a valid retail loan account and a settlement SB/CA account.
const LOAN_ACCOUNT_NUMBER = '3200000059';
const COLLECT_REFUND_ACCOUNT_ID = '7710003367';

test('HPAYOFF - payoff creation for retail loan', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const payoffPage = new RetailLoanPayoffPage(page);

  try {
    const result = await payoffPage.createPayoff({
      loanAccountNumber: LOAN_ACCOUNT_NUMBER,
      transactionType: 'transfer customer induced',
      collectRefundAccountId: COLLECT_REFUND_ACCOUNT_ID,
      reasonCode: 'ASO',
    });

    console.log('====================================');
    console.log('Payoff creation transaction ID:', result.transactionId);
  expect(result.transactionId).toBeTruthy();
    console.log('Payoff creation message:', result.message);
  expect(result.message).toBeTruthy();
  expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
    console.log('====================================');
  } finally {
    await homePage.logout().catch(() => {});
  }
});
