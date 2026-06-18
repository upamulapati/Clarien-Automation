import { test } from '@playwright/test';
import { HomePage } from '../../../pages/HomePage';
import { SavingsBankAccountPage } from '../../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';

// Verification must be done by a DIFFERENT user than the one who deleted the
// related party (the deletion was done by finacletest01).
const USERNAME = COMMON_DATA.verifierCredentials.username;
const PASSWORD = COMMON_DATA.verifierCredentials.password;

// Existing account in which the related party was deleted.
const ACCOUNT_ID = '7600000160';

let homePage: HomePage;
let savingsAccountPage: SavingsBankAccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);

  // Step 1: Login with a different user (finacletest14)
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  savingsAccountPage = new SavingsBankAccountPage(page);
});

// HACM - Verify/authorise the deletion of a related party from an account
test('HACM - verify deleted related party for savings account', async ({ page }) => {
  console.log(`Verifying deleted related party on Account ID: ${ACCOUNT_ID}`);

  // Select "core server" from the solution drop down
  console.log('Selecting Core Server...');
  await savingsAccountPage.selectCoreServer();

  // Step 2: Type menu option "HACM" in finacle
  console.log('Searching for HACM...');
  await savingsAccountPage.searchMenu('HACM');
  await page.waitForTimeout(3000);

  // Step 3: Function - V - Verify
  console.log('Selecting Verify function...');
  await savingsAccountPage.selectFunction('Verify');

  // Step 4: A/c Id - Enter the account number in which related party is deleted
  console.log('Entering account ID to verify...');
  await savingsAccountPage.enterHacmAccountId(ACCOUNT_ID);

  // Click Go to load the account into the verification screen
  console.log('Clicking Go button...');
  await savingsAccountPage.clickGo();

  // Step 5: Visit Related Party details - go to the 2nd record and confirm the
  // DEL checkbox is highlighted/ticked (i.e. the record is pending deletion)
  console.log('Visiting Related Party tab...');
  await savingsAccountPage.visitTabById('relatedpartydetails');

  console.log('Navigating to related party record 2...');
  await savingsAccountPage.goToRelatedPartyRecord(2);

  console.log('Checking whether the DEL checkbox is highlighted...');
  const markedForDeletion = await savingsAccountPage.isRelatedPartyMarkedForDeletion();
  console.log(`Related party record marked for deletion: ${markedForDeletion}`);

  // Step 6: Visit Scheme details
  console.log('Visiting Scheme tab...');
  await savingsAccountPage.visitTabById('acmosd');

  // Step 7: Visit Interest details
  console.log('Visiting Interest & Tax tab...');
  await savingsAccountPage.visitTabById('acmoit');

  // Step 8: Visit MIS Codes details
  console.log('Visiting MIS Codes tab...');
  await savingsAccountPage.visitTabById('miscodes');

  // Step 9: Visit Additional Info details
  console.log('Visiting Addl. Info. tab...');
  await savingsAccountPage.visitTabById('acmai');

  // Step 10: Click Submit - the deletion gets authorised/verified
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

