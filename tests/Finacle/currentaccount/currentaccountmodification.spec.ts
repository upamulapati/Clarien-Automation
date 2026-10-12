import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';
import COMMON_DATA from '../../../data/common-data.json';
import { getSharedValue } from '../../helpers/sharedState';
import { CURRENT_MODIFY_DATA } from '../../config/excelTestData';

// Current account modification is done by the maker user.
const USERNAME = 'finacletest5';
const PASSWORD = CREDENTIALS.credentials.password;

// HACM (Customer Account Maintenance) screen for current accounts.
const HACM_MENU = COMMON_DATA.currentAccount.screens.modifyAndVerify;

let homePage: HomePage;
let accountPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  accountPage = new AccountPage(page);
});

for (const acct of CURRENT_MODIFY_DATA) {
  test(`HACM - modify current account dispatch mode and A/c status - instance ${acct.instance}`, async ({ page }) => {
    const createdAccountId = getSharedValue((state) => state.currentAccounts?.[String(acct.instance)] ?? state.accountId);
    const effectiveAccountId = createdAccountId || acct.accountId;
    if (!createdAccountId) {
      console.warn(`[Modification] No created account found for instance ${acct.instance}; falling back to Excel accountId ${acct.accountId}`);
    } else {
      console.log(`[Modification] Using created account for instance ${acct.instance}: ${effectiveAccountId}`);
    }

    console.log('Selecting Core Server...');
    await accountPage.selectCoreServer();
    await page.waitForTimeout(3000);

    console.log(`Searching for ${HACM_MENU}...`);
    await accountPage.searchMenu(HACM_MENU);
    await page.waitForTimeout(3000);

    console.log('Selecting Modify function...');
    await accountPage.selectFunction('Modify');

    console.log(`Entering account ID to modify: ${effectiveAccountId}...`);
    await accountPage.enterHacmAccountId(effectiveAccountId);

    console.log('Clicking Go button...');
    await accountPage.clickGo();

    const DISPATCH_MODE = (acct.dispatchMode ?? 'no dispatch') as 'email' | 'post' | 'no dispatch';
    const ACCOUNT_STATUS = (acct.accountStatus ?? 'inactive') as 'active' | 'dormant' | 'inactive';

    console.log(`Visiting General Details tab to modify Dispatch Mode to ${DISPATCH_MODE}...`);
    await accountPage.visitGeneralDetailsTab();
    await accountPage.selectDispatchMode(DISPATCH_MODE);

    console.log(`Visiting Scheme tab to modify A/c Status to ${ACCOUNT_STATUS}...`);
    await accountPage.visitTab('Scheme');
    await accountPage.selectAccountStatus(ACCOUNT_STATUS);

    console.log('Clicking Submit button...');
    await accountPage.submitForm();

    const result = await accountPage.verifyAccountCreated();
    console.log('Exact result message:', result.message);

    if (!result.success) {
      console.error('Current account modification failed. Exact error message:', result.message);
      console.error('Captured fields:', JSON.stringify(result.allFields, null, 2));
    }

    expect(result.success, `Expected successful modification but got: ${result.message}`).toBe(true);
    expect(result.message, 'No status message captured for current account modification').toBeTruthy();
    expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);

    console.log('Current account modification passed. Result:', result.message);

    console.log('Logging out...');
    await homePage.logout();
  });
}
