import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { RETAIL_LOAN_DATA } from '../../config/excelTestData';
import { CREDENTIALS } from '../../../data/credentials';
import { getSharedValue } from '../../helpers/sharedState';

const STEP = RETAIL_LOAN_DATA[0]?.data ?? {};

// Verification must be performed by a DIFFERENT user than the maker who opened
// the loan (the account was created by finacletest13 in Retailloancreation.spec).
const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

// Both created retail-loan accounts must be verified before any downstream
// disbursement. The maker saves the full account as loanAccounts['1']
// and the partial account as loanAccounts['partial'].

let homePage: HomePage;
let loanPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(60000);

  // Step 1: Login with a different user (verifier) than the maker.
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  loanPage = new AccountPage(page);
});

// HOAACVLA - Verify/authorise both created retail loan account openings.
test.describe.serial('Verify retail loan accounts', () => {
for (const accountKey of ['chargeoffLoanAccountId', 'payoffLoanAccountId']) {
  test(`HOAACVLA - verify retail loan account ${accountKey}`, async ({ page }) => {
  const LOAN_ACCOUNT_NUMBER = getSharedValue<string>(
    (state) => (state as any).loanAccounts?.[accountKey] ?? (state as any)[accountKey] ?? state.loanAccountId
  );
  if (!LOAN_ACCOUNT_NUMBER) throw new Error(`Loan account for key ${accountKey} must be available from the creation spec`);
  console.log(`[SharedState] Using loan account for key ${accountKey}:`, LOAN_ACCOUNT_NUMBER);
  console.log(`Verifying retail loan account: ${LOAN_ACCOUNT_NUMBER}`);

  // Select "core server" from the solution drop down
  console.log('Selecting Core Server...');
  await loanPage.selectCoreServer();

  // Step 2: Type menu option "HOAACVLA" in finacle
  console.log('Searching for HOAACVLA...');
  const menuOption = STEP['menuOption'];
  if (!menuOption) throw new Error('menuOption is required in the Excel sheet');
  await loanPage.searchMenu(menuOption);
  await page.waitForTimeout(3000);

  // Step 3: Function - V - Verify, Temporary a/c id - loan account number
  console.log('Selecting Verify function...');
  await loanPage.selectFunction('Verify');

  console.log('Entering temporary loan account ID to verify...');
  await loanPage.enterTemporaryAccountId(LOAN_ACCOUNT_NUMBER);

  // Click Go to load the loan account into the verification screen
  console.log('Clicking Go button...');
  await loanPage.clickGo();

  // Step 4: Visit General details
  console.log('Visiting General details tab...');
  await loanPage.visitLoanTab('General', 'generaldetails');

  // Step 5: Visit Loan details
  console.log('Visiting Loan details tab...');
  await loanPage.visitLoanTab('Loan Details', 'lasch');

  // Step 6: Visit A/c interest details
  console.log('Visiting A/c Interest tab...');
  await loanPage.visitLoanTab('A/C Interest', 'laacctinterest');

  // Step 7: Visit LA interest details
  console.log('Visiting LA Interest tab...');
  await loanPage.visitLoanTab('LA Interest', 'laint');

  // Step 8: Visit payment schedule details
  console.log('Visiting Payment Schedule tab...');
  await loanPage.visitLoanTab('Payment Schedule', 'lamnt');

  // Step 9: Visit related party details
  console.log('Visiting Related Party tab...');
  await loanPage.visitLoanTab('Related Party', 'relatedpartydetails');

  // Step 10: Visit MIS codes details
  console.log('Visiting MIS Codes tab...');
  await loanPage.visitLoanTab('MIS Codes', 'miscodes');

  // Step 11: Visit document details
  console.log('Visiting Document details tab...');
  await loanPage.visitLoanTab('Document', 'documentdetails');

  // Step 12: Visit account limits
  console.log('Visiting Account Limits tab...');
  await loanPage.visitLoanTab('Account Limits', 'acctlmt');

  // Step 13: Visit fees tab
  console.log('Visiting Fees tab...');
  await loanPage.visitLoanTab('Fees', 'lachrg');

  // Step 14: Click Submit - the loan account opening gets authorised/verified.
  // The confirmation screen shows "Verified A/c. ID: <number>" with an Accept
  // button to finalise the authorisation.
  console.log('Clicking Submit button...');
  await loanPage.submitForm();

  // If a Warning & Exception popup appears, click Accept to continue.
  await loanPage.acceptWarningPopup();

  const verifiedAccountNumber = await loanPage.getGeneratedLoanAccountNumber();
  console.log('=== VERIFIED LOAN ACCOUNT NUMBER:', verifiedAccountNumber, '===');
  expect(verifiedAccountNumber, '===').toBeTruthy();
  if (verifiedAccountNumber !== LOAN_ACCOUNT_NUMBER) {
    throw new Error(`Verification returned account ${verifiedAccountNumber} but expected ${LOAN_ACCOUNT_NUMBER} for key ${accountKey}`);
  }

  console.log('Clicking Accept button...');
  await loanPage.clickAccept();

  // Logout
  console.log('Logging out...');
  await homePage.logout();
  });
}
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
