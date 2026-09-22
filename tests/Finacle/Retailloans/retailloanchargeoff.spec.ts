import { test } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { RetailLoanChargeoffPage } from '../../pages/CoreBanking/RetailLoanChargeoffPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

// Maker user who initiates the retail-loan chargeoff.
const MAKER = CREDENTIALS.credentials;

// Test data: loan account to be charged off.
const LOAN_ACCOUNT_NUMBER = process.env.LOAN_ACCOUNT_NUMBER ?? '3200000081';

test('HCOLA - retail loan chargeoff', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  const { homePage } = await loginToFinacle(page, MAKER.username, MAKER.password);
  const chargeoffPage = new RetailLoanChargeoffPage(page);

  try {
    const result = await chargeoffPage.performChargeoff({
      loanAccountNumber: LOAN_ACCOUNT_NUMBER,
    });

    console.log('====================================');
    console.log('Chargeoff message:', result.message);
    console.log('====================================');
  } finally {
    await homePage.logout().catch(() => {});
  }
});
