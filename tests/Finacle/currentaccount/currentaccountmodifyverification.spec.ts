import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';
import COMMON_DATA from '../../../data/common-data.json';

// Current account modification verification must be performed by a different user.
const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;

// A/c Id that was modified.
const ACCOUNT_ID = '4600000134';

// HACM (Customer Account Maintenance) screen for current accounts.
const HACM_MENU = COMMON_DATA.currentAccount.screens.modifyAndVerify;

let homePage: HomePage;
let accountPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  accountPage = new AccountPage(page);
});

test('HACM - verify current account modification', async ({ page }) => {
  console.log(`Verifying current account modification: ${ACCOUNT_ID}`);

  console.log('Selecting Core Server...');
  await accountPage.selectCoreServer();
  await page.waitForTimeout(5000);

  console.log(`Searching for ${HACM_MENU}...`);
  await accountPage.searchMenu(HACM_MENU);
  await page.waitForTimeout(3000);

  console.log('Selecting V-Verify function...');
  await accountPage.selectFunction('V-Verify');

  console.log('Entering account ID to verify...');
  await accountPage.enterHacmAccountId(ACCOUNT_ID);

  console.log('Clicking Go button...');
  await accountPage.clickGo();

  console.log('Visiting required HACM verification tabs...');

  console.log('Visiting General tab to check Dispatch Mode...');
  await accountPage.visitTab('General');
  const dispatchMode = await accountPage.getDispatchMode();
  console.log('Captured dispatch mode:', dispatchMode);
  if (!dispatchMode) {
    console.warn('Dispatch mode was not captured on General tab');
  } else if (!/no dispatch|no despatch/i.test(dispatchMode)) {
    console.warn(`Expected dispatch mode to reflect 'no dispatch', got: ${dispatchMode}`);
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
  } else if (!/inactive/i.test(accountStatus)) {
    console.warn(`Expected A/c Status to be 'Inactive', got: ${accountStatus}`);
  }

  console.log('Visiting Addl. Info. tab...');
  await accountPage.visitTab('Addl. Info.');

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
