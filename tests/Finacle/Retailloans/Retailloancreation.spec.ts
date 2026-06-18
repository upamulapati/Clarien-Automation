import { test } from '@playwright/test';
import { HomePage } from '../../../pages/HomePage';
import { SavingsBankAccountPage } from '../../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

// Retail loan creation (HOAACLA) is performed by the maker user.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Loan header inputs.
const CURRENCY = 'BMD';
const SOL_ID = '100';
//const CIF_ID = COMMON_DATA.baseAccountData.cifCode;
const CIF_ID = '0005000599';

// NOTE: Set this to a valid retail-loan scheme code. If left blank, the scheme
// search popup will fall back to selecting the first available scheme.
const LOAN_SCHEME_CODE = 'LNCOV';

// Operative (repayment) SB account number used on the Loan details tab. This is
// the savings account under CIF 0005000599 used across the savings specs.
const OPERATIVE_SB_ACCOUNT = '7710003367';

// Loan parameters.
const LOAN_AMOUNT = '10000';
const LOAN_PERIOD_MONTHS = '12';
const NO_OF_INSTALMENTS = '12';

// Account limit expiry date = loan last instalment date (one year ahead).
const expiryDate = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
})();

let homePage: HomePage;
let loanPage: SavingsBankAccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  // Cap individual action waits so a missing/unknown field fails fast (instead
  // of blocking for the whole test timeout) while we lock the loan selectors.
  page.setDefaultTimeout(20000);

  // Step 1: Login to finacle
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  loanPage = new SavingsBankAccountPage(page);
});

// HOAACLA - Create a retail loan account and capture the generated account number.
test('HOAACLA - create retail loan account', async ({ page }) => {
  console.log('Creating retail loan account...');

  // Step 1: Select "core server" from the solution drop down
  console.log('Selecting Core Server...');
  await loanPage.selectCoreServer();

  // Step 2: Type menu option "HOAACLA" in finacle
  console.log('Searching for HOAACLA...');
  await loanPage.searchMenu('HOAACLA');
  await page.waitForTimeout(3000);

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

  // Step 5: Loan details tab - amount, period (months), operative a/c id
  console.log('Visiting Loan details tab...');
  await loanPage.visitLoanTab('Loan Details', 'lasch');
  await loanPage.logVisibleFields('Loan details');
  await loanPage.fillLoanDetails({
    loanAmount: LOAN_AMOUNT,
    loanPeriodMonths: LOAN_PERIOD_MONTHS,
    operativeAccountId: OPERATIVE_SB_ACCOUNT,
  });

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

  // Steps 9-11: Payment plan - Holiday period configuration
  console.log('Configuring Holiday period...');
  await loanPage.configureLoanHolidayPeriod();

  // Step 12: Payment schedule details - amortization schedule -> OK
  console.log('Visiting Payment Schedule Details tab...');
  await loanPage.visitLoanTab('Payment Schedule', 'lamnt');
  await loanPage.logVisibleFields('Payment schedule');
  await loanPage.generateAmortizationSchedule();

  // Step 13: Account limits - expiry date, document date (today), drawing power EQUAL
  console.log('Visiting Account Limits details tab...');
  await loanPage.visitLoanTab('Account Limits', 'acctlmt');
  await loanPage.logVisibleFields('Account limits');
  await loanPage.fillLoanAccountLimits(expiryDate);

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

  // Step 17: Click Accept to finalise the loan after the A/c ID is generated.
  console.log('Clicking Accept button...');
  await loanPage.clickAccept();

  // Logout
  console.log('Logging out...');
  await homePage.logout();
});
