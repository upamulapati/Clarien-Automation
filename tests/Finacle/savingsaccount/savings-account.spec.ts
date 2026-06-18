import { test } from '@playwright/test';
import { LoginPage } from '../../../pages/LoginPage';
import { HomePage } from '../../../pages/HomePage';
import { SavingsBankAccountPage } from '../../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import TEST_DATA from '../../../data/savings-account-test-data.json';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;
const SECOND_USERNAME = CREDENTIALS.secondCredentials.username;
const SECOND_PASSWORD = CREDENTIALS.secondCredentials.password;
const BASE_ACCOUNT_DATA = COMMON_DATA.baseAccountData;

let loginPage: LoginPage;
let homePage: HomePage;
let savingsAccountPage: SavingsBankAccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(120000);

  // Login with credentials
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  savingsAccountPage = new SavingsBankAccountPage(page);

  // Select Core Server from solution drop down
  console.log('Selecting Core Server...');
  await savingsAccountPage.selectCoreServer();

  // Type menu option HOAACSB in Finacle
  console.log('Searching for HOAACSB...');
  await savingsAccountPage.searchMenu('HOAACSB');
});

// Test 1: Hardcoded - random scheme selection
const HARDCODED_RANDOM_DATA = COMMON_DATA.hardcodedRandomData;

test('save savings bank account - random scheme', async () => {
  console.log('Creating savings account with random scheme (hardcoded)...');
  await savingsAccountPage.createSavingsAccount({ ...HARDCODED_RANDOM_DATA });

  const isCreated = await savingsAccountPage.verifyAccountCreated();
  console.log('Account created:', isCreated);
  await homePage.logout();
});

// Test 2: Hardcoded - SVREG scheme
test('save savings bank account with SVREG scheme', async () => {
  console.log('Creating savings account with SVREG scheme (hardcoded)...');
  await savingsAccountPage.createSavingsAccount(COMMON_DATA.svregTestData);

  const isCreated = await savingsAccountPage.verifyAccountCreated();
  console.log('Account created:', isCreated);
  await homePage.logout();
});

// Test 3: Data-driven - each JSON entry as a separate test case
for (const testCase of TEST_DATA as any[]) {
  const testLabel = testCase.description 
    ? `${testCase.description} ${testCase.currency}`
    : `${testCase.schemeCode} ${testCase.currency}`;

  test(`save savings bank account - data driven ${testLabel}`, async ({ page }) => {
    // Re-navigate to HOAACSB for each test
    await savingsAccountPage.selectCoreServer();
    await savingsAccountPage.searchMenu('HOAACSB');
    
    await savingsAccountPage.createSavingsAccount({
      ...BASE_ACCOUNT_DATA,
      ccy: testCase.currency,
      schemeCode: testCase.schemeCode || undefined
    });

    const result = await savingsAccountPage.verifyAccountCreated();
    console.log(`Account created for ${testLabel}:`, result.message);
    const accountId = result.accountNumber;
    if (!accountId) {
      throw new Error('Failed to capture account ID after creating savings account');
    }
    console.log(`Captured Account ID: ${accountId}`);

    // Logout
    await homePage.logout();
    await page.waitForTimeout(5000);

    // Login with second user
    console.log('Logging in with second user...');
    loginPage = new LoginPage(page);
    homePage = new HomePage(page);
    savingsAccountPage = new SavingsBankAccountPage(page);

    await loginPage.goto();
    await loginPage.login(SECOND_USERNAME, SECOND_PASSWORD);
    await page.waitForTimeout(5000);
    await loginPage.handleAlreadyLoggedInError(SECOND_PASSWORD);

    console.log('Selecting Core Server...');
    await savingsAccountPage.selectCoreServer();
    await page.waitForTimeout(5000);

    // Search for HOAACVSB and select verify option
    console.log('Searching for HOAACVSB (verification screen)...');
    await savingsAccountPage.searchVerificationScreen('HOAACVSB');
    await page.waitForTimeout(3000);

    console.log('Selecting verify function option...');
    await savingsAccountPage.selectVerifyFunction();

    console.log('Entering temporary account ID...');
    await savingsAccountPage.enterTemporaryAccountId(accountId);

    // Click Go
    console.log('Clicking Go button...');
    await savingsAccountPage.acceptButton.click();
    await page.waitForTimeout(5000);

    // Navigate through all tabs
    console.log('Navigating through all tabs...');
    await savingsAccountPage.navigateAllTabs();

    // Click Submit button
    console.log('Clicking Submit button...');
    await savingsAccountPage.clickSubmit();

    // Logout at end
    console.log('Logging out...');
    await homePage.logout();
  });
}

// Test 4: Account Verification Workflow
test('SB verification', async ({ page }) => {
  test.setTimeout(300000);

  // Step 1-5: Create account and capture ID
  console.log('Creating savings account...');
  await savingsAccountPage.selectCoreServer();
  await savingsAccountPage.searchMenu('HOAACSB');
  await savingsAccountPage.createSavingsAccount(COMMON_DATA.svregTestData);

  const result = await savingsAccountPage.verifyAccountCreated();
  console.log('Account created:', result.message);
  const accountId = result.accountNumber;
  if (!accountId) {
    throw new Error('Failed to capture account ID after creating savings account');
  }
  console.log(`Captured Account ID: ${accountId}`);

  // Step 6: Logout
  console.log('Logging out...');
  await homePage.logout();
  await page.waitForTimeout(5000);

  // Step 7-8: Login with second user and wait for page load
  console.log('Logging in with second user...');
  loginPage = new LoginPage(page);
  homePage = new HomePage(page);
  savingsAccountPage = new SavingsBankAccountPage(page);

  await loginPage.goto();
  await loginPage.login(SECOND_USERNAME, SECOND_PASSWORD);
  await page.waitForTimeout(5000);
  await loginPage.handleAlreadyLoggedInError(SECOND_PASSWORD);

  console.log('Selecting Core Server...');
  await savingsAccountPage.selectCoreServer();
  await page.waitForTimeout(5000);

  // Step 9-10: Search for HOAACVSB and select verify option
  console.log('Searching for HOAACVSB (verification screen)...');
  await savingsAccountPage.searchVerificationScreen('HOAACVSB');
  await page.waitForTimeout(3000);

  console.log('Selecting verify function option...');
  await savingsAccountPage.selectVerifyFunction();

  console.log('Entering temporary account ID...');
  await savingsAccountPage.enterTemporaryAccountId(accountId);

  // Step 11: Click Go
  console.log('Clicking Go button...');
  await savingsAccountPage.acceptButton.click();
  await page.waitForTimeout(5000);

  // Step 12: Navigate through all tabs
  console.log('Navigating through all tabs...');
  await savingsAccountPage.navigateAllTabs();

  // Step 13: Click Submit button
  console.log('Clicking Submit button...');
  await savingsAccountPage.clickSubmit();

  // Logout at end
  console.log('Logging out...');
  await homePage.logout();
});

// Test 5: HACI Enquiry Test
test('HACI enquiry', async ({ page }) => {
  test.setTimeout(300000);

  // Step 1: Create Account
  console.log('Creating savings account...');
  await savingsAccountPage.selectCoreServer();
  await savingsAccountPage.searchMenu('HOAACSB');
  await savingsAccountPage.createSavingsAccount(COMMON_DATA.svregTestData);

  const result = await savingsAccountPage.verifyAccountCreated();
  console.log('Account created:', result.message);
  const accountId = result.accountNumber;
  if (!accountId) {
    throw new Error('Failed to capture account ID after creating savings account');
  }
  console.log(`Captured Account ID: ${accountId}`);

  // Step 3: Search for Enquiry Screen (HACI)
  console.log('Searching for HACI (enquiry screen)...');
  await savingsAccountPage.searchEnquiryScreen('HACI');
  await page.waitForTimeout(3000);

  // Step 4: Enter the captured ID in acctNo field
  console.log('Entering account ID in enquiry screen...');
  await savingsAccountPage.enterEnquiryAccountId(accountId);

  // Step 5: Click Go
  console.log('Clicking Go button...');
  await savingsAccountPage.acceptButton.click();
  await page.waitForTimeout(5000);

  // Step 6: Verify if error message is showing
  console.log('Checking for authorization error...');
  const hasAuthError = await savingsAccountPage.checkAuthorizationError();
  if (hasAuthError) {
    throw new Error('Authorization error detected: Account creation is not yet authorized');
  }
  console.log('No authorization error found');

  // Step 7: Logout
  console.log('Logging out...');
  await homePage.logout();
});

// Test 6: HTM Transaction Management Test
test('HTM transaction management', async ({ page }) => {
  test.setTimeout(120000);

  // Step 1: Create Account
  console.log('Creating savings account...');
  await savingsAccountPage.selectCoreServer();
  await savingsAccountPage.searchMenu('HOAACSB');
  await savingsAccountPage.createSavingsAccount(COMMON_DATA.svregTestData);

  const result = await savingsAccountPage.verifyAccountCreated();
  console.log('Account created:', result.message);
  const accountId = result.accountNumber;
  if (!accountId) {
    throw new Error('Failed to capture account ID after creating savings account');
  }
  console.log(`Captured Account ID: ${accountId}`);

  // Step 3: Search for HTM
  console.log('Searching for HTM (transaction management)...');
  await savingsAccountPage.searchTransactionManagement('HTM');
  await page.waitForTimeout(3000);

  // Step 4: Select "A - Add" function
  console.log('Selecting Add function...');
  await savingsAccountPage.selectHtmFunction('A');

  // Step 5: Select "T/CI - Customer Induced" transaction type
  console.log('Selecting transaction type...');
  await savingsAccountPage.selectHtmTranTypeSubType('T/CI');

  // Step 6: Click Go
  console.log('Clicking Go button...');
  await savingsAccountPage.clickHtmGo();
  await page.waitForTimeout(5000);

  // Step 7: Enter A/c. ID as "7710003367" and amount, select debit, click Add
  console.log('Entering initial account ID and amount...');
  const initialAccountId = '7710003367';
  const amount = '1000';
  await savingsAccountPage.enterHtmAccountId(initialAccountId);
  await savingsAccountPage.enterHtmAmount(amount);
  await savingsAccountPage.selectHtmDebit();
  await savingsAccountPage.clickHtmAdd();

  // Step 8: Enter captured ID and same amount, click Post
  console.log('Entering captured account ID and same amount...');
  await savingsAccountPage.enterHtmAccountId(accountId);
  await savingsAccountPage.enterHtmAmount(amount);
  await savingsAccountPage.clickHtmPost();

  // Step 9: Verify any error message
  console.log('Checking for HTM error messages...');
  const hasHtmError = await savingsAccountPage.checkHtmError();
  if (hasHtmError) {
    throw new Error('HTM error message detected');
  }
  console.log('No HTM error found');

  // Step 10: Logout
  console.log('Logging out...');
  await homePage.logout();
});

// Test 7: HTM Transaction Management with HACLINQ Test
test('HTM transaction management with HACLINQ', async ({ page }) => {
  test.setTimeout(120000);

  // Step 1: Create Account
  console.log('Creating savings account...');
  await savingsAccountPage.selectCoreServer();
  await savingsAccountPage.searchMenu('HOAACSB');
  await savingsAccountPage.createSavingsAccount(COMMON_DATA.svregTestData);

  const result = await savingsAccountPage.verifyAccountCreated();
  console.log('Account created:', result.message);
  const accountId = result.accountNumber;
  if (!accountId) {
    throw new Error('Failed to capture account ID after creating savings account');
  }
  console.log(`Captured Account ID: ${accountId}`);

  // Step 3: Search for HTM
  console.log('Searching for HTM (transaction management)...');
  await savingsAccountPage.searchTransactionManagement('HTM');
  await page.waitForTimeout(3000);

  // Step 4: Select "A - Add" function
  console.log('Selecting Add function...');
  await savingsAccountPage.selectHtmFunction('A');

  // Step 5: Select "T/CI - Customer Induced" transaction type
  console.log('Selecting transaction type...');
  await savingsAccountPage.selectHtmTranTypeSubType('T/CI');

  // Step 6: Click Go
  console.log('Clicking Go button...');
  await savingsAccountPage.clickHtmGo();
  await page.waitForTimeout(10000);

  // Step 7: Select debit radio button
  console.log('Selecting debit option...');
  await savingsAccountPage.selectHtmDebit();

  // Step 8: Enter A/c. ID as "7710003367" and amount, click Add
  console.log('Entering initial account ID and amount...');
  const initialAccountId = '7710003367';
  const amount = '1000';
  await savingsAccountPage.enterHtmAccountId(initialAccountId);
  await savingsAccountPage.enterHtmAmount(amount);
  await savingsAccountPage.clickHtmAdd();

  // Step 9: Enter captured ID and same amount, press tab, click Post
  console.log('Entering captured account ID and same amount...');
  await savingsAccountPage.enterHtmAccountId(accountId);
  await savingsAccountPage.enterHtmAmount(amount, true);
  await savingsAccountPage.clickHtmPost();

  // Step 9: Verify any error message
  console.log('Checking for HTM error messages...');
  const hasHtmError = await savingsAccountPage.checkHtmError();
  if (hasHtmError) {
    throw new Error('HTM error message detected');
  }
  console.log('No HTM error found');

  // Step 10: Search for HACLINQ
  console.log('Searching for HACLINQ (account inquiry)...');
  await savingsAccountPage.searchAccountInquiry('HACLINQ');

  // Step 11: Enter captured account ID
  console.log('Entering captured account ID in HACLINQ...');
  await savingsAccountPage.enterHaclinqAccountId(accountId);

  // Step 12: Click Go
  console.log('Clicking Go button in HACLINQ...');
  await savingsAccountPage.clickHaclinqGo();

  // Step 13: Logout
  console.log('Logging out...');
  await homePage.logout();
});


