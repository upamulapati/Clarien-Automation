import { test, expect } from '@playwright/test';
import { getPrimaryConfig } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { getSharedValue, updateSharedState } from '../../helpers/sharedState';
import { SAVINGS_DATA, DEFAULT_CUSTOMER } from '../../config/excelTestData';
import FLOW7_DATA from '../../../data/flow7.json';

// Use CIF ID from shared state (written by CRM E2E) if available,
// otherwise fall back to the hardcoded value in common-data.json.
const SHARED_CIF = getSharedValue((state) => state.cifs?.retail?.cifId);
if (SHARED_CIF) console.log(`[SharedState] Using CIF ID from previous run: ${SHARED_CIF}`);

const CONFIG = getPrimaryConfig({ username: 'finacletest5' });
// SAVINGS_DATA and DEFAULT_CUSTOMER are loaded from savingsTestData.ts.

const groups: { main: any; related: any[] }[] = [];
let activeGroup: { main: any; related: any[] } | null = null;

for (const entry of SAVINGS_DATA) {
  const row = entry.data ?? entry;
  const sheet = String(row.Sheet || '').trim().toLowerCase();
  const isRelated = sheet === 'related party' || sheet === 'relatedparty';

  if (isRelated) {
    if (activeGroup) {
      activeGroup.related.push(row);
    } else {
      console.warn('Related Party row before first Main row, skipping:', row);
    }
    continue;
  }

  activeGroup = { main: row, related: [] };
  groups.push(activeGroup);
}

const SCENARIOS: any[] = [];
let idx = 0;
for (const group of groups) {
  const mainData = group.main;
  const pricingCode = String(mainData.externalSystemPricingFor || '').split('-')[0].trim().toUpperCase();
  const isPricingNone = pricingCode === 'N';
  const data = {
    ...DEFAULT_CUSTOMER,
    ...mainData,
    functionOption: mainData.functionOption ?? DEFAULT_CUSTOMER.functionOption ?? 'O',
    ccy: mainData.currency ?? DEFAULT_CUSTOMER.ccy,
    cifCode: mainData.cifCode ?? mainData.cif ?? SHARED_CIF ?? DEFAULT_CUSTOMER.cifCode,
    dispatchMode: mainData.dispatchMode ?? DEFAULT_CUSTOMER.dispatchMode ?? 'post',
    externalSystemPricing: mainData.externalSystemPricing ?? (mainData.externalSystemPricingFor ? 'Y' : DEFAULT_CUSTOMER.externalSystemPricing ?? 'N'),
    relationshipPricingId: isPricingNone ? undefined : (mainData.relationshipPricingId ?? DEFAULT_CUSTOMER.relationshipPricingId),
    pricingEffectiveDate: isPricingNone ? undefined : (mainData.pricingEffectiveDate ?? DEFAULT_CUSTOMER.pricingEffectiveDate),
    pricingReviewDate: isPricingNone ? undefined : (mainData.pricingReviewDate ?? DEFAULT_CUSTOMER.pricingReviewDate),
  };
  const scheme = mainData.schemeCode ?? 'random';
  SCENARIOS.push({
    name: `${scheme}-${data.ccy}-${idx}`,
    data,
    relatedParties: group.related,
    instance: mainData.instance,
  });
  idx++;
}

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
      await savingsAccountPage.createSavingsAccount(scenario.data as any, { skipGeneralDetailsRevisit: true, relatedParties: scenario.relatedParties });

      const result = await savingsAccountPage.verifyAccountCreated();
      console.log('Exact result message:', result.message);
      expect(result.success, `Expected success but got: ${result.message}`).toBe(true);
      expect(result.message).toBeTruthy();
      console.log('Account created:', result.message);
      expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated|New A\/c\.?\s*ID|Account Number|Account No)/i);
      console.log('Captured Account ID:', result.accountNumber);
      expect(result.accountNumber).toBeTruthy();

      const hasRelatedParties = (scenario.data.jointHolders && scenario.data.jointHolders.length > 0) || scenario.data.relatedPartyCif;
      if (hasRelatedParties) {
        const relatedResult = await savingsAccountPage.addRelatedPartiesToSavingsAccount(
          result.accountNumber as string,
          scenario.data as any
        );
        expect(relatedResult.success, `Expected related party addition to succeed but got: ${relatedResult.message}`).toBe(true);
        console.log('Related party result:', relatedResult.message);
      }

      // Persist the generated Account ID for downstream verification specs
      const instanceKey = scenario.data.instance != null ? String(scenario.data.instance) : undefined;
      updateSharedState((state) => {
        if (!state.savingsAccounts) state.savingsAccounts = {};
        state.savingsAccounts[scenario.name] = result.accountNumber ?? '';
        if (instanceKey) state.savingsAccounts[instanceKey] = result.accountNumber ?? '';
        state.accountId = result.accountNumber ?? '';
        if (hasRelatedParties) {
          state.relatedPartyAddedForSavings = true;
        }
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
