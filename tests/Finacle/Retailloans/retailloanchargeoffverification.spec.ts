import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { RetailLoanChargeoffPage } from '../../pages/CoreBanking/RetailLoanChargeoffPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

// Verifier user who authorises the retail-loan chargeoff.
const VERIFIER = CREDENTIALS.verifierCredentials;

// Test data: same loan account used in the chargeoff creation spec.
const LOAN_ACCOUNT_NUMBER = process.env.LOAN_ACCOUNT_NUMBER ?? '3200000080';

test('HCOLA - retail loan chargeoff verification', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  const { homePage } = await loginToFinacle(page, VERIFIER.username, VERIFIER.password);
  const chargeoffPage = new RetailLoanChargeoffPage(page);

  try {
    const result = await chargeoffPage.verifyChargeoff({
      loanAccountNumber: LOAN_ACCOUNT_NUMBER,
    });

    console.log('====================================');
    console.log('Chargeoff verification message:', result.message);
  expect(result.message).toBeTruthy();
  expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
    console.log('Chargeoff verification transaction ID:', result.transactionId ?? 'NOT CAPTURED');
  expect(result.transactionId).toBeTruthy();
    console.log('====================================');
  } finally {
    await homePage.logout().catch(() => {});
  }
});
