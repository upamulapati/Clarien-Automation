import { test } from '@playwright/test';
import { HomePage } from '../../../pages/HomePage';
import { SavingsBankAccountPage } from '../../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

let homePage: HomePage;
let savingsAccountPage: SavingsBankAccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);

  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  savingsAccountPage = new SavingsBankAccountPage(page);

  console.log('Selecting Core Server...');
  await savingsAccountPage.selectCoreServer();

  console.log('Searching for HOAACSB...');
  await savingsAccountPage.searchMenu('HOAACSB');
});

test('TC_SB_002 - save savings bank account with SVREG scheme', async ({ page }) => {
  console.log('Creating savings account with SVREG scheme (hardcoded)...');
  await savingsAccountPage.createSavingsAccount(COMMON_DATA.svregTestData);

  const result = await savingsAccountPage.verifyAccountCreated();
  console.log('Verification Result:', result.message);
  console.log('Account Number:', result.accountNumber);
  await savingsAccountPage.saveSavingsAccount();
  await page.waitForTimeout(180000);
});

test('TC_SB_005 - SB A/c Modification - Account opened through NEWGEN', async ({ page }) => {
  console.log('Creating savings account first (as extension of TC_SB_002)...');
  await savingsAccountPage.createSavingsAccount(COMMON_DATA.svregTestData);

  const result = await savingsAccountPage.verifyAccountCreated();
  console.log('Verification Result:', result.message);
  console.log('Account Number:', result.accountNumber);

  const accountId = result.accountNumber;
  if (!accountId) {
    throw new Error('Failed to capture account ID after creating savings account');
  }
  console.log(`Captured Account ID: ${accountId}`);

  console.log('Navigating to modification screen...');
  // Type menu option "HOAACMSB" for account modification
  await savingsAccountPage.searchMenu('HOAACMSB');
  
  // Paste the captured account ID on the modification screen
  await savingsAccountPage.enterAccountId(accountId);
  
  // Click Go and perform all the same modifications done in the first test case
  // Dispatch Mode set to 'post' which maps to value 'A' (Post and Email)
  console.log('Performing modifications across all tabs...');
  await savingsAccountPage.modifySavingsAccount('post');

  // Verify the modification message and account number
  const modResult = await savingsAccountPage.verifyAccountCreated();
  console.log('Modification Result:', modResult.message);
  console.log('Modified Account Number:', modResult.accountNumber);

  // Finally logout
  console.log('Logging out...');
  await homePage.logout();
});

test('TC_SB_006 - SB A/c Modification with Full Field Capture', async ({ page }) => {
  console.log('Creating savings account first...');
  await savingsAccountPage.createSavingsAccount(COMMON_DATA.svregTestData);

  const result = await savingsAccountPage.verifyAccountCreated();
  console.log('Verification Result:', result.message);
  console.log('Account Number:', result.accountNumber);

  const accountId = result.accountNumber;
  if (!accountId) {
    throw new Error('Failed to capture account ID after creating savings account');
  }
  console.log(`Captured Account ID: ${accountId}`);

  // Capture all other result fields
  console.log('Capturing all result fields...');
  if (result.allFields) {
    console.log('All captured fields:', JSON.stringify(result.allFields, null, 2));
  }

  console.log('Navigating to modification screen...');
  await savingsAccountPage.searchMenu('HOAACMSB');
  
  console.log('Entering captured account ID...');
  await savingsAccountPage.enterAccountId(accountId);
  
  console.log('Performing modifications across all tabs...');
  await savingsAccountPage.modifySavingsAccount('post');

  const modResult = await savingsAccountPage.verifyAccountCreated();
  console.log('Modification Result:', modResult.message);
  console.log('Modified Account Number:', modResult.accountNumber);

  // Capture all modification result fields
  console.log('Capturing all modification result fields...');
  if (modResult.allFields) {
    console.log('All modification fields:', JSON.stringify(modResult.allFields, null, 2));
  }

  console.log('Logging out...');
  await homePage.logout();
});

