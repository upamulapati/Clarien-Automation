import { test } from '@playwright/test';
import { RetailLoanDisbursementPage } from '../../pages/CoreBanking/RetailLoanDisbursementPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

// Maker user who performs the retail-loan disbursement.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Test data: update with the loan account to be disbursed.
const LOAN_ACCOUNT_NUMBER = '3200000079';
const DISBURSEMENT_AMOUNT = '1000';

test('HLADISB - disbursement for retail loan', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const disbursementPage = new RetailLoanDisbursementPage(page);

  try {
    const result = await disbursementPage.createDisbursement({
      loanAccountNumber: LOAN_ACCOUNT_NUMBER,
      transactionType: 'transfer',
      modeOfDisbursement: 'a/c transfer',
      disbursementAmount: DISBURSEMENT_AMOUNT,
    });

    console.log('====================================');
    console.log('Disbursement message:', result.message);
    console.log('====================================');
  } finally {
    await homePage.logout().catch(() => {});
  }
});
