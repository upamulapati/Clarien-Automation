import { test, expect } from '@playwright/test';
import { getVerificationConfig } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { getSharedValue } from '../../helpers/sharedState';

const VERIFY_CONFIG = getVerificationConfig();

// Existing account in which the related party was deleted.
const SHARED_ACCOUNT_ID = getSharedValue((state) => state.loanAccountId);
const ACCOUNT_ID = SHARED_ACCOUNT_ID ?? '3200000044';
if (SHARED_ACCOUNT_ID) console.log(`[SharedState] Using Loan Account ID from previous run: ${SHARED_ACCOUNT_ID}`);

test.describe('Verify Deleted Related Party for Retail Loan Account', () => {
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

  // HACMLA - Verify/authorise the deletion of a related party from a retail loan account
  test('HACMLA - verify deleted related party for retail loan account', async ({ page }) => {
    console.log(`Verifying deleted related party on Account ID: ${ACCOUNT_ID}`);

    // Select "core server" from the solution drop down
    console.log('Selecting Core Server...');
    await accountPage.selectCoreServer();

    // Step 2: Type menu option "HACMLA" in finacle
    console.log('Searching for HACMLA...');
    await accountPage.searchMenu('HACMLA');
    await page.waitForTimeout(3000);

    // Step 3: Function - V - Verify
    console.log('Selecting Verify function...');
    await accountPage.selectFunction('Verify');

    // Step 4: A/c Id - Enter the account number in which related party is deleted
    console.log('Entering account ID to verify...');
    await accountPage.enterHacmAccountId(ACCOUNT_ID || '3200000044');

    // Click Go to load the account into the verification screen
    console.log('Clicking Go button...');
    await accountPage.clickGo();

    // Step 4: Visit General details
    console.log('Visiting General details tab...');
    await accountPage.visitLoanTab('General', 'generaldetails');

    // Step 5: Visit Loan details
    console.log('Visiting Loan Details tab...');
    await accountPage.visitLoanTab('Loan Details', 'lasch');

    // Step 6: Visit A/c interest details
    console.log('Visiting A/C Interest tab...');
    await accountPage.visitLoanTab('A/C Interest', 'laacctinterest');

    // Step 7: Visit LA interest details
    console.log('Visiting LA Interest tab...');
    await accountPage.visitLoanTab('LA Interest', 'laint');

    // Step 8: Visit Payment Schedule details
    console.log('Visiting Payment Schedule tab...');
    await accountPage.visitLoanTab('Payment Schedule', 'lamnt');

    // Step 9: Visit Related Party details - go to the 2nd record (deleted party)
    console.log('Visiting Related Party tab...');
    await accountPage.visitLoanTab('Related Party', 'relatedpartydetails');

    console.log('Navigating to related party record 2...');
    await accountPage.goToRelatedPartyRecord(2);

    // Step 10: Visit MIS Codes details
    console.log('Visiting MIS Codes tab...');
    await accountPage.visitLoanTab('MIS Codes', 'miscodes');

    // Step 11: Visit Document details
    console.log('Visiting Document tab...');
    await accountPage.visitLoanTab('Document', 'documentdetails');

    // Step 12: Visit Addl. Info. details
    console.log('Visiting Addl. Info. tab...');
    await accountPage.visitLoanTab('Addl. Info.', 'acmai');

    // Step 13: Visit Fees tab
    console.log('Visiting Fees tab...');
    await accountPage.visitLoanTab('Fees', 'lachrg');

    // Step 14: Click Submit - the deletion gets authorised/verified
    console.log('Clicking Submit button...');
    await accountPage.submitForm();

    // Capture the verification success message
    const statusMessage = await accountPage.getStatusMessage();
    console.log('Verification status message:', statusMessage);

    // Click OK on the verification success confirmation
    console.log('Clicking OK button...');
    await accountPage.clickOkButton();

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
