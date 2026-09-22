import { test, expect } from '@playwright/test';
import { getPrimaryConfig } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import COMMON_DATA from '../../../data/common-data.json';
import { getSharedValue, writeSharedState } from '../../helpers/sharedState';
import { getCreatedCif } from '../../config/cifStore';

// Use CIF ID from shared state (written by CRM E2E) if available,
// otherwise fall back to the hardcoded value in common-data.json.
const SHARED_CIF = getSharedValue((state) => state.cifs?.retail?.cifId);
if (SHARED_CIF) console.log(`[SharedState] Using CIF ID from previous run: ${SHARED_CIF}`);

const CONFIG = getPrimaryConfig();

//tags:- end2end,regression,sanity
test.describe('Savings Account Creation', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  let lastDialogMessages: string[] = [];
  let homePage: HomePage;
  let savingsAccountPage: AccountPage;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(900000);
    setupDialogHandlers(page, lastDialogMessages);
    await login(page, CONFIG);

    homePage = new HomePage(page);
    savingsAccountPage = new AccountPage(page);

    // Select Core Server from the solution drop down
    console.log('Selecting Core Server...');
    await savingsAccountPage.selectCoreServer();

    // Navigate to HOAACSB (savings account creation screen)
    console.log('Searching for HOAACSB...');
    await savingsAccountPage.searchMenu('HOAACSB');
  });

  test('create savings account - SVREG scheme', async () => {
    const accountData: any = { ...COMMON_DATA.svregTestData };
    if (SHARED_CIF) accountData.cifCode = SHARED_CIF;
    try {
      console.log(`Creating savings account SVREG (CIF: ${accountData.cifCode})...`);
      await savingsAccountPage.createSavingsAccount(accountData);

      const result = await savingsAccountPage.verifyAccountCreated();
      console.log('Account created:', result.message);
      console.log('Captured Account ID:', result.accountNumber);

      // Persist the generated Account ID for downstream verification specs
      const { updateSharedState } = require('../../helpers/sharedState');
      updateSharedState((state: any) => { state.accountId = result.accountNumber; });

      await homePage.logout();
    } catch (err: any) {
      console.error('Savings account creation test failed:', err);
      console.error(`CIF used: ${accountData.cifCode}`);
      if (lastDialogMessages.length > 0) {
        console.error(`Dialog messages: ${lastDialogMessages.join(' | ')}`);
      }
      throw err;
    }
  });
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
