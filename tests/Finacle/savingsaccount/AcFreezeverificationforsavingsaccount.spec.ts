import { test } from '@playwright/test';
import { HomePage } from '../../../pages/HomePage';
import { SavingsBankAccountPage } from '../../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';

// Verification must be done by a DIFFERENT user than the one who marked the
// freeze (the freeze was done by finacletest13).
const USERNAME = COMMON_DATA.verifierCredentials.username;
const PASSWORD = COMMON_DATA.verifierCredentials.password;

// Existing savings account on which the freeze was marked.
const ACCOUNT_ID = '7710003367';

let homePage: HomePage;
let savingsAccountPage: SavingsBankAccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);

  // Step 1: Login with a different user (finacletest14)
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  savingsAccountPage = new SavingsBankAccountPage(page);
});

// HAFSM - Verify/authorise the freeze that was marked on a savings account.
test('HAFSM - verify freeze on savings account', async ({ page }) => {
  console.log(`Verifying freeze on Account ID: ${ACCOUNT_ID}`);

  // Select "core server" from the solution drop down
  console.log('Selecting Core Server...');
  await savingsAccountPage.selectCoreServer();

  // Step 2: Type menu option "HAFSM" in finacle
  console.log('Searching for HAFSM...');
  await savingsAccountPage.searchMenu('HAFSM');
  await page.waitForTimeout(3000);

  // Step 3: Function - V - Verify
  console.log('Selecting Verify function...');
  await savingsAccountPage.selectFunction('Verify');

  // Step 4: A/c Id - Enter the account number in which freeze is marked
  console.log('Entering account ID to verify...');
  await savingsAccountPage.enterHacmAccountId(ACCOUNT_ID);

  // Step 5: Click Go to load the pending freeze into the verification screen
  console.log('Clicking Go button...');
  await savingsAccountPage.clickGo();

  // Step 6: Verify whether the freeze details are correct
  const freezeDetails = await savingsAccountPage.getFreezeDetails(ACCOUNT_ID);
  console.log('Freeze details on verification screen:', freezeDetails);

  // Step 7: Click Submit - the freeze gets authorised/verified
  console.log('Clicking Submit button...');
  await savingsAccountPage.submitForm();

  // Capture the actual Finacle status message after verification
  const statusMessage = await savingsAccountPage.getStatusMessage();
  console.log('Verification status message:', statusMessage);

  // Sign out of the application
  console.log('Logging out...');
  await homePage.logout();
});
