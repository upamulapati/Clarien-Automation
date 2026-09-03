import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import { readLatestCollateralId } from '../../helpers/sharedState';

// Collateral modification verification (HCLM) MUST be performed by a DIFFERENT
// user than the maker who modified the collateral in
// Collaterallodgementmodification.spec.ts.
const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

// Collateral ID to verify. Prefer the id persisted by the lodgement spec; fall
// back to this constant when no persisted id is available.
const FALLBACK_COLLATERAL_ID = 'RBU3532';
const COLLATERAL_ID = readLatestCollateralId() ?? FALLBACK_COLLATERAL_ID;

let homePage: HomePage;
let collateralPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  // Step 1: Login with a different user (verifier) than the maker.
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  collateralPage = new AccountPage(page);
});

// HCLM - Verify a modified (term deposit) collateral following the manual steps.
test('HCLM - verify modified collateral', async ({ page }) => {
  console.log(`Verifying modified collateral: ${COLLATERAL_ID}`);

  // Step 1: Select "core server" from the solution drop down.
  console.log('Selecting Core Server...');
  await collateralPage.selectCoreServer();

  // Step 2: Type menu option "HCLM" in finacle.
  console.log('Searching for HCLM...');
  await collateralPage.searchMenu(COMMON_DATA.collateralLodgement.screens.maintenance);
  await page.waitForTimeout(3000);

  // Step 3: Function - V-Verify, Type - Deposits, enter the Collateral ID and
  // click the search button so the unverified (modified) record is loaded, Go.
  console.log('Selecting Function (Verify) and Type (Deposits)...');
  await collateralPage.selectCollateralDropdown('Verify');
  await collateralPage.selectCollateralDropdown('Deposits');

  console.log(`Entering Collateral ID: ${COLLATERAL_ID}...`);
  await collateralPage.setCollateralId(COLLATERAL_ID);

  console.log('Clicking Go button...');
  await collateralPage.clickGo();
  await page.waitForTimeout(3000);

  // Step 4: Verify General details tab.
  console.log('Visiting General details tab...');
  await collateralPage.visitLoanTab('General', 'general');

  // Step 4: Verify Particulars tab.
  console.log('Visiting Particulars tab...');
  await collateralPage.visitLoanTab('Particulars', 'particulars');

  // Step 5: Click Submit - "Record verified successfully".
  console.log('Clicking Submit button...');
  await collateralPage.submitForm();

  // Dismiss any Warning & Exception popup raised on submit.
  await collateralPage.acceptWarningPopup();

  // Surface the on-screen verification message.
  await collateralPage.logScreenMessages();
  const statusMessage = await collateralPage.getStatusMessage();
  console.log('Verification status message:', statusMessage);

  // Assert the collateral modification was verified successfully.
  // getStatusMessage() can be null on this screen, so fall back to scanning
  // every frame's body text for the Finacle success message before dismissal.
  let successText = statusMessage ?? '';
  if (!/verified successfully/i.test(successText)) {
    for (const frame of page.frames()) {
      const body = (await frame.locator('body').innerText().catch(() => ''))
        .replace(/\s+/g, ' ').trim();
      if (/verified successfully/i.test(body)) {
        successText = body;
        break;
      }
    }
  }
  expect(successText, 'Expected collateral verification success message').toMatch(/verified successfully/i);

  // Finalise on the confirmation screen if an Accept button is present.
  await collateralPage.clickAccept();

  // Logout.
  console.log('Logging out...');
  await homePage.logout();
});
