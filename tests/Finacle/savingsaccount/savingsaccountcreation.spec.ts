import { test } from '@playwright/test';
import { HomePage } from '../../../pages/HomePage';
import { SavingsBankAccountPage } from '../../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';

// Savings account creation (HOAACSB) is performed by the maker user. This spec
// contains ONLY account creation - verification lives in
// savingsaccountverification.spec.ts.
const USERNAME = COMMON_DATA.credentials.username;
const PASSWORD = COMMON_DATA.credentials.password;
//tags:- end2end,regression,sanity
let homePage: HomePage;
let savingsAccountPage: SavingsBankAccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(120000);

  // Step 1: Login with the maker credentials
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  savingsAccountPage = new SavingsBankAccountPage(page);

  // Step 2: Select Core Server from the solution drop down
  console.log('Selecting Core Server...');
  await savingsAccountPage.selectCoreServer();

  // Step 3: Type menu option HOAACSB in Finacle
  console.log('Searching for HOAACSB...');
  await savingsAccountPage.searchMenu('HOAACSB');
});

// Test 1: Create savings account with a random scheme (hardcoded data)
test('create savings account - random scheme', async () => {
  console.log('Creating savings account with random scheme (hardcoded)...');
  await savingsAccountPage.createSavingsAccount({ ...COMMON_DATA.hardcodedRandomData });

  const result = await savingsAccountPage.verifyAccountCreated();
  console.log('Account created:', result.message);
  console.log('Captured Account ID:', result.accountNumber);

  await homePage.logout();
});

// Test 2: Create savings account with the SVREG scheme (hardcoded data)
test('create savings account - SVREG scheme', async () => {
  console.log('Creating savings account with SVREG scheme (hardcoded)...');
  await savingsAccountPage.createSavingsAccount(COMMON_DATA.svregTestData);

  const result = await savingsAccountPage.verifyAccountCreated();
  console.log('Account created:', result.message);
  console.log('Captured Account ID:', result.accountNumber);

  await homePage.logout();
});
