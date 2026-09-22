import { test, expect } from '@playwright/test';
import { RetailLoanChargeoffRecoveryPage } from '../../pages/CoreBanking/RetailLoanChargeoffRecoveryPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

// Maker user who performs the retail-loan chargeoff recovery.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Test data: update with a valid charged-off retail loan and a source account.
const LOAN_ACCOUNT_NUMBER = process.env.LOAN_ACCOUNT_NUMBER ?? '3200000080';
const RECOVERY_AMOUNT = process.env.RECOVERY_AMOUNT ?? '1000';
const SOURCE_ACCOUNT_ID = process.env.SOURCE_ACCOUNT_ID ?? '7710003367';

test('HRACO - chargeoff recovery for retail loan', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const recoveryPage = new RetailLoanChargeoffRecoveryPage(page);

  try {
    const result = await recoveryPage.performRecovery({
      loanAccountNumber: LOAN_ACCOUNT_NUMBER,
      transactionType: 'Transfer',
      recoveryAmount: RECOVERY_AMOUNT,
      sourceAccountId: SOURCE_ACCOUNT_ID,
      valueDate: process.env.RECOVERY_VALUE_DATE,
    });

    console.log('====================================');
    console.log('Chargeoff recovery message:', result.message);
    console.log('Chargeoff recovery transaction ID:', result.transactionId ?? 'NOT CAPTURED');
    console.log('====================================');

    expect(result.message ?? '').toMatch(/successful|completed|done|posted|generated/i);
  } finally {
    await homePage.logout().catch(() => {});
  }
});
