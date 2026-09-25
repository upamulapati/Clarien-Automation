import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { SAVINGS_TEST_DATA } from '../../config/testData';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

let homePage: HomePage;
let savingsAccountPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);

  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  savingsAccountPage = new AccountPage(page);

  console.log('Selecting Core Server...');
  await savingsAccountPage.selectCoreServer();

  console.log('Searching for HOAACSB...');
  await savingsAccountPage.searchMenu(COMMON_DATA.savingsAccount.screens.create);
});

test('TC_SB_002 - save savings bank account with SVREG scheme', async ({ page }) => {
  console.log('Creating savings account with SVREG scheme (hardcoded)...');
  await savingsAccountPage.createSavingsAccount(SAVINGS_TEST_DATA);

  const result = await savingsAccountPage.verifyAccountCreated();
  console.log('Exact result message:', result.message);
  expect(result.success, `Expected success but got: ${result.message}`).toBe(true);
  expect(result.message).toBeTruthy();
  console.log('Verification Result:', result.message);
  expect(result.message).toBeTruthy();
  expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log('Account Number:', result.accountNumber);
  expect(result.accountNumber).toBeTruthy();
  await savingsAccountPage.saveSavingsAccount();
  await page.waitForTimeout(180000);
});

test('TC_SB_005 - SB A/c Modification - Account opened through NEWGEN', async ({ page }) => {
  console.log('Creating savings account first (as extension of TC_SB_002)...');
  await savingsAccountPage.createSavingsAccount(SAVINGS_TEST_DATA);

  const result = await savingsAccountPage.verifyAccountCreated();
  console.log('Exact result message:', result.message);
  expect(result.success, `Expected success but got: ${result.message}`).toBe(true);
  expect(result.message).toBeTruthy();
  console.log('Verification Result:', result.message);
  expect(result.message).toBeTruthy();
  expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log('Account Number:', result.accountNumber);
  expect(result.accountNumber).toBeTruthy();

  const accountId = result.accountNumber;
  if (!accountId) {
    throw new Error('Failed to capture account ID after creating savings account');
  }
  console.log(`Captured Account ID: ${accountId}`);

  console.log('Navigating to modification screen...');
  // Type menu option "HOAACMSB" for account modification
  await savingsAccountPage.searchMenu(COMMON_DATA.savingsAccount.screens.modify);
  
  // Paste the captured account ID on the modification screen
  await savingsAccountPage.enterAccountId(accountId);
  
  // Click Go and perform all the same modifications done in the first test case
  // Dispatch Mode set to 'post' which maps to value 'A' (Post and Email)
  console.log('Performing modifications across all tabs...');
  await savingsAccountPage.modifySavingsAccount('post');

  // Verify the modification message and account number
  const modResult = await savingsAccountPage.verifyAccountCreated();
  expect(modResult.success, `Expected success but got: ${modResult.message}`).toBe(true);
  console.log('Modification Result:', modResult.message);
  expect(modResult.message).toBeTruthy();
  expect(modResult.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log('Modified Account Number:', modResult.accountNumber);
  expect(modResult.accountNumber).toBeTruthy();

  // Finally logout
  console.log('Logging out...');
  await homePage.logout();
});

test('TC_SB_006 - SB A/c Modification with Full Field Capture', async ({ page }) => {
  console.log('Creating savings account first...');
  await savingsAccountPage.createSavingsAccount(SAVINGS_TEST_DATA);

  const result = await savingsAccountPage.verifyAccountCreated();
  console.log('Exact result message:', result.message);
  expect(result.success, `Expected success but got: ${result.message}`).toBe(true);
  expect(result.message).toBeTruthy();
  console.log('Verification Result:', result.message);
  expect(result.message).toBeTruthy();
  expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log('Account Number:', result.accountNumber);
  expect(result.accountNumber).toBeTruthy();

  const accountId = result.accountNumber;
  if (!accountId) {
    throw new Error('Failed to capture account ID after creating savings account');
  }
  console.log(`Captured Account ID: ${accountId}`);

  // Capture all other result fields
  console.log('Capturing all result fields...');
  console.log('Account creation result:', JSON.stringify(result, null, 2));

  console.log('Navigating to modification screen...');
  await savingsAccountPage.searchMenu(COMMON_DATA.savingsAccount.screens.modify);
  
  console.log('Entering captured account ID...');
  await savingsAccountPage.enterAccountId(accountId);
  
  console.log('Performing modifications across all tabs...');
  await savingsAccountPage.modifySavingsAccount('post');

  const modResult = await savingsAccountPage.verifyAccountCreated();
  expect(modResult.success, `Expected success but got: ${modResult.message}`).toBe(true);
  console.log('Modification Result:', modResult.message);
  expect(modResult.message).toBeTruthy();
  expect(modResult.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log('Modified Account Number:', modResult.accountNumber);
  expect(modResult.accountNumber).toBeTruthy();

  // Capture all modification result fields
  console.log('Capturing all modification result fields...');
  console.log('Modification result:', JSON.stringify(modResult, null, 2));

  console.log('Logging out...');
  await homePage.logout();
});


// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
