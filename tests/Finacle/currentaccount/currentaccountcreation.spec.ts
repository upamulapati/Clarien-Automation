import { test } from '@playwright/test';
import { HomePage } from '../../../pages/HomePage';
import { SavingsBankAccountPage } from '../../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

// Current account creation (HOAACCA) is performed by the maker user. This spec
// contains ONLY account creation - verification lives in
// current-account verification specs.
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Current account opening (HOAACCA) menu option.
const CURRENT_ACCOUNT_MENU = 'HOAACCA';

// Current account scheme code under test. A single account is created so the
// run stops once an A/c ID is generated (no looping over every scheme).
const CURRENT_ACCOUNT_SCHEME = COMMON_DATA.currentAccountSchemes[0];

// CIF ID (test data) the current account is opened under.
const CIF_ID = '0001001423';

let homePage: HomePage;
let currentAccountPage: SavingsBankAccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(120000);

  // Step 1: Login with the maker credentials
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  currentAccountPage = new SavingsBankAccountPage(page);

  // Step 2: Select Core Server from the solution drop down
  console.log('Selecting Core Server...');
  await currentAccountPage.selectCoreServer();

  // Step 3: Type menu option HOAACCA in Finacle
  console.log(`Searching for ${CURRENT_ACCOUNT_MENU}...`);
  await currentAccountPage.searchMenu(CURRENT_ACCOUNT_MENU);
});

// Open a single current account (HOAACCA) and capture the generated A/c ID.
test(`create current account - scheme ${CURRENT_ACCOUNT_SCHEME}`, async () => {
  // Function- Open, Currency- BMD, Sol id 100, CIF Id and scheme code, Go;
  // visit General/Interest/Scheme/Related Party/MIS/Account Limits tabs;
  // submit to generate the account number.
  console.log(`Creating current account with scheme ${CURRENT_ACCOUNT_SCHEME}...`);
  await currentAccountPage.createCurrentAccount({
    ...COMMON_DATA.currentAccountData,
    cifCode: CIF_ID,
    schemeCode: CURRENT_ACCOUNT_SCHEME,
    dispatchMode: COMMON_DATA.currentAccountData.dispatchMode as 'email' | 'post',
  });

  const statusMessage = await currentAccountPage.getStatusMessage();
  console.log('Creation status message:', statusMessage);

  const result = await currentAccountPage.verifyAccountCreated();
  console.log(`Account created for scheme ${CURRENT_ACCOUNT_SCHEME}:`, result.message);
  const accountId = result.accountNumber;
  if (!accountId) {
    throw new Error(`Failed to capture account ID for scheme ${CURRENT_ACCOUNT_SCHEME}`);
  }
  console.log(`Captured Account ID (scheme ${CURRENT_ACCOUNT_SCHEME}): ${accountId}`);

  // Logout the maker
  console.log('Logging out...');
  await homePage.logout();
});
