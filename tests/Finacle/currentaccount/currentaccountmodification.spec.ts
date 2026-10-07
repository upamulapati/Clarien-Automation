import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';
import COMMON_DATA from '../../../data/common-data.json';
import { getSharedValue } from '../../helpers/sharedState';
import FLOW9_DATA from '../../../data/flow9.json';

// Current account modification is done by the maker user.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;
const IS_FLOW9 = process.env.CIF_MOD_FLOW === 'flow9';

// A/c Id to be modified.
const SHARED_ACCOUNT_ID = getSharedValue<string>('accountId') ?? process.env.FLOW9_CURRENT_ACCOUNT_ID;
if (IS_FLOW9 && !SHARED_ACCOUNT_ID) throw new Error('Flow 9 requires the current account ID to modify.');
const ACCOUNT_ID = (IS_FLOW9 ? SHARED_ACCOUNT_ID! : (SHARED_ACCOUNT_ID ?? '4600000134')) as string;

// HACM (Customer Account Maintenance) screen for current accounts.
const HACM_MENU = COMMON_DATA.currentAccount.screens.modifyAndVerify;

const DISPATCH_MODE = (process.env.FLOW9_DISPATCH_MODE ?? process.env.FLOW6_DISPATCH_MODE ?? (IS_FLOW9 ? (FLOW9_DATA as any).modification.dispatchMode : 'no dispatch')) as 'email' | 'post' | 'no dispatch';
const ACCOUNT_STATUS = (process.env.FLOW9_ACCOUNT_STATUS ?? process.env.FLOW6_ACCOUNT_STATUS ?? (IS_FLOW9 ? (FLOW9_DATA as any).modification.accountStatus : 'inactive')) as 'active' | 'dormant' | 'inactive';

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
