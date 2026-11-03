import { test, expect } from '@playwright/test';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { CRM_TEST_DATA } from '../../config/crmTestData';
import { HomePage } from '../../pages/HomePages/HomePage';
import COMMON_DATA from '../../../data/common-data.json';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { getSharedValue, getTransactionIds } from '../../helpers/sharedState';
import { getApplicationDate } from '../../helpers/common';

// Verification must be performed by a DIFFERENT user than the maker who posted
// the transfer. Uses the standard verification credentials.
const CONFIG = {
  baseUrl: CRM_TEST_DATA.common.baseUrl,
  username: COMMON_DATA.verifierCredentials.username,
  password: COMMON_DATA.verifierCredentials.password,
  timeouts: CRM_TEST_DATA.common.timeouts,
};

// Transaction IDs: prefer the list of posted transaction IDs; fallback to the last scalar value.
const TRANSACTION_IDS = getTransactionIds().length ? getTransactionIds() : [getSharedValue<string>('transactionId') ?? ''];
if (TRANSACTION_IDS.length) console.log(`[SharedState] Using Transaction IDs from previous run: ${TRANSACTION_IDS.join(', ')}`);


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

  // HTM (V - Verify) — Authorise/verify each transfer posted by the maker, one by one.
  for (const [index, TRANSACTION_ID] of TRANSACTION_IDS.entries()) {
    test(`HTM - transfer maintenance verification (${index + 1})`, async ({ page }) => {
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
      await tmPage.enterHtmTransactionDate(await getApplicationDate(page));

      // Load the transaction into the verification screen.
      console.log('Clicking Go button...');
      await tmPage.clickHtmGo();
      await page.waitForTimeout(3000);

      // Step 6: Click Submit - the transaction gets authorised/verified.
      console.log('Clicking Submit button...');
      await tmPage.clickHtmSubmit();

      // Dismiss any Warning & Exception popup raised on submit.
      await tmPage.acceptWarningPopup();

      console.log(`=== VERIFIED TRANSACTION ID: ${TRANSACTION_ID} ===`);

      // Logout.
      console.log('Logging out...');
      await homePage.logout();
    });
  }
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
