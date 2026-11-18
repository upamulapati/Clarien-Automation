import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import {
  getInstanceAccountId,
  saveInstanceResult,
  updateInstanceStatus,
  getSuiteName,
  isDownstreamEligible,
  markInstanceSkipped,
} from '../../helpers/sharedState';
import { SAVINGS_DATA, DEFAULT_CUSTOMER } from '../../config/excelTestData';
import { getSelectedInstances } from '../../helpers/flowStepData';
import { tagInstance } from '../../helpers/instance';
import { CREDENTIALS } from '../../../data/credentials';

// SAVINGS_DATA and DEFAULT_CUSTOMER are loaded from savingsTestData.ts.
const { username: USERNAME, password: PASSWORD } = CREDENTIALS.verifierCredentials;
const SUITE_NAME = getSuiteName('savingsAccount');

const selectedInstances = getSelectedInstances();
const selectedSet = selectedInstances ? new Set(selectedInstances) : null;

const RAW_SCENARIOS = SAVINGS_DATA.filter((entry: any) => {
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

// Eligibility is checked at test runtime so the spec can be collected before
// the upstream creation spec has executed. This supports both the orchestrator
// (which runs specs in separate processes) and a single Playwright run over the
// whole savings account folder.
const SCENARIOS = RAW_SCENARIOS;

test.describe('Savings Account Verification', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  for (const scenario of SCENARIOS) {
    test(`HOAACVSB - verify savings account (${scenario.name}) [instance:${scenario.instance}]`, async ({ page }) => {
      tagInstance(scenario.instance);
      test.setTimeout(900000);
      const instanceKey = scenario.instance != null ? String(scenario.instance) : undefined;

      // Skip verification when the upstream creation instance did not pass.
      if (!isDownstreamEligible(scenario.instance, SUITE_NAME)) {
        markInstanceSkipped(scenario.instance, 'Upstream Flow Failed', SUITE_NAME);
        test.skip(true, 'Upstream Flow Failed');
      }

      try {
        const accountId = getInstanceAccountId(scenario.instance, SUITE_NAME) ?? '';
        console.log(`[Verify] Using Account ID: ${accountId} for ${scenario.name} (instance:${scenario.instance})`);
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

        if (instanceKey && verifiedAccountId) {
          saveInstanceResult(
            instanceKey,
            { status: 'passed', accountId: verifiedAccountId },
            SUITE_NAME
          );
        }

        // Logout
        console.log('Logging out...');
        await homePage.logout();
      } catch (err: any) {
        if (instanceKey) {
          updateInstanceStatus(
            instanceKey,
            'failed',
            err?.message || String(err),
            SUITE_NAME
          );
        }
        throw err;
      }
    });
  }
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
