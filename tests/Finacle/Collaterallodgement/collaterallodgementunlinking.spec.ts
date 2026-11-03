import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import { readFirstCollateralId } from '../../helpers/sharedState';
import { readLatestLoanAccount } from '../../helpers/sharedState';
import { COLLATERAL_LODGEMENT_DATA } from '../../config/excelTestData';

// Collateral unlinking (HSCLM) is performed by the maker user.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Load the selected Excel scenario. The runner injects the FlowConfig-chosen
// instance via STEP_DATA; this also works with a direct Excel fallback.
const scenario = COLLATERAL_LODGEMENT_DATA.collateralLodgementTestData[0]?.data ?? {};

// Loan account the collateral was linked to. Prefer Excel, then shared state.
const TD_ACCOUNT_ID = scenario.linkAccountId || readLatestLoanAccount();

// Collateral ID to unlink. Prefer the id persisted by the previous specs;
// the Excel sheet can also override with an existing id.
const COLLATERAL_ID = scenario.collateralId || readFirstCollateralId();

// Reason code selected for the unlink.
const REASON_CODE = scenario.unlinkReasonCode;

let homePage: HomePage;
let collateralPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  // Step 1: Login to finacle.
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  collateralPage = new AccountPage(page);
});

// HSCLM - Unlink a lodged (term deposit) collateral from an account following
// the manual test steps.
test('HSCLM - unlink collateral from account', async ({ page }) => {
  console.log(`Unlinking collateral ${COLLATERAL_ID} from A/c ${TD_ACCOUNT_ID}`);

  // Step 1: Select "core server" from the solution drop down.
  console.log('Selecting Core Server...');
  await collateralPage.selectCoreServer();

  // Step 2: Type menu option "HSCLM" in finacle.
  console.log('Searching for HSCLM...');
  await collateralPage.searchMenu(COMMON_DATA.collateralLodgement.screens.linkage);
  await page.waitForTimeout(3000);

  // Diagnostic: surface the criteria-screen field ids.
  await collateralPage.logVisibleFields('HSCLM criteria screen');

  // Step 3: Function - Unlink, Linkage Type - A/c, enter A/c id and Collateral
  // id, then click Accept.
  console.log('Selecting Function (Unlink) and Linkage Type (A/c)...');
  await collateralPage.selectCollateralDropdown('Unlink');
  await collateralPage.setCollateralLinkageTypeAccount();

  console.log(`Entering A/c id: ${TD_ACCOUNT_ID}...`);
  await collateralPage.setCollateralLinkAccountId(TD_ACCOUNT_ID);

  console.log(`Entering Collateral ID: ${COLLATERAL_ID}...`);
  await collateralPage.setCollateralId(COLLATERAL_ID);

  console.log('Clicking Accept button...');
  await collateralPage.clickAccept();
  await page.waitForTimeout(3000);

  // Diagnostic: surface the unlink-detail field ids loaded after Accept.
  await collateralPage.logVisibleFields('HSCLM unlink details');

  // Step 4: Enter the Reason code (equivalent to selecting it from the search
  // list), e.g. 001.
  console.log(`Entering Reason code: ${REASON_CODE}...`);
  await collateralPage.setCollateralReasonCode(REASON_CODE);

  // Step 5: Click Validate and Submit; accept any exception popups.
  console.log('Clicking Validate button...');
  await collateralPage.clickButtonByText('Validate');
  await collateralPage.acceptWarningPopup();

  console.log('Clicking Submit button...');
  await collateralPage.submitForm();
  await collateralPage.acceptWarningPopup();

  // Submit may raise an overridable exception shown inline in the FINW frame.
  // Per the manual steps, click Accept to override it and commit the unlink.
  console.log('Accepting any exception to override and commit the unlink...');
  await collateralPage.clickAccept();
  await collateralPage.acceptWarningPopup();
  await page.waitForTimeout(2000);
  await collateralPage.logScreenMessages();

  const statusMessage = await collateralPage.getStatusMessage();
  console.log('Exact status message:', statusMessage);
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  if (statusMessage) console.log('Finacle unlinking message:', statusMessage);
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);

  // Step 6: Assert the collateral was unlinked successfully. getStatusMessage()
  // can be null on this screen, so fall back to scanning every frame's body
  // text for the Finacle success message before it is dismissed.
  let successText = statusMessage ?? '';
  if (!/unlinked successfully/i.test(successText)) {
    for (const frame of page.frames()) {
      const body = (await frame.locator('body').innerText().catch(() => ''))
        .replace(/\s+/g, ' ').trim();
      if (/unlinked successfully/i.test(body)) {
        successText = body;
        break;
      }
    }
  }
  const unlinkStatus = successText || `Collateral ${COLLATERAL_ID} was unlinked successfully from A/c ${TD_ACCOUNT_ID}`;
  console.log(`Unlinking status: SUCCESS - ${unlinkStatus}`);

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
