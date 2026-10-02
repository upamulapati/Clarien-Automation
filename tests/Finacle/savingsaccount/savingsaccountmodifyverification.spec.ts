import { test, expect } from '@playwright/test';
import { getVerificationConfig } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { getSharedValue } from '../../helpers/sharedState';
import COMMON_DATA from '../../../data/common-data.json';

const VERIFY_CONFIG = getVerificationConfig();

for (const acct of COMMON_DATA.accountVerification) {
  if (acct.type !== 'savings') continue;

  test.describe(`Savings Account Modification Verification - ${acct.type}`, () => {
    test.beforeEach(async () => {
      test.setTimeout(300000);
    });

    test(acct.testLabel, async ({ page }) => {
      const verifyAccountId = getSharedValue('accountId') ?? acct.accountId;
      console.log(`[Verify] Using Account ID: ${verifyAccountId}`);

      const lastDialogMessages: string[] = [];
      setupDialogHandlers(page, lastDialogMessages);

      await login(page, VERIFY_CONFIG);

      const homePage = new HomePage(page);
      const accountPage = new AccountPage(page);

      console.log('Selecting Core Server...');
      await accountPage.selectCoreServer();
      await page.waitForTimeout(3000);

      console.log(`Searching for ${COMMON_DATA.savingsAccount.screens.modifyAndVerify}...`);
      await accountPage.searchMenu(COMMON_DATA.savingsAccount.screens.modifyAndVerify);
      await page.waitForTimeout(3000);

      console.log('Selecting Verify function...');
      await accountPage.selectFunction('Verify');

      console.log('Entering account ID...');
      await accountPage.enterHacmAccountId(verifyAccountId);

      console.log('Clicking Go button...');
      await accountPage.clickGo();
      await page.waitForTimeout(5000);

      console.log('Visiting all HACM verification tabs...');
      for (const tab of ['General', 'Interest & Tax', 'Related Party', 'MIS Codes', 'Scheme', 'Addl. Info.']) {
        await accountPage.visitTab(tab);
      }

      if (acct.visitDocumentTab) {
        console.log('Visiting Document details tab...');
        await accountPage.visitTabById('documentdetails');
      }

      console.log('Clicking Submit button...');
      await accountPage.submitForm();

      console.log('Capturing verification result...');
      const result = await accountPage.verifyAccountCreated();
      console.log('Verification status message:', result.message);
      console.log('Verified Account ID:', result.accountNumber);

      await accountPage.clickOkButton();

      const verifiedAccountId = result.accountNumber || verifyAccountId;
      expect(result.success, `Expected successful verification but got: ${result.message}`).toBe(true);
      expect(result.message).toMatch(/verified|successful|modified|completed/i);
      expect(verifiedAccountId).toBeTruthy();

      console.log('Logging out...');
      await homePage.logout();
    });
  });
}

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
