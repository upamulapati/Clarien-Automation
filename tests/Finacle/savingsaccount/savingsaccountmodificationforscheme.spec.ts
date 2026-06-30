import { test } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// Parameterized test: iterates over both savings and current account scheme modification data
for (const acct of COMMON_DATA.schemeModification) {

  test.describe(`Scheme Modification - ${acct.type}`, () => {
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

      console.log('Selecting Modify function...');
      await accountPage.selectFunction('Modify');

      console.log(`Entering account ID to modify: ${acct.accountId}...`);
      await accountPage.enterHacmAccountId(acct.accountId);

      console.log('Clicking Go button...');
      await accountPage.clickGo();

      console.log('Visiting Scheme tab...');
      await accountPage.visitTab('Scheme');

      console.log('Setting A/c status to inactive...');
      await accountPage.selectAccountStatus('inactive');

      console.log('Clicking Submit button...');
      await accountPage.submitForm();

      const result = await accountPage.verifyAccountCreated();
      console.log('Modification Result:', result.message);
      console.log('Account Number:', result.accountNumber);

      console.log('Logging out...');
      await homePage.logout();
    });
  });
}
