import { test, expect } from '@playwright/test';
import { getPrimaryConfig } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { getSharedValue } from '../../helpers/sharedState';

const CONFIG = getPrimaryConfig();

// Use Account ID from shared state (written by savingsaccountcreation) for the
// savings entry; fall back to the hardcoded value in common-data.json.
const SHARED_ACCOUNT_ID = getSharedValue((state) => state.accountId);
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
    test.setTimeout(300000);
    ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
    accountPage = new AccountPage(page);
  });

  for (const acct of COMMON_DATA.accountModification.filter(a => a.type === 'savings')) {
    const effectiveAccountId = getSharedValue('accountId') ?? acct.accountId;

    test(`HACM - modify savings account dispatch mode and A/c status - ${acct.accountId}`, async ({ page }) => {
      console.log('Selecting Core Server...');
      await accountPage.selectCoreServer();
      await page.waitForTimeout(3000);

      console.log(`Searching for ${COMMON_DATA.savingsAccount.screens.modifyAndVerify}...`);
      await accountPage.searchMenu(COMMON_DATA.savingsAccount.screens.modifyAndVerify);
      await page.waitForTimeout(3000);

      console.log('Selecting Modify function...');
      await accountPage.selectFunction('Modify');

      console.log(`Entering account ID to modify: ${effectiveAccountId}...`);
      await accountPage.enterHacmAccountId(effectiveAccountId);

      console.log('Clicking Go button...');
      await accountPage.clickGo();

      console.log('Visiting General Details tab to modify Dispatch Mode...');
      const effectiveDispatchMode = (process.env.FLOW7_SAVINGS_DISPATCH as 'email' | 'no dispatch' | 'post') ?? acct.dispatchMode;
      await accountPage.visitGeneralDetailsTab();
      await accountPage.selectDispatchMode(effectiveDispatchMode);

      console.log('Visiting Scheme tab to modify A/c Status...');
      await accountPage.visitTab('Scheme');
      await accountPage.selectAccountStatus('inactive');

      console.log('Clicking Submit button...');
      await accountPage.submitForm();

      const result = await accountPage.verifyAccountCreated();
      console.log('Exact result message:', result.message);

      if (!result.success) {
        console.error('Savings account modification failed. Exact error message:', result.message);
        console.error('Captured fields:', JSON.stringify(result.allFields, null, 2));
      }

      expect(result.success, `Expected successful modification but got: ${result.message}`).toBe(true);
      expect(result.message, 'No status message captured for savings account modification').toBeTruthy();
      expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);

      console.log('Savings account modification passed. Result:', result.message);

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
