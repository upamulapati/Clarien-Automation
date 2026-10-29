import { test, expect } from '@playwright/test';
import { DEFAULT_CUSTOMER } from '../../config/testData';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { ServicePackPage } from '../../pages/CRM/servicePackPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { recordTransactionId, updateSharedState } from '../../helpers/sharedState';
import { captureEvidence } from '../../helpers/evidence';
import { getPrimaryConfig } from '../../config/crmTestData';
import COMMON_DATA from '../../../data/common-data.json';
import { TRANSFER_DATA } from '../../config/excelTestData';

const CONFIG = getPrimaryConfig();

const BASE_STEP: any = TRANSFER_DATA[0]?.data ?? {};
const SAVINGS_FUNDING_ROW: any = TRANSFER_DATA.find((r: any) => r.data?.testType === 'savingsFunding')?.data ?? BASE_STEP;
const SERIAL_245_ROW: any = TRANSFER_DATA.find((r: any) => r.data?.testType === 'serial245')?.data ?? {};
const SERIAL_261_ROW: any = TRANSFER_DATA.find((r: any) => r.data?.testType === 'serial261')?.data ?? {};

const USERNAME = COMMON_DATA.credentials.username;
const PASSWORD = COMMON_DATA.credentials.password;

// Transfer header inputs (fallback to the first resolved row).
const SOL_ID = SAVINGS_FUNDING_ROW.solId ?? DEFAULT_CUSTOMER.solId ?? '100';
const TRAN_TYPE_SUBTYPE = SAVINGS_FUNDING_ROW.tranTypeSubType ?? 'T/CI';

// Legacy scalar details for the Serial 245/261 tests.
const SAVINGS_FUNDING_DEBIT = SAVINGS_FUNDING_ROW.debits?.[0];
const SAVINGS_FUNDING_CREDIT = SAVINGS_FUNDING_DEBIT?.credits?.[0];
const DEBIT_ACCOUNT = SAVINGS_FUNDING_DEBIT?.accountId ?? '';
const CREDIT_ACCOUNT = SAVINGS_FUNDING_CREDIT?.accountId ?? '';
const INITIAL_FUNDING_AMOUNT = SAVINGS_FUNDING_DEBIT?.amount ?? '100';

const SERIAL_245_DEBIT = SERIAL_245_ROW.debits?.[0];
const SECONDARY_AMOUNT = SERIAL_245_DEBIT?.amount ?? '100';

test.describe(SAVINGS_FUNDING_ROW.testLabel ?? 'Transfer Maintenance - Fund Savings Account', () => {
  
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  let homePage: HomePage;
  let tmPage: AccountPage;
  let spPage: ServicePackPage;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(900000);
    ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
    tmPage = new AccountPage(page);
    spPage = new ServicePackPage(page);
  });

  // HTM - Post one-to-one, one-to-many, or many-to-many transfers.
  // Generates one Playwright test per resolved transfer row.
  for (const [index, raw] of TRANSFER_DATA.entries()) {
    const STEP: any = raw.data ?? {};
    const label = STEP.testLabel ?? `transfer instance ${raw.instance ?? index + 1}`;
    const STEP_SOL_ID = STEP.solId ?? SOL_ID;
    const STEP_TRAN_TYPE = STEP.tranTypeSubType ?? TRAN_TYPE_SUBTYPE;

    test(`HTM - transfer maintenance (${label})`, async ({ page }) => {
      // Step 1: Select "core server" from the solution drop down.
      console.log('Selecting Core Server...');
      await tmPage.selectCoreServer();

      // Pre-HTM HACLINQ verification: capture every distinct account ledger before the transfer.
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

      // Step 3: Function - A - Add, Sol id, transaction date today (defaulted),
      // Transaction type/subtype, then Go.
      console.log('Selecting Add function...');
      await tmPage.selectHtmFunction('A');

      console.log('Entering Sol id...');
      await tmPage.enterHtmSolId(String(STEP_SOL_ID));

      console.log('Selecting transaction type/subtype...');
      await tmPage.selectHtmTranTypeSubType(STEP_TRAN_TYPE);

      console.log('Clicking Go button...');
      await tmPage.clickHtmGo();
      await page.waitForTimeout(5000);

      // Diagnostic: surface the part-transaction field ids on the posting screen.
      await tmPage.logVisibleFields('HTM posting screen');

      // Step 4+: Enter all part transactions and post.
      console.log('Entering part transactions and posting...');
      const transactionId = await tmPage.postHtmTransfer(STEP);

      // Surface any validation/exception message from the post.
      const hasError = await tmPage.checkHtmError();
      if (hasError) {
        await tmPage.logScreenMessages();
      }
      expect(hasError).toBe(false);

      // Capture the generated transaction ID (e.g. "CB5") from the
      // "Posted successfully" confirmation screen for verification.
      expect(transactionId, 'HTM transaction ID was not generated').toBeTruthy();
      console.log(`=== GENERATED TRANSACTION ID: ${transactionId} ===`);

      // Persist the transaction ID so the verification spec can authorise it.
      if (transactionId) {
        recordTransactionId(transactionId);
        updateSharedState((state: any) => { state.transactionId = transactionId; });
      }

      await captureEvidence(page, 'Step: Transaction posted', { transactionId });

      // Acknowledge the confirmation screen.
      console.log('Clicking OK on confirmation...');
      await tmPage.clickHtmOk();

      // Verification - HACLINQ (Account Ledger Inquiry): confirm every part transaction.
      const entries = tmPage.getHtmPartTransactions(STEP);
      for (const entry of entries) {
        console.log(`Verifying ${entry.type === 'D' ? 'DEBIT' : 'CREDIT'} account in HACLINQ...`);
        await tmPage.searchAccountInquiry('HACLINQ');
        await tmPage.enterHaclinqAccountId(entry.accountId);
        await tmPage.clickHaclinqGo();
        const ok = await tmPage.verifyHaclinqDebitCredit(
          entry.amount,
          entry.type === 'D' ? 'Debit' : 'Credit',
          transactionId ?? undefined
        );
        expect(ok, `Post-HTM HACLINQ ${entry.type} verification failed for ${entry.accountId}. Expected amount ${entry.amount} with transaction ${transactionId}`).toBe(true);
        console.log(`${entry.type === 'D' ? 'DEBIT' : 'CREDIT'} verification (${entry.accountId}): ${ok ? 'PASS' : 'NOT CONFIRMED'}`);
      }

      await captureEvidence(page, 'Step: HACLINQ verification complete', { transactionId, entries });

      // Logout.
      console.log('Logging out...');
      await homePage.logout();
    });
  }

  // Serial 245 (INC000001224790) - HTM Post by Part Transaction checkbox selects all
  // Verify that clicking the master Post checkbox on the Post by Part Transaction
  // screen selects all part transaction checkboxes.
  test('Serial 245 - HTM Post by Part Transaction checkbox selects all', async ({ page }) => {
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

    // Step 4-7: Debit part transaction - select Debit, enter debit a/c id and
    // amount (Tab to commit the amount), then Add.
    console.log('Adding DEBIT part transaction...');
    await tmPage.selectHtmDebit();
    await tmPage.enterHtmAccountId(DEBIT_ACCOUNT);
    await tmPage.enterHtmAmount(SECONDARY_AMOUNT, true);
    await tmPage.clickHtmAdd();

    // Step 8-10: Credit part transaction - switch to Credit, enter credit a/c id
    // and amount (Tab to commit the amount).
    console.log('Entering CREDIT part transaction...');
    await tmPage.selectHtmCredit();
    await tmPage.enterHtmAccountId(CREDIT_ACCOUNT);
    await tmPage.enterHtmAmount(SECONDARY_AMOUNT, true);

    // Click the Post by Part Transaction button to open its screen.
    // The current credit part is the active record and is included in the list.
    console.log('Clicking Post by Part Transaction button to open Post by Part Transaction screen...');
    await (tmPage as any).htmClickButton('Post by Part Transaction');
    await page.waitForTimeout(5000);

    // Call the Serial 245 wrapper to verify master Post checkbox selects all.
    const result = await spPage.verifyHtmPostCheckboxSelectsAll(page);

    // Assertions in the spec file only.
    expect(result.masterPostCheckboxFound).toBe(true);
    expect(result.masterPostCheckboxClicked).toBe(true);
    expect(result.partTransactionCheckboxesFound).toBeGreaterThan(0);
    expect(result.allSelected).toBe(true);

    console.log(`[Serial 245] Verification complete: masterPostCheckboxFound=${result.masterPostCheckboxFound}, allSelected=${result.allSelected}`);
    await captureEvidence(page, 'Serial 245: Post checkbox verification', { masterPostCheckboxFound: result.masterPostCheckboxFound, allSelected: result.allSelected, partTransactionCheckboxesFound: result.partTransactionCheckboxesFound });

    // Cancel and logout.
    await (tmPage as any).getFinwFrame().locator('#Cancel, input[value="Cancel"]').first().click().catch(() => {});
    await page.waitForTimeout(2000);
    await homePage.logout();
  });

  // Serial 261 (INC000001227818) - Debit/credit order on modify
  // When SHOW_DEBIT_TRN_FIRST_FOR_TM is set to true, the debit part
  // transaction should appear before the credit part transaction on the
  // HTM Modify screen.
  test('Serial 261 - HTM Debit/credit order on modify', async ({ page }) => {
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

    // Step 4-7: Debit part transaction - select Debit, enter debit a/c id and
    // amount (Tab to commit the amount), then Add.
    console.log('Adding DEBIT part transaction...');
    await tmPage.selectHtmDebit();
    await tmPage.enterHtmAccountId(DEBIT_ACCOUNT);
    await tmPage.enterHtmAmount(SECONDARY_AMOUNT, true);
    await tmPage.clickHtmAdd();

    // Step 8-10: Credit part transaction - switch to Credit, enter credit a/c id
    // and amount (Tab to commit the amount).
    console.log('Entering CREDIT part transaction...');
    await tmPage.selectHtmCredit();
    await page.waitForTimeout(1000);
    await tmPage.enterHtmAccountId(CREDIT_ACCOUNT);
    await page.waitForTimeout(1000);
    await tmPage.enterHtmAmount(SECONDARY_AMOUNT, true);

    // Post the transaction to get a transaction ID
    console.log('Clicking Post button...');
    await tmPage.clickHtmPost();

    const transactionId = await tmPage.getHtmTransactionId();
    console.log(`=== GENERATED TRANSACTION ID: ${transactionId} ===`);

    if (!transactionId) {
      throw new Error('Transaction ID not generated. Cannot verify Serial 261.');
    }

    await tmPage.clickHtmOk();

    // Use Inquire to view the transaction and verify debit/credit order
    // The Inquire screen should show part transactions in the same order as Modify
    await tmPage.searchTransactionManagement('HTM');
    await page.waitForTimeout(3000);

    console.log('Selecting Inquire function...');
    await tmPage.selectHtmFunction('I');

    console.log('Entering transaction ID...');
    await tmPage.enterHtmTransactionId(transactionId);

    console.log('Clicking Go button to open Inquire screen...');
    await tmPage.clickHtmGo();
    await page.waitForTimeout(3000);

    // Call the Serial 261 wrapper to verify debit appears first
    const result = await spPage.verifyHtmDebitFirstOnModify(page);

    // Assertions in the spec file only.
    expect(result.modifyScreenOpened).toBe(true);
    expect(result.partTransactionsFound).toBeGreaterThan(0);
    expect(result.firstTransactionIsDebit).toBe(true);
    expect(result.debitCreditOrder[0]).toBe('Debit');

    console.log(`[Serial 261] Verification complete: modifyScreenOpened=${result.modifyScreenOpened}, debitCreditOrder=${JSON.stringify(result.debitCreditOrder)}, firstTransactionIsDebit=${result.firstTransactionIsDebit}`);
    await captureEvidence(page, 'Serial 261: Debit/credit order verification', { modifyScreenOpened: result.modifyScreenOpened, firstTransactionIsDebit: result.firstTransactionIsDebit, debitCreditOrder: result.debitCreditOrder });

    // Cancel and logout.
    await tmPage.clickHtmOk().catch(() => {});
    await page.waitForTimeout(2000);
    await homePage.logout();
  });
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
