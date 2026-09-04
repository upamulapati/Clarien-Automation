import { test } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { ServicePackPage } from '../../pages/servicepackpage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

// Verification of a loan modification must be performed by a DIFFERENT user than
// the maker who modified the loan (the maker modified it in
// Retailloanmodification.spec.ts).
const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

// Loan accounts to verify after modification. Set to the specific A/c ID(s)
// requested for this run.
const LOAN_ACCOUNTS: { scheme: string; accountNumber: string }[] = [
  { scheme: 'MODIFIED', accountNumber: '3200000049' },
];

let homePage: HomePage;
let loanPage: AccountPage;

test.beforeEach(async ({ page }) => {
  // All recorded accounts are verified in a single test/session, so budget
  // ~5 min per account to avoid timing out mid-verification.
  test.setTimeout(Math.max(1, LOAN_ACCOUNTS.length) * 300000);
  page.setDefaultTimeout(20000);

  // Step 1: Login with a different user (verifier) than the maker.
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  loanPage = new AccountPage(page);
});

// HACMLA - Verify/authorise every retail loan MODIFICATION made in the latest
// Retailloanmodification.spec.ts run. The A/c IDs are read at runtime from the
// shared store so this picks up the accounts modified in the same run.
test('HACMLA - verify modified retail loan accounts', async ({ page }) => {
  const loanAccounts = LOAN_ACCOUNTS;

  console.log(`Verifying ${loanAccounts.length} modified retail loan account(s):`,
    loanAccounts.map((a) => `${a.scheme}=${a.accountNumber}`).join(', '));

  for (const { scheme, accountNumber } of loanAccounts) {
    await verifyModifiedLoanAccount(page, scheme, accountNumber);
  }

  // Logout once after all accounts are verified.
  console.log('Logging out...');
  await homePage.logout();
});

// Runs the HACMLA verification flow for a single modified loan A/c ID.
async function verifyModifiedLoanAccount(
  page: import('@playwright/test').Page,
  scheme: string,
  loanAccountNumber: string,
): Promise<void> {
  console.log(`Verifying modified retail loan account (${scheme}): ${loanAccountNumber}`);

  // Select "core server" from the solution drop down.
  console.log('Selecting Core Server...');
  await loanPage.selectCoreServer();

  // Step 2: Type menu option "HACMLA" in finacle.
  console.log('Searching for HACMLA...');
  await loanPage.searchMenu(COMMON_DATA.retailLoans.screens.modifyAndVerify);
  await page.waitForTimeout(3000);

  // Step 3: Function - V - Verify, Temporary a/c id - the loan account number.
  console.log('Selecting Verify function...');
  await loanPage.selectFunction('Verify');

  console.log('Entering loan account ID to verify...');
  await loanPage.enterHacmAccountId(loanAccountNumber);

  // Click Go to load the modified loan account into the verification screen.
  console.log('Clicking Go button...');
  await loanPage.clickGo();

  // A Warning & Exception popup may appear after Go; accept it to continue.
  await loanPage.acceptWarningPopup();

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

  // Step 12: Visit Addl. Info details
  console.log('Visiting Addl. Info details tab...');
  await loanPage.visitLoanTab('Addl. Info', 'additionalinfo');

  // Step 13: Visit fees tab
  console.log('Visiting Fees tab...');
  await loanPage.visitLoanTab('Fees', 'lachrg');

  // Step 14: View Audit service pack validation before submitting.
  console.log('Starting View Audit service pack validation...');
  const servicePackPage = new ServicePackPage(page);
  await servicePackPage.servicePackRetailLoanModifyAuditValidation();

  // Step 15: Click Submit - the loan modification gets authorised/verified.
  console.log('Clicking Submit button...');
  await loanPage.submitForm();

  // If a Warning & Exception popup appears, click Accept/OK to continue.
  await loanPage.acceptWarningPopup();

  const verifiedAccountNumber = await loanPage.getGeneratedLoanAccountNumber();
  console.log(`=== VERIFIED MODIFIED LOAN ACCOUNT NUMBER (${scheme}):`, verifiedAccountNumber, '===');

  console.log('Clicking Accept button...');
  await loanPage.clickAccept();
}
