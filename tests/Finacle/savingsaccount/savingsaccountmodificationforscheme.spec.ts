import { test } from '@playwright/test';
import { HomePage } from '../../../pages/HomePage';
import { SavingsBankAccountPage } from '../../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

let homePage: HomePage;
let savingsAccountPage: SavingsBankAccountPage;


test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);

  // Navigate to login page and login
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  savingsAccountPage = new SavingsBankAccountPage(page);
});

// HACM - Modify a savings account scheme - set A/c status to Inactive
test('HACM - modify scheme A/c status to inactive', async ({ page }) => {
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
  const accountId = '7500001471';
  await savingsAccountPage.enterHacmAccountId(accountId);

  // Click Go to load the account
  console.log('Clicking Go button...');
  await savingsAccountPage.clickGo();

  // Step 5: Visit Scheme tab and set A/c status to Inactive
  console.log('Visiting Scheme tab...');
  await savingsAccountPage.visitTab('Scheme');

  console.log('Setting A/c status to inactive...');
  await savingsAccountPage.selectAccountStatus('inactive');

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
