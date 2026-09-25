import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { SavingsBankAccountPage } from '../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';
import { recordTransactionId, resetTransactionIds } from '../../helpers/sharedState';

// Transfer maintenance (HTM) is performed by the maker user.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Transfer header inputs.
const SOL_ID = '100';
const TRAN_TYPE_SUBTYPE = 'T/CI'; // Transfer / Customer Induced

// Part transaction details.
const DEBIT_ACCOUNT = '7010003820';   // account to be debited
const CREDIT_ACCOUNT = '4600000134';  // SB/CA account to be credited
const AMOUNT = '100';

let homePage: HomePage;
let tmPage: SavingsBankAccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(20000);

  // Step 1: Login to finacle (maker user).
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  tmPage = new SavingsBankAccountPage(page);
});

// HTM - Post a transfer (debit one account, credit another) by part
// transaction and capture the generated transaction ID for verification.
test('HTM - transfer maintenance (post by part transaction)', async ({ page }) => {
  // Step 1: Select "core server" from the solution drop down.
  console.log('Selecting Core Server...');
  await tmPage.selectCoreServer();

  // Step 2: Type menu option "HTM" in finacle.
  // Pre-HTM HACLINQ verification: capture both account ledgers before the transfer.
  console.log('Pre-HTM HACLINQ: capturing DEBIT account...');
  await tmPage.searchAccountInquiry('HACLINQ');
  await tmPage.enterHaclinqAccountId(DEBIT_ACCOUNT);
  await tmPage.clickHaclinqGo();
  const preDebitFrame = page.frame({ name: 'FINW' });
  if (!preDebitFrame) throw new Error('FINW frame not found for pre-HTM HACLINQ debit');
  const preDebitBody = await preDebitFrame.locator('body').innerText();
  expect(preDebitBody, `Pre-HTM HACLINQ debit account ${DEBIT_ACCOUNT} not loaded`).toContain(DEBIT_ACCOUNT);

  console.log('Pre-HTM HACLINQ: capturing CREDIT account...');
  await tmPage.searchAccountInquiry('HACLINQ');
  await tmPage.enterHaclinqAccountId(CREDIT_ACCOUNT);
  await tmPage.clickHaclinqGo();
  const preCreditFrame = page.frame({ name: 'FINW' });
  if (!preCreditFrame) throw new Error('FINW frame not found for pre-HTM HACLINQ credit');
  const preCreditBody = await preCreditFrame.locator('body').innerText();
  expect(preCreditBody, `Pre-HTM HACLINQ credit account ${CREDIT_ACCOUNT} not loaded`).toContain(CREDIT_ACCOUNT);

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

  // Step 4-7: Debit part transaction - select Debit, enter debit a/c id and
  // amount (Tab to commit the amount), then Add.
  console.log('Adding DEBIT part transaction...');
  await tmPage.selectHtmDebit();
  await tmPage.enterHtmAccountId(DEBIT_ACCOUNT);
  await tmPage.enterHtmAmount(AMOUNT, true);
  await tmPage.clickHtmAdd();

  // Step 8-10: Credit part transaction - switch to Credit, enter credit a/c id
  // and amount (Tab to commit the amount). The debit was Added as record 1; the
  // credit stays as the current entry which Post posts, so we do NOT click Add
  // again (that would leave an extra blank record).
  console.log('Entering CREDIT part transaction...');
  await tmPage.selectHtmCredit();
  await tmPage.enterHtmAccountId(CREDIT_ACCOUNT);
  await tmPage.enterHtmAmount(AMOUNT, true);

  // With the debit added (record 1) and the credit entered, scroll down and
  // click Post to post both part transactions.
  console.log('Clicking Post button...');
  await tmPage.clickHtmPost();

  // Surface any validation/exception message from the post.
  const hasError = await tmPage.checkHtmError();
  expect(hasError).toBe(false);
  if (hasError) {
    await tmPage.logScreenMessages();
  }

  // Capture the generated transaction ID (e.g. "CB5") from the
  // "Posted successfully" confirmation screen for verification.
  const transactionId = await tmPage.getHtmTransactionId();
  expect(transactionId, 'HTM transaction ID was not generated').toBeTruthy();
  console.log(`=== GENERATED TRANSACTION ID: ${transactionId} ===`);

  // Persist the transaction ID so the verification spec can authorise it.
  if (transactionId) {
    resetTransactionIds();
    recordTransactionId(transactionId);
  }

  // Acknowledge the confirmation screen.
  console.log('Clicking OK on confirmation...');
  await tmPage.clickHtmOk();

  // Verification - HACLINQ (Account Ledger Inquiry): confirm the debit account
  // was debited and the credit account was credited for the posted amount.
  console.log('Verifying DEBIT account in HACLINQ...');
  await tmPage.searchAccountInquiry('HACLINQ');
  await tmPage.enterHaclinqAccountId(DEBIT_ACCOUNT);
  await tmPage.clickHaclinqGo();
  const debitOk = await tmPage.verifyHaclinqDebitCredit(AMOUNT, 'Debit', transactionId ?? undefined);
  expect(debitOk, `Post-HTM HACLINQ debit verification failed for ${DEBIT_ACCOUNT}. Expected amount ${AMOUNT} with transaction ${transactionId}`).toBe(true);
  console.log(`DEBIT verification (${DEBIT_ACCOUNT}): ${debitOk ? 'PASS' : 'NOT CONFIRMED'}`);

  console.log('Verifying CREDIT account in HACLINQ...');
  await tmPage.searchAccountInquiry('HACLINQ');
  await tmPage.enterHaclinqAccountId(CREDIT_ACCOUNT);
  await tmPage.clickHaclinqGo();
  const creditOk = await tmPage.verifyHaclinqDebitCredit(AMOUNT, 'Credit', transactionId ?? undefined);
  expect(creditOk, `Post-HTM HACLINQ credit verification failed for ${CREDIT_ACCOUNT}. Expected amount ${AMOUNT} with transaction ${transactionId}`).toBe(true);
  console.log(`CREDIT verification (${CREDIT_ACCOUNT}): ${creditOk ? 'PASS' : 'NOT CONFIRMED'}`);

  // Logout.
  console.log('Logging out...');
  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
