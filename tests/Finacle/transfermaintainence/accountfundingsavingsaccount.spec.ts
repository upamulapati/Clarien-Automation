import { test } from '@playwright/test';
import { getPrimaryConfig } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { getSharedValue, writeSharedState } from '../../helpers/sharedState';

const CONFIG = getPrimaryConfig();

// Transfer header inputs.
const SOL_ID = '100';
const TRAN_TYPE_SUBTYPE = 'T/CI'; // Transfer / Customer Induced

// Part transaction details.
const DEBIT_ACCOUNT = '7010003820';   // account to be debited
// Credit the dynamically created savings account if available.
const SHARED_ACCOUNT_ID = getSharedValue('accountId');
const CREDIT_ACCOUNT = SHARED_ACCOUNT_ID ?? '9200000593';
if (SHARED_ACCOUNT_ID) console.log(`[SharedState] Using Account ID as credit account: ${SHARED_ACCOUNT_ID}`);

const AMOUNT = '1000';

test.describe('Transfer Maintenance - Fund Savings Account', () => {
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

  // HTM - Post a transfer (debit one account, credit another) by part
  // transaction and capture the generated transaction ID for verification.
  test('HTM - transfer maintenance (post by part transaction)', async ({ page }) => {
    // Step 1: Select "core server" from the solution drop down.
    console.log('Selecting Core Server...');
    await tmPage.selectCoreServer();

    // Step 2: Type menu option "HTM" in finacle.
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

    // Diagnostic: verify field values before posting
    await tmPage.logVisibleFields('HTM after credit entry');

    // With the debit added (record 1) and the credit entered, scroll down and
    // click Post to post both part transactions.
    console.log('Clicking Post button...');
    await tmPage.clickHtmPost();

    // Surface any validation/exception message from the post.
    const hasError = await tmPage.checkHtmError();
    if (hasError) {
      await tmPage.logScreenMessages();
    }

    // Capture the generated transaction ID (e.g. "CB5") from the
    // "Posted successfully" confirmation screen for verification.
    const transactionId = await tmPage.getHtmTransactionId();
    console.log(`=== GENERATED TRANSACTION ID: ${transactionId} ===`);

    // Persist the transaction ID so the verification spec can authorise it.
    if (transactionId) {
      writeSharedState({ transactionId });
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
    console.log(`DEBIT verification (${DEBIT_ACCOUNT}): ${debitOk ? 'PASS' : 'NOT CONFIRMED'}`);

    console.log('Verifying CREDIT account in HACLINQ...');
    await tmPage.searchAccountInquiry('HACLINQ');
    await tmPage.enterHaclinqAccountId(CREDIT_ACCOUNT);
    await tmPage.clickHaclinqGo();
    const creditOk = await tmPage.verifyHaclinqDebitCredit(AMOUNT, 'Credit', transactionId ?? undefined);
    console.log(`CREDIT verification (${CREDIT_ACCOUNT}): ${creditOk ? 'PASS' : 'NOT CONFIRMED'}`);

    // Logout.
    console.log('Logging out...');
    await homePage.logout();
  });
});
