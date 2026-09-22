import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import { readFirstTermDepositAccount, resetCollateralIds, recordCollateralId } from '../../helpers/sharedState';

// Collateral lodgement (HCLM) is performed by the maker user.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Collateral code searched/selected on the General tab.
const COLLATERAL_CODE = 'CBLT1BMD';

// Ceiling Limit per Linkage amount.
const CEILING_LIMIT = '500';

let homePage: HomePage;
let collateralPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);

  // Step 1: Login to finacle.
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  collateralPage = new AccountPage(page);
});

// HCLM - Lodge a (term deposit) collateral following the manual test steps.
test('HCLM - lodge collateral for term deposit', async ({ page }) => {
  // Step 1: Select "core server" from the solution drop down.
  console.log('Selecting Core Server...');
  await collateralPage.selectCoreServer();

  // Step 2: Type menu option "HCLM" in finacle.
  console.log('Searching for HCLM...');
  await collateralPage.searchMenu(COMMON_DATA.collateralLodgement.screens.maintenance);
  await page.waitForTimeout(3000);

  // Step 3: Function - Lodge, Type - Deposits, then click Go.
  console.log('Selecting Function (Lodge) and Type (Deposits)...');
  await collateralPage.selectCollateralDropdown('Lodge');
  await collateralPage.selectCollateralDropdown('Deposits');

  console.log('Clicking Go button...');
  await collateralPage.clickGo();

  // Step 4: General details tab - Collateral Code -> CBLT1BMD.
  console.log('Visiting General details tab...');
  await collateralPage.visitLoanTab('General', 'general');
  await collateralPage.logVisibleFields('Collateral General tab');

  console.log(`Setting collateral code: ${COLLATERAL_CODE}...`);
  await collateralPage.setCollateralCode(COLLATERAL_CODE);

  // Step 5: Ceiling Limit per Linkage -> 500.
  console.log(`Setting ceiling limit per linkage: ${CEILING_LIMIT}...`);
  await collateralPage.setCeilingLimitPerLinkage(CEILING_LIMIT);

  // The system requires Status and Charge Registration before the record can be
  // submitted; set sensible defaults.
  console.log('Setting Status to Normal and Charge Registration Required to No...');
  await collateralPage.setCollateralStatus('Normal');
  await collateralPage.setCollateralChargeRegistrationRequired('No');
  await page.waitForTimeout(2000);

  // Step 6: Visit Particulars tab (verify it actually loaded by looking for the Full Benefit label).
  console.log('Visiting Particulars tab...');
  await collateralPage.visitLoanTab('Particulars', 'particulars', 'Full Benefit');
  await collateralPage.logVisibleFields('Collateral Particulars tab');

  // Steps 7-11: Lodged/Review/Received dates (BOD or current), Deposit A/c ID, Full Benefit No.
  const depositAccountId = readFirstTermDepositAccount()?.accountNumber ?? '9200000597';
  const cifId = COMMON_DATA.termDeposit.cifCode;
  const bod = await collateralPage.getBODDate() || collateralPage.collateralToday();
  console.log(`Filling HCLM Particulars for TD ${depositAccountId}, CIF ${cifId}, BOD ${bod}...`);
  await collateralPage.fillCollateralParticulars({
    lodgedDate: bod,
    reviewDate: bod,
    receivedDate: bod,
    depositAccountId,
    fullBenefit: 'yes',
    cifId,
    withdraw: 'no',
  });

  // Step 12: Click Submit - "Record lodged successfully collateral id Ex: RBU7052".
  console.log('Clicking Submit button...');
  await collateralPage.submitForm();

  // Dismiss any Warning & Exception popup raised on submit.
  await collateralPage.acceptWarningPopup();

  // Diagnostics: surface the on-screen message after submit.
  await collateralPage.logScreenMessages();
  const tabError = await collateralPage.getTabSpecificError('Particulars: This tab contains errors');
  if (tabError) console.log('Particulars tab specific error:', tabError);
  await collateralPage.logAllFieldErrors();

  // Capture the generated collateral id from the success message BEFORE the
  // confirmation is dismissed, otherwise the message disappears and the id is
  // lost.
  const collateralId = await collateralPage.getGeneratedCollateralId();
  console.log(`=== GENERATED COLLATERAL ID: ${collateralId} ===`);
  expect(collateralId, 'Expected a generated collateral ID after successful lodgement').not.toBeNull();

  // Persist the generated collateral id so the modification/verification specs
  // can act on the same record.
  if (collateralId) {
    resetCollateralIds();
    recordCollateralId(collateralId);
  }

  const statusMessage = await collateralPage.getStatusMessage();
  console.log('Lodgement status message:', statusMessage);

  // The lodgement is finalised on a confirmation screen with an OK button;
  // click it (falling back to Accept) so the collateral id is committed.
  await collateralPage.clickOkButton();
  await collateralPage.clickAccept();
  await collateralPage.logScreenMessages();

  // Logout.
  console.log('Logging out...');
  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
