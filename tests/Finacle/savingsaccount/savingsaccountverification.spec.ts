import { test } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

// Verification is performed by a different user than the one who made the changes
const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;

// Parameterized test: iterates over both savings and current account verification data
for (const acct of COMMON_DATA.accountVerification) {

  test.describe(`Account Verification - ${acct.type}`, () => {
    let homePage: HomePage;
    let accountPage: AccountPage;

    test.beforeEach(async ({ page }) => {
      test.setTimeout(300000);
      ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
      accountPage = new AccountPage(page);
    });

    test(acct.testLabel, async ({ page }) => {
      console.log('Selecting Core Server...');
      await accountPage.selectCoreServer();

      console.log('Searching for HACM...');
      await accountPage.searchMenu('HACM');
      await page.waitForTimeout(3000);

      console.log('Selecting Verify function...');
      await accountPage.selectFunction('Verify');

      console.log(`Entering account ID to verify: ${acct.accountId}...`);
      await accountPage.enterHacmAccountId(acct.accountId);

      console.log('Clicking Go button...');
      await accountPage.clickGo();

      // Visit required tabs
      for (const tab of ['General', 'Interest & Tax', 'Related Party', 'MIS Codes', 'Scheme', 'Addl. Info.']) {
        console.log(`Visiting ${tab} tab...`);
        await accountPage.visitTab(tab);
      }

      // Document tab is mandatory for savings, else Submit is blocked
      if (acct.visitDocumentTab) {
        console.log('Visiting Document details tab...');
        await accountPage.visitTabById('documentdetails');
      }

      console.log('Clicking Submit button...');
      await accountPage.submitForm();

      console.log('Clicking OK button...');
      await accountPage.clickOkButton();

      const statusMessage = await accountPage.getStatusMessage();
      console.log('Verification status message:', statusMessage);

      const result = await accountPage.verifyAccountCreated();
      console.log('Verification Result:', result.message);
      console.log('Account Number:', result.accountNumber);

      console.log('Logging out...');
      await homePage.logout();
    });
  });
}
