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
  // Transaction IDs are written to the shared store by the posting spec.
  const transactionIds = readTransactionIds();

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
