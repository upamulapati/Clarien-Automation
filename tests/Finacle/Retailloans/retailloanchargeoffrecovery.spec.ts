import { test, expect } from '@playwright/test';
import { getSharedValue } from '../../helpers/sharedState';
import { RetailLoanChargeoffRecoveryPage } from '../../pages/CoreBanking/RetailLoanChargeoffRecoveryPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { RETAIL_LOAN_DATA } from '../../config/excelTestData';
import { CREDENTIALS } from '../../../data/credentials';

// Maker user who performs the retail-loan chargeoff recovery.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

const STEP = RETAIL_LOAN_DATA[0]?.data ?? {};

// Test data: update with a valid charged-off retail loan and a source account.
const LOAN_KEY = STEP.sharedKey ?? 'chargeoffLoanAccountId';
const LOAN_ACCOUNT_NUMBER = getSharedValue<string>((state) => (state as any)[String(LOAN_KEY)] as string);
if (!LOAN_ACCOUNT_NUMBER) throw new Error(`Chargeoff loan account for shared key '${LOAN_KEY}' must be available from the creation spec`);
console.log(`[SharedState] Using loan account (key: ${LOAN_KEY}):`, LOAN_ACCOUNT_NUMBER);
const RECOVERY_AMOUNT = STEP['Recovery Amount'];
const SOURCE_ACCOUNT_ID = STEP['Source Account Id'];

test('HRACO - chargeoff recovery for retail loan', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const recoveryPage = new RetailLoanChargeoffRecoveryPage(page);

  try {
    const result = await recoveryPage.performRecovery({
      loanAccountNumber: LOAN_ACCOUNT_NUMBER,
      transactionType: STEP['Transaction Type'],
      recoveryAmount: RECOVERY_AMOUNT,
      sourceAccountId: SOURCE_ACCOUNT_ID,
      valueDate: STEP['Value Date'] ?? process.env.RECOVERY_VALUE_DATE,
    });

    console.log('====================================');
    console.log('Chargeoff recovery message:', result.message);
    console.log('Chargeoff recovery transaction ID:', result.transactionId ?? 'NOT CAPTURED');
    console.log('====================================');

    if (result.message) {
      expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
    }
  } finally {
    await homePage.logout().catch(() => {});
  }
});
