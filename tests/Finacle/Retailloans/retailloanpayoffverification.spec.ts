import { test } from '@playwright/test';
import { RetailLoanPayoffPage } from '../../pages/CoreBanking/RetailLoanPayoffPage';
import { ServicePackPage } from '../../pages/servicepackpage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

// Verifier user who authorises the retail-loan payoff.
const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

// Test data: update with the same loan account used in the payoff creation spec.
const LOAN_ACCOUNT_NUMBER = '3200000056';

test('HPAYOFF - payoff verification for retail loan', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const payoffPage = new RetailLoanPayoffPage(page);

  try {
    const result = await payoffPage.verifyPayoff({
      loanAccountNumber: LOAN_ACCOUNT_NUMBER,
    });

    console.log('====================================');
    console.log('Payoff verification transaction ID:', result.transactionId);
    console.log('Payoff verification message:', result.message);
    console.log('====================================');

    const servicePackPage = new ServicePackPage(page);
    await servicePackPage.servicePackRetailLoanPayoffVerificationValidation(result);
  } finally {
    await homePage.logout().catch(() => {});
  }
});
