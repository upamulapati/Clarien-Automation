import { test } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import { getSharedValue } from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Existing account number from which the related party record will be deleted
// (same account used when the related party was added).
const SHARED_ACCOUNT_ID = getSharedValue('loanAccountId');
const ACCOUNT_ID = SHARED_ACCOUNT_ID ?? '3200000044';
if (SHARED_ACCOUNT_ID) console.log(`[SharedState] Using Loan Account ID from previous run: ${SHARED_ACCOUNT_ID}`);

let homePage: HomePage;
let retailLoanAccountPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);

  // Navigate to login page and login (same user who added the related party)
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  retailLoanAccountPage = new AccountPage(page);
});

// HACMLA - Delete a related party record from an existing retail loan account
test('HACMLA - delete related party from retail loan account', async ({ page }) => {
  console.log(`Deleting related party on Account ID: ${ACCOUNT_ID}`);

  // Step 1: Select "core server" from solution drop down
  console.log('Selecting Core Server...');
  await retailLoanAccountPage.selectCoreServer();

  // Step 2: Type menu option "HACMLA" in finacle
  console.log('Searching for HACMLA...');
  await retailLoanAccountPage.searchMenu('HACMLA');
  await page.waitForTimeout(3000);

  // Step 3: Function - Modify
  console.log('Selecting Modify function...');
  await retailLoanAccountPage.selectFunction('Modify');

  // Step 4: A/c Id - Enter the account number from which to delete the party
  console.log('Entering account ID to modify...');
  await retailLoanAccountPage.enterHacmAccountId(ACCOUNT_ID);

  // Click Go to load the account
  console.log('Clicking Go button...');
  await retailLoanAccountPage.clickGo();

  // Step 5: Visit Related Party Details
  console.log('Visiting Related Party Details tab...');
  await retailLoanAccountPage.visitLoanTab('Related Party', 'relatedpartydetails');

  // Step 6: Go to the 2nd record (the one to be deleted)
  console.log('Navigating to related party record 2...');
  await retailLoanAccountPage.goToRelatedPartyRecord(2);

  // Step 7: Tick the Record DEL checkbox to mark the record for deletion
  console.log('Marking related party record for deletion...');
  await retailLoanAccountPage.markRelatedPartyRecordForDeletion();

  // Step 8: Click Submit
  console.log('Clicking Submit button...');
  await retailLoanAccountPage.submitForm();

  // Verify modification result
  const result = await retailLoanAccountPage.verifyAccountCreated();
  console.log('Deletion Result:', result.message);
  console.log('Account Number:', result.accountNumber);

  // Logout
  console.log('Logging out...');
  await homePage.logout();
});
