import { test, expect } from '@playwright/test';
import { RetailLoanDisbursementPage } from '../../pages/CoreBanking/RetailLoanDisbursementPage';
import { ServicePackPage } from '../../pages/servicepackpage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

// Verifier user who authorises the retail-loan disbursement.
const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

// Test data: update with the same loan account used in the disbursement creation spec.
const LOAN_ACCOUNT_NUMBER = '3200000043';

test('HLADISB - disbursement verification for retail loan', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const disbursementPage = new RetailLoanDisbursementPage(page);

  try {
    const result = await disbursementPage.verifyDisbursement({
      loanAccountNumber: LOAN_ACCOUNT_NUMBER,
      transactionType: 'transfer',
    });

    console.log('====================================');
    console.log('Disbursement verification message:', result.message);
  expect(result.message).toBeTruthy();
  expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
    console.log('====================================');

    const servicePackPage = new ServicePackPage(page);
    await servicePackPage.servicePackRetailLoanDisbursementAuditValidation(LOAN_ACCOUNT_NUMBER);
    console.log('HAFI MCTD service pack validation assertion passed');

    console.log('Captured Transaction ID:', result.transactionId ?? 'NOT CAPTURED');
  expect(result.transactionId).toBeTruthy();
    console.log('Captured Transaction Date:', result.transactionDate ?? 'NOT CAPTURED');
  expect(result.transactionDate).toBeTruthy();

    if (result.transactionId && result.transactionDate) {
      await servicePackPage.servicePackRetailLoanDisbursementHtmValidation(result.transactionId, result.transactionDate);
    } else {
      console.log('Transaction ID or Date not captured, skipping HTM validation');
    }
  } finally {
    await homePage.logout().catch(() => {});
  }
});
