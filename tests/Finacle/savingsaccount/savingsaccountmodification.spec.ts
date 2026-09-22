import { test, expect } from '@playwright/test';
import { getPrimaryConfig } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import COMMON_DATA from '../../../data/common-data.json';
import { getSharedValue } from '../../helpers/sharedState';

const CONFIG = getPrimaryConfig();

// Use Account ID from shared state (written by savingsaccountcreation) for the
// savings entry; fall back to the hardcoded value in common-data.json.
const SHARED_ACCOUNT_ID = getSharedValue('accountId');
if (SHARED_ACCOUNT_ID) console.log(`[SharedState] Using Account ID from previous run: ${SHARED_ACCOUNT_ID}`);

// Parameterized test: iterates over both savings and current account modification data
for (const acct of COMMON_DATA.accountModification.filter(a => a.type === 'savings')) {
  // For savings type, prefer the dynamically created account ID
  const effectiveAccountId = acct.type === 'savings' && SHARED_ACCOUNT_ID
    ? SHARED_ACCOUNT_ID
    : acct.accountId;

  test.describe(`Account Modification - ${acct.type}`, () => {
    test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

    let lastDialogMessages: string[] = [];
    let homePage: HomePage;
    let accountPage: AccountPage;

    test.beforeEach(async ({ page }) => {
      test.setTimeout(900000);
      setupDialogHandlers(page, lastDialogMessages);
      await login(page, CONFIG);

      homePage = new HomePage(page);
      accountPage = new AccountPage(page, lastDialogMessages);
    });

    test(acct.testLabel, async ({ page }) => {
      console.log('Selecting Core Server...');
      await accountPage.selectCoreServer();

      console.log('Searching for HACM...');
      await accountPage.searchMenu('HACM');
      await page.waitForTimeout(3000);

      console.log('Selecting Modify function...');
      await accountPage.selectFunction('Modify');

      console.log(`Entering account ID to modify: ${effectiveAccountId}...`);
      await accountPage.enterHacmAccountId(effectiveAccountId);

      console.log('Clicking Go button...');
      await accountPage.clickGo();

      console.log(`Setting dispatch mode to ${acct.dispatchMode}...`);
      await accountPage.selectDispatchMode(acct.dispatchMode as 'email' | 'no dispatch' | 'post');

      console.log('Clicking Submit button...');
      await accountPage.submitForm();

      const result = await accountPage.verifyAccountCreated();
      console.log('Modification Result:', result.message);
      console.log('Account Number:', result.accountNumber);

      console.log('Logging out...');
      await homePage.logout();
    });
  });
}

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
