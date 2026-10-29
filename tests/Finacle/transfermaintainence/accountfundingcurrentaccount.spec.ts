import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';
import { recordTransactionId, getSharedValue, updateSharedState } from '../../helpers/sharedState';
import { TRANSFER_DATA } from '../../config/excelTestData';

const STEP: any = TRANSFER_DATA[0]?.data ?? {};

// Transfer maintenance (HTM) is performed by the maker user.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Transfer header inputs.
const SOL_ID = STEP.solId ?? '100';
const TRAN_TYPE_SUBTYPE = STEP.tranTypeSubType ?? 'T/CI';

// Pre/post HACLINQ checks and HTM posting use the resolved part transactions (debits/credits).

let homePage: HomePage;
let tmPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(20000);

  // Step 1: Login to finacle (maker user).
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  tmPage = new AccountPage(page);
});

// HTM - Post a transfer (debit one account, credit another) by part
// transaction and capture the generated transaction ID for verification.
test('HTM - transfer maintenance (post by part transaction)', async ({ page }) => {
  // Step 1: Select "core server" from the solution drop down.
  console.log('Selecting Core Server...');
  await tmPage.selectCoreServer();

  // Step 2: Type menu option "HTM" in finacle.
  // Pre-HTM HACLINQ verification: capture both account ledgers before the transfer.
  const preHtmAccounts = Array.from(new Set(tmPage.getHtmPartTransactions(STEP).map(e => e.accountId)));
  for (const accountId of preHtmAccounts) {
    console.log(`Pre-HTM HACLINQ: capturing account ${accountId}...`);
    await tmPage.searchAccountInquiry('HACLINQ');
    await tmPage.enterHaclinqAccountId(accountId);
    await tmPage.clickHaclinqGo();
    const preHtmFrame = page.frame({ name: 'FINW' });
    if (!preHtmFrame) throw new Error(`FINW frame not found for pre-HTM HACLINQ account ${accountId}`);
    const preHtmBody = await preHtmFrame.locator('body').innerText();
    expect(preHtmBody, `Pre-HTM HACLINQ account ${accountId} not loaded`).toContain(accountId);
  }

  console.log('Searching for HTM...');
  await tmPage.searchTransactionManagement('HTM');
  await page.waitForTimeout(3000);

  // Step 3: Function - A - Add, Sol id 100, transaction date today (defaulted),
  // Transaction type/subtype T/CI - customer induced, then Go.
  console.log('Selecting Add function...');
  await tmPage.selectHtmFunction('A');

  console.log('Entering Sol id...');
  await tmPage.enterHtmSolId(SOL_ID);

  console.log('Selecting transaction type/subtype...');
  await tmPage.selectHtmTranTypeSubType(TRAN_TYPE_SUBTYPE);

  console.log('Clicking Go button...');
  await tmPage.clickHtmGo();
  await page.waitForTimeout(5000);

  // Diagnostic: surface the part-transaction field ids on the posting screen.
  await tmPage.logVisibleFields('HTM posting screen');

  // Step 4: Enter all part transactions (one-to-one, one-to-many or many-to-many)
  // and post. The helper clicks Add for all entries except the last one, which
  // Post commits.
  console.log('Entering part transactions and posting...');
  const transactionId = await tmPage.postHtmTransfer(STEP);

  // Step 5: Transaction must have generated an ID.
  expect(transactionId, 'HTM transaction ID was not generated').toBeTruthy();
  console.log(`=== GENERATED TRANSACTION ID: ${transactionId} ===`);

  // Persist the transaction ID so the verification spec can authorise it.
  if (transactionId) {
    recordTransactionId(transactionId);
    updateSharedState((state: any) => { state.transactionId = transactionId; });
  }

  // Acknowledge the confirmation screen.
  console.log('Clicking OK on confirmation...');
  await tmPage.clickHtmOk();

  // Verification - HACLINQ (Account Ledger Inquiry): confirm each part transaction.
  const entries = tmPage.getHtmPartTransactions(STEP);
  for (const entry of entries) {
    console.log(`Verifying ${entry.type === 'D' ? 'DEBIT' : 'CREDIT'} account in HACLINQ...`);
    await tmPage.searchAccountInquiry('HACLINQ');
    await tmPage.enterHaclinqAccountId(entry.accountId);
    await tmPage.clickHaclinqGo();
    const ok = await tmPage.verifyHaclinqDebitCredit(entry.amount, entry.type === 'D' ? 'Debit' : 'Credit', transactionId ?? undefined);
    expect(ok, `Post-HTM HACLINQ ${entry.type} verification failed for ${entry.accountId}. Expected amount ${entry.amount} with transaction ${transactionId}`).toBe(true);
    console.log(`${entry.type === 'D' ? 'DEBIT' : 'CREDIT'} verification (${entry.accountId}): ${ok ? 'PASS' : 'NOT CONFIRMED'}`);
  }

  // Logout.
  console.log('Logging out...');
  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
