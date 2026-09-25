import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import { readLatestCollateralId } from '../../helpers/sharedState';
import { readLatestLoanAccount } from '../../helpers/sharedState';

// Collateral linking verification (HSCLM) MUST be performed by a DIFFERENT user
// than the maker who linked the collateral in collaterallodgementlinking.spec.ts.
const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

// Loan account the collateral was linked to. Use the latest from shared state.
const TD_ACCOUNT_ID = readLatestLoanAccount() ?? '3200000041';

// Collateral ID to verify. Prefer the id persisted by the lodgement spec; fall
// back to this constant when no persisted id is available.
const FALLBACK_COLLATERAL_ID = 'RBU3533';
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

// HSCLM - Verify a collateral linkage following the manual test steps.
test('HSCLM - verify collateral linkage', async ({ page }) => {
  console.log(`Verifying linkage of collateral ${COLLATERAL_ID} to A/c ${TD_ACCOUNT_ID}`);

  // Step 1: Select "core server" from the solution drop down.
  console.log('Selecting Core Server...');
  await collateralPage.selectCoreServer();

  // Step 2: Type menu option "HSCLM" in finacle (Collateral Linkage Maintenance).
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

  // Step 5: Click Submit exactly once. The generic submitForm() clicks Submit up
  // to four times; on this screen the first click commits and later clicks land
  // on a menu item, raising "Invoking the menu results in loss of all entered
  // data" which wipes the confirmation. So issue a single Submit.
  console.log('Clicking Submit button...');
  await collateralPage.clickButtonByText('Submit');

  // Submit may raise an overridable exception shown inline in the FINW frame.
  console.log('Accepting any exception to override and commit the verification...');
  await collateralPage.acceptWarningPopup();
  await page.waitForTimeout(2000);
  await collateralPage.logScreenMessages();

  const statusMessage = await collateralPage.getStatusMessage();
  console.log('Linkage verification status message:', statusMessage);

  // Step 6: Assert the linkage was verified successfully. getStatusMessage() can
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
  expect(successText, 'Expected collateral linkage verification success message').toMatch(/verified successfully/i);

  // Finalise on the confirmation screen (OK, falling back to Accept).
  await collateralPage.clickOkButton();
  await collateralPage.clickAccept();

  // Logout.
  console.log('Logging out...');
  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
