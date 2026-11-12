import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';
import COMMON_DATA from '../../../data/common-data.json';
import { getSharedValue } from '../../helpers/sharedState';
import { CURRENT_MODIFY_VERIFY_DATA } from '../../config/excelTestData';

// Current account modification verification must be performed by a different user.
const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;

// HACM (Customer Account Maintenance) screen for current accounts.
const HACM_MENU = COMMON_DATA.currentAccount.screens.modifyAndVerify;

let homePage: HomePage;
let accountPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  accountPage = new AccountPage(page);
});

const sharedAccounts = (getSharedValue('currentAccounts') ?? {}) as Record<string, string>;
const verifyDataByInstance = new Map<string, any>();
for (const acct of CURRENT_MODIFY_VERIFY_DATA) {
  const acctData = acct.data ?? acct;
  const key = String(acctData.instance ?? '');
  if (key) verifyDataByInstance.set(key, acctData);
}

const instances = Object.keys(sharedAccounts).length > 0
  ? Object.keys(sharedAccounts)
  : Array.from(verifyDataByInstance.keys());

for (const instance of instances) {
  const acctData = verifyDataByInstance.get(instance) ?? { instance };
  const rawAccountId = sharedAccounts[instance] ?? acctData.accountId;
  const testLabel = typeof acctData.testLabel === 'string' ? acctData.testLabel.trim() : '';
  const accountIdForTitle = rawAccountId ? String(rawAccountId).trim() : 'from-shared-state';
  const testTitle = testLabel || `Verify current account modification - Instance ${instance} - ${accountIdForTitle}`;
  test(testTitle, async ({ page }) => {
    const verifyAccountId = accountIdForTitle !== 'from-shared-state' ? accountIdForTitle : undefined;
    if (!verifyAccountId) {
      throw new Error(`No accountId to verify for instance ${instance}`);
    }
    console.log(`[Verify] Using Account ID: ${verifyAccountId}`);
    console.log(`Verifying current account modification: ${verifyAccountId}`);

    console.log('Selecting Core Server...');
    await accountPage.selectCoreServer();
    await page.waitForTimeout(5000);

    console.log(`Searching for ${HACM_MENU}...`);
    await accountPage.searchMenu(HACM_MENU);
    await page.waitForTimeout(3000);

    console.log('Selecting V-Verify function...');
    await accountPage.selectFunction('V-Verify');

    console.log('Entering account ID to verify...');
    await accountPage.enterHacmAccountId(verifyAccountId);

    console.log('Clicking Go button...');
    await accountPage.clickGo();

    console.log('Visiting required HACM verification tabs...');

    const expectedDispatchMode = (acctData.dispatchMode ? String(acctData.dispatchMode).trim() : '') as string;
    const expectedAccountStatus = (acctData.accountStatus ? String(acctData.accountStatus).trim() : '') as string;

    console.log('Visiting General tab to check Dispatch Mode...');
    await accountPage.visitTab('General');
    const dispatchMode = await accountPage.getDispatchMode();
    console.log('Captured dispatch mode:', dispatchMode);
    if (!dispatchMode) {
      console.warn('Dispatch mode was not captured on General tab');
    } else if (expectedDispatchMode && !new RegExp(expectedDispatchMode.replace(/[-\s]/g, '[-\\s]?'), 'i').test(dispatchMode)) {
      console.warn(`Expected dispatch mode to reflect '${expectedDispatchMode}', got: ${dispatchMode}`);
    }

    console.log('Visiting Interest & Tax tab...');
    await accountPage.visitTab('Interest & Tax');

    console.log('Visiting Related Party tab...');
    await accountPage.visitTab('Related Party');

    console.log('Visiting MIS Codes tab...');
    await accountPage.visitTab('MIS Codes');

    console.log('Visiting Scheme tab to check A/c Status...');
    await accountPage.visitTab('Scheme');
    const accountStatus = await accountPage.getAccountStatus();
    console.log('Captured A/c status:', accountStatus);
    if (!accountStatus) {
      console.warn('A/c Status was not captured on Scheme tab');
    } else if (expectedAccountStatus && !new RegExp(expectedAccountStatus, 'i').test(accountStatus)) {
      console.warn(`Expected A/c Status to be '${expectedAccountStatus}', got: ${accountStatus}`);
    }

    console.log('Visiting Addl. Info. tab...');
    await accountPage.visitTab('Addl. Info.');

    console.log('Visiting Document details tab...');
    await accountPage.visitTabById('documentdetails');

    console.log('Clicking Submit button...');
    await accountPage.clickSubmit();

    // Dismiss any non-blocking warning/exception popup that appears.
    if (!page.isClosed()) {
      await accountPage.acceptWarningPopup().catch(() => {});
      await page.waitForTimeout(2000).catch(() => {});
    }

    await page.waitForTimeout(3000);
    const result = await accountPage.verifyAccountCreated();
    console.log('Exact verification result message:', result.message);

    if (!result.success) {
      console.error('Current account modification verification did not report success. Full message:', result.message);
      console.error('Captured fields:', JSON.stringify(result.allFields, null, 2));
    }

    expect(result.message, 'No status message captured for current account modification verification').toBeTruthy();
    expect(
      result.message,
      `Current account modification verification did not report success. Full message: ${result.message}`
    ).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);

    console.log('Current account modification verification passed.');

    console.log('Logging out...');
    await homePage.logout();
  });
}
