import { test } from '@playwright/test';
import { LoginPage } from '../../pages/HomePages/LoginPage';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;
const VERIFIER_USERNAME = CREDENTIALS.verifierCredentials.username;
const VERIFIER_PASSWORD = CREDENTIALS.verifierCredentials.password;
const CLOSURE_DATA = COMMON_DATA.accountClosure;

let loginPage: LoginPage;
let homePage: HomePage;
let accountPage: AccountPage;

test.describe('Account Closure - HCAAC', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(300000);

    // Login with credentials
    ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
    accountPage = new AccountPage(page);

    // Select Core Server from solution drop down
    console.log('Selecting Core Server...');
    await accountPage.selectCoreServer();
  });

  test('SB/CA - Account Closure with Balance Transfer', async ({ page }) => {
    // Step 1: Invoke HTM menu
    console.log('Invoking HTM menu...');
    await accountPage.searchTransactionManagement(CLOSURE_DATA.screens.htm);
    await page.waitForTimeout(3000);

    // Step 2: Select Function as Add and Transaction type as Bank Induced
    console.log('Selecting Add function...');
    await accountPage.selectHtmFunction('A');
    
    console.log('Selecting Bank Induced transaction type...');
    await accountPage.selectHtmTranTypeSubType('T/BI');
    
    console.log('Clicking Go button...');
    await accountPage.clickHtmGo();
    await page.waitForTimeout(5000);

    // Step 3: Click Debit radio button and enter A/C ID to close
    console.log('Selecting Debit option...');
    await accountPage.selectHtmDebit();
    
    console.log('Entering A/C ID to close:', CLOSURE_DATA.accountIdToClose);
    await accountPage.enterHtmAccountId(CLOSURE_DATA.accountIdToClose);
    
    // Step 4: Enter amount to transfer
    console.log('Entering transfer amount:', CLOSURE_DATA.transferAmount);
    await accountPage.enterHtmAmount(CLOSURE_DATA.transferAmount);

    // Step 5: Select transaction particular code and click validate
    console.log('Selecting Transaction Particular Code:', CLOSURE_DATA.transactionParticularCode);
    await accountPage.selectTransactionParticularCode(CLOSURE_DATA.transactionParticularCode);
    
    console.log('Clicking Validate button...');
    await accountPage.clickValidate();
    await page.waitForTimeout(2000);

    // Step 6: Click Add button
    console.log('Clicking Add button...');
    await accountPage.clickHtmAdd();
    await page.waitForTimeout(3000);

    // Step 7: Click Credit radio button and enter transfer A/C ID
    console.log('Selecting Credit option...');
    await accountPage.selectHtmCredit();
    
    console.log('Entering transfer A/C ID:', CLOSURE_DATA.transferAccountId);
    await accountPage.enterHtmAccountId(CLOSURE_DATA.transferAccountId);
    
    // Step 8: Enter exact amount and particulars
    console.log('Entering credit amount:', CLOSURE_DATA.transferAmount);
    await accountPage.enterHtmAmount(CLOSURE_DATA.transferAmount);
    
    console.log('Entering particulars:', CLOSURE_DATA.particulars);
    await accountPage.enterHtmParticulars(CLOSURE_DATA.particulars);

    // Step 9: Click Post button
    console.log('Clicking Post button...');
    await accountPage.clickHtmPost();
    await page.waitForTimeout(5000);

    // Step 10: Capture Transaction ID
    const transactionId = await accountPage.getHtmTransactionId();
    console.log('Transaction ID captured:', transactionId);
    if (!transactionId) {
      console.log('Warning: Transaction ID not captured, proceeding with verification');
    }

    // Step 11: Check for HTM errors
    const hasHtmError = await accountPage.checkHtmError();
    if (hasHtmError) {
      throw new Error('HTM error message detected during transfer');
    }
    console.log('No HTM error found');

    // Step 12: Logout
    console.log('Logging out...');
    await homePage.logout();
    await page.waitForTimeout(5000);

    // Step 13: Login as Verifier
    console.log('Logging in as Verifier...');
    loginPage = new LoginPage(page);
    homePage = new HomePage(page);
    accountPage = new AccountPage(page);

    await loginPage.goto();
    await loginPage.login(VERIFIER_USERNAME, VERIFIER_PASSWORD);
    await page.waitForTimeout(5000);
    await loginPage.handleAlreadyLoggedIn(VERIFIER_USERNAME, VERIFIER_PASSWORD);

    console.log('Selecting Core Server...');
    await accountPage.selectCoreServer();
    await page.waitForTimeout(5000);

    // Step 14: Invoke HTM menu to verify Transaction ID
    console.log('Invoking HTM menu for verification...');
    await accountPage.searchTransactionManagement(CLOSURE_DATA.screens.htm);
    await page.waitForTimeout(3000);

    console.log('Selecting Verify function...');
    await accountPage.selectHtmFunction('V');

    if (transactionId) {
      console.log('Entering Transaction ID for verification:', transactionId);
      await accountPage.enterHtmTransactionId(transactionId);
    } else {
      console.log('Skipping Transaction ID entry (not captured)');
    }

    console.log('Clicking Go button for verification...');
    await accountPage.clickHtmGo();
    await page.waitForTimeout(5000);

    // Step 15: Verify transaction and submit
    console.log('Clicking Verify button...');
    await accountPage.clickHcaacVerify();
    await page.waitForTimeout(3000);

    console.log('Clicking Submit button...');
    await accountPage.clickHtmSubmit();
    await page.waitForTimeout(5000);

    // Step 16: Logout
    console.log('Logging out from verifier...');
    await homePage.logout();
    await page.waitForTimeout(5000);

    // Step 17: Login to Finacle for account closure
    console.log('Logging in for account closure...');
    loginPage = new LoginPage(page);
    homePage = new HomePage(page);
    accountPage = new AccountPage(page);

    await loginPage.goto();
    await loginPage.login(USERNAME, PASSWORD);
    await page.waitForTimeout(5000);
    await loginPage.handleAlreadyLoggedIn(USERNAME, PASSWORD);

    console.log('Selecting Core Server...');
    await accountPage.selectCoreServer();
    await page.waitForTimeout(5000);

    // Step 18: Invoke HCAAC menu
    console.log('Invoking HCAAC menu...');
    await accountPage.searchMenu(CLOSURE_DATA.screens.hcaac);
    await page.waitForTimeout(3000);

    // Step 19: Select function as Z - Close
    console.log('Selecting Z - Close function...');
    await accountPage.selectHcaacFunction('Z');

    // Step 20: Enter A/C ID to close
    console.log('Entering A/C ID to close:', CLOSURE_DATA.accountIdToClose);
    await accountPage.enterHcaacAccountId(CLOSURE_DATA.accountIdToClose);

    // Step 21: Click Transfer checkbox
    console.log('Clicking Transfer checkbox...');
    await accountPage.clickTransferCheckbox();

    // Step 22: Enter Transfer A/C ID
    console.log('Entering Transfer A/C ID:', CLOSURE_DATA.transferAccountId);
    await accountPage.enterTransferAccountId(CLOSURE_DATA.transferAccountId);

    // Step 23: Click Go button
    console.log('Clicking Go button...');
    await accountPage.clickHtmGo();
    await page.waitForTimeout(5000);

    // Step 24: Select Apply interest till date as Yes
    console.log('Selecting Apply interest till date as Yes...');
    await accountPage.selectApplyInterestTillDate('Yes');

    // Step 25: Submit account closure
    console.log('Submitting account closure...');
    await accountPage.clickHtmSubmit();
    await page.waitForTimeout(5000);

    // Step 26: Logout
    console.log('Logging out after closure submission...');
    await homePage.logout();
    await page.waitForTimeout(5000);

    // Step 27: Login to verify and close the account
    console.log('Logging in for final verification...');
    loginPage = new LoginPage(page);
    homePage = new HomePage(page);
    accountPage = new AccountPage(page);

    await loginPage.goto();
    await loginPage.login(VERIFIER_USERNAME, VERIFIER_PASSWORD);
    await page.waitForTimeout(5000);
    await loginPage.handleAlreadyLoggedIn(VERIFIER_USERNAME, VERIFIER_PASSWORD);

    console.log('Selecting Core Server...');
    await accountPage.selectCoreServer();
    await page.waitForTimeout(5000);

    // Step 28: Invoke HCAAC menu to verify
    console.log('Invoking HCAAC menu for verification...');
    await accountPage.searchMenu(CLOSURE_DATA.screens.hcaac);
    await page.waitForTimeout(3000);

    console.log('Selecting Verify function...');
    await accountPage.selectHcaacFunction('V');

    console.log('Entering A/C ID for verification:', CLOSURE_DATA.accountIdToClose);
    await accountPage.enterHcaacAccountId(CLOSURE_DATA.accountIdToClose);

    console.log('Clicking Go button for verification...');
    await accountPage.clickHtmGo();
    await page.waitForTimeout(5000);

    // Step 29: Verify and submit
    console.log('Clicking Verify button...');
    await accountPage.clickHcaacVerify();
    await page.waitForTimeout(3000);

    console.log('Clicking Submit button to close account...');
    await accountPage.clickHtmSubmit();
    await page.waitForTimeout(5000);

    console.log('Account closure completed successfully');

    // Step 30: Logout
    console.log('Final logout...');
    await homePage.logout();
  });
});
