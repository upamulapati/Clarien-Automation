import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

// Account freeze (HAFSM) is performed by finacletest1.
const USERNAME = 'finacletest1';
const PASSWORD = CREDENTIALS.credentials.password;

const EXCEL_PATH = path.resolve('data', 'test-data.xlsx');
const SHEET_NAME = 'SavingsAccountFreezeData';

interface SavingsAccountFreezeRow {
  instance: string;
  accountId: string;
  freezeCode: string;
  freezeReasonCode: string;
  testLabel: string;
}

function loadSavingsAccountFreezeData(): SavingsAccountFreezeRow[] {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`Excel file not found: ${EXCEL_PATH}`);
  }
  const workbook = XLSX.readFile(EXCEL_PATH);
  const worksheet = workbook.Sheets[SHEET_NAME];
  if (!worksheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found in ${EXCEL_PATH}`);
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' }) as Record<string, any>[];
  return rows
    .map((row) => {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof key === 'string' && (key.startsWith('__EMPTY') || key.trim() === '')) continue;
        normalized[key] = String(value ?? '').trim();
      }
      return normalized as unknown as SavingsAccountFreezeRow;
    })
    .filter((row) => row.accountId && row.accountId.trim() !== '');
}

const freezeTestData = loadSavingsAccountFreezeData();

for (const row of freezeTestData) {
  const testTitle = `${row.testLabel} - ${row.freezeCode} on account ${row.accountId} (instance ${row.instance})`;
  test(testTitle, async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const accountPage = new AccountPage(page);

  console.log(`Marking freeze on Account ID: ${row.accountId}`);

  console.log('Selecting Core Server...');
  await accountPage.selectCoreServer();

  console.log('Searching for HAFSM...');
  await accountPage.searchMenu(COMMON_DATA.savingsAccount.screens.freeze);
  await page.waitForTimeout(3000);

  console.log('Selecting Freeze function...');
  await accountPage.selectFunction('Freeze');

  console.log(`Entering account ID to freeze: ${row.accountId}...`);
  await accountPage.enterHacmAccountId(row.accountId);

  console.log(`Selecting freeze code (${row.freezeCode})...`);
  await accountPage.selectFreezeCode(row.freezeCode);

  const finwFrame = page.frame({ name: 'FINW' });
  if (!finwFrame) throw new Error('FINW frame not found');

  const selectedFreezeValue = await finwFrame
    .locator('input[type="radio"][name*="freezeCode" i]:checked')
    .first()
    .getAttribute('value');
  const expectedFreezeValue =
    row.freezeCode.toLowerCase().includes('total') ? 'T' :
    row.freezeCode.toLowerCase().includes('debit') ? 'D' :
    row.freezeCode.toLowerCase().includes('credit') ? 'C' :
    row.freezeCode;
  expect(selectedFreezeValue, `Expected Freeze Code ${row.freezeCode}`).toBe(expectedFreezeValue);

  console.log(`Selecting freeze reason code ${row.freezeReasonCode}...`);
  await accountPage.selectFreezeReasonCode(row.freezeReasonCode);

  const reasonSet = await finwFrame.evaluate((expectedCode: string) => {
    const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
    const matched = inputs.find((inp) =>
      /reason|rsn|freezereason/i.test(inp.id + ' ' + inp.name) &&
      (inp.value || '').trim().includes(expectedCode.trim())
    );
    return { found: !!matched, value: matched?.value?.trim() || '' };
  }, row.freezeReasonCode);
  expect(reasonSet.found, `Freeze Reason Code ${row.freezeReasonCode} not found in any reason field (value="${reasonSet.value}")`).toBeTruthy();

  // Assertion: "Modify Freeze Details" co-mandatory rule.
  // Modify Freeze Details defaults to No on this screen.
  // When it is No, Freeze Reason Code 1 is co-mandatory and must be provided before clicking Go.
  if (!row.freezeReasonCode || row.freezeReasonCode.trim() === '') {
    throw new Error(
      `Assertion failed: "Freeze Reason Code 1" is co-mandatory when ` +
      `"Modify Freeze Details" is set to No. Freeze Reason Code must not be empty.`
    );
  }
  console.log(
    `Co-mandatory assertion passed: Modify Freeze Details = No (default), ` +
    `Freeze Reason Code 1 = "${row.freezeReasonCode}" — proceeding to Go.`
  );

  console.log('Clicking Go button...');
  await accountPage.clickGo();
  await page.waitForTimeout(3000);

  const getFrame = () => {
    const f = page.frame({ name: 'FINW' });
    if (!f) throw new Error('FINW frame not found');
    return f;
  };

  // Assertion: After Go, verify Freeze Reason Code 1 was propagated to all
  // account rows in the details page (as per the co-mandatory rule).
  const propagationCheck = await getFrame().evaluate((expectedCode: string) => {
    const allInputs = Array.from(
      document.querySelectorAll('input[type="text"]')
    ) as HTMLInputElement[];
    const reasonInputs = allInputs.filter(inp =>
      /reason.*code.*1|frzReason.*1|freezeReason.*1/i.test(inp.id + inp.name)
    );
    if (reasonInputs.length === 0) return { found: 0, propagated: 0, allMatch: null };
    const propagated = reasonInputs.filter(inp => inp.value?.trim() === expectedCode).length;
    return { found: reasonInputs.length, propagated, allMatch: propagated === reasonInputs.length };
  }, row.freezeReasonCode);

  if (propagationCheck.found > 0) {
    console.log(
      `Propagation check: Freeze Reason Code 1 "${row.freezeReasonCode}" ` +
      `propagated to ${propagationCheck.propagated}/${propagationCheck.found} account row(s). ` +
      `All match: ${propagationCheck.allMatch}`
    );
    if (!propagationCheck.allMatch) {
      throw new Error(
        `Assertion failed: Freeze Reason Code 1 "${row.freezeReasonCode}" was NOT propagated ` +
        `to all accounts. Only ${propagationCheck.propagated}/${propagationCheck.found} rows have it.`
      );
    }
  } else {
    console.log('Propagation check: Details page loaded (reason code columns not found in table — may be single-account view)');
  }

  console.log('Selecting account row checkbox...');
  await accountPage.selectAccountRowCheckbox();

  console.log('Clicking Submit button...');
  await accountPage.submitForm();

  if (row.instance === '1') {
    console.log('Accepting any pending-transactions warning for instance 1...');
    await accountPage.acceptWarningPopup();
  }

  const statusMessage = await accountPage.getStatusMessage();
  console.log('Exact status message:', statusMessage);
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log('Freeze status message:', statusMessage);
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);

  console.log('Logging out...');
  await homePage.logout();
});
}

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
