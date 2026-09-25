import { test, expect } from '@playwright/test';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import COMMON_DATA from '../../../data/common-data.json';
import { getCif, updateSharedState, saveCif } from '../../helpers/sharedState';

// Use CIF ID from shared state (written by CRM E2E) if available,
// otherwise fall back to the hardcoded value in common-data.json.
const SHARED_CIF = getCif('retail');
if (SHARED_CIF) console.log(`[SharedState] Using CIF ID from previous run: ${SHARED_CIF}`);

// Use credentials from common-data.json
const CONFIG = {
  baseUrl: 'https://clrnuat.clarienbank.com/fininfra/ui/SSOLogin.jsp',
  username: COMMON_DATA.credentials.username,
  password: COMMON_DATA.credentials.password,
  timeouts: {
    veryShort: 1000,
    short: 2000,
    short3: 3000,
    medium: 5000,
    medium4: 4000,
    long: 10000,
    long15: 15000,
    popupLoad: 30000,
    formLoad: 60000,
    crmLoad: 120000,
    testTimeout: 900000
  }
};

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
    const accountData = { ...COMMON_DATA.svregTestData, ccy: 'BMD', solId: '202' };
    if (SHARED_CIF) accountData.cifCode = SHARED_CIF;
    console.log(`Creating savings account SVREG (CIF: ${accountData.cifCode}, CCY: ${accountData.ccy}, SOL: ${accountData.solId})...`);
    await savingsAccountPage.createSavingsAccount(accountData);

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
    if (result.accountNumber) {
      updateSharedState((state) => {
        state.accountId = result.accountNumber!;
      });
    }

    // Persist the CIF used so downstream CIF modification specs use the same customer
    if (accountData.cifCode) {
      saveCif('retail', accountData.cifCode);
    }

    await homePage.logout();
  });
});
