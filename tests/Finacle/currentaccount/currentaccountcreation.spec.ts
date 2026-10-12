import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';
import { writeSharedState, updateSharedState } from '../../helpers/sharedState';
import { CURRENT_ACCOUNT_DATA, DEFAULT_CUSTOMER } from '../../config/excelTestData';
import COMMON_DATA from '../../../data/common-data.json';
import FLOW6_DATA from '../../../data/flow6.json';
import FLOW9_DATA from '../../../data/flow9.json';

const IS_FLOW9 = process.env.CIF_MOD_FLOW === 'flow9';
const FLOW_DATA = IS_FLOW9 ? (FLOW9_DATA as any) : FLOW6_DATA;
const IS_EXCEL = CURRENT_ACCOUNT_DATA.length > 0;

// Current account creation (HOAACCA) is performed by the maker user. This spec
// contains ONLY account creation - verification lives in
// current-account verification specs.
const USERNAME = 'finacletest5';
const PASSWORD = CREDENTIALS.credentials.password;

// Current account opening (HOAACCA) menu option.
const CURRENT_ACCOUNT_MENU = COMMON_DATA.currentAccount.screens.create;

const EXCEL_SCENARIOS = CURRENT_ACCOUNT_DATA.map((entry: any, index: number) => {
  const scheme = entry.schemeCode ?? 'unknown';
  const data = {
    ...DEFAULT_CUSTOMER,
    ...entry,
    functionOption: entry.functionOption ?? DEFAULT_CUSTOMER.functionOption,
    ccy: entry.currency ?? entry.ccy ?? DEFAULT_CUSTOMER.ccy,
    cifCode: entry.cifCode ?? entry.cif ?? DEFAULT_CUSTOMER.cifCode,
    dispatchMode: entry.dispatchMode ?? DEFAULT_CUSTOMER.dispatchMode,
    schemeCode: entry.schemeCode,
  };
  return { name: `${scheme}-${data.ccy}-${index}`, instance: entry.instance ?? index, data };
});

const LEGACY_SCENARIOS = [
  {
    name: FLOW_DATA.currentAccounts[0].schemeCode,
    data: {
      ...FLOW_DATA.currentAccounts[0],
      ccy: FLOW_DATA.currentAccounts[0].currency,
      cifCode: FLOW_DATA.cifId,
      schemeCode: FLOW_DATA.currentAccounts[0].schemeCode,
      dispatchMode: FLOW_DATA.currentAccounts[0].dispatchMode,
    },
  },
];

const SCENARIOS = (IS_EXCEL ? EXCEL_SCENARIOS : LEGACY_SCENARIOS) as any[];

let homePage: HomePage;
let currentAccountPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);

  // Step 1: Login with the maker credentials
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  currentAccountPage = new AccountPage(page);

  // Step 2: Select Core Server from the solution drop down
  console.log('Selecting Core Server...');
  await currentAccountPage.selectCoreServer();

  // Step 3: Type menu option HOAACCA in Finacle
  console.log(`Searching for ${CURRENT_ACCOUNT_MENU}...`);
  await currentAccountPage.searchMenu(CURRENT_ACCOUNT_MENU);
});

// Open current account(s) (HOAACCA) and capture the generated A/c ID(s).
for (const scenario of SCENARIOS) {
  test(`create current account - scheme ${scenario.name}`, async () => {
    // Function- Open, Currency- BMD, Sol id 100, CIF Id and scheme code, Go;
    // visit General/Interest/Scheme/Related Party/MIS/Account Limits tabs;
    // submit to generate the account number.
    console.log(`Creating current account with scheme ${scenario.name}...`);
    const accountData = scenario.data;

    await currentAccountPage.createCurrentAccount(accountData);

    const statusMessage = await currentAccountPage.getStatusMessage();
    console.log('Creation status message:', statusMessage);

    const result = await currentAccountPage.verifyAccountCreated();
    console.log('Exact result message:', result.message);

    if (!result.success) {
      console.error('Current account creation failed. Exact error message:', result.message);
      console.error('Captured fields:', JSON.stringify(result.allFields, null, 2));
    }

    expect(result.success, `Expected success but got: ${result.message}`).toBe(true);
    expect(result.message).toBeTruthy();
    console.log(`Account created for scheme ${scenario.name}:`, result.message);
    const accountId = result.accountNumber;
    if (!accountId) {
      throw new Error(`Failed to capture account ID for scheme ${scenario.name}`);
    }
    console.log(`Captured Account ID (scheme ${scenario.name}): ${accountId}`);
    writeSharedState({ accountId });

    // Persist the generated current account number(s) so downstream specs can use it.
    const instanceKey = scenario.instance != null ? String(scenario.instance) : undefined;
    updateSharedState((state) => {
      state.accountId = accountId;
      if (!state.currentAccounts) state.currentAccounts = {};
      state.currentAccounts[scenario.name] = accountId;
      if (instanceKey) state.currentAccounts[instanceKey] = accountId;
    });

    // Logout the maker
    console.log('Logging out...');
    await homePage.logout();
  });
}

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
