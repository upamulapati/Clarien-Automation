import { test, expect } from '@playwright/test';
import { getVerificationConfig } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { getSharedValue } from '../../helpers/sharedState';
import SAVINGS_DATA from '../../../data/savings-account-test-data.json';
import COMMON_DATA from '../../../data/common-data.json';

const DEFAULT_CUSTOMER = COMMON_DATA.defaultCustomer;
const VERIFY_CONFIG = getVerificationConfig();

const SCENARIOS = SAVINGS_DATA.map((entry: any, index: number) => {
  const scheme = entry.schemeCode ?? 'random';
  const ccy = entry.currency ?? DEFAULT_CUSTOMER.ccy;
  return { name: `${scheme}-${ccy}-${index}` };
});

test.describe('Savings Account Verification', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  for (const scenario of SCENARIOS) {
    test(`HOAACVSB - verify savings account (${scenario.name})`, async ({ page }) => {
      test.setTimeout(900000);

      const accountId = getSharedValue((state) => state.savingsAccounts?.[scenario.name]) ?? '';
      console.log(`[Verify] Using Account ID: ${accountId} for ${scenario.name}`);
      expect(accountId, `Created account ID for ${scenario.name} must be available`).toBeTruthy();

      const lastDialogMessages: string[] = [];
      setupDialogHandlers(page, lastDialogMessages);

      await login(page, VERIFY_CONFIG);

      const homePage = new HomePage(page);
      const savingsAccountPage = new AccountPage(page);

      // Select Core Server from the solution drop down
      console.log('Selecting Core Server...');
      await savingsAccountPage.selectCoreServer();
      await page.waitForTimeout(5000);

      // Search for HOAACVSB (verification screen)
      console.log('Searching for HOAACVSB (verification screen)...');
      await savingsAccountPage.searchVerificationScreen('HOAACVSB');
      await page.waitForTimeout(3000);

      // Function - V - Verify
      console.log('Selecting verify function option...');
      await savingsAccountPage.selectVerifyFunction();

      // Temporary a/c id - the generated savings account number
      console.log('Entering temporary account ID...');
      await savingsAccountPage.enterTemporaryAccountId(accountId);

      // Click Go to load the account into the verification screen
      console.log('Clicking Go button...');
      await savingsAccountPage.acceptButton.click();
      await page.waitForTimeout(5000);

      // Navigate through all tabs
      console.log('Navigating through all tabs...');
      await savingsAccountPage.navigateAllTabs();

      // Document tab is mandatory on the verification screen, else Submit
      // is blocked with "Document Details: Visit document information."
      console.log('Visiting Document details tab...');
      await savingsAccountPage.visitTabById('documentdetails');

      // Click Submit - the account opening gets authorised/verified
      console.log('Clicking Submit button...');
      await savingsAccountPage.clickSubmit();

      // If a Warning & Exception popup appears, click Accept to continue.
      await savingsAccountPage.acceptWarningPopup();

      // Capture the actual Finacle status message after verification
      const statusMessage = await savingsAccountPage.getStatusMessage();
      console.log('Verification status message:', statusMessage);

      // Logout
      console.log('Logging out...');
      await homePage.logout();
    });
  }
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
