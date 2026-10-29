import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { getSharedValue } from '../../helpers/sharedState';
import COMMON_DATA from '../../../data/common-data.json';

const EXCEL_PATH = path.resolve('data', 'test-data.xlsx');
const SHEET_NAME = 'SavingsAccountModifyData';

interface FieldResult {
  field: string;
  expected: string;
  actual: string;
  status: 'Skipped' | 'Updated' | 'Failed' | 'NotFound' | 'ReadOnly';
}

function loadSavingsModifyData(): Record<string, string>[] {
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
      return normalized;
    })
    .filter((row) => row.Sheet && row.Sheet.trim() !== '');
}

function prettyLabel(header: string): string {
  if (/[\s\/().,-]/.test(header)) return header;
  return header
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (m) => m.toUpperCase())
    .trim();
}

function expandHeader(header: string): string {
  if (/[\s\/().,-]/.test(header)) return header;
  const expansions: Record<string, string> = {
    calc: 'Calculation',
    freq: 'Frequency',
    pcnt: 'Percent',
    min: 'Min',
    max: 'Max',
    int: 'Interest',
    acct: 'Account',
    num: 'Number',
    no: 'Number',
    amt: 'Amount',
    ccy: 'Currency',
    dt: 'Date',
    id: 'ID',
    cr: 'Cr',
    dr: 'Dr',
  };
  let s = header.replace(/([A-Z])/g, ' $1').toLowerCase();
  for (const [short, full] of Object.entries(expansions)) {
    const re = new RegExp(`\\b${short}\\b`, 'g');
    s = s.replace(re, full);
  }
  return s.replace(/^./, (m) => m.toUpperCase()).trim();
}

function candidateLabels(fieldName: string): string[] {
  const aliases = FIELD_LABEL_ALIASES[fieldName] ?? [];
  const set = new Set<string>([
    fieldName,
    prettyLabel(fieldName),
    expandHeader(fieldName),
    ...aliases,
  ]);
  return Array.from(set).filter(Boolean);
}

function clean(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function stripCode(s: string): string {
  return s.replace(/^[a-z]\s*[-/.]\s*/i, '').trim();
}

function valuesMatch(expected: string, actual: string): boolean {
  if (expected.trim().toLowerCase() === actual.trim().toLowerCase()) return true;

  // Short code like "P" should match "P - Previous day" or "G" should match "G - Gregorian Calendar"
  const exp = expected.trim();
  if (exp.length <= 2 && exp.length > 0) {
    const firstToken = actual.split(/[^a-z0-9]+/i)[0] || '';
    if (firstToken.toLowerCase() === exp.toLowerCase()) return true;
  }

  const c1 = clean(stripCode(expected));
  const c2 = clean(stripCode(actual));
  if (c1 === c2) return true;
  if (c1.length > 0 && c2.length > 0 && (c2.includes(c1) || c1.includes(c2))) return true;

  const n1 = parseFloat(expected.replace(/,/g, ''));
  const n2 = parseFloat(actual.replace(/,/g, ''));
  if (!isNaN(n1) && !isNaN(n2) && n1 === n2) return true;

  const d1 = expected.replace(/[^0-9]/g, '');
  const d2 = actual.replace(/[^0-9]/g, '');
  if (d1.length >= 6 && d2.length >= 6) {
    const v1 = parseInt(d1, 10);
    const v2 = parseInt(d2, 10);
    if (v1 === v2) return true;
  }

  const yes = ['yes', 'y', 'true', '1'];
  const no = ['no', 'n', 'false', '0'];
  if (yes.includes(c1) && yes.includes(c2)) return true;
  if (no.includes(c1) && no.includes(c2)) return true;

  return false;
}

const IDENTITY_FIELDS = ['instance', 'accountId', 'type', 'testLabel', 'enabled', 'flowName', 'sharedKey', 'Sheet', 'Add related parties'];

const TAB_ORDER = [
  'General Details',
  'Interest & Tax',
  'Scheme',
  'Related Party',
  'MIS Codes',
  'Addl. Info.',
  'Others',
  'Documents',
];

const FIELD_OVERRIDES: Record<string, string> = {
  dispatchMode: 'General Details',
  despatchMode: 'General Details',
  'A/c Name': 'General Details',
  'A/c Opening Date': 'General Details',
  'A/c Short Name': 'General Details',
  'Customer Relationship A/c Manager': 'General Details',
  'Turnover Details': 'General Details',
  'Collect Charges': 'General Details',
  'Preferential Calendar Base': 'General Details',
  'Mode of Operation': 'General Details',
  'Next Print Date': 'General Details',
  relativeToStaff: 'General Details',
  relativeStaffId: 'General Details',
  chargeLevelCode: 'General Details',
  accountManagerId: 'General Details',
  accountStatement: 'General Details',
  statementFrequency: 'General Details',
  statementWeek: 'General Details',
  statementDay: 'General Details',
  statementP: 'General Details',
  statementG: 'General Details',
  'A/c Status': 'Scheme',
  accountStatus: 'Scheme',
  'Due Date': 'Documents',
  receivedDate: 'Documents',
  documentExpiryDate: 'Documents',
  scanDetails: 'Documents',
  documentDate: 'Documents',
  documentCode: 'Documents',
  'Document Code': 'Documents',
  interestMethodDr: 'Scheme',
  'Interest Method (Dr.)': 'Scheme',
  externalSystemPricingFor: 'Others',
  'Relation Code': 'Related Party',
  'Designation Code': 'Related Party',
  'Print Statement': 'Related Party',
  'Print Advice for Standing Instruction': 'Related Party',
  'Print Deposit Notice': 'Related Party',
  'Print Loan Notice': 'Related Party',
  'Interest Certificate': 'Related Party',
  'Interest Rate Change Advice': 'Related Party',
  'Limit Level Interest': 'Account Limits',
};

const FIELD_LABEL_ALIASES: Record<string, string[]> = {
  'A/c Name': ['A/c. Name', 'Account Name', 'A/c. Short Name'],
  accountManagerId: ['A/c. Manager ID', 'Manager ID'],
  relativeToStaff: ['Related to Staff', 'A/c. Information'],
  relativeStaffId: ['Relative Staff ID'],
  accountStatement: ['A/c. Statement', 'A/c. Statement *'],
  statementDay: ['Statement Frequency', 'Day', 'Statement Day', 'Week Day'],
  statementP: ['Statement Frequency'],
  statementG: ['Statement Frequency'],
  'Due Date': ['Due Date'],
  payInterest: ['Pay Interest'],
  collectInterest: ['Collect Interest'],
  accountPegged: ['A/c. Pegged'],
  interestRateCode: ['Interest Rate Code'],
  interestCreditAccount: ['Interest Credit A/c.'],
  interestDebitAccount: ['Interest Debit A/c.'],
  interestCreditAccountId: ['Interest Credit A/c. ID'],
  interestDebitAccountId: ['Interest Debit A/c. ID'],
  interestCalcFreqCr: ['Interest Calculation Frequency (Cr.)'],
  interestCalcFreqDr: ['Interest Calculation Frequency (Dr.)'],
  interestCalcFreqCrDay: ['Interest Calculation Frequency (Cr.)'],
  interestCalcFreqDrDay: ['Interest Calculation Frequency (Dr.)'],
  interestCalcFreqCrP: ['Interest Calculation Frequency (Cr.)'],
  interestCalcFreqDrP: ['Interest Calculation Frequency (Dr.)'],
  interestCalcFreqCrG: ['Interest Calculation Frequency (Cr.)'],
  interestCalcFreqDrG: ['Interest Calculation Frequency (Dr.)'],
  nextInterestCalculationDateCr: ['Next Interest Calculation Date (Cr.)'],
  'Next Interest Calculation Date (Dr.)': ['Next Interest Calculation Date (Dr.)'],
  interestCompoundingFreqDr: ['Interest Compounding Frequency (Dr.)'],
  creditInterestCompoundingFreq: ['Credit Interest Compounding Frequency'],
  debitCompoundingRestIndicator: ['Debit Compounding Rest Indicator'],
  creditCompoundingRestIndicator: ['Credit Compounding Rest Indicator'],
  interestMethodDr: ['Interest Method (Dr.)'],
};

const FIELD_CONTROL_INDEX: Record<string, number> = {
  // A/c. Information checkboxes
  relativeToStaff: 0,
  'Collect Charges': 2,
  'Turnover Details': 3,
  // A/c. Statement grouped dropdowns
  statementFrequency: 0,
  statementWeek: 1,
  statementDay: 3,
  statementP: 4,
  statementG: 5,
  // Interest & Tax top checkboxes
  payInterest: 0,
  collectInterest: 1,
  // Interest & Tax grouped dropdowns
  interestCalcFreqCr: 0,
  interestCalcFreqCrDay: 3,
  interestCalcFreqCrP: 4,
  interestCalcFreqCrG: 5,
  interestCalcFreqDr: 0,
  interestCalcFreqDrDay: 3,
  interestCalcFreqDrP: 4,
  interestCalcFreqDrG: 5,
};

const FIELD_CONTROL_ID: Record<string, string> = {
  statementP: 'FreqHldyStat',
  statementG: 'FreqCalBase',
};

// Ensure A/c. Statement controls are processed before Next Print Date so the
// dependency check (enabled only for Statement or Both) is evaluated correctly.
const GENERAL_DETAILS_FIELD_ORDER: Record<string, number> = {
  accountstatement: 0,
  statementfrequency: 1,
  statementp: 1,
  statementg: 1,
  statementweek: 1,
  statementday: 1,
  dispatchmode: 1,
  nextprintdate: 99,
};

function inferTab(fieldName: string): string | null {
  if (FIELD_OVERRIDES[fieldName]) return FIELD_OVERRIDES[fieldName];
  const lower = fieldName.toLowerCase();

  if (
    lower.includes('dispatch') ||
    lower.includes('despatch') ||
    lower.includes('print') ||
    lower.includes('statement') ||
    lower.includes('operation') ||
    lower.includes('turnover') ||
    lower === 'relativetostaff' ||
    lower === 'relativestaffid' ||
    lower === 'chargelevelcode' ||
    lower === 'accountmanagerid' ||
    lower === 'preferentialcalendarbase' ||
    lower === 'collectcharges'
  ) {
    return 'General Details';
  }

  if (
    lower.includes('interest') ||
    lower.includes('tax') ||
    lower.includes('withholding') ||
    lower.includes('pegging') ||
    lower.includes('compounding') ||
    lower.includes('waive min') ||
    lower === 'tdsoperativeaccountid' ||
    lower === 'accountpegged' ||
    lower === 'interestratecode'
  ) {
    return 'Interest & Tax';
  }

  if (
    lower.includes('cheque') ||
    lower.includes('nomination') ||
    lower.includes('nominee') ||
    lower.includes('sanction') ||
    lower.includes('expirydate') ||
    lower.includes('minbalance') ||
    lower.includes('sweep') ||
    lower.includes('renewal') ||
    lower.includes('debitbalancelimit') ||
    lower.includes('maxallowedlimit') ||
    lower === 'ffdschemecode' ||
    lower === 'interest method (dr.)'
  ) {
    return 'Scheme';
  }

  if (lower.includes('relatedparty') || lower.includes('relation') || lower === 'dsainformation' || lower === 'sourcingdealerid' || lower === 'disbursingdealerid') {
    return 'Related Party';
  }

  if (
    lower.includes('pricing') ||
    lower.includes('occupation') ||
    lower.includes('sector') ||
    lower.includes('subsector') ||
    lower.includes('reportcode') ||
    lower.includes('external') ||
    lower === 'relationshippricingid'
  ) {
    return 'MIS Codes';
  }

  if (
    lower.includes('document') ||
    lower.includes('duedate') ||
    lower.includes('scandetails') ||
    lower.includes('receiveddate') ||
    lower === 'documentdate'
  ) {
    return 'Documents';
  }

  if (
    lower.includes('accountlimits') ||
    lower.includes('drawingpower') ||
    lower.includes('penal') ||
    lower === 'limit level interest' ||
    lower === 'sanctionauthority' ||
    lower === 'limitreferenceno' ||
    lower === 'accountlimitsreviewdate'
  ) {
    return 'Account Limits';
  }

  if (
    lower.includes('paymentsystem') ||
    lower.includes('roundoff') ||
    lower.includes('collectfee') ||
    lower.includes('taxreporting') ||
    lower === 'linktooperativeaccount' ||
    lower === 'masteraccountno' ||
    lower === 'ratecode'
  ) {
    return 'Others';
  }

  return null;
}

function fieldTabMap(fieldName: string): string {
  return inferTab(fieldName) ?? 'General Details';
}

function groupSavingsModifyData(rows: Record<string, string>[]): { main: Record<string, string>; related: Record<string, string>[] }[] {
  const groups: { main: Record<string, string>; related: Record<string, string>[] }[] = [];
  let current: { main: Record<string, string> | null; related: Record<string, string>[] } = { main: null, related: [] };
  for (const row of rows) {
    const sheet = (row.Sheet ?? '').trim().toLowerCase();
    if (sheet === 'main') {
      if (current.main) {
        groups.push({ main: current.main, related: current.related });
      }
      current = { main: row, related: [] };
    } else if (sheet === 'related party' && current.main) {
      current.related.push(row);
    }
  }
  if (current.main) {
    groups.push({ main: current.main, related: current.related });
  }
  return groups;
}

const SAVINGS_MODIFY_DATA = groupSavingsModifyData(loadSavingsModifyData());

for (const group of SAVINGS_MODIFY_DATA) {
  const createdAccountId = getSharedValue(
    (state) => state.savingsAccounts?.[String(group.main.instance)] ?? state.accountId
  ) as string | undefined;
  const effectiveAccountId = createdAccountId || group.main.accountId;
  const row = group.main;
  const relatedPartyRows = group.related;
  test.describe(`Savings Account Modification - ${effectiveAccountId}`, () => {
    test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

    let homePage: HomePage;
    let accountPage: AccountPage;

    test.beforeEach(async ({ page }) => {
      test.setTimeout(300000);
      ({ homePage } = await loginToFinacle(page, 'FINACLETEST1', COMMON_DATA.credentials.password));
      accountPage = new AccountPage(page);
    });

    test(`HACM - data-driven savings account modification - ${effectiveAccountId}`, async ({ page }) => {
      console.log(`[Modification] Using Account ID: ${effectiveAccountId}`);

      await accountPage.selectCoreServer();
      await page.waitForTimeout(3000);

      console.log(`Searching for ${COMMON_DATA.savingsAccount.screens.modifyAndVerify}...`);
      await accountPage.searchMenu(COMMON_DATA.savingsAccount.screens.modifyAndVerify);
      await page.waitForTimeout(3000);

      console.log('Selecting Modify function...');
      await accountPage.selectFunction('Modify');

      console.log(`Entering account ID to modify: ${effectiveAccountId}...`);
      await accountPage.enterHacmAccountId(effectiveAccountId);

      console.log('Clicking Go button...');
      await accountPage.clickGo();
      await page.waitForTimeout(3000);

      const fieldsToProcess = Object.keys(row).filter(
        (k) =>
          !IDENTITY_FIELDS.includes(k) &&
          !k.startsWith('__EMPTY') &&
          row[k] !== ''
      );

      const tabToFields = new Map<string, string[]>();
      for (const field of fieldsToProcess) {
        const tab = fieldTabMap(field);
        const list = tabToFields.get(tab) ?? [];
        list.push(field);
        tabToFields.set(tab, list);
      }

      const results: FieldResult[] = [];
      const fieldLabels = new Map<string, string>();
      let anyChanges = false;

      for (const tab of TAB_ORDER) {
        const tabFields = tabToFields.get(tab);
        if (!tabFields || tabFields.length === 0) continue;

        if (tab === 'General Details') {
          const getPriority = (f: string) => GENERAL_DETAILS_FIELD_ORDER[f.replace(/[^a-z0-9]/gi, '').toLowerCase()] ?? 0;
          tabFields.sort((a, b) => getPriority(a) - getPriority(b));
        }

        console.log(`[Tab] ${tab} - ${tabFields.length} field(s)`);
        if (tab === 'Related Party') {
          await accountPage.visitRelatedPartyTab();
        } else {
          await accountPage.visitTab(tab);
        }
        await page.waitForTimeout(2000);

        for (const field of tabFields) {
          const expected = row[field];

          if (field.toLowerCase() === 'dispatchmode' || field.toLowerCase() === 'despatchmode') {
            if (!(await accountPage.isDispatchModeEnabled())) {
              results.push({ field, expected, actual: '', status: 'ReadOnly' });
              continue;
            }
            const actual = (await accountPage.getDispatchMode()) ?? '';
            if (valuesMatch(expected, actual)) {
              results.push({ field, expected, actual, status: 'Skipped' });
            } else {
              await accountPage.selectDispatchMode(expected);
              const actual2 = (await accountPage.getDispatchMode()) ?? '';
              const ok = valuesMatch(expected, actual2);
              results.push({ field, expected, actual: actual2, status: ok ? 'Updated' : 'Failed' });
              if (ok) anyChanges = true;
            }
            continue;
          }

          if (field.toLowerCase() === 'accountstatus' || field === 'A/c Status') {
            const actual = (await accountPage.getAccountStatus()) ?? '';
            if (valuesMatch(expected, actual)) {
              results.push({ field, expected, actual, status: 'Skipped' });
            } else {
              await accountPage.selectAccountStatus(expected as 'active' | 'dormant' | 'inactive');
              const actual2 = (await accountPage.getAccountStatus()) ?? '';
              const ok = valuesMatch(expected, actual2);
              results.push({ field, expected, actual: actual2, status: ok ? 'Updated' : 'Failed' });
              if (ok) anyChanges = true;
            }
            continue;
          }

          const controlIndex = FIELD_CONTROL_INDEX[field];
          const controlId = FIELD_CONTROL_ID[field];

          let info: Awaited<ReturnType<AccountPage['getFieldValueByLabel']>> | null = null;
          let matchedLabel = '';
          for (const label of candidateLabels(field)) {
            info = await accountPage.getFieldValueByLabel(label, controlIndex, controlId);
            if (info) {
              matchedLabel = label;
              break;
            }
          }
          if (!info) {
            results.push({ field, expected, actual: '', status: 'NotFound' });
            continue;
          }

          fieldLabels.set(field, matchedLabel);

          // Next Print Date is only editable when A/c. Statement is Statement or Both
          if (field.replace(/\s+/g, '').toLowerCase() === 'nextprintdate') {
            let acStmtInfo: Awaited<ReturnType<AccountPage['getFieldValueByLabel']>> | null = null;
            for (const acStmtLabel of ['A/c. Statement', 'A/c. Statement *', 'Statement P/G']) {
              acStmtInfo = await accountPage.getFieldValueByLabel(acStmtLabel);
              if (acStmtInfo) break;
            }
            const acStmt = acStmtInfo?.value ?? '';
            const acStmtNorm = clean(stripCode(acStmt));
            const isStatementEnabled = acStmtNorm.includes('statement') || acStmtNorm.includes('both');
            if (!isStatementEnabled) {
              console.log(`[Next Print Date] skipping because A/c Statement = "${acStmt}" (not Statement/Both)`);
              results.push({ field, expected, actual: info.value, status: 'ReadOnly' });
              continue;
            }
          }

          const actual = info.value;
          if (valuesMatch(expected, actual)) {
            results.push({ field, expected, actual, status: 'Skipped' });
            continue;
          }

          if (info.disabled) {
            results.push({ field, expected, actual, status: 'ReadOnly' });
            continue;
          }

          const typeHint = info.type === 'unknown' ? undefined : info.type;
          const setOk = await accountPage.setFieldValueByLabel(matchedLabel, expected, typeHint, controlIndex, controlId);
          if (!setOk) {
            results.push({ field, expected, actual, status: 'Failed' });
            continue;
          }

          const verifyInfo = await accountPage.getFieldValueByLabel(matchedLabel, controlIndex, controlId);
          const actual2 = verifyInfo ? verifyInfo.value : actual;
          const ok = valuesMatch(expected, actual2);
          results.push({ field, expected, actual: actual2, status: ok ? 'Updated' : 'Failed' });
          if (ok) anyChanges = true;
        }

        if (tab === 'Interest & Tax') {
          // When the interest credit/debit account is Original A/c., the corresponding
          // account ID fields must be cleared to avoid a validation alert that blocks
          // switching to other tabs (e.g., Related Party).
          const crFlag = String(row.interestCreditAccount ?? '').toLowerCase();
          const drFlag = String(row.interestDebitAccount ?? '').toLowerCase();
          if (crFlag.includes('original')) {
            const crInfo = await accountPage.getFieldValueByLabel('Interest Credit A/c. ID', 0);
            if (crInfo?.id) await accountPage.clearFieldById(crInfo.id);
          }
          if (drFlag.includes('original')) {
            const drInfo = await accountPage.getFieldValueByLabel('Interest Debit A/c. ID', 0);
            if (drInfo?.id) await accountPage.clearFieldById(drInfo.id);
          }
        }

        // Related Party rows: update existing records or add new
        if (tab === 'Related Party' && relatedPartyRows.length > 0) {
          for (const rpRow of relatedPartyRows) {
            const hasNext = await accountPage.goToNextRelatedPartyRecord();
            if (!hasNext) {
              await accountPage.clickRelatedPartyAdd();
            }
            await page.waitForTimeout(2000);

            if (rpRow.relationType?.trim()) {
              await accountPage.selectRelationType(rpRow.relationType);
            }
            if (rpRow.relatedPartyCifId?.trim()) {
              await accountPage.enterRelatedPartyCif(rpRow.relatedPartyCifId);
            }

            const rpFieldsToProcess = Object.keys(rpRow).filter(
              (k) =>
                !IDENTITY_FIELDS.includes(k) &&
                !k.startsWith('__EMPTY') &&
                rpRow[k] !== '' &&
                k !== 'relationType' &&
                k !== 'relatedPartyCifId' &&
                fieldTabMap(k) === 'Related Party'
            );

            for (const rpField of rpFieldsToProcess) {
              const rpExpected = rpRow[rpField];
              let set = false;
              for (const rpLabel of candidateLabels(rpField)) {
                set = await accountPage.setFieldValueByLabel(rpLabel, rpExpected);
                if (set) break;
              }
              if (!set) {
                throw new Error(`Failed to set related party field "${rpField}" to "${rpExpected}"`);
              }
            }
          }
        }

        // Verify all fields processed on this tab before moving to the next tab
        const tabUpdated = results.filter((r) => r.status === 'Updated' && tabFields.includes(r.field));
        if (tabUpdated.length > 0) {
          console.log(`[Tab Verify] ${tab} - re-checking ${tabUpdated.length} updated field(s)`);
          for (const r of tabUpdated) {
            const matched = fieldLabels.get(r.field);
            if (!matched) continue;
            const verifyInfo = await accountPage.getFieldValueByLabel(matched, FIELD_CONTROL_INDEX[r.field], FIELD_CONTROL_ID[r.field]);
            const actual = verifyInfo ? verifyInfo.value : r.actual;
            if (!valuesMatch(r.expected, actual)) {
              console.log(`[Tab Verify] ${r.field} mismatch: expected "${r.expected}", got "${actual}"`);
              r.status = 'Failed';
              r.actual = actual;
            } else {
              console.log(`[Tab Verify] ${r.field} = "${actual}" OK`);
            }
          }
        }

        const tabFailures = results.filter(
          (r) =>
            (r.status === 'Failed') &&
            tabFields.includes(r.field)
        );
        const tabNotFound = results.filter((r) => r.status === 'NotFound' && tabFields.includes(r.field));
        if (tabFailures.length > 0) {
          console.error(`[Tab ${tab} failures] ${JSON.stringify(tabFailures)}`);
        }
        if (tabNotFound.length > 0) {
          console.warn(`[Tab ${tab} not found] ${JSON.stringify(tabNotFound)}`);
        }
        expect(
          tabFailures,
          `Tab "${tab}" has failed fields: ${JSON.stringify(tabFailures)}`
        ).toHaveLength(0);
      }

      console.log('=== Savings Account Modification Field Results ===');
      console.log(JSON.stringify(results, null, 2));

      const failures = results.filter((r) => r.status === 'Failed');
      const notFound = results.filter((r) => r.status === 'NotFound');
      const updates = results.filter((r) => r.status === 'Updated');

      if (failures.length > 0) {
        console.error(`[Failed] ${JSON.stringify(failures)}`);
      }
      if (notFound.length > 0) {
        console.warn(`[NotFound] ${JSON.stringify(notFound)}`);
      }

      expect(
        failures,
        `One or more fields failed to be updated: ${JSON.stringify(failures)}`
      ).toHaveLength(0);

      if (updates.length > 0) {
        console.log(`Submitting modification for ${updates.length} updated field(s)...`);
        await accountPage.submitForm();

        const result = await accountPage.verifyAccountCreated();
        console.log('Exact result message:', result.message);

        expect(result.success, `Expected successful modification but got: ${result.message}`).toBe(true);
        expect(result.message).toBeTruthy();
        expect(result.message).toMatch(
          /(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i
        );
      } else {
        console.log('No fields required modification; skipping submit.');
      }

      await homePage.logout();
    });
  });
}

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
