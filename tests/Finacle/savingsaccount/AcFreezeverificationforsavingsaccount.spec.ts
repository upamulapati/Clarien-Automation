import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

// Verification must be done by a DIFFERENT user than the one who marked the freeze.
const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

const EXCEL_PATH = path.resolve('data', 'test-data.xlsx');
const FREEZE_VERIFY_SHEET_NAME = 'SavingsAccountFreezeVerifyData';

interface SavingsAccountFreezeVerifyRow {
  instance: string;
  accountId: string;
  testLabel: string;
}

function loadSavingsAccountFreezeVerifyData(): SavingsAccountFreezeVerifyRow[] {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`Excel file not found: ${EXCEL_PATH}`);
  }
  const workbook = XLSX.readFile(EXCEL_PATH);
  const worksheet = workbook.Sheets[FREEZE_VERIFY_SHEET_NAME];
  if (!worksheet) {
    throw new Error(`Sheet "${FREEZE_VERIFY_SHEET_NAME}" not found in ${EXCEL_PATH}`);
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' }) as Record<string, any>[];
  return rows
    .map((row) => {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof key === 'string' && (key.startsWith('__EMPTY') || key.trim() === '')) continue;
        normalized[key] = String(value ?? '').trim();
      }
      return normalized as unknown as SavingsAccountFreezeVerifyRow;
    })
    .filter((row) => row.accountId && row.accountId.trim() !== '');
}

const freezeVerifyTestData = loadSavingsAccountFreezeVerifyData();

let homePage: HomePage;
let savingsAccountPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);

  // Step 1: Login with a different user (finacletest14)
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  savingsAccountPage = new AccountPage(page);
});

// HAFSM - Verify/authorise the freeze that was marked on a savings account.
for (const row of freezeVerifyTestData) {
  test(`${row.testLabel} - account ${row.accountId} (instance ${row.instance})`, async ({ page }) => {
    console.log(`Verifying freeze on Account ID: ${row.accountId}`);

    // Select "core server" from the solution drop down
    console.log('Selecting Core Server...');
    await savingsAccountPage.selectCoreServer();

    // Step 2: Type menu option "HAFSM" in finacle
    console.log('Searching for HAFSM...');
    await savingsAccountPage.searchMenu(COMMON_DATA.savingsAccount.screens.freeze);
    await page.waitForTimeout(3000);

    // Step 3: Function - V - Verify
    console.log('Selecting Verify function...');
    await savingsAccountPage.selectFunction('Verify');

    // Step 4: A/c Id - Enter the account number in which freeze is marked
    console.log('Entering account ID to verify...');
    await savingsAccountPage.enterHacmAccountId(row.accountId);

    // Step 5: Click Go to load the pending freeze into the verification screen
    console.log('Clicking Go button...');
    await savingsAccountPage.clickGo();

    // Step 6: Verify whether the freeze details are correct
    const freezeDetails = await savingsAccountPage.getFreezeDetails(row.accountId);
    console.log('Freeze details on verification screen:', freezeDetails);
    expect(freezeDetails).toBeTruthy();

    // Step 7: Click Submit - the freeze gets authorised/verified
    console.log('Clicking Submit button...');
    await savingsAccountPage.submitForm();

    if (row.instance === '1') {
      console.log('Accepting any pending-transactions warning for instance 1...');
      await savingsAccountPage.acceptWarningPopup();
    }

    // Capture the actual Finacle status message after verification
    const statusMessage = await savingsAccountPage.getStatusMessage();
    console.log('Exact status message:', statusMessage);
    expect(statusMessage).toBeTruthy();
    expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
    console.log('Verification status message:', statusMessage);
    expect(statusMessage).toBeTruthy();
    expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);

    // Sign out of the application
    console.log('Logging out...');
    await homePage.logout();
  });
}

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
