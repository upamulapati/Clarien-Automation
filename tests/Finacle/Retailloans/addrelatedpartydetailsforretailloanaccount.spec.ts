import { test, expect } from '@playwright/test';
import { getPrimaryConfig } from '../../config/crmTestData';
import { CREDENTIALS } from '../../../data/credentials';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { getSharedValue } from '../../helpers/sharedState';
import { RETAIL_LOAN_DATA } from '../../config/excelTestData';

const CONFIG = getPrimaryConfig({
  username: CREDENTIALS.credentials.username,
  password: CREDENTIALS.credentials.password,
});
const STEP = RETAIL_LOAN_DATA[0]?.data ?? {};

// Existing retail loan account number to which the related party will be added.
const ACCOUNT_ID = getSharedValue<string>('loanAccountId');
if (!ACCOUNT_ID) throw new Error('loanAccountId must be available from the creation spec');
console.log('[SharedState] Using Account ID from previous run:', ACCOUNT_ID);

// CIF of the customer to add as a related party (joint holder).
// This must be a DIFFERENT customer than the account owner.
const RELATED_PARTY_CIF = STEP['Related Party CIF'];

// Relationship code 999 maps to description "OTHERS".
const RELATION_CODE = STEP['Relation Code'];

test.describe('Add Related Party to Retail Loan Account', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  let lastDialogMessages: string[] = [];
  let homePage: HomePage;
  let accountPage: AccountPage;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(900000);
    setupDialogHandlers(page, lastDialogMessages);
    await login(page, CONFIG);

    homePage = new HomePage(page);
    accountPage = new AccountPage(page);
  });

  // HACMLA - Add related party (joint holder) details to an existing retail loan account
  test('HACMLA - add related party to retail loan account', async ({ page }) => {
    console.log(`Using existing Account ID: ${ACCOUNT_ID}`);

    // Step 1: Select "core server" from solution drop down
    console.log('Selecting Core Server...');
    await accountPage.selectCoreServer();

    // Step 2: Type menu option "HACMLA" in finacle
    console.log('Searching for HACMLA...');
    const menuOption = STEP['menuOption'];
  if (!menuOption) throw new Error('menuOption is required in the Excel sheet');
  await accountPage.searchMenu(menuOption);
    await page.waitForTimeout(3000);

    // Step 3: Function - Modify
    console.log('Selecting Modify function...');
    await accountPage.selectFunction('Modify');

    // Step 4: A/c Id - Enter the existing account number
    console.log('Entering account ID to modify...');
    await accountPage.enterHacmAccountId(ACCOUNT_ID);

    // Click Go to load the account
    console.log('Clicking Go button...');
    await accountPage.clickGo();

    // Step 5: Visit Related Party Details - click ADD
    console.log('Visiting Related Party Details tab...');
    await accountPage.visitTabById('relatedpartydetails');

    console.log('Clicking Add for related party...');
    await accountPage.clickRelatedPartyAdd();

    // Step 7: Relation type - Joint Holder
    console.log('Selecting relation type: Joint Holder...');
    await accountPage.selectRelationType(STEP['Relation Type']);

    // Step 8: Relation code - Others (code 999)
    console.log('Selecting relation code: Others (999)...');
    await accountPage.selectRelationCode(RELATION_CODE);

    // Step 9: Enter CIF number and press Tab (customer details auto-populate)
    console.log('Entering related party CIF...');
    await accountPage.enterRelatedPartyCif(RELATED_PARTY_CIF);

    // Step 10: Click Submit
    console.log('Clicking Submit button...');
    await accountPage.submitForm();

    // Verify modification result
    const modifyResult = await accountPage.verifyAccountCreated();
  expect(modifyResult.success, `Expected success but got: ${modifyResult.message}`).toBe(true);
    console.log('Modification Result:', modifyResult.message);
    if (modifyResult.message && !/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i.test(modifyResult.message)) {
      throw new Error('Expected a success message but got: ' + modifyResult.message);
    }
    console.log('Account Number:', modifyResult.accountNumber);
  expect(modifyResult.accountNumber).toBeTruthy();

    // Logout
    console.log('Logging out...');
    await homePage.logout();
  });
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
