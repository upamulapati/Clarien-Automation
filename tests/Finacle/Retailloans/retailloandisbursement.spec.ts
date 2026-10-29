import { test, expect } from '@playwright/test';
import { RetailLoanDisbursementPage } from '../../pages/CoreBanking/RetailLoanDisbursementPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { RETAIL_LOAN_DATA } from '../../config/excelTestData';
import { CREDENTIALS } from '../../../data/credentials';
import { getSharedValue } from '../../helpers/sharedState';

// Maker user who performs the retail-loan disbursement.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

const STEP = RETAIL_LOAN_DATA[0]?.data ?? {};

// Use the loan account created by the upstream creation spec when available.
const LOAN_KEY = STEP.sharedKey ?? STEP.instance ?? 'loanAccountId';
const LOAN_ACCOUNT_NUMBER = getSharedValue<string>(
  (state) => (state as any).loanAccounts?.[String(LOAN_KEY)] ?? state.loanAccountId
);
if (!LOAN_ACCOUNT_NUMBER) throw new Error('loanAccountId must be available from the creation spec');
console.log('[SharedState] Using loan account from previous run:', LOAN_ACCOUNT_NUMBER);

const DISBURSEMENT_AMOUNT = STEP['Disbursement Amount'] ? String(STEP['Disbursement Amount']) : undefined;

test('HLADISB - disbursement for retail loan', async ({ page }) => {
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
    });

    console.log('====================================');
    console.log('Disbursement message:', result.message);
    if (result.message && !/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i.test(result.message)) {
      throw new Error('Expected a success message but got: ' + result.message);
    }
    expect(result.message ?? '').not.toMatch(/could not get response from server/i);

    // Hard assertion: full disbursement must report a successful message.
    expect(
      result.message,
      `Expected successful disbursement message, but got: ${result.message ?? 'no message'}`,
    ).toMatch(/successful/i);

    console.log('====================================');
  } finally {
    await homePage.logout().catch(() => {});
  }
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error|could not get response from server/);
});
