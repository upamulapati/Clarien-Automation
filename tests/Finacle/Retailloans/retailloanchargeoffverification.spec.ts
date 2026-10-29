import { test, expect } from '@playwright/test';
import { getSharedValue } from '../../helpers/sharedState';
import { HomePage } from '../../pages/HomePages/HomePage';
import { RetailLoanChargeoffPage } from '../../pages/CoreBanking/RetailLoanChargeoffPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { RETAIL_LOAN_DATA } from '../../config/excelTestData';
import { CREDENTIALS } from '../../../data/credentials';

// Verifier user who authorises the retail-loan chargeoff.
const VERIFIER = CREDENTIALS.verifierCredentials;

const STEP = RETAIL_LOAN_DATA[0]?.data ?? {};

// Test data: same loan account used in the chargeoff creation spec.
const LOAN_KEY = STEP.sharedKey ?? 'chargeoffLoanAccountId';
const LOAN_ACCOUNT_NUMBER = getSharedValue<string>((state) => (state as any)[String(LOAN_KEY)] as string);
if (!LOAN_ACCOUNT_NUMBER) throw new Error(`Chargeoff loan account for shared key '${LOAN_KEY}' must be available from the creation spec`);
console.log(`[SharedState] Using loan account (key: ${LOAN_KEY}):`, LOAN_ACCOUNT_NUMBER);

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
    if (result.message) {
      expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
    }
    console.log('Chargeoff verification transaction ID:', result.transactionId ?? 'NOT CAPTURED');
  expect(result.transactionId).toBeTruthy();
    console.log('====================================');
  } finally {
    await homePage.logout().catch(() => {});
  }
});
