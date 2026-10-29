import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

// Account unfreeze (HAFSM) is performed by finacletest1.
const USERNAME = 'finacletest1';
const PASSWORD = CREDENTIALS.credentials.password;

const EXCEL_PATH = path.resolve('data', 'test-data.xlsx');
const UNFREEZE_SHEET_NAME = 'SavingsAccountUnfreezeData';

interface SavingsAccountUnfreezeRow {
  instance: string;
  accountId: string;
  testLabel: string;
}

function loadSavingsAccountUnfreezeData(): SavingsAccountUnfreezeRow[] {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`Excel file not found: ${EXCEL_PATH}`);
  }
  const workbook = XLSX.readFile(EXCEL_PATH);
  const worksheet = workbook.Sheets[UNFREEZE_SHEET_NAME];
  if (!worksheet) {
    throw new Error(`Sheet "${UNFREEZE_SHEET_NAME}" not found in ${EXCEL_PATH}`);
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' }) as Record<string, any>[];
  return rows
    .map((row) => {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof key === 'string' && (key.startsWith('__EMPTY') || key.trim() === '')) continue;
        normalized[key] = String(value ?? '').trim();
      }
      return normalized as unknown as SavingsAccountUnfreezeRow;
    })
    .filter((row) => row.accountId && row.accountId.trim() !== '');
}

const unfreezeTestData = loadSavingsAccountUnfreezeData();

let homePage: HomePage;
let accountPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  accountPage = new AccountPage(page);
});

// Parameterized test: one test for each row in SavingsAccountUnfreezeData.
for (const row of unfreezeTestData) {
  test(`${row.testLabel} - account ${row.accountId} (instance ${row.instance})`, async ({ page }) => {
    console.log(`Unfreezing Account ID: ${row.accountId}`);

    console.log('Selecting Core Server...');
    await accountPage.selectCoreServer();

    console.log('Searching for HAFSM...');
    await accountPage.searchMenu(COMMON_DATA.savingsAccount.screens.freeze);
    await page.waitForTimeout(3000);

    console.log('Selecting Unfreeze function...');
    await accountPage.selectFunction('Unfreeze');

    console.log(`Entering account ID to unfreeze: ${row.accountId}...`);
    await accountPage.enterHacmAccountId(row.accountId);

    console.log('Clicking Go button...');
    await accountPage.clickGo();

    console.log('Selecting account row checkbox...');
    await accountPage.selectAccountRowCheckbox();

    console.log('Clicking Submit button...');
    await accountPage.submitForm();

    if (row.instance === '1') {
      console.log('Accepting any pending-transactions warning for instance 1...');
      await accountPage.acceptWarningPopup();
    }

    console.log('Capturing status message before OK...');
    const statusMessage = await accountPage.getStatusMessage();
    console.log('Exact status message:', statusMessage);

    expect(statusMessage, `Unfreeze for account ${row.accountId} did not return a status message`).toBeTruthy();

    if (statusMessage && /E\d{4}|\berror\b|\bexception\b|\bfailed\b/i.test(statusMessage)) {
      throw new Error(`Unfreeze failed for account ${row.accountId}: ${statusMessage}`);
    }

    expect(statusMessage, `Unfreeze for account ${row.accountId} did not return the expected success message. Got: ${statusMessage}`)
      .toMatch(/(Total|Credit|Debit) Freeze on Selected A\/cs Removed successfully/i);
    console.log('Unfreeze status message:', statusMessage);

    console.log('Clicking OK button...');
    await accountPage.clickOkButton();

    console.log('Logging out...');
    await homePage.logout();
  });
}

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
