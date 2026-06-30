import { test } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

// Account unfreeze (HAFSM) is performed by FINACLETEST13.
const USERNAME = CREDENTIALS.thirdCredentials.username;
const PASSWORD = CREDENTIALS.thirdCredentials.password;

// Parameterized test: iterates over both savings and current account unfreeze data
for (const acct of COMMON_DATA.accountUnfreeze) {

  test.describe(`Account Unfreeze - ${acct.type}`, () => {
    let homePage: HomePage;
    let accountPage: AccountPage;

    test.beforeEach(async ({ page }) => {
      test.setTimeout(300000);
      ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
      accountPage = new AccountPage(page);
    });

    test(acct.testLabel, async ({ page }) => {
      console.log(`Unfreezing Account ID: ${acct.accountId}`);

      console.log('Selecting Core Server...');
      await accountPage.selectCoreServer();

      console.log('Searching for HAFSM...');
      await accountPage.searchMenu('HAFSM');
      await page.waitForTimeout(3000);

      console.log('Selecting Unfreeze function...');
      await accountPage.selectFunction('Unfreeze');

      console.log(`Entering account ID to unfreeze: ${acct.accountId}...`);
      await accountPage.enterHacmAccountId(acct.accountId);

      console.log('Clicking Go button...');
      await accountPage.clickGo();

      console.log('Selecting account row checkbox...');
      await accountPage.selectAccountRowCheckbox();

      console.log('Clicking Submit button...');
      await accountPage.submitForm();

      console.log('Clicking OK button...');
      await accountPage.clickOkButton();

      const statusMessage = await accountPage.getStatusMessage();
      console.log('Unfreeze status message:', statusMessage);

      console.log('Logging out...');
      await homePage.logout();
    });
  });
}
