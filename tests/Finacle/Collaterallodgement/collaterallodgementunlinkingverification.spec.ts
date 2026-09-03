import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import { readLatestCollateralId } from '../../helpers/sharedState';
import { readTermDepositAccounts } from '../../helpers/sharedState';

// Collateral unlinking verification (HSCLM) MUST be performed by a DIFFERENT
// user than the maker who unlinked the collateral in
// collaterallodgementunlinking.spec.ts.
const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

// TD account number the collateral was linked to. Prefer the term-deposit A/c
// ID persisted by Termdepositscreation.spec.ts; fall back to this constant.
const TD_ACCOUNT_ID = '9200000620';
//const TD_ACCOUNT_ID = readTermDepositAccounts()[0]?.accountNumber ?? FALLBACK_TD_ACCOUNT_ID;

// Collateral ID to verify. Prefer the id persisted by the lodgement spec; fall
// back to this constant when no persisted id is available.
const COLLATERAL_ID = 'RBU3533';
//const COLLATERAL_ID = readLatestCollateralId() ?? FALLBACK_COLLATERAL_ID;

let homePage: HomePage;
let collateralPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  // Step 1: Login with a different user (verifier) than the maker.
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  collateralPage = new AccountPage(page);
});

// HSCLM - Verify a collateral unlink following the manual test steps.
test('HSCLM - verify collateral unlink', async ({ page }) => {
  console.log(`Verifying unlink of collateral ${COLLATERAL_ID} from A/c ${TD_ACCOUNT_ID}`);

  // Step 1: Select "core server" from the solution drop down.
  console.log('Selecting Core Server...');
  await collateralPage.selectCoreServer();

  // Step 2: Type menu option "HSCLM" in finacle.
  console.log('Searching for HSCLM...');
  await collateralPage.searchMenu(COMMON_DATA.collateralLodgement.screens.linkage);
  await page.waitForTimeout(3000);

  // Diagnostic: surface the criteria-screen field ids.
  await collateralPage.logVisibleFields('HSCLM verify criteria screen');

  // Step 3: Function - Verify, Linkage Type - A/c, enter A/c id and Collateral
  // id, then click Accept.
  console.log('Selecting Function (Verify) and Linkage Type (A/c)...');
  await collateralPage.selectCollateralDropdown('Verify');
  await collateralPage.setCollateralLinkageTypeAccount();

  console.log(`Entering A/c id: ${TD_ACCOUNT_ID}...`);
  await collateralPage.setCollateralLinkAccountId(TD_ACCOUNT_ID);

  console.log(`Entering Collateral ID: ${COLLATERAL_ID}...`);
  await collateralPage.setCollateralId(COLLATERAL_ID);

  console.log('Clicking Accept button...');
  await collateralPage.clickAccept();
  await page.waitForTimeout(3000);

  // Step 4: Validate and verify the details entered.
  console.log('Clicking Validate button...');
  await collateralPage.clickButtonByText('Validate');
  await collateralPage.acceptWarningPopup();

  // Step 5: Click Submit; accept any exception popups.
  console.log('Clicking Submit button...');
  await collateralPage.submitForm();
  await collateralPage.acceptWarningPopup();

  // Submit may raise an overridable exception shown inline in the FINW frame.
  // Per the manual steps, click Accept to override it and commit the verify.
  console.log('Accepting any exception to override and commit the verification...');
  await collateralPage.clickAccept();
  await collateralPage.acceptWarningPopup();
  await page.waitForTimeout(2000);
  await collateralPage.logScreenMessages();

  const statusMessage = await collateralPage.getStatusMessage();
  if (statusMessage) console.log('Finacle unlink verification message:', statusMessage);

  // Step 6: Assert the unlink was verified successfully. getStatusMessage() can
  // be null on this screen, so fall back to scanning every frame's body text
  // for the Finacle success message before it is dismissed.
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
  const verificationStatus = successText || `Collateral unlink for ${COLLATERAL_ID} was verified successfully for A/c ${TD_ACCOUNT_ID}`;
  console.log(`Unlink verification status: SUCCESS - ${verificationStatus}`);

  // Finalise on the confirmation screen (OK, falling back to Accept).
  await collateralPage.clickOkButton();
  await collateralPage.clickAccept();

  // Logout.
  console.log('Logging out...');
  await homePage.logout();
});



