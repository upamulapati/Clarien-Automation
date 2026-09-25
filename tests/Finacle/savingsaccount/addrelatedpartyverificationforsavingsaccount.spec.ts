import { test, expect } from '@playwright/test';
import { CRM_TEST_DATA } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { getSharedValue } from '../../helpers/sharedState';
import COMMON_DATA from '../../../data/common-data.json';

const VERIFY_CONFIG = {
  baseUrl: CRM_TEST_DATA.common.baseUrl,
  username: COMMON_DATA.verifierCredentials.username,
  password: COMMON_DATA.verifierCredentials.password,
  timeouts: CRM_TEST_DATA.common.timeouts,
};

// Existing account in which the related party was added.
const SHARED_ACCOUNT_ID = getSharedValue('accountId');
const ACCOUNT_ID = SHARED_ACCOUNT_ID ?? '7500001476';
if (SHARED_ACCOUNT_ID) console.log(`[SharedState] Using Account ID from previous run: ${SHARED_ACCOUNT_ID}`);

test.describe('Verify Related Party for Savings Account', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  let lastDialogMessages: string[] = [];
  let homePage: HomePage;
  let accountPage: AccountPage;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(900000);
    setupDialogHandlers(page, lastDialogMessages);
    await login(page, VERIFY_CONFIG);

    homePage = new HomePage(page);
    accountPage = new AccountPage(page);
  });

  // HACM - Verify/authorise the related party that was added to a savings account
  test('HACM - verify added related party for savings account', async ({ page }) => {
    console.log(`Verifying related party on Account ID: ${ACCOUNT_ID}`);

    // Select "core server" from the solution drop down
    console.log('Selecting Core Server...');
    await accountPage.selectCoreServer();

    // Step 2: Type menu option "HACM" in finacle
    console.log('Searching for HACM...');
    await accountPage.searchMenu('HACM');
    await page.waitForTimeout(3000);

    // Step 3: Function - V - Verify
    console.log('Selecting Verify function...');
    await accountPage.selectFunction('Verify');

    // Step 4: A/c Id - Enter the account number in which related party is added
    console.log('Entering account ID to verify...');
    await accountPage.enterHacmAccountId(ACCOUNT_ID);

    // Click Go to load the account into the verification screen
    console.log('Clicking Go button...');
    await accountPage.clickGo();

    // Step 5: Visit General details
    console.log('Visiting General tab...');
    await accountPage.visitTabById('acmogd');

    // Step 6: Visit Scheme details
    console.log('Visiting Scheme tab...');
    await accountPage.visitTabById('acmosd');

    // Step 7: Visit Interest details
    console.log('Visiting Interest & Tax tab...');
    await accountPage.visitTabById('acmoit');

    // Step 8: Visit Related Party details - go to the 2nd record (newly added party)
    console.log('Visiting Related Party tab...');
    await accountPage.visitTabById('relatedpartydetails');

    console.log('Navigating to related party record 2...');
    await accountPage.goToRelatedPartyRecord(2);

    // Step 9: Visit MIS Codes details
    console.log('Visiting MIS Codes tab...');
    await accountPage.visitTabById('miscodes');

    // Step 10: Visit Additional Info details
    console.log('Visiting Addl. Info. tab...');
    await accountPage.visitTabById('acmai');

    // Step 10b: Visit Document Information - mandatory, else Submit is blocked with
    // "Document Details: Visit document information."
    console.log('Visiting Document details tab...');
    await accountPage.visitTabById('documentdetails');

    // Step 11: Click Submit - the added related party gets authorised/verified
    console.log('Clicking Submit button...');
    await accountPage.submitForm();

    // Click OK on the confirmation shown after submit
    console.log('Clicking OK button...');
    await accountPage.clickOkButton();

    // Capture the actual Finacle status message after verification
    const statusMessage = await accountPage.getStatusMessage();
    console.log('Verification status message:', statusMessage);

    const result = await accountPage.verifyAccountCreated();
  console.log('Exact result message:', result.message);
  expect(result.success, `Expected success but got: ${result.message}`).toBe(true);
  expect(result.message).toBeTruthy();
    console.log('Verification Result:', result.message);
  expect(result.message).toBeTruthy();
  expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
    console.log('Account Number:', result.accountNumber);
  expect(result.accountNumber).toBeTruthy();

    // Logout
    console.log('Logging out...');
    await homePage.logout();
  });
});

