import { test, expect } from '@playwright/test';
import { getSharedValue } from '../../helpers/sharedState';
import { RetailLoanChargeoffRecoveryPage } from '../../pages/CoreBanking/RetailLoanChargeoffRecoveryPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { RETAIL_LOAN_DATA } from '../../config/excelTestData';
import { CREDENTIALS } from '../../../data/credentials';

// Verifier user who checks the retail-loan chargeoff recovery.
const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

const STEP = RETAIL_LOAN_DATA[0]?.data ?? {};

// Same loan account that was used in the HRACO recovery spec.
const LOAN_KEY = STEP.sharedKey ?? 'chargeoffLoanAccountId';
const LOAN_ACCOUNT_NUMBER = getSharedValue<string>((state) => (state as any)[String(LOAN_KEY)] as string);
if (!LOAN_ACCOUNT_NUMBER) throw new Error(`Chargeoff loan account for shared key '${LOAN_KEY}' must be available from the creation spec`);
console.log(`[SharedState] Using loan account (key: ${LOAN_KEY}):`, LOAN_ACCOUNT_NUMBER);

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
    if (result.message) {
      expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
    }
    console.log('Chargeoff recovery verification transaction ID:', result.transactionId ?? 'NOT CAPTURED');
  expect(result.transactionId).toBeTruthy();
    console.log('====================================');
  } finally {
    await homePage.logout().catch(() => {});
  }
});
