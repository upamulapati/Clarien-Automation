import { test, expect } from '@playwright/test';
import { RetailLoanDisbursementPage } from '../../pages/CoreBanking/RetailLoanDisbursementPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';
import { getSharedValue } from '../../helpers/sharedState';

// Maker user who performs the retail-loan disbursement.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Use the loan account created by the upstream creation spec when available.
const SHARED_LOAN_ACCOUNT = getSharedValue<string>('loanAccountId');
const LOAN_ACCOUNT_NUMBER = SHARED_LOAN_ACCOUNT ?? '3200000079';
if (SHARED_LOAN_ACCOUNT) console.log(`[SharedState] Using loan account from previous run: ${SHARED_LOAN_ACCOUNT}`);

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
  expect(result.message).toBeTruthy();
  expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
    expect(result.message ?? '').not.toMatch(/could not get response from server/i);
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
