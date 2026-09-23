import { test } from '@playwright/test';
import { RetailLoanChargeoffRecoveryPage } from '../../pages/CoreBanking/RetailLoanChargeoffRecoveryPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

// Verifier user who checks the retail-loan chargeoff recovery.
const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

// Same loan account that was used in the HRACO recovery spec.
const LOAN_ACCOUNT_NUMBER = process.env.LOAN_ACCOUNT_NUMBER ?? '3200000080';

test('HROCA - verify chargeoff recovery for retail loan', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const recoveryPage = new RetailLoanChargeoffRecoveryPage(page);

  try {
    const result = await recoveryPage.verifyRecovery({
      loanAccountNumber: LOAN_ACCOUNT_NUMBER,
    });

    console.log('====================================');
    console.log('Chargeoff recovery verification message:', result.message);
    console.log('Chargeoff recovery verification transaction ID:', result.transactionId ?? 'NOT CAPTURED');
    console.log('====================================');
  } finally {
    await homePage.logout().catch(() => {});
  }
});
