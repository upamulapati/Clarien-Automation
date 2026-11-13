import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { getSharedValue, updateSharedState } from '../../helpers/sharedState';
import { SAVINGS_DATA, DEFAULT_CUSTOMER } from '../../config/excelTestData';
import { getSelectedInstances } from '../../helpers/flowStepData';
import { CREDENTIALS } from '../../../data/credentials';

// SAVINGS_DATA and DEFAULT_CUSTOMER are loaded from savingsTestData.ts.
const { username: USERNAME, password: PASSWORD } = CREDENTIALS.verifierCredentials;

const selectedInstances = getSelectedInstances();
const selectedSet = selectedInstances ? new Set(selectedInstances) : null;

const SCENARIOS = SAVINGS_DATA.filter((entry: any) => {
  const entryData = entry.data ?? entry;
  // Ignore related-party rows; verification runs only against the main account rows.
  const sheet = String(entryData.Sheet || '').trim().toLowerCase();
  if (sheet === 'related party' || sheet === 'relatedparty') return false;
  if (selectedSet) {
    const instance = String(entryData.instance ?? entry.instance ?? '').trim();
    return selectedSet.has(instance);
  }
  return true;
}).map((entry: any, index: number) => {
  const entryData = entry.data ?? entry;
  const scheme = entryData.schemeCode ?? 'random';
  const ccy = entryData.currency ?? DEFAULT_CUSTOMER.ccy;
  return { name: `${scheme}-${ccy}-${index}`, instance: entryData.instance ?? entry.instance ?? index };
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
      const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD, lastDialogMessages);
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

      console.log('Capturing General Details field values for verification...');
      await savingsAccountPage.visitGeneralDetailsTab();
      await savingsAccountPage.captureSavingsFieldDiagnostics();

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

      // Verification must produce an explicit success/authorised message.
      const successKeywords = /\b(successfully|posted|completed|authorised|authorized|verified|approved|modified|deleted|created|added|disbursed|generated)\b/i;
      const errorKeywords = /\b(failed|failure|error|invalid|cannot|not\s+posted|unsuccessful|rejected|visit)\b/i;
      const bodyText = await page.locator('body').innerText().catch(() => '');
      expect(
        statusMessage,
        `Expected a verification success message for ${scenario.name}, but got: ${statusMessage}\n\nBody text:\n${bodyText.substring(0, 1500)}`
      ).toBeTruthy();
      expect(statusMessage, `Verification status for ${scenario.name} contains an error/visit prompt`).not.toMatch(errorKeywords);
      expect(statusMessage, `Verification status for ${scenario.name} does not indicate success`).toMatch(successKeywords);

      // After verification the permanent account number is shown; persist it.
      const verifiedAccountId = await savingsAccountPage.getAccountId();
      console.log('Verified Account ID:', verifiedAccountId);
      expect(verifiedAccountId, `Verified account ID for ${scenario.name} must be a real account number`).toMatch(/^\d{6,}$/);
      if (verifiedAccountId) {
        const instanceKey = scenario.instance != null ? String(scenario.instance) : undefined;
        updateSharedState((state) => {
          state.savingsAccounts ??= {};
          state.savingsAccounts[scenario.name] = verifiedAccountId;
          if (instanceKey) state.savingsAccounts[instanceKey] = verifiedAccountId;
          state.accountId = verifiedAccountId;
        });
      }

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
