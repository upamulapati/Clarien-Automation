import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';
import COMMON_DATA from '../../../data/common-data.json';

// Current account modification is done by the maker user.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// A/c Id to be modified.
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

test('HACM - modify current account dispatch mode and A/c status', async ({ page }) => {
  console.log('Selecting Core Server...');
  await accountPage.selectCoreServer();
  await page.waitForTimeout(3000);

  console.log(`Searching for ${HACM_MENU}...`);
  await accountPage.searchMenu(HACM_MENU);
  await page.waitForTimeout(3000);

  console.log('Selecting Modify function...');
  await accountPage.selectFunction('Modify');

  console.log(`Entering account ID to modify: ${ACCOUNT_ID}...`);
  await accountPage.enterHacmAccountId(ACCOUNT_ID);

  console.log('Clicking Go button...');
  await accountPage.clickGo();

  console.log('Visiting General Details tab to modify Dispatch Mode...');
  await accountPage.visitGeneralDetailsTab();
  await accountPage.selectDispatchMode('no dispatch');

  console.log('Visiting Scheme tab to modify A/c Status...');
  await accountPage.visitTab('Scheme');
  await accountPage.selectAccountStatus('inactive');

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
