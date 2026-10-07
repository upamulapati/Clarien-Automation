import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import FLOW9_DATA from '../../../data/flow9.json';
import { getSharedValue } from '../../helpers/sharedState';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;
const IS_FLOW9 = process.env.CIF_MOD_FLOW === 'flow9';

// Existing current account number to which the related party will be added.
const SHARED_ACCOUNT_ID = process.env.FLOW9_CURRENT_ACCOUNT_ID ?? getSharedValue<string>('accountId');
if (IS_FLOW9 && !SHARED_ACCOUNT_ID) throw new Error('Flow 9 requires the current account ID from the previous step.');
const ACCOUNT_ID = (IS_FLOW9 ? SHARED_ACCOUNT_ID! : (SHARED_ACCOUNT_ID ?? '7600000160')) as string;
if (SHARED_ACCOUNT_ID) console.log(`[SharedState] Using Account ID from previous run: ${SHARED_ACCOUNT_ID}`);

// CIFs of the customers to add as related parties (joint holders).
const JOINT_HOLDERS = (IS_FLOW9 ? ((FLOW9_DATA as any).jointHolders as string[]) : ['0002012248']);
if (IS_FLOW9 && !JOINT_HOLDERS?.length) throw new Error('Flow 9 requires jointHolders in flow9.json.');

// Relationship type and code from flow9.json when running Flow 9.
const RELATION_TYPE = (IS_FLOW9 ? (FLOW9_DATA as any).relationType : 'Joint Holder') as string;
const RELATION_CODE = (IS_FLOW9 ? (FLOW9_DATA as any).relationCode : '999') as string;
if (IS_FLOW9 && !RELATION_CODE) throw new Error('Flow 9 requires relationCode in flow9.json.');

let homePage: HomePage;
let savingsAccountPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);

  // Navigate to login page and login
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  savingsAccountPage = new AccountPage(page);
});

// HACM - Add related party (joint holder) details to an existing current account
for (const RELATED_PARTY_CIF of JOINT_HOLDERS) {
  test(`HACM - add related party to current account (${RELATED_PARTY_CIF})`, async ({ page }) => {
  const accountId = ACCOUNT_ID;
  console.log(`Using existing Account ID: ${accountId}`);

  // Step 1: Select "core server" from solution drop down
  console.log('Selecting Core Server...');
  await savingsAccountPage.selectCoreServer();

  // Step 2: Type menu option "HACM" in finacle
  console.log('Searching for HACM...');
  await savingsAccountPage.searchMenu(COMMON_DATA.currentAccount.screens.modifyAndVerify);
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
  console.log(`Selecting relation type: ${RELATION_TYPE}...`);
  await savingsAccountPage.selectRelationType(RELATION_TYPE);

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
  expect(modifyResult.success, `Expected success but got: ${modifyResult.message}`).toBe(true);
  console.log('Modification Result:', modifyResult.message);
  expect(modifyResult.message).toBeTruthy();
  expect(modifyResult.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log('Account Number:', modifyResult.accountNumber);
  expect(modifyResult.accountNumber).toBeTruthy();

  // Logout
  console.log('Logging out...');
  await homePage.logout();
  });
}

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
