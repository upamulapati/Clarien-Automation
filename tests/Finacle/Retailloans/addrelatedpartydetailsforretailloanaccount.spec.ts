import { test, expect } from '@playwright/test';
import { getPrimaryConfig } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { getSharedValue } from '../../helpers/sharedState';

const CONFIG = getPrimaryConfig();

// Existing retail loan account number to which the related party will be added.
const SHARED_ACCOUNT_ID = getSharedValue<string>(state => (state as any).loanAccountId) ?? getSharedValue<string>(state => (state as any).accountId);
const ACCOUNT_ID = SHARED_ACCOUNT_ID ?? '7500001492';
if (SHARED_ACCOUNT_ID) console.log(`[SharedState] Using Account ID from previous run: ${SHARED_ACCOUNT_ID}`);

// CIF of the customer to add as a related party (joint holder).
// This must be a DIFFERENT customer than the account owner.
const RELATED_PARTY_CIF = '0005000599';

// Relationship code 999 maps to description "OTHERS".
const RELATION_CODE = '999';

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
    await accountPage.searchMenu('HACMLA');
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
    await accountPage.selectRelationType('Joint Holder');

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
    console.log('Modification Result:', modifyResult.message);
    console.log('Account Number:', modifyResult.accountNumber);

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
