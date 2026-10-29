import { test, expect } from '@playwright/test';
import { getSharedValue } from '../../helpers/sharedState';
import { RetailLoanDisbursementPage } from '../../pages/CoreBanking/RetailLoanDisbursementPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { RETAIL_LOAN_DATA } from '../../config/excelTestData';
import { CREDENTIALS } from '../../../data/credentials';

// Maker user who performs the partial retail-loan disbursement.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

const STEP = RETAIL_LOAN_DATA[0]?.data ?? {};

// Test data: loan account to be partially disbursed.
const LOAN_KEY = STEP.sharedKey ?? (String(STEP['Partial']).toUpperCase() === 'Y' ? 'payoffLoanAccountId' : 'chargeoffLoanAccountId');
const LOAN_ACCOUNT_NUMBER = getSharedValue<string>(
  (state) => (state as any).loanAccounts?.[String(LOAN_KEY)] ?? state.loanAccountId
);
if (!LOAN_ACCOUNT_NUMBER) throw new Error('loanAccountId must be available from the creation spec');
console.log('[SharedState] Using loan account from previous run:', LOAN_ACCOUNT_NUMBER);

const DISBURSEMENT_AMOUNT = STEP['Disbursement Amount'] ? String(STEP['Disbursement Amount']) : undefined;

test('HLADISB - partial disbursement for retail loan', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const disbursementPage = new RetailLoanDisbursementPage(page);

  try {
    const result = await disbursementPage.createDisbursement({
      loanAccountNumber: LOAN_ACCOUNT_NUMBER,
      transactionType: STEP['Transaction Type'],
      modeOfDisbursement: STEP['Mode Of Disbursement'],
      disbursementAmount: DISBURSEMENT_AMOUNT,
      partial: true,
    });

    console.log('====================================');
    console.log('Partial disbursement message:', result.message);
    if (result.message && !/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i.test(result.message)) {
      throw new Error('Expected a success message but got: ' + result.message);
    }
    console.log('====================================');

    // If the result is not successful, capture exact on-screen error text and stop.
    if (!result.message || !/successful/i.test(result.message)) {
      await disbursementPage.logScreenMessages();
      const finwFrame = page.frame({ name: 'FINW' });
      const bodyText = (await finwFrame?.locator('body').textContent().catch(() => '') ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1200);
      console.error('Disbursement failure details:', bodyText);
    }

    // Hard assertion: disbursement must report a successful message.
    expect(
      result.message,
      `Expected successful disbursement message, but got: ${result.message ?? 'no message'}`,
    ).toMatch(/successful/i);

    // Strict assertion: the post-submit disbursed amount must match the Excel value.
    expect(result.actualAmount, 'Post-submit disbursement amount not captured').toBeTruthy();
    const expectedAmount = parseFloat(DISBURSEMENT_AMOUNT || '0');
    const actualAmount = parseFloat((result.actualAmount || '').replace(/,/g, ''));
    expect(
      actualAmount,
      `Expected disbursed amount ${expectedAmount}, got ${result.actualAmount}`,
    ).toBe(expectedAmount);
  } finally {
    await homePage.logout().catch(() => {});
  }
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error|could not get response from server/);
});
