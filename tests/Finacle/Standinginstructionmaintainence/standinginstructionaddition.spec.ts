import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { SavingsBankAccountPage } from '../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

// Standing instruction addition (HSSIM) is performed by the maker user.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Header inputs.
const SOL_ID = '100';
const DEBIT_CIF_ID = '0005000599';        // CIF id (Debit)
const NEXT_EXECUTION_DATE = '03-08-2026';  // start date of the SI (from screenshot)
const ACCEPTANCE_EVENT = 'SET_UP SI';      // Fee details - acceptance event
//const HEADER_DEBIT_ACCOUNT = '7500001482'; // Debit a/c id on the header

// Instruction (part transaction) inputs.
const CURRENCY = 'BMD';
const DEBIT_ACCOUNT = '7500001482';   // debit leg account
const CREDIT_ACCOUNT = '7500001474';  // credit leg account (different from debit)
const AMOUNT = '500';

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
  await siPage.searchMenu('HSSIM');
  await page.waitForTimeout(3000);

  // Step 3: Function - Add, then click Go.
  console.log('Selecting Function (Add)...');
  await siPage.selectSiDropdown('Add');
  console.log('Clicking Go button...');
  await siPage.clickGo();
  await page.waitForTimeout(3000);

  // Step 3.5: Visit Header details tab.
  console.log('Visiting Header details tab...');
  await siPage.visitLoanTab('Header', 'header');
  await siPage.logVisibleFields('HSSIM Header details');

  // Step 4: Standing instruction type - Customer induced (radio button), Sol Id 100.
  console.log('Selecting SI type (Customer induced)...');
  await siPage.setSiType('customer');
  console.log('Entering Sol Id...');
  await siPage.setSiText(['solID', 'solId', 'soleId'], SOL_ID, 'Sol Id');

  // Step 5: CIF id (Debit).
  console.log('Entering Debit CIF id...');
  await siPage.setSiText(
    ['cifID', 'cifId', 'debitCifId', 'drCifId', 'cifIdDr'], DEBIT_CIF_ID, 'Debit CIF id'
  );

  // Step 6: SI frequency - Monthly. Monthly requires a start day-of-month
  // (siFreqStartDD); without it Finacle raises "Invalid Freq type combination".
  console.log('Selecting SI frequency (Monthly)...');
  await siPage.selectSiOptionById('siFreqType', 'Monthly');
  // Date -> day 01 (siFreqStartDD). Interval and Calendar base are left at
  // their defaults to match the required header state.
  console.log('Selecting SI frequency start day (01)...');
  await siPage.selectSiOptionById('siFreqStartDD', '01');
  // Holiday handling -> S - Skip (as shown in the screenshot).
  console.log('Selecting SI frequency holiday handling (Skip)...');
  await siPage.selectSiOptionById('siFreqHldyStat', 'S - Skip');

  // Step 6b: Calendar base (required for Monthly).
  console.log('Selecting SI frequency calendar base (Gregorian)...');
  await siPage.selectSiOptionById('siFreqCalBase', 'Gregorian');

  // Step 7: Execution time - Before Change of Date.
  console.log('Selecting Execution time (Before Change of Date)...');
  await siPage.selectSiDropdown('Before Change');

  // Step 8: Next execution date - start date of the SI.
  console.log('Entering Next execution date...');
  await siPage.fillSiDate(
    ['nextExecDate_ui', 'nextExecnDate_ui', 'nextExecutionDate_ui', 'startDate_ui'],
    NEXT_EXECUTION_DATE, 'Next execution date'
  );

  // Step 9: Validate CCY Holiday - No.
  console.log('Setting Validate CCY Holiday = No...');
  await siPage.setSiFlag('holiday', 'No');

  // Step 10: Autopost - Yes.
  console.log('Setting Autopost = Yes...');
  await siPage.setSiFlag('autopost', 'Yes');

  // Step 11: Carry forward if failed - Yes.
  console.log('Setting Carry forward if failed = Yes...');
  await siPage.setSiFlag('carry forward', 'Yes');

  // Step 12: Fee details - Acceptance event -> SET_UP SI (typed into the field).
  console.log('Setting Acceptance event (SET_UP SI)...');
  await siPage.setSiText(
    ['acceptanceEvt', 'acceptanceEvent', 'accptEvent', 'feeAcceptEvent'],
    ACCEPTANCE_EVENT, 'Acceptance event'
  );

  // Step 13: Debit a/c id (header).
  console.log('Entering header Debit a/c id...');
  await siPage.setSiText(
    ['drAcctID', 'drAcctId', 'debitAcctId', 'feeDrAcctId'], DEBIT_ACCOUNT, 'Header debit a/c id'
  );

  // Diagnostic: dump the exact frequency combination before switching tabs.
  await siPage.logSiFreqState();

  // Step 13.5: Visit Instruction details tab.
  console.log('Visiting Instruction details tab...');
  await siPage.visitLoanTab('Instruction Details', 'instruction', 'Debit/Credit');
  await siPage.logVisibleFields('HSSIM Instruction details');

  // Set the default for the memo pad entry radio before adding any part.
  console.log('Setting Create Memo Pad Entry = No...');
  await siPage.setSiFlag('create memo pad entry', 'No');

  // Steps 14-19: Add the DEBIT part transaction.
  console.log('Adding debit part transaction...');
  await siPage.setSiText(['acctID'], DEBIT_ACCOUNT, 'A/c. ID');
  await siPage.setSiCurrency(CURRENCY);
  await siPage.setSiPartTranType('debit');
  await siPage.selectSiDropdown('Fixed');
  await siPage.setSiAmount(AMOUNT);
  await siPage.setSiFlag('collect fees', 'yes');
  await siPage.logSiButtons();
  await siPage.clickSiAddPartTran();

  // Steps 20-25: Add the CREDIT part transaction.
  console.log('Adding credit part transaction...');
  await siPage.setSiText(['acctID'], CREDIT_ACCOUNT, 'A/c. ID');
  await siPage.setSiCurrency(CURRENCY);
  await siPage.setSiPartTranType('credit');
  await siPage.selectSiDropdown('Fixed');
  await siPage.setSiAmount(AMOUNT);
  await siPage.setSiFlag('collect fees', 'no');
  // Credit part is submitted directly from the current entry row.
  await siPage.logSiPartTranState();

  // Step 26: Validate - both debit and credit part transactions are displayed.
  // Remove HTML required attributes from the empty entry row so the existing
  // grid rows can be validated and submitted without re-filling the blank form.
  console.log('Removing HTML5 required validation before Validate...');
  await siPage.removeSiRequiredValidation();
  console.log('Clicking Validate button...');
  await siPage.clickButtonByText('Validate');
  await siPage.logScreenMessages();

  // Step 27: Submit - "Standing Instruction# NU#### added successfully".
  console.log('Clicking Submit button...');
  await siPage.clickButtonByText('Submit');
  await siPage.acceptWarningPopup();
  await siPage.logScreenMessages();

  const statusMessage = await siPage.getStatusMessage();
  console.log('Status after Submit:', statusMessage);

  const siNumber = await siPage.getGeneratedSiNumber();
  console.log(`=== GENERATED STANDING INSTRUCTION NUMBER: ${siNumber} ===`);
  expect(siNumber, 'Expected a generated SI number (NU...)').toBeTruthy();

  console.log('SI addition status message:', statusMessage);

  // Step 28: Click Accept to return to the main page.
  console.log('Clicking Accept button...');
  await siPage.clickAccept();

  // Logout from the session.
  console.log('Logging out...');
  await homePage.logout();
});
