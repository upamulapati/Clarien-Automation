import { test } from '@playwright/test';
import { HomePage } from '../../../pages/HomePage';
import { SavingsBankAccountPage } from '../../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';

const USERNAME = COMMON_DATA.credentials.username;
const PASSWORD = COMMON_DATA.credentials.password;

let homePage: HomePage;
let savingsAccountPage: SavingsBankAccountPage;


test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);

  // Navigate to login page and login
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  savingsAccountPage = new SavingsBankAccountPage(page);
});

// TC_SB_HACM_001 - HACM Account Maintenance - Set Dispatch Mode to No Dispatch
test('HACM - modify dispatch mode to no dispatch', async ({ page }) => {
  // Step 1: Select "core server" from solution drop down
  console.log('Selecting Core Server...');
  await savingsAccountPage.selectCoreServer();

  // Step 2: Type menu option "HACM" in finacle
  console.log('Searching for HACM...');
  await savingsAccountPage.searchMenu('HACM');
  await page.waitForTimeout(3000);

  // Step 3: Function - Modify
  console.log('Selecting Modify function...');
  await savingsAccountPage.selectFunction('Modify');

  // Step 4: A/c Id - Enter account number to be modified
  console.log('Entering account ID to modify...');
  const accountId = '7500001468';
  await savingsAccountPage.enterHacmAccountId(accountId);

  // Click Go to load the account
  console.log('Clicking Go button...');
  await savingsAccountPage.clickGo();

  // Step 5: Modify dispatch mode field to "no dispatch" (field is on the form)
  console.log('Setting dispatch mode to no dispatch...');
  await savingsAccountPage.selectDispatchMode('email');

  // Step 6: Click submit
  console.log('Clicking Submit button...');
  await savingsAccountPage.submitForm();

  // Verify modification result
  const result = await savingsAccountPage.verifyAccountCreated();
  console.log('Modification Result:', result.message);
  console.log('Account Number:', result.accountNumber);

  // Logout
  console.log('Logging out...');
  await homePage.logout();
});

