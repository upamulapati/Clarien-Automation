import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import { readLatestCollateralId } from '../../helpers/sharedState';

// Collateral modification (HCLM) is performed by the maker user.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Collateral ID to modify. Prefer the id persisted by collaterallodgment.spec.ts;
// fall back to this constant when no persisted id is available.
const FALLBACK_COLLATERAL_ID = 'RBU3532';
const COLLATERAL_ID = readLatestCollateralId() ?? FALLBACK_COLLATERAL_ID;

// New Ceiling Limit per Linkage value applied on the General tab.
const NEW_CEILING_LIMIT = '600';

let homePage: HomePage;
let collateralPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  // Step 1: Login to finacle.
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  collateralPage = new AccountPage(page);
});

// HCLM - Modify a lodged (term deposit) collateral following the manual steps.
test('HCLM - modify lodged collateral', async ({ page }) => {
  console.log(`Modifying collateral: ${COLLATERAL_ID}`);

  // Step 1: Select "core server" from the solution drop down.
  console.log('Selecting Core Server...');
  await collateralPage.selectCoreServer();

  // Step 2: Type menu option "HCLM" in finacle.
  console.log('Searching for HCLM...');
  await collateralPage.searchMenu(COMMON_DATA.collateralLodgement.screens.maintenance);
  await page.waitForTimeout(3000);

  // Step 3: Function - Modify, Type - Deposits, enter the Collateral ID, then Go.
  console.log('Selecting Function (Modify) and Type (Deposits)...');
  await collateralPage.selectCollateralDropdown('Modify');
  await collateralPage.selectCollateralDropdown('Deposits');

  console.log(`Entering Collateral ID: ${COLLATERAL_ID}...`);
  await collateralPage.setCollateralId(COLLATERAL_ID);

  console.log('Clicking Go button...');
  await collateralPage.clickGo();
  await page.waitForTimeout(3000);

  // Step 4: General details tab - modify the Ceiling Limit per Linkage, then
  // click Validate.
  console.log('Visiting General details tab...');
  await collateralPage.visitLoanTab('General', 'general');

  console.log(`Modifying ceiling limit per linkage: ${NEW_CEILING_LIMIT}...`);
  await collateralPage.setCeilingLimitPerLinkage(NEW_CEILING_LIMIT);

  console.log('Clicking Validate button (General tab)...');
  await collateralPage.clickButtonByText('Validate');
  await collateralPage.acceptWarningPopup();

  // Step 5: Particulars tab - modify the Review date, then click Validate.
  console.log('Visiting Particulars tab...');
  await collateralPage.visitLoanTab('Particulars', 'particulars');

  const nextMonth = collateralPage.collateralDateOffset(1);
  console.log(`Modifying review date to next month: ${nextMonth}...`);
  await collateralPage.setCollateralReviewDate(nextMonth);

  const reviewDateValue = await collateralPage.getCollateralReviewDate();
  console.log(`Review date field value after fill: ${reviewDateValue}`);
  expect(reviewDateValue, 'Review date should be set to the next month').toBe(nextMonth);

  console.log('Clicking Validate button (Particulars tab)...');
  await collateralPage.clickButtonByText('Validate');
  await collateralPage.acceptWarningPopup();

  // Step 6: Click Submit - "Record modified successfully".
  console.log('Clicking Submit button...');
  await collateralPage.submitForm();
  await collateralPage.acceptWarningPopup();
  await collateralPage.logScreenMessages();

  const statusMessage = await collateralPage.getStatusMessage();
  console.log('Exact status message:', statusMessage);
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log('Modification status message:', statusMessage);
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);

  // Assert the collateral was modified successfully. getStatusMessage() can be
  // null on this screen, so fall back to scanning every frame's body text for
  // the Finacle success message before it is dismissed.
  let successText = statusMessage ?? '';
  if (!/modified successfully/i.test(successText)) {
    for (const frame of page.frames()) {
      const body = (await frame.locator('body').innerText().catch(() => ''))
        .replace(/\s+/g, ' ').trim();
      if (/modified successfully/i.test(body)) {
        successText = body;
        break;
      }
    }
  }
  expect(successText, 'Expected collateral modification success message').toMatch(/modified successfully/i);

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
