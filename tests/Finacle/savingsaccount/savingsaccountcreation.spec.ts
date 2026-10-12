import { test, expect } from '@playwright/test';
import { getPrimaryConfig } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { getSharedValue, updateSharedState } from '../../helpers/sharedState';
import { SAVINGS_DATA, DEFAULT_CUSTOMER } from '../../config/excelTestData';

// Use CIF ID from shared state (written by CRM E2E) if available,
// otherwise fall back to the hardcoded value in common-data.json.
const SHARED_CIF = getSharedValue((state) => state.cifs?.retail?.cifId);
if (SHARED_CIF) console.log(`[SharedState] Using CIF ID from previous run: ${SHARED_CIF}`);

const CONFIG = getPrimaryConfig({ username: 'finacletest5' });
// SAVINGS_DATA and DEFAULT_CUSTOMER are loaded from savingsTestData.ts.

const SCENARIOS = SAVINGS_DATA.map((entry: any, index: number) => {
  const scheme = entry.schemeCode ?? 'random';
  const data = {
    ...DEFAULT_CUSTOMER,
    ...entry,
    functionOption: entry.functionOption ?? DEFAULT_CUSTOMER.functionOption ?? 'O',
    ccy: entry.currency ?? DEFAULT_CUSTOMER.ccy,
    cifCode: entry.cifCode ?? entry.cif ?? SHARED_CIF ?? DEFAULT_CUSTOMER.cifCode,
    dispatchMode: entry.dispatchMode ?? DEFAULT_CUSTOMER.dispatchMode ?? 'post',
  };
  return { name: `${scheme}-${data.ccy}-${index}`, data };
});

//tags:- end2end,regression,sanity
test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

for (const scenario of SCENARIOS) {
  test(`HOAACSB - create savings account (${scenario.name})`, async ({ page }) => {
    test.setTimeout(900000);
    const lastDialogMessages: string[] = [];
    setupDialogHandlers(page, lastDialogMessages);
    try {
      await login(page, CONFIG);

      const homePage = new HomePage(page);
      const savingsAccountPage = new AccountPage(page);

      // Select Core Server from the solution drop down
      console.log('Selecting Core Server...');
      await savingsAccountPage.selectCoreServer();

      // Navigate to HOAACSB (savings account creation screen)
      console.log('Searching for HOAACSB...');
      await savingsAccountPage.searchMenu('HOAACSB');

      console.log(`Creating savings account ${scenario.name} (CIF: ${scenario.data.cifCode})...`);
      await savingsAccountPage.createSavingsAccount(scenario.data as any);

      const result = await savingsAccountPage.verifyAccountCreated();
  console.log('Exact result message:', result.message);
  expect(result.success, `Expected success but got: ${result.message}`).toBe(true);
  expect(result.message).toBeTruthy();
      console.log('Account created:', result.message);
  expect(result.message).toBeTruthy();
  expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated|New A\/c\.?\s*ID|Account Number|Account No)/i);
      console.log('Captured Account ID:', result.accountNumber);
  expect(result.accountNumber).toBeTruthy();

      // Persist the generated Account ID for downstream verification specs
      const instanceKey = scenario.data.instance != null ? String(scenario.data.instance) : undefined;
      updateSharedState((state) => {
        if (!state.savingsAccounts) state.savingsAccounts = {};
        state.savingsAccounts[scenario.name] = result.accountNumber ?? '';
        if (instanceKey) state.savingsAccounts[instanceKey] = result.accountNumber ?? '';
        state.accountId = result.accountNumber ?? '';
      });

      await homePage.logout();
    } catch (err: any) {
      console.error(`Savings account creation test failed for ${scenario.name}:`, err);
      console.error(`CIF used: ${scenario.data.cifCode}`);
      if (lastDialogMessages.length > 0) {
        console.error(`Dialog messages: ${lastDialogMessages.join(' | ')}`);
      }
      throw err;
    }
  });
}

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
