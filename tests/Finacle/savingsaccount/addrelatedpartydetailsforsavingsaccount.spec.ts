import { test } from '@playwright/test';
import { getPrimaryConfig } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { getSharedValue } from '../../helpers/sharedState';

const CONFIG = getPrimaryConfig();

// Existing savings account number to which the related party will be added.
const SHARED_ACCOUNT_ID = getSharedValue((state) => state.accountId);
const ACCOUNT_ID = SHARED_ACCOUNT_ID ?? '7500001476';
if (SHARED_ACCOUNT_ID) console.log(`[SharedState] Using Account ID from previous run: ${SHARED_ACCOUNT_ID}`);

// CIF of the customer to add as a related party (joint holder).
const RELATED_PARTY_CIF = '0002012248';

// Relationship code 999 maps to description "OTHERS".
const RELATION_CODE = '999';

test.describe('Add Related Party to Savings Account', () => {
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

  // HACM - Add related party (joint holder) details to an existing savings account
  test('HACM - add related party to savings account', async ({ page }) => {
    console.log(`Using existing Account ID: ${ACCOUNT_ID}`);

    // Step 1: Select "core server" from solution drop down
    console.log('Selecting Core Server...');
    await accountPage.selectCoreServer();

    // Step 2: Type menu option "HACM" in finacle
    console.log('Searching for HACM...');
    await accountPage.searchMenu('HACM');
    await page.waitForTimeout(3000);

    // Step 3: Function - Modify
    console.log('Selecting Modify function...');
    await accountPage.selectFunction('Modify');

    // Step 4: A/c Id - Enter the existing account number
    console.log('Entering account ID to modify...');
    await accountPage.enterHacmAccountId(ACCOUNT_ID || '7500001476');

    // Click Go to load the account
    console.log('Clicking Go button...');
    await accountPage.clickGo();

    // Step 5: Visit General Details - set Next Print Date (present/future date)
    console.log('Visiting General Details tab...');
    await accountPage.visitTabById('acmogd');

    console.log('Setting next print date...');
    await accountPage.setNextPrintDate();

    // Step 6: Visit Related Party Details - click ADD
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
