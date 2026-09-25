import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { SavingsBankAccountPage } from '../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';
import { readTransactionIds } from '../../helpers/sharedState';
import { getApplicationDate } from '../../helpers/common';

// Verification must be performed by a DIFFERENT user than the maker who posted
// the transfer (the transaction was posted by the maker in transfermaintainence.spec).
const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

// Transaction ID to verify. Set this directly to override; when left blank the
// id is read from the shared store written by the posting spec.
const TRANSACTION_ID = 'CB21';

// Expected part-transaction details (must match the posting spec).
const DEBIT_ACCOUNT = '6000123165';
const CREDIT_ACCOUNT = '9200000593';//'4600000119';
const AMOUNT = '1000';


let homePage: HomePage;
let tmPage: SavingsBankAccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(20000);

  // Step 1: Login with a different user (verifier) than the maker.
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  tmPage = new SavingsBankAccountPage(page);
});

// HTM (V - Verify) - Authorise/verify the transfer posted in the latest
// transfermaintainence.spec.ts run. The generated transaction ID is read at
// runtime from the shared store.
test('HTM - transfer maintenance verification', async ({ page }) => {
  // Prefer the in-script TRANSACTION_ID; otherwise fall back to the shared store.
  const transactionIds = TRANSACTION_ID.trim()
    ? [TRANSACTION_ID.trim()]
    : readTransactionIds();

  if (transactionIds.length === 0) {
    throw new Error(
      'No transaction ID to verify. Set TRANSACTION_ID in this spec, or run ' +
      'transfermaintainence.spec.ts first so the id is recorded in ' +
      'data/shared-state.json.'
    );
  }

  console.log(`Verifying ${transactionIds.length} transaction(s): ${transactionIds.join(', ')}`);

  for (const transactionId of transactionIds) {
    await verifyTransaction(page, transactionId);
  }

  // Logout once after all transactions are verified.
  console.log('Logging out...');
  await homePage.logout();
});

// Compares a read part-transaction against the expected account/amount and logs
// the result (soft check - the flow continues regardless).
function logCheck(
  label: string,
  read: { account: string; amount: string },
  expectedAccount: string,
  expectedAmount: string,
): void {
  const accountOk = read.account.includes(expectedAccount);
  const amountOk = read.amount.replace(/[,\s]/g, '').startsWith(expectedAmount);
  console.log(
    `${label} check -> account ${accountOk ? 'PASS' : `MISMATCH (got '${read.account}', expected '${expectedAccount}')`}, ` +
    `amount ${amountOk ? 'PASS' : `MISMATCH (got '${read.amount}', expected '${expectedAmount}')`}`,
  );
}

// Runs the HTM Verify flow for a single transaction ID.
async function verifyTransaction(
  page: import('@playwright/test').Page,
  transactionId: string,
): Promise<void> {
  console.log(`Verifying transaction: ${transactionId}`);

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
  await tmPage.enterHtmTransactionId(transactionId);

  // Step 5: Transaction date - today's date (usually defaulted).
  console.log('Entering transaction date...');
  await tmPage.enterHtmTransactionDate(await getApplicationDate(page));

  // Load the transaction into the verification screen.
  console.log('Clicking Go button...');
  await tmPage.clickHtmGo();
  await page.waitForTimeout(3000);

  // Step 6: Check the debit account number and amount (1st record).
  console.log('Checking DEBIT record...');
  const debit = await tmPage.readHtmPartTransaction('DEBIT (record 1)');
  logCheck('DEBIT', debit, DEBIT_ACCOUNT, AMOUNT);

  // Step 7: Click on record to view 2nd record (credit account number).
  console.log('Navigating to 2nd record (CREDIT)...');
  await tmPage.clickHtmNextRecord();

  // Step 8: Check the credit account number and amount (2nd record).
  console.log('Checking CREDIT record...');
  const credit = await tmPage.readHtmPartTransaction('CREDIT (record 2)');
  logCheck('CREDIT', credit, CREDIT_ACCOUNT, AMOUNT);

  // Step 9: Click Submit - the transaction gets authorised/verified.
  console.log('Clicking Submit button...');
  await tmPage.clickHtmSubmit();

  // Dismiss any Warning & Exception popup raised on submit.
  await tmPage.acceptWarningPopup();

  console.log(`=== VERIFIED TRANSACTION ID: ${transactionId} ===`);
}

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
