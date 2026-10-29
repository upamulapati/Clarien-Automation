import { test, expect } from '@playwright/test';
import { RetailLoanDisbursementPage } from '../../pages/CoreBanking/RetailLoanDisbursementPage';
import { ServicePackPage } from '../../pages/servicepackpage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { RETAIL_LOAN_DATA } from '../../config/excelTestData';
import { CREDENTIALS } from '../../../data/credentials';
import { getApplicationDate } from '../../helpers/common';
import { getSharedValue } from '../../helpers/sharedState';

// Verifier user who authorises the retail-loan disbursement.
const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

const STEP = RETAIL_LOAN_DATA[0]?.data ?? {};

// Use the same loan account that was used in the disbursement creation spec.
const LOAN_KEY = STEP.sharedKey ?? (String(STEP.instance) === '10' ? 'partial' : 'loanAccountId');
const LOAN_ACCOUNT_NUMBER = getSharedValue<string>(
  (state) => (state as any).loanAccounts?.[String(LOAN_KEY)] ?? state.loanAccountId
);
if (!LOAN_ACCOUNT_NUMBER) throw new Error('loanAccountId must be available from the creation spec');
console.log('[SharedState] Using loan account from previous run:', LOAN_ACCOUNT_NUMBER);

test('HLADISB - disbursement verification for retail loan', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const disbursementPage = new RetailLoanDisbursementPage(page);

  try {
    const result = await disbursementPage.verifyDisbursement({
      loanAccountNumber: LOAN_ACCOUNT_NUMBER,
      transactionType: STEP['Transaction Type'],
    });

    console.log('====================================');
    console.log('Disbursement verification message:', result.message);

    if (result.message && !/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i.test(result.message)) {
      throw new Error(`Disbursement verification message indicates failure: ${result.message}`);
    }

    // When a status message is captured, it must indicate success.
    if (result.message) {
      expect(result.message).toMatch(/successful|verified|authorized/i);
    }

    console.log('====================================');

    const servicePackPage = new ServicePackPage(page);
    const auditResult = await servicePackPage.servicePackRetailLoanDisbursementAuditValidation(LOAN_ACCOUNT_NUMBER);
    console.log('HAFI MCTD service pack validation assertion passed');

    const transactionId = auditResult.transactionId ?? result.transactionId;
    const transactionDate = auditResult.transactionDate ?? result.transactionDate;

    console.log('Captured Transaction ID:', transactionId ?? 'NOT CAPTURED');
    expect(transactionId).toBeTruthy();
    console.log('Captured Transaction Date:', transactionDate ?? 'NOT CAPTURED');
    expect(transactionDate).toBeTruthy();

    if (transactionId && transactionDate) {
      const htmTransactionDate = (await getApplicationDate(page)).replace(/-/g, '/');
      console.log('Using HTM transaction date:', htmTransactionDate);
      await servicePackPage.servicePackRetailLoanDisbursementHtmValidation(transactionId, htmTransactionDate);
    } else {
      console.log('Transaction ID or Date not captured, skipping HTM validation');
    }
  } finally {
    await homePage.logout().catch(() => {});
  }
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
