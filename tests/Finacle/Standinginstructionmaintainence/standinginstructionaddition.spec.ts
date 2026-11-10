import { test, expect } from '@playwright/test';
import { STANDING_INSTRUCTION_TEST_DATA } from '../../config/excelTestData';
import { writeSharedState } from '../../helpers/sharedState';
import { HomePage } from '../../pages/HomePages/HomePage';
import { SavingsBankAccountPage } from '../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

// Standing instruction addition (HSSIM) is performed by the maker user.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

const SCENARIOS = STANDING_INSTRUCTION_TEST_DATA.standingInstructionTestData;
const scenario = SCENARIOS.find((s: any) => String(s.function).toLowerCase() === 'add') ?? SCENARIOS[0] ?? { data: {} };
const data = scenario.data ?? {};

let homePage: HomePage;
let siPage: SavingsBankAccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  // Step 1: Login to finacle (maker user).
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  siPage = new SavingsBankAccountPage(page);
});

// HSSIM - Add a standing instruction (debit + credit part transactions) and
// capture the generated SI number.
test('HSSIM - add standing instruction', async ({ page }) => {
  // Step 1: Select "core server" from the solution drop down.
  console.log('Selecting Core Server...');
  await siPage.selectCoreServer();

  // Step 2: Type menu option "HSSIM" in finacle.
  console.log('Searching for HSSIM...');
  await siPage.searchMenu(scenario.menuOption || 'HSSIM');
  await page.waitForTimeout(3000);

  // Step 3: Function - Add, then click Go.
  console.log('Selecting Function (Add)...');
  await siPage.selectSiDropdown(scenario.function || 'Add');
  console.log('Clicking Go button...');
  await siPage.clickGo();
  await page.waitForTimeout(3000);

  // Step 3.5: Visit Header details tab.
  console.log('Visiting Header details tab...');
  await siPage.visitLoanTab('Header', 'header');
  await siPage.logVisibleFields('HSSIM Header details');

  // Step 4: Standing instruction type - Customer induced (radio button), Sol Id 100.
  console.log('Selecting SI type (Customer induced)...');
  await siPage.setSiType(data.siType || 'customer');
  console.log('Entering Sol Id...');
  await siPage.setSiSolId(data.solId);

  // Step 5: CIF id (Debit).
  console.log('Entering Debit CIF id...');
  await siPage.setSiCifId(data.cifCode);

  // Step 6: SI frequency - Monthly. Monthly requires a start day-of-month
  // (siFreqStartDD); without it Finacle raises "Invalid Freq type combination".
  console.log('Selecting SI frequency (Monthly)...');
  await siPage.selectSiOptionById('siFreqType', data.siFreqType || 'Monthly');
  // Date -> day 01 (siFreqStartDD). Interval and Calendar base are left at
  // their defaults to match the required header state.
  console.log('Selecting SI frequency start day (01)...');
  await siPage.selectSiOptionById('siFreqStartDD', data.siFreqStartDD || '01');
  // Holiday handling -> S - Skip (as shown in the screenshot).
  console.log('Selecting SI frequency holiday handling (Skip)...');
  await siPage.selectSiOptionById('siFreqHldyStat', data.siFreqHldyStat || 'S - Skip');

  // Step 6b: Calendar base (required for Monthly).
  console.log('Selecting SI frequency calendar base (Gregorian)...');
  await siPage.selectSiOptionById('siFreqCalBase', data.siFreqCalBase || 'Gregorian');

  // Step 7: Execution time - Before Change of Date.
  console.log('Selecting Execution time (Before Change of Date)...');
  await siPage.selectSiDropdown(data.executionTime || 'Before Change');

  // Step 8: Next execution date - start date of the SI.
  console.log('Entering Next execution date...');
  await siPage.setSiNextExecutionDate(data.nextExecutionDate);

  // Step 9: Validate CCY Holiday - No.
  console.log('Setting Validate CCY Holiday = No...');
  await siPage.setSiFlag('holiday', data.validateCcyHoliday || 'No');

  // Step 10: Autopost - Yes.
  console.log('Setting Autopost = Yes...');
  await siPage.setSiFlag('autopost', data.autopost || 'Yes');

  // Step 11: Carry forward if failed - Yes.
  console.log('Setting Carry forward if failed = Yes...');
  await siPage.setSiFlag('carry forward', data.carryFrwdIfFailed || 'Yes');

  // Step 12: Fee details - Acceptance event -> SET_UP SI (typed into the field).
  console.log('Setting Acceptance event (SET_UP SI)...');
  await siPage.setSiAcceptanceEvent(data.acceptanceEvent);

  // Step 12.5: Collect Charges for Modification -> No.
  console.log('Setting Collect Charges for Modification = No...');
  await siPage.setSiFlag('collect charges for modification', data.collectChargesForModification || 'No');

  // Step 13: Debit a/c id (header).
  // The source data may label this as either headerDebitAccountId or debitAccount.
  console.log('Entering header Debit a/c id...');
  await siPage.setSiHeaderDebitAccountId(data.headerDebitAccountId || data.debitAccount);

  // Step 13.25: Leave Execution Condition (A/c. ID, A/c. Balance Indicator, A/c. Balance)
  // empty per the requirement; do not populate them.
  console.log('Skipping Execution Condition fields per requirement...');

  // Diagnostic: dump the exact frequency combination.
  await siPage.logSiFreqState();

  // Step 13.5: Open the Instruction Details tab.
  console.log('Opening Instruction Details tab...');
  await siPage.visitSiInstructionDetails();
  await page.waitForTimeout(3000);
  await siPage.logVisibleFields('HSSIM Instruction Details');

  // Step 14: Set Create Memo Pad Entry = No.
  console.log('Setting Create Memo Pad Entry = No...');
  await siPage.setSiFlag('create memo pad entry', data.createMemoPadEntry || 'No');

  // Step 15: Add debit part transaction.
  console.log('Adding debit part transaction...');
  await siPage.setSiPartAccountId(data.debitAccount);
  await siPage.setSiCurrency(data.currency);
  await siPage.setSiPartTranType('debit');
  await siPage.selectSiOptionById('mAmtType', data.amountType || 'F');
  await siPage.setSiAmount(data.amount);
  await siPage.setSiCollectFees(data.debitCollectFees || 'yes');
  await siPage.clickSiAddPartTran();
  await page.waitForTimeout(2000);

  // Step 16: Add credit part transaction.
  console.log('Adding credit part transaction...');
  await siPage.setSiPartAccountId(data.creditAccount);
  await siPage.setSiCurrency(data.currency);
  await siPage.setSiPartTranType('credit');
  await siPage.selectSiOptionById('mAmtType', data.amountType || 'F');
  await siPage.setSiAmount(data.amount);
  await siPage.setSiCollectFees(data.creditCollectFees || 'no');

  // Do not click Add for the credit row. The credit part transaction remains in the
  // input form and is submitted together with the already added debit grid row.

  // The filled credit part transaction is in the input form; proceed directly to Submit.
  // No intermediate Validate is needed because the same validation runs on Submit.

  // Step 27: Submit - "Standing Instruction# NU#### added successfully".
  console.log('Clicking Submit button...');
  await siPage.clickButtonByText('Submit');
  await siPage.acceptWarningPopup();
  await siPage.logScreenMessages();

  const statusMessage = await siPage.getStatusMessage();
  console.log('Exact status message:', statusMessage);
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log('Status after Submit:', statusMessage);

  const siNumber = await siPage.getGeneratedSiNumber();
  if (siNumber && scenario.sharedKey) {
    writeSharedState({ [scenario.sharedKey]: siNumber });
  }
  console.log(`=== GENERATED STANDING INSTRUCTION NUMBER: ${siNumber} ===`);
  expect(siNumber, 'Expected a generated SI number (NU...)').toBeTruthy();

  console.log('SI addition status message:', statusMessage);
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);

  // Step 28: Click Accept to return to the main page.
  console.log('Clicking Accept button...');
  await siPage.clickAccept();

  // Logout from the session.
  console.log('Logging out...');
  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
