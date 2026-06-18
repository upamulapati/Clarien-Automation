import { test } from '@playwright/test';
import { HomePage } from '../../../pages/HomePage';
import { SavingsBankAccountPage } from '../../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';

// Account freeze (HAFSM) is performed by FINACLETEST13.
const USERNAME = COMMON_DATA.thirdCredentials.username;
const PASSWORD = COMMON_DATA.thirdCredentials.password;

// Existing savings account on which the freeze is marked.
const ACCOUNT_ID = '7710003367';

// Total Freeze + reason code 31015 (CDD required).
const FREEZE_CODE = 'Total Freeze';
const FREEZE_REASON_CODE = '31015';

let homePage: HomePage;
let savingsAccountPage: SavingsBankAccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);

  // Step 1: Login with FINACLETEST13
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  savingsAccountPage = new SavingsBankAccountPage(page);
});

// HAFSM - Mark a total freeze on an existing savings account.
test('HAFSM - mark total freeze on savings account', async ({ page }) => {
  console.log(`Marking freeze on Account ID: ${ACCOUNT_ID}`);

  // Select "core server" from the solution drop down
  console.log('Selecting Core Server...');
  await savingsAccountPage.selectCoreServer();

  // Step 2: Type menu option "HAFSM" in finacle
  console.log('Searching for HAFSM...');
  await savingsAccountPage.searchMenu('HAFSM');
  await page.waitForTimeout(3000);

  // Step 3: Function - Freeze
  console.log('Selecting Freeze function...');
  await savingsAccountPage.selectFunction('Freeze');

  // Step 4: A/c Id - Enter the account number to be frozen
  console.log('Entering account ID to freeze...');
  await savingsAccountPage.enterHacmAccountId(ACCOUNT_ID);

  // Step 5: Freeze code - Total Freeze
  console.log('Selecting freeze code (Total Freeze)...');
  await savingsAccountPage.selectFreezeCode(FREEZE_CODE);

  // Step 6: Freeze reason code 1 - 31015 (CDD required) from the search list
  console.log('Selecting freeze reason code 31015 (CDD required)...');
  await savingsAccountPage.selectFreezeReasonCode(FREEZE_REASON_CODE);

  // Step 7: Click Go
  console.log('Clicking Go button...');
  await savingsAccountPage.clickGo();

  // Step 8: Select the checkbox beside the A/c Id
  console.log('Selecting account row checkbox...');
  await savingsAccountPage.selectAccountRowCheckbox();

  // Click Submit
  console.log('Clicking Submit button...');
  await savingsAccountPage.submitForm();

  // Capture the actual Finacle status message after the freeze
  const statusMessage = await savingsAccountPage.getStatusMessage();
  console.log('Freeze status message:', statusMessage);

  // Logout
  console.log('Logging out...');
  await homePage.logout();
});
