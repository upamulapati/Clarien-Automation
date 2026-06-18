import { test } from '@playwright/test';
import { HomePage } from '../../../pages/HomePage';
import { SavingsBankAccountPage } from '../../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

// Account unfreeze (HAFSM) is performed by FINACLETEST13.
const USERNAME = CREDENTIALS.thirdCredentials.username;
const PASSWORD = CREDENTIALS.thirdCredentials.password;

// Existing current account on which the freeze is removed.
const ACCOUNT_ID = '7600000160';

let homePage: HomePage;
let savingsAccountPage: SavingsBankAccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);

  // Step 1: Login with FINACLETEST13
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  savingsAccountPage = new SavingsBankAccountPage(page);
});

// HAFSM - Unfreeze an existing current account.
test('HAFSM - unfreeze current account', async ({ page }) => {
  console.log(`Unfreezing Account ID: ${ACCOUNT_ID}`);

  // Step 1: Select "core server" from the solution drop down
  console.log('Selecting Core Server...');
  await savingsAccountPage.selectCoreServer();

  // Step 2: Type menu option "HAFSM" in finacle
  console.log('Searching for HAFSM...');
  await savingsAccountPage.searchMenu('HAFSM');
  await page.waitForTimeout(3000);

  // Step 3: Function - Unfreeze
  console.log('Selecting Unfreeze function...');
  await savingsAccountPage.selectFunction('Unfreeze');

  // Step 4: A/c Id - Enter the account number to be unfrozen
  console.log('Entering account ID to unfreeze...');
  await savingsAccountPage.enterHacmAccountId(ACCOUNT_ID);

  // Step 5: Click Go
  console.log('Clicking Go button...');
  await savingsAccountPage.clickGo();

  // Step 6: Select the checkbox beside the A/c Id and click Submit
  console.log('Selecting account row checkbox...');
  await savingsAccountPage.selectAccountRowCheckbox();

  console.log('Clicking Submit button...');
  await savingsAccountPage.submitForm();

  // Step 7: Click OK after successful unfreezing of the account
  console.log('Clicking OK button...');
  await savingsAccountPage.clickOkButton();

  // Capture the actual Finacle status message after the unfreeze
  const statusMessage = await savingsAccountPage.getStatusMessage();
  console.log('Unfreeze status message:', statusMessage);

  // Logout
  console.log('Logging out...');
  await homePage.logout();
});
