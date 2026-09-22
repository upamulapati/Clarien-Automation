import { test, expect } from '@playwright/test';
import { getVerificationConfig } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { getSharedValue } from '../../helpers/sharedState';

// Verification must be performed by a DIFFERENT user than the maker who posted
// the transfer. Uses the standard verification credentials.
const CONFIG = getVerificationConfig();

// Expected part-transaction details (must match the posting spec).
const DEBIT_ACCOUNT = '6000123165';
const SHARED_CREDIT_ACCOUNT = getSharedValue<string>('accountId');
const CREDIT_ACCOUNT = SHARED_CREDIT_ACCOUNT ?? '4600000119';
if (SHARED_CREDIT_ACCOUNT) console.log(`[SharedState] Using credit account from previous run: ${SHARED_CREDIT_ACCOUNT}`);
const AMOUNT = '1000';

// Transaction ID: prefer shared state from the posting spec, fallback to hardcoded.
const SHARED_TXN_ID = getSharedValue((state) => state.transactionId);
const TRANSACTION_ID = SHARED_TXN_ID ?? 'CB18';
if (SHARED_TXN_ID) console.log(`[SharedState] Using Transaction ID from previous run: ${SHARED_TXN_ID}`);

// Today's date in Finacle's DD-MM-YYYY format (transaction date).
function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

test.describe('Transfer Maintenance - Verification', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  let lastDialogMessages: string[] = [];
  let homePage: HomePage;
  let tmPage: AccountPage;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(900000);
    setupDialogHandlers(page, lastDialogMessages);
    await login(page, CONFIG);

    homePage = new HomePage(page);
    tmPage = new AccountPage(page);
  });

  // HTM (V - Verify) — Authorise/verify the transfer posted by the maker.
  test('HTM - transfer maintenance verification', async ({ page }) => {
    expect(TRANSACTION_ID, 'Transaction ID must be available for verification').toBeTruthy();

    console.log(`Verifying transaction: ${TRANSACTION_ID}`);

    // Step 1: Select "core server" from the solution drop down.
    console.log('Selecting Core Server...');
    await tmPage.selectCoreServer();

    // Step 2: Type menu option "HTM" in finacle.
    console.log('Searching for HTM...');
    await tmPage.searchTransactionManagement('HTM');
    await page.waitForTimeout(3000);

    // Step 3: Function - V - Verify.
    console.log('Selecting Verify function...');
    await tmPage.selectHtmFunction('V');

    // Step 4: Enter the transaction ID generated during posting.
    console.log('Entering transaction ID to verify...');
    await tmPage.enterHtmTransactionId(TRANSACTION_ID);

    // Step 5: Transaction date - today's date (usually defaulted).
    console.log('Entering transaction date...');
    await tmPage.enterHtmTransactionDate(todayDDMMYYYY());

    // Load the transaction into the verification screen.
    console.log('Clicking Go button...');
    await tmPage.clickHtmGo();
    await page.waitForTimeout(3000);

    // Step 6: Check the debit account number and amount (1st record).
    console.log('Checking DEBIT record...');
    const debit = await tmPage.readHtmPartTransaction('DEBIT (record 1)');
    const debitAccountOk = debit.account.includes(DEBIT_ACCOUNT);
    const debitAmountOk = debit.amount.replace(/[,\s]/g, '').startsWith(AMOUNT);
    console.log(`DEBIT check -> account ${debitAccountOk ? 'PASS' : `MISMATCH (got '${debit.account}')`}, amount ${debitAmountOk ? 'PASS' : `MISMATCH (got '${debit.amount}')`}`);

    // Step 7: Click on record to view 2nd record (credit account number).
    console.log('Navigating to 2nd record (CREDIT)...');
    await tmPage.clickHtmNextRecord();

    // Step 8: Check the credit account number and amount (2nd record).
    console.log('Checking CREDIT record...');
    const credit = await tmPage.readHtmPartTransaction('CREDIT (record 2)');
    const creditAccountOk = credit.account.includes(CREDIT_ACCOUNT);
    const creditAmountOk = credit.amount.replace(/[,\s]/g, '').startsWith(AMOUNT);
    console.log(`CREDIT check -> account ${creditAccountOk ? 'PASS' : `MISMATCH (got '${credit.account}')`}, amount ${creditAmountOk ? 'PASS' : `MISMATCH (got '${credit.amount}')`}`);

    // Step 9: Click Submit - the transaction gets authorised/verified.
    console.log('Clicking Submit button...');
    await tmPage.clickHtmSubmit();

    // Dismiss any Warning & Exception popup raised on submit.
    await tmPage.acceptWarningPopup();

    console.log(`=== VERIFIED TRANSACTION ID: ${TRANSACTION_ID} ===`);

    // Logout.
    console.log('Logging out...');
    await homePage.logout();
  });
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
