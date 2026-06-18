import { test } from '@playwright/test';
import { HomePage } from '../../../pages/HomePage';
import { SavingsBankAccountPage } from '../../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

// Verification is performed by a different user than the one who made the changes
const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;

let homePage: HomePage;
let savingsAccountPage: SavingsBankAccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);

  // Step 1: Login with the verifying user (different from the maker)
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  savingsAccountPage = new SavingsBankAccountPage(page);
});

// TC_CA_HACM_VERIFY_001 - HACM Current Account Maintenance - Verify/Authorise modification
test('HACM - verify current account modification', async ({ page }) => {
  // Select "core server" from the solution drop down
  console.log('Selecting Core Server...');
  await savingsAccountPage.selectCoreServer();

  // Step 2: Type menu option "HACM" in finacle search
  console.log('Searching for HACM...');
  await savingsAccountPage.searchMenu('HACM');
  await page.waitForTimeout(3000);

  // Step 3: Function - V-Verify (option text is "V - Verify")
  console.log('Selecting Verify function...');
  await savingsAccountPage.selectFunction('Verify');

  // Step 4: A/c Id - Enter account number to verify
  console.log('Entering account ID to verify...');
  const accountId = '4600000111';
  await savingsAccountPage.enterHacmAccountId(accountId);

  // Click Go to load the account into the verification screen
  console.log('Clicking Go button...');
  await savingsAccountPage.clickGo();

  // Step 5: Visit General tab - check the dispatch mode details
  console.log('Visiting General tab...');
  await savingsAccountPage.visitTab('General');

  // Step 7: Visit Interest & Tax tab
  console.log('Visiting Interest & Tax tab...');
  await savingsAccountPage.visitTab('Interest & Tax');

  // Step 8: Visit Related Party tab
  console.log('Visiting Related Party tab...');
  await savingsAccountPage.visitTab('Related Party');

  // Step 9: Visit MIS Codes and Scheme tabs
  console.log('Visiting MIS Codes tab...');
  await savingsAccountPage.visitTab('MIS Codes');
  console.log('Visiting Scheme tab...');
  await savingsAccountPage.visitTab('Scheme');

  // Step 10: Visit Addl. Info. tab
  console.log('Visiting Addl. Info. tab...');
  await savingsAccountPage.visitTab('Addl. Info.');

  // Step 11: Click submit - account modification will be authorised/verified
  console.log('Clicking Submit button...');
  await savingsAccountPage.submitForm();

  // Click OK on the confirmation shown after submit
  console.log('Clicking OK button...');
  await savingsAccountPage.clickOkButton();

  // Capture the actual Finacle status message after verification
  const statusMessage = await savingsAccountPage.getStatusMessage();
  console.log('Verification status message:', statusMessage);

  const result = await savingsAccountPage.verifyAccountCreated();
  console.log('Verification Result:', result.message);
  console.log('Account Number:', result.accountNumber);

  // Logout
  console.log('Logging out...');
  await homePage.logout();
});

