import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import { readLatestCollateralId } from '../../helpers/sharedState';

// Collateral linking (HSCLM) is performed by the maker user.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// TD account number the collateral is linked to. Use the Life Insurance flow
// account id as specified in the manual steps.
const TD_ACCOUNT_ID = '9200000627';

// Collateral ID to link. Prefer the id persisted by the Life Insurance flow in
// collaterallodgementspvalidations.spec.ts; fall back to this constant when no
// persisted id is available.
const FALLBACK_COLLATERAL_ID = 'RBU3533';
const COLLATERAL_ID = readLatestCollateralId() ?? FALLBACK_COLLATERAL_ID;

// Loan To Value percent. Apportioned value is computed at runtime as 10% of
// the collateral value shown on the linkage screen (fallback below).
const APPORTIONED_VALUE_FALLBACK = '1100';
const LOAN_TO_VALUE_PERCENT = '100';

let homePage: HomePage;
let collateralPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  // Step 1: Login to finacle.
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  collateralPage = new AccountPage(page);
});

// HSCLM - Link a lodged (term deposit) collateral to an account following the
// manual test steps.
test('HSCLM - link collateral to account', async ({ page }) => {
  console.log(`Linking collateral ${COLLATERAL_ID} to A/c ${TD_ACCOUNT_ID}`);

  // Step 1: Select "core server" from the solution drop down.
  console.log('Selecting Core Server...');
  await collateralPage.selectCoreServer();

  // Step 2: Type menu option "HSCLM" in finacle.
  console.log('Searching for HSCLM...');
  await collateralPage.searchMenu(COMMON_DATA.collateralLodgement.screens.linkage);
  await page.waitForTimeout(3000);

  // Diagnostic: surface the criteria-screen field ids.
  await collateralPage.logVisibleFields('HSCLM criteria screen');

  // Step 3: Function - Link, Linkage Type - A/c, enter A/c id and Collateral id,
  // then click Accept.
  console.log('Selecting Function (Link) and Linkage Type (A/c)...');
  await collateralPage.selectCollateralDropdown('Link');
  await collateralPage.setCollateralLinkageTypeAccount();

  console.log(`Entering A/c id: ${TD_ACCOUNT_ID}...`);
  await collateralPage.setCollateralLinkAccountId(TD_ACCOUNT_ID);

  console.log(`Entering Collateral ID: ${COLLATERAL_ID}...`);
  await collateralPage.setCollateralId(COLLATERAL_ID);

  console.log('Clicking Accept button...');
  await collateralPage.clickAccept();
  await page.waitForTimeout(3000);

  // Diagnostic: surface the linkage-detail field ids loaded after Accept.
  await collateralPage.logVisibleFields('HSCLM linkage details');

  // Step 4: Apportioned value (10% of collateral value), Nature - Primary,
  // Loan To Value percent - 100.
  const collateralValueText = await collateralPage.getCollateralValue();
  const collateralValue = parseFloat((collateralValueText ?? '').replace(/,/g, ''));
  const apportionedValue = !isNaN(collateralValue) && collateralValue > 0
    ? Math.round(collateralValue * 0.1).toString()
    : APPORTIONED_VALUE_FALLBACK;
  console.log(`Collateral value: ${collateralValueText}, entering Apportioned Value (10%): ${apportionedValue}...`);
  await collateralPage.setCollateralApportionedValue(apportionedValue);

  console.log('Selecting Nature (Primary)...');
  await collateralPage.setCollateralNaturePrimary();

  console.log(`Entering Loan To Value percent: ${LOAN_TO_VALUE_PERCENT}...`);
  await collateralPage.setCollateralLoanToValuePercent(LOAN_TO_VALUE_PERCENT);

  // Step 5: Click Validate and Submit; accept any exception popups.
  console.log('Clicking Validate button...');
  await collateralPage.clickButtonByText('Validate');
  await collateralPage.acceptWarningPopup();

  // Click Submit exactly once. The generic submitForm() clicks Submit up to
  // four times (needed by TD creation's repeated popups); on this screen the
  // first click commits the linkage and later clicks land on a menu item,
  // raising "Invoking the menu results in loss of all entered data" which wipes
  // the success confirmation. So issue a single Submit here.
  console.log('Clicking Submit button...');
  await collateralPage.clickButtonByText('Submit');

  // Submit may raise an overridable exception (e.g. "GCO - Set the drawing power
  // indicator through the HACLHM menu option."); dismiss/override it if present.
  await collateralPage.acceptWarningPopup();
  await page.waitForTimeout(2000);
  await collateralPage.logScreenMessages();

  const statusMessage = await collateralPage.getStatusMessage();
  console.log('Linking status message:', statusMessage);

  // Step 6: Assert the collateral was linked successfully. getStatusMessage()
  // can be null on this screen, so fall back to scanning every frame's body
  // text for the Finacle success message before it is dismissed.
  let successText = statusMessage ?? '';
  if (!/linked successfully/i.test(successText)) {
    for (const frame of page.frames()) {
      const body = (await frame.locator('body').innerText().catch(() => ''))
        .replace(/\s+/g, ' ').trim();
      if (/linked successfully/i.test(body)) {
        successText = body;
        break;
      }
    }
  }
  expect(successText, 'Expected collateral linking success message').toMatch(/linked successfully/i);

  // Finalise on the confirmation screen (OK, falling back to Accept).
  await collateralPage.clickOkButton();
  await collateralPage.clickAccept();

  // Logout.
  console.log('Logging out...');
  await homePage.logout();
});

