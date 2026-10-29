import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { RETAIL_LOAN_DATA } from '../../config/excelTestData';
import { CREDENTIALS } from '../../../data/credentials';
import { saveLoanAccount, updateSharedState } from '../../helpers/sharedState';
import { captureEvidence } from '../../helpers/evidence';
import * as xlsx from 'xlsx';
import * as path from 'path';

const wb = xlsx.readFile(path.resolve('data/test-data.xlsx'));
const ALL_LOAN_ROWS = xlsx.utils.sheet_to_json(wb.Sheets['retail_loans']) as any[];

function getScenario(key: string): any {
  const row = ALL_LOAN_ROWS.find(
    (r) =>
      String(r.sharedKey).toLowerCase() === key.toLowerCase() &&
      String(r.menuOption).toUpperCase() === 'HOAACLA'
  );
  if (!row) throw new Error(`No retail_loans creation row with sharedKey=${key} and menuOption=HOAACLA`);
  return row;
}

const STEP = RETAIL_LOAN_DATA[0]?.data ?? {};

// Retail loan creation (HOAACLA) is performed by the maker user.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Loan header inputs.
const CURRENCY = STEP['Currency'];
if (!CURRENCY) throw new Error('Currency is required in the Excel sheet');
const SOL_ID = STEP['Sol Id'];
if (!SOL_ID) throw new Error('Sol Id is required in the Excel sheet');
const rawCif = STEP['CIF Id'];
if (!rawCif) throw new Error('CIF Id is required in the Excel sheet');
const CIF_ID = String(rawCif).padStart(10, '0');
if (CIF_ID) console.log(`[SharedState] Using CIF ID: ${CIF_ID}`);

// NOTE: Set this to a valid retail-loan scheme code. If left blank, the scheme
// search popup will fall back to selecting the first available scheme.
const LOAN_SCHEME_CODE = STEP['Scheme Code'];

// Operative (repayment) SB account number used on the Loan details tab. This is
// the savings account under CIF 0005000599 used across the savings specs.
const OPERATIVE_SB_ACCOUNT = STEP['Operative A/c Id'];

// Loan parameters.
const LOAN_AMOUNT = STEP['Loan Amount'];
const LOAN_PERIOD_MONTHS = STEP['Loan Period (Months)'];
const NO_OF_INSTALMENTS = STEP['No. Of Instalments'];

// Account limit expiry date = loan last instalment date (one year ahead).
const computedExpiry = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
})();
const expiryDate = STEP['Expiry Date'] || computedExpiry;

let homePage: HomePage;
let loanPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  // Cap individual action waits so a missing/unknown field fails fast (instead
  // of blocking for the whole test timeout) while we lock the loan selectors.
  page.setDefaultTimeout(20000);

  // Step 1: Login to finacle
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  loanPage = new AccountPage(page);
});

// HOAACLA - Create a retail loan account and capture the generated account number.
test.describe.serial('Create retail loan accounts', () => {
for (const accountKey of ['chargeoffLoanAccountId', 'payoffLoanAccountId']) {
  test(`HOAACLA - create retail loan account ${accountKey}`, async ({ page }) => {
  try {
    const SCENARIO = getScenario(accountKey);
    const STEP = SCENARIO;

    const CURRENCY = STEP['Currency'];
    const SOL_ID = STEP['Sol Id'];
    const rawCif = STEP['CIF Id'];
    const CIF_ID = String(rawCif).padStart(10, '0');
    const LOAN_SCHEME_CODE = STEP['Scheme Code'];
    const OPERATIVE_SB_ACCOUNT = STEP['Operative A/c Id'];
    const LOAN_AMOUNT = STEP['Loan Amount'];
    const LOAN_PERIOD_MONTHS = STEP['Loan Period (Months)'];
    const NO_OF_INSTALMENTS = STEP['No. Of Instalments'];
    const expiryDate = STEP['Expiry Date'] || computedExpiry;

    console.log(`Creating retail loan account [${accountKey}] with scheme ${LOAN_SCHEME_CODE}...`);

  // Step 1: Select "core server" from the solution drop down
  console.log('Selecting Core Server...');
  await loanPage.selectCoreServer();

  // Step 2: Type menu option "HOAACLA" in finacle
  console.log('Searching for HOAACLA...');
  const menuOption = STEP['menuOption'];
  if (!menuOption) throw new Error('menuOption is required in the Excel sheet');
  await loanPage.searchMenu(menuOption);
  await page.waitForTimeout(3000);
  await captureEvidence(page, 'Step 1-2: Loan screen opened', { currency: CURRENCY, solId: SOL_ID, cifCode: CIF_ID, schemeCode: LOAN_SCHEME_CODE });

  // Step 3: Function Open, Currency BMD, Sol id 100, CIF Id + scheme code, Go
  console.log('Entering loan header (function/currency/sol/cif/scheme) and clicking Go...');
  await loanPage.openLoanHeader({
    ccy: CURRENCY,
    solId: SOL_ID,
    cifCode: CIF_ID,
    schemeCode: LOAN_SCHEME_CODE || undefined,
  });

  // Step 4: General details tab - A/c statement (mandatory) -> None
  console.log('Visiting General details tab...');
  await loanPage.visitLoanTab('General');
  // Diagnostic: map all loan tab anchors/labels for flow understanding.
  await loanPage.logLoanTabs();
  await loanPage.logVisibleFields('General details');
  await loanPage.setLoanAccountStatementNone();
  await captureEvidence(page, 'Step 4: General details', { accountStatement: 'None' });

  // Step 5: Loan details tab - amount, period (months), operative a/c id
  console.log('Visiting Loan details tab...');
  await loanPage.visitLoanTab('Loan Details', 'lasch');
  await loanPage.logVisibleFields('Loan details');
  await loanPage.fillLoanDetails({
    loanAmount: LOAN_AMOUNT,
    loanPeriodMonths: LOAN_PERIOD_MONTHS,
    operativeAccountId: OPERATIVE_SB_ACCOUNT,
  });
  await captureEvidence(page, 'Step 5: Loan details', { loanAmount: LOAN_AMOUNT, loanPeriodMonths: LOAN_PERIOD_MONTHS, operativeAccountId: OPERATIVE_SB_ACCOUNT });

  // Step 6: A/c interest tab
  console.log('Visiting A/c Interest tab...');
  await loanPage.visitLoanTab('A/C Interest', 'laacctinterest');

  // Step 7: LA Interest tab
  console.log('Visiting LA Interest tab...');
  await loanPage.visitLoanTab('LA Interest', 'laint');
  await loanPage.logVisibleFields('LA Interest');

  // Step 8: Payment plan - No of instalments 12
  console.log('Visiting Payment Plan tab...');
  await loanPage.visitLoanTab('Payment Plan', 'laparm');
  await loanPage.logVisibleFields('Payment plan');
  await loanPage.setNumberOfInstalments(NO_OF_INSTALMENTS);
  await captureEvidence(page, 'Step 8: Payment plan', { noOfInstalments: NO_OF_INSTALMENTS });

  // Steps 9-11: Payment plan - Holiday period configuration
  console.log('Configuring Holiday period...');
  await loanPage.configureLoanHolidayPeriod();

  // Step 12: Payment schedule details - amortization schedule -> OK
  console.log('Visiting Payment Schedule Details tab...');
  await loanPage.visitLoanTab('Payment Schedule', 'lamnt');
  await loanPage.logVisibleFields('Payment schedule');
  await loanPage.generateAmortizationSchedule();
  await captureEvidence(page, 'Step 12: Payment schedule', { scheduleGenerated: true });

  // Step 13: Account limits - expiry date, document date (today), drawing power EQUAL
  console.log('Visiting Account Limits details tab...');
  await loanPage.visitLoanTab('Account Limits', 'acctlmt');
  await loanPage.logVisibleFields('Account limits');
  await loanPage.fillLoanAccountLimits(expiryDate);
  await captureEvidence(page, 'Step 13: Account limits', { expiryDate });

  // Step 14: Related party details tab
  console.log('Visiting Related Party details tab...');
  await loanPage.visitLoanTab('Related Party', 'relatedpartydetails');

  // Step 15: Fee details tab
  console.log('Visiting Fee details tab...');
  await loanPage.visitLoanTab('Fees', 'lachrg');

  // Step 15b: Document tab - mandatory to visit, else submit is blocked with
  // "Document: Visit document information as it is set as mandatory."
  console.log('Visiting Document details tab...');
  await loanPage.visitLoanTab('Document', 'documentdetails');

  // Step 16: Submit - the confirmation screen shows the new A/c ID.
  console.log('Clicking Submit button...');
  await loanPage.submitForm();

  // If a Warning & Exception popup appears, click Accept to continue.
  await loanPage.acceptWarningPopup();

  // Capture the generated loan A/c ID from the confirmation screen.
  const loanAccountNumber = await loanPage.getGeneratedLoanAccountNumber();
  console.log('=== GENERATED LOAN ACCOUNT NUMBER:', loanAccountNumber, '===');
  expect(loanAccountNumber, '===').toBeTruthy();

  if (!loanAccountNumber) {
    const statusMessage = await loanPage.getStatusMessage();
    const tabError = await loanPage.getTabSpecificError(statusMessage);
    throw new Error(`Loan account not created. Status: ${statusMessage || 'n/a'}. ${tabError || ''}`);
  }

  await captureEvidence(page, 'Step 16: Loan account generated', { cifCode: CIF_ID, loanAccountNumber });

  // Persist the CIF ID and loan account ID(s) for downstream specs.
  // Two accounts are created in the same FlowConfig step: key '1' (used for
  // full disbursement) and key 'partial' (used for partial disbursement).
  updateSharedState((state) => {
    state.loanCifId = CIF_ID;
    if (loanAccountNumber) {
      if (!state.loanAccounts) {
        state.loanAccounts = {};
      }

      // Persist under the explicit shared-state key (driven by the Excel sharedKey).
      (state as any)[accountKey] = loanAccountNumber;
      state.loanAccounts[accountKey] = loanAccountNumber;

      // Keep the legacy generic key set to the first (chargeoff) account.
      if (!state.loanAccountId) {
        state.loanAccountId = loanAccountNumber;
      }
      saveLoanAccount(loanAccountNumber);
    }
  });

  // Step 17: Click Accept to finalise the loan after the A/c ID is generated.
  console.log('Clicking Accept button...');
  await loanPage.clickAccept();
  await captureEvidence(page, 'Step 17: Loan created and accepted', { cifCode: CIF_ID, loanAccountNumber });

  // Logout
  console.log('Logging out...');
  await homePage.logout();
  } catch (err: any) {
    console.log(`Retail loan creation [${accountKey}] failed:`, err);
    // Navigate to the failing tab and capture the field-level error.
    try {
      await loanPage.visitLoanTab('Account Limits', 'acctlmt');
      await loanPage.logVisibleFields('Account limits failure');
      const frame = (loanPage as any).getFinwFrame();
      const ids = ['expiryDate_ui', 'documentDate_ui', 'sanctDate_ui', 'reviewDate_ui', 'sanctionLevelCode', 'sanctionLevelDesc', 'sanctionAuthCode', 'sanctionAuthDesc'];
      const values: Record<string, string> = {};
      for (const id of ids) {
        values[id] = (await frame.locator(`#${id}`).inputValue().catch(async () => (await frame.locator(`#${id}`).textContent().catch(() => '')) || '')) || '';
      }
      const errTexts = (await frame.locator('.errortext, .errormsg, .alert, .error, td.alert, tr.alert, .errorinfo, font[color]').allInnerTexts().catch(() => []))
        .map((t: string) => t.trim())
        .filter((t: string) => t);
      console.log('Account Limits values:', JSON.stringify(values));
      console.log('Account Limits error texts:', JSON.stringify(errTexts));
      const tabError = await loanPage.getTabSpecificError('Account Limits: This tab contains errors');
      console.log('Account Limits tab error:', tabError);
    } catch (tabErr) {
      console.log('Could not capture Account Limits tab details:', tabErr);
    }
    await captureEvidence(page, `Retail loan creation [${accountKey}] failed`, { error: err.message });
    throw err;
    }
  });
}
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
