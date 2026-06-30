import { test } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Existing current account number to which the related party will be added.
const ACCOUNT_ID = '7600000160';

// CIF of the customer to add as a related party (joint holder).
const RELATED_PARTY_CIF = '0002012248';

// Relationship code 999 maps to description "OTHERS".
const RELATION_CODE = '999';

let homePage: HomePage;
let savingsAccountPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);

  // Navigate to login page and login
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  savingsAccountPage = new AccountPage(page);
});

// HACM - Add related party (joint holder) details to an existing current account
test('HACM - add related party to current account', async ({ page }) => {
  const accountId = ACCOUNT_ID;
  console.log(`Using existing Account ID: ${accountId}`);

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

  // Step 4: A/c Id - Enter the existing account number
  console.log('Entering account ID to modify...');
  await savingsAccountPage.enterHacmAccountId(accountId);

  // Click Go to load the account
  console.log('Clicking Go button...');
  await savingsAccountPage.clickGo();

  // Step 5: Visit General Details - set Next Print Date (present/future date)
  console.log('Visiting General Details tab...');
  await savingsAccountPage.visitTabById('acmogd');

  console.log('Setting next print date...');
  await savingsAccountPage.setNextPrintDate();

  // Step 6: Visit Related Party Details - click ADD
  console.log('Visiting Related Party Details tab...');
  await savingsAccountPage.visitTabById('relatedpartydetails');

  console.log('Clicking Add for related party...');
  await savingsAccountPage.clickRelatedPartyAdd();

  // Step 7: Relation type - Joint Holder
  console.log('Selecting relation type: Joint Holder...');
  await savingsAccountPage.selectRelationType('Joint Holder');

  // Step 8: Relation code - Others (code 999)
  console.log('Selecting relation code: Others (999)...');
  await savingsAccountPage.selectRelationCode(RELATION_CODE);

  // Step 9: Enter CIF number and press Tab (customer details auto-populate)
  console.log('Entering related party CIF...');
  await savingsAccountPage.enterRelatedPartyCif(RELATED_PARTY_CIF);

  // Step 10: Click Submit
  console.log('Clicking Submit button...');
  await savingsAccountPage.submitForm();

  // Verify modification result
  const modifyResult = await savingsAccountPage.verifyAccountCreated();
  console.log('Modification Result:', modifyResult.message);
  console.log('Account Number:', modifyResult.accountNumber);

  // Logout
  console.log('Logging out...');
  await homePage.logout();
});
