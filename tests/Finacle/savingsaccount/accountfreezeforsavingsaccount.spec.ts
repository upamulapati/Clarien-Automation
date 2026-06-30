import { test } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

// Account freeze (HAFSM) is performed by FINACLETEST13.
const USERNAME = CREDENTIALS.thirdCredentials.username;
const PASSWORD = CREDENTIALS.thirdCredentials.password;

// Total Freeze + reason code 31015 (CDD required).
const FREEZE_CODE = 'Total Freeze';
const FREEZE_REASON_CODE = '31015';

// Parameterized test: iterates over both savings and current account freeze data
for (const acct of COMMON_DATA.accountFreeze) {

  test.describe(`Account Freeze - ${acct.type}`, () => {
    let homePage: HomePage;
    let accountPage: AccountPage;

    test.beforeEach(async ({ page }) => {
      test.setTimeout(300000);
      ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
      accountPage = new AccountPage(page);
    });

    test(acct.testLabel, async ({ page }) => {
      console.log(`Marking freeze on Account ID: ${acct.accountId}`);

      console.log('Selecting Core Server...');
      await accountPage.selectCoreServer();

      console.log('Searching for HAFSM...');
      await accountPage.searchMenu('HAFSM');
      await page.waitForTimeout(3000);

      console.log('Selecting Freeze function...');
      await accountPage.selectFunction('Freeze');

      console.log(`Entering account ID to freeze: ${acct.accountId}...`);
      await accountPage.enterHacmAccountId(acct.accountId);

      console.log('Selecting freeze code (Total Freeze)...');
      await accountPage.selectFreezeCode(FREEZE_CODE);

      console.log('Selecting freeze reason code 31015 (CDD required)...');
      await accountPage.selectFreezeReasonCode(FREEZE_REASON_CODE);

      console.log('Clicking Go button...');
      await accountPage.clickGo();

      console.log('Selecting account row checkbox...');
      await accountPage.selectAccountRowCheckbox();

      console.log('Clicking Submit button...');
      await accountPage.submitForm();

      const statusMessage = await accountPage.getStatusMessage();
      console.log('Freeze status message:', statusMessage);

      console.log('Logging out...');
      await homePage.logout();
    });
  });
}
