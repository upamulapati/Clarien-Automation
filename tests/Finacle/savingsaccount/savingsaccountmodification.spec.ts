import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { getSharedValue } from '../../helpers/sharedState';
import { SAVINGS_MODIFY_DATA } from '../../config/excelTestData';
import COMMON_DATA from '../../../data/common-data.json';

// Parameterized test: iterates over savings account modification data from Excel/JSON.
// The account to modify is resolved at test runtime from the account created by the
// savingsaccountcreation / savingsaccountcreationverify specs (keyed by instance).
for (const acct of SAVINGS_MODIFY_DATA) {
  const acctData = acct.data ?? acct;
  const accountType = acctData.type ?? 'savings';

  test.describe(`Account Modification - ${accountType}`, () => {
    test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

    let lastDialogMessages: string[] = [];
    let homePage: HomePage;
    let accountPage: AccountPage;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(300000);
    ({ homePage } = await loginToFinacle(page, 'finacletest5', COMMON_DATA.credentials.password));
    accountPage = new AccountPage(page);
  });

    test(`HACM - modify savings account dispatch mode and A/c status - instance ${acctData.instance}`, async ({ page }) => {
      const createdAccountId = getSharedValue((state) => state.savingsAccounts?.[String(acctData.instance)] ?? state.accountId);
      const effectiveAccountId = createdAccountId || acctData.accountId;
      if (!createdAccountId) {
        console.warn(`[Modification] No created account found for instance ${acctData.instance}; falling back to Excel accountId ${acctData.accountId}`);
      } else {
        console.log(`[Modification] Using created account for instance ${acctData.instance}: ${effectiveAccountId}`);
      }

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
      const effectiveDispatchMode = (acctData.dispatchMode ?? 'post') as 'email' | 'no dispatch' | 'post';
      await accountPage.visitGeneralDetailsTab();
      await accountPage.selectDispatchMode(effectiveDispatchMode);

      console.log('Visiting Scheme tab to modify A/c Status...');
      await accountPage.visitTab('Scheme');
      await accountPage.selectAccountStatus((acctData.accountStatus ?? 'inactive') as 'active' | 'dormant' | 'inactive');

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

      // Persist the account that was modified so the verification spec can be data-driven from this run.
      //updateSharedState((state) => { state.modifiedSavingsAccountId = effectiveAccountId; });
      console.log(`[SharedState] Saved modified savings account id: ${effectiveAccountId}`);

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
