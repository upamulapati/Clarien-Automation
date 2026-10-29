import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';
import { writeSharedState, updateSharedState } from '../../helpers/sharedState';
import { CURRENT_ACCOUNT_DATA, DEFAULT_CUSTOMER } from '../../config/excelTestData';
import COMMON_DATA from '../../../data/common-data.json';
import { writeFileSync } from 'fs';

// Current account creation (HOAACCA) is performed by the maker user. This spec
// is fully data-driven from the CurrentAccountData sheet in test-data.xlsx.
const USERNAME = 'finacletest5';
const PASSWORD = CREDENTIALS.credentials.password;

const CURRENT_ACCOUNT_MENU = COMMON_DATA.currentAccount.screens.create;

const groups: { main: any; related: any[] }[] = [];
let activeGroup: { main: any; related: any[] } | null = null;

for (const entry of CURRENT_ACCOUNT_DATA) {
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
  const data: any = {
    ...DEFAULT_CUSTOMER,
    ...mainData,
    functionOption: mainData.functionOption ?? DEFAULT_CUSTOMER.functionOption,
    ccy: mainData.currency ?? mainData.ccy ?? DEFAULT_CUSTOMER.ccy,
    cifCode: mainData.cifCode ?? mainData.cif ?? DEFAULT_CUSTOMER.cifCode,
    dispatchMode: mainData.dispatchMode ?? DEFAULT_CUSTOMER.dispatchMode,
    statementFrequency: mainData['Statement Frequency'] ?? mainData.statementFrequency ?? DEFAULT_CUSTOMER.statementFrequency,
    schemeCode: mainData.schemeCode,
  };
  const scheme = mainData.schemeCode ?? 'unknown';
  SCENARIOS.push({
    name: `${scheme}-${data.ccy}-${idx}`,
    data,
    relatedParties: group.related,
    instance: mainData.instance,
  });
  idx++;
}

if (SCENARIOS.length === 0) {
  throw new Error('No current account scenarios found in CurrentAccountData sheet. Verify excelTestData.ts is loading the sheet.');
}

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

function generateValidationReport(data: any, tabs: any[]): string {
  const norm = (s: string) =>
    String(s ?? '')
      .toLowerCase()
      .replace(/\s*\/\s*c\.?\s*/g, 'account')
      .replace(/[^a-z0-9]/g, '');

  const dataKeys = Object.keys(data).filter(
    (k) => data[k] != null && String(data[k]).trim() !== '' && !['Sheet', 'instance', 'enabled'].includes(k)
  );
  const usedKeys = new Set<string>();
  let report = '# HOAACCA Field Validation Report\n\n';
  let total = 0, pass = 0, fail = 0, unmapped = 0;

  for (const tab of tabs) {
    report += `## ${tab.tab}\n\n`;
    report += '| Excel Key | Expected | UI Label | UI Value | Status |\n';
    report += '|-----------|----------|----------|----------|--------|\n';
    for (const f of tab.fields) {
      const fNorm = norm(f.label || f.id || f.name);
      let matchKey: string | undefined;
      let bestScore = 0;
      for (const k of dataKeys) {
        if (usedKeys.has(k)) continue;
        const kNorm = norm(k);
        if (!kNorm) continue;
        if (fNorm.includes(kNorm) || kNorm.includes(fNorm)) {
          const score = Math.min(fNorm.length, kNorm.length);
          if (score > bestScore) {
            bestScore = score;
            matchKey = k;
          }
        }
      }
      const expected = matchKey ? String(data[matchKey]).trim() : '';
      const actual = String(f.value).trim();
      const code = expected.split('-')[0].trim().toLowerCase();
      let status = 'unmapped';
      if (matchKey) {
        usedKeys.add(matchKey);
        total++;
        if (actual === '' || actual.toLowerCase() === 'select') {
          status = 'not set';
          fail++;
        } else if (
          actual.toLowerCase().includes(expected.toLowerCase()) ||
          expected.toLowerCase().includes(actual.toLowerCase()) ||
          actual.toLowerCase().startsWith(code)
        ) {
          status = 'pass';
          pass++;
        } else {
          status = 'fail';
          fail++;
        }
      }
      const label = (f.label || f.id || f.name || '').replace(/\\|/g, '\\\\|');
      report += `| ${matchKey ?? ''} | ${expected.replace(/\\|/g, '\\\\|')} | ${label} | ${actual.replace(/\\|/g, '\\\\|')} | ${status} |\n`;
    }
    report += '\n';
  }

  const missingExcel = dataKeys.filter((k) => !usedKeys.has(k));
  if (missingExcel.length) {
    report += '## Unmapped Excel Columns (non-empty)\n\n';
    report += '| Excel Key | Expected |\n|-----------|----------|\n';
    for (const k of missingExcel) {
      report += `| ${k} | ${String(data[k]).trim().replace(/\\|/g, '\\\\|')} |\n`;
    }
    unmapped = missingExcel.length;
    report += '\n';
  }

  report += `## Summary\n\n- Matched fields: ${total}\n- Passed: ${pass}\n- Failed / Not set: ${fail}\n- Unmapped Excel columns: ${unmapped}\n`;
  return report;
}

for (const scenario of SCENARIOS) {
  test(`HOAACCA - create current account (${scenario.name})`, async ({ page }) => {
    test.setTimeout(900000);

    try {
      await loginToFinacle(page, USERNAME, PASSWORD);
      const homePage = new HomePage(page);
      const currentAccountPage = new AccountPage(page);

      console.log('Selecting Core Server...');
      await currentAccountPage.selectCoreServer();

      console.log(`Searching for ${CURRENT_ACCOUNT_MENU}...`);
      await currentAccountPage.searchMenu(CURRENT_ACCOUNT_MENU);

      console.log(`Creating current account ${scenario.name} (CIF: ${scenario.data.cifCode})...`);
      await currentAccountPage.createCurrentAccount(scenario.data as any);

      const tabReports = await currentAccountPage.getTabReports();
      const report = generateValidationReport(scenario.data, tabReports);
      writeFileSync('test-results/hoaacca-validation-report.md', report);

      const result = await currentAccountPage.verifyAccountCreated();
      console.log('Exact result message:', result.message);

      if (!result.success) {
        console.error('Current account creation failed. Exact error message:', result.message);
        console.error('Captured fields:', JSON.stringify(result.allFields, null, 2));
      }

      expect(result.success, `Expected success but got: ${result.message}`).toBe(true);
      expect(result.message).toBeTruthy();
      console.log('Account created:', result.message);
      expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated|New A\/c\.?\s*ID|Account Number|Account No)/i);
      console.log('Captured Account ID:', result.accountNumber);
      expect(result.accountNumber).toBeTruthy();

      const instanceKey = scenario.data.instance != null ? String(scenario.data.instance) : undefined;
      writeSharedState({ accountId: result.accountNumber });
      updateSharedState((state) => {
        state.accountId = result.accountNumber;
        if (!state.currentAccounts) state.currentAccounts = {};
        state.currentAccounts[scenario.name] = result.accountNumber ?? '';
        if (instanceKey) state.currentAccounts[instanceKey] = result.accountNumber ?? '';
      });

      console.log('Logging out...');
      await homePage.logout();
    } catch (err: any) {
      console.error(`Current account creation test failed for ${scenario.name}:`, err);
      console.error(`CIF used: ${scenario.data.cifCode}`);
      throw err;
    }
  });
}

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
