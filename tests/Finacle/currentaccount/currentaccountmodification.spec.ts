import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { updateSharedState } from '../../helpers/sharedState';
import { CREDENTIALS } from '../../../data/credentials';
import COMMON_DATA from '../../../data/common-data.json';

const EXCEL_PATH = path.resolve('data', 'test-data.xlsx');
const SHEET_NAME = 'CurrentAccountModifyData';

interface FieldResult {
  field: string;
  expected: string;
  actual: string;
  status: 'Skipped' | 'Updated' | 'Failed' | 'NotFound' | 'ReadOnly';
}

function loadCurrentModifyData(): Record<string, string>[] {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error('Excel file not found: ' + EXCEL_PATH);
  }
  const workbook = XLSX.readFile(EXCEL_PATH);
  const worksheet = workbook.Sheets[SHEET_NAME];
  if (!worksheet) {
    throw new Error('Sheet "' + SHEET_NAME + '" not found in ' + EXCEL_PATH);
  }

  const raw = XLSX.utils.sheet_to_json(worksheet, { defval: '', header: 1 }) as any[][];
  if (raw.length === 0) return [];
  const rawHeaders = raw[0].map((h) => String(h).trim());
  const headers: string[] = [];
  let section = '';
  for (const h of rawHeaders) {
    const hl = h.toLowerCase().replace(/\s+/g, '');
    if (hl.includes('document')) {
      section = 'Document';
    }
    if (
      hl.includes('occupation') ||
      hl.includes('sectorcode') ||
      hl.includes('subsectorcode') ||
      h.toLowerCase().startsWith('free code')
    ) {
      section = 'MIS';
    }
    const freeFieldMatch = h.match(/^Free (Text|Code)\s+(\d+)$/i);
    if (freeFieldMatch && section) {
      headers.push(`${section} ${h}`);
    } else {
      headers.push(h);
    }
  }

  const rows = raw.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      let v = r[i] ?? '';
      if (typeof v === 'string') v = v.replace(/\s+/g, ' ').trim();
      obj[headers[i]] = v;
    }
    return obj;
  });
  return rows
    .map((row) => {
      const normalized: Record<string, string> = {};
      for (const [rawKey, value] of Object.entries(row)) {
        if (typeof rawKey !== 'string') continue;
        const key = rawKey.trim();
        if (key === '' || key.startsWith('__EMPTY')) continue;
        normalized[key] = String(value ?? '').trim();
      }
      return normalized;
    })
    .filter(
      (row) =>
        (row.Sheet && row.Sheet.trim() !== '') ||
        (row.instance && String(row.instance).trim() !== '') ||
        (row.accountId && String(row.accountId).trim() !== '')
    );
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
  return header
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .replace(/^./, (m) => m.toUpperCase())
    .trim();
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

  const exp = expected.trim();
  if (exp.length <= 2 && exp.length > 0) {
    const firstToken = actual.split(/[^a-z0-9]+/i)[0] || '';
    if (firstToken.toLowerCase() === exp.toLowerCase()) return true;
  }

  const c1 = clean(stripCode(expected));
  const c2 = clean(stripCode(actual));
  if (c1 === c2) return true;
  // Removed one-direction substring match to avoid false positives
  // (e.g. "Active" being treated as matching "Inactive").

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

const TABS_TO_SKIP = ['Flexi-Deposit', 'FFD Details'];

const TAB_ORDER = [
  'General Details',
  'Interest Details',
  'Scheme',
  'Related Party',
  'MIS Codes',
  'FFD Details',
  'Flexi-Deposit',
  'Other Details',
  'Account Limits',
  'Document Details',
];

const FIELD_OVERRIDES: Record<string, string> = {
  dispatchMode: 'General Details',
  despatchMode: 'General Details',
  'Location code': 'General Details',
  'A/C. Report Code': 'General Details',
  'A/c Report Code': 'General Details',
  chargeLevelCode: 'General Details',
  accountManagerId: 'General Details',
  'Preferential Calendar Base': 'General Details',
  'Mode of Operation': 'General Details',
  'Next Print Date': 'General Details',
  relativeToStaff: 'General Details',
  relativeStaffId: 'General Details',
  'Related to Staff': 'General Details',
  'Turnover Details': 'General Details',
  'Collect Charges': 'General Details',
  accountStatement: 'General Details',
  statementFrequency: 'General Details',
  statementWeek: 'General Details',
  statementDay: 'General Details',
  statementP: 'General Details',
  statementG: 'General Details',
  'A/c. Status': 'Scheme',
  accountStatus: 'Scheme',
  'Interest Method (Dr.)': 'Scheme',
  'Interest Method (Dr.)_1': 'Scheme',
  'Cheque Allowed': 'Scheme',
  nomination: 'Scheme',
  'Cheques Provided by Bank': 'Scheme',
  'Recover Fee for Cheque Issue': 'Scheme',
  'Return Paid Cheque': 'Scheme',
  debitBalanceLimit: 'Scheme',
  maxAllowedLimit: 'Scheme',
  schemeSanctionLimit: 'Scheme',
  accountMinBalanceIndicator: 'Scheme',
  sweepInMinBalance: 'Scheme',
  Autoclosure: 'Flexi-Deposit',
  autoSweep: 'Scheme',
  autoRenewal: 'Scheme',
  maxRenewalAllowed: 'Scheme',
  autoRenewalPeriodMonths: 'Scheme',
  autoRenewalPeriodDays: 'Scheme',
  autoRenewalScheme: 'Scheme',
  sweepOutDepositPeriodMonths: 'Scheme',
  sweepOutDepositPeriodDays: 'Scheme',
  sweepOutFrequency: 'Scheme',
  'General Ledger Subhead Code': 'Scheme',
  ffdSchemeCode: 'Flexi-Deposit',
  ffdScheme: 'Flexi-Deposit',
  'Safe Custody': 'Flexi-Deposit',
  'Print Receipt': 'Flexi-Deposit',
  'Payment System Statements': 'Other Details',
  externalSystemPricingFor: 'Other Details',
  relationshipPricingId: 'Other Details',
  pricingEffectiveDate: 'Other Details',
  pricingReviewDate: 'Other Details',
  'Link to Operative A/c.': 'Other Details',
  linkToOperativeAccount: 'Other Details',
  masterAccountNo: 'Other Details',
  rateCode: 'Other Details',
  foreignTaxReportable: 'Other Details',
  taxReportingCountry: 'Other Details',
  taxReportingStatus: 'Other Details',
  lastTaxReportingReviewDate: 'Other Details',
  nextTaxReportingReviewDate: 'Other Details',
  paymentSystemAccountId: 'Other Details',
  amountType: 'Other Details',
  paymentSystemPercent: 'Other Details',
  paymentSystemAmount: 'Other Details',
  roundOffIndicator: 'Other Details',
  roundOffAmount: 'Other Details',
  collectFee: 'Other Details',
  dsaInformation: 'Related Party',
  sourcingDealerId: 'Related Party',
  disbursingDealerId: 'Related Party',
  'Relation Code': 'Related Party',
  'Designation Code': 'Related Party',
  'Print Statement': 'Related Party',
  'Print Advice for Standing Instruction': 'Related Party',
  'Print Deposit Notice': 'Related Party',
  'Print Loan Notice': 'Related Party',
  'Interest Certificate': 'Related Party',
  'Interest Rate Change Advice': 'Related Party',
  'Document Code': 'Document Details',
  'Due Date': 'Document Details',
  receivedDate: 'Document Details',
  documentExpiryDate: 'Document Details',
  scanDetails: 'Document Details',
  documentDate: 'Document Details',
  'Limit Level Interest': 'Account Limits',
  accountLimitsSanctionLimit: 'Account Limits',
  sanctionDate: 'Account Limits',
  'Penal Interest Start Date': 'Account Limits',
  accountLimitsReviewDate: 'Account Limits',
  sanctionAuthority: 'Account Limits',
  limitReferenceNo: 'Account Limits',
  accountLimitsExpiryDate: 'Account Limits',
  drawingPowerIndicator: 'Account Limits',
  drawingPowerPercent: 'Account Limits',
  drawingPower: 'Account Limits',
};

const FIELD_LABEL_ALIASES: Record<string, string[]> = {
  'Location code': ['Location Code'],
  'A/C. Report Code': ['A/c. Report Code', 'A/c Report Code'],
  accountManagerId: ['A/c. Manager ID', 'A/c Manager ID'],
  relativeToStaff: ['Related to Staff'],
  relativeStaffId: ['Relative Staff ID', 'Relative Staff Id'],
  'Related to Staff': ['Related to Staff'],
  accountStatement: ['A/c. Statement', 'A/c Statement', 'A/cStatement'],
  statementFrequency: ['Statement Frequency', 'A/c. Statement Frequency'],
  statementWeek: ['Statement Week'],
  statementDay: ['Statement Day', 'Statement Day (Date)', 'Day'],
  payInterest: ['Pay Interest'],
  collectInterest: ['Collect Interest'],
  accountPegged: ['A/c. Pegged', 'Account Pegged'],
  interestCreditAccount: ['Interest Credit A/c.', 'Interest Credit Account'],
  interestDebitAccount: ['Interest Debit A/c.', 'Interest Debit Account'],
  interestCreditAccountId: ['Interest Credit A/c. ID', 'Interest Credit A/c. Id'],
  interestDebitAccountId: ['Interest Debit A/c. ID', 'Interest Debit A/c. Id'],
  nextInterestCalculationDateCr: ['Next Interest Calculation Date (Cr.)', 'Next Int. Calc. Date (Cr)', 'Next interest calc date (Cr)'],
  'Next Interest Calculation Date (Dr.)': ['Next Interest Calculation Date (Dr.)', 'Next Int. Calc. Date (Dr)', 'Next interest calc date (Dr)'],
  'Interest Compounding Frequency (Dr.)': ['Dr. Compounding Frequency'],
  'Credit Interest Compounding Frequency': ['Credit Compounding Frequency'],
  'Debit Compounding Rest Indicator': ['Dr. Compounding Rest Indicator'],
  'Credit Compounding Rest Indicator': ['Cr. Compounding Rest Indicator'],
  'Waive Min. Interest': ['Waive Min. Interest'],
  ffdSchemeCode: ['FFD Scheme Code', 'FFD Scheme code'],
  ffdScheme: ['FFD Scheme Code', 'FFD Scheme code'],
  debitBalanceLimit: ['Debit Balance Limit'],
  maxAllowedLimit: ['Max. Allowed Limit', 'Max Allowed Limit'],
  schemeSanctionLimit: ['Scheme Sanction Limit', 'Sanction Limit'],
  accountMinBalanceIndicator: ['A/c. Min. Balance Indicator', 'Account Min. Balance Indicator'],
  sweepInMinBalance: ['Sweep In Min. Balance', 'Sweep In Minimum Balance', 'Sweep In Min. Bal.'],
  'Interest Method (Dr.)': ['Interest Method Dr'],
  'Interest Method (Dr.)_1': ['Interest Method (Dr.)', 'Interest Method Dr'],
  'A/c. Status': ['A/c Status', 'Account Status'],
  'Payment System Statements': ['Payment System Statements'],
  externalSystemPricingFor: ['External System Pricing For', 'Ext. System Pricing For'],
  relationshipPricingId: ['Relationship Pricing ID', 'Relationship Pricing Id'],
  pricingEffectiveDate: ['Pricing Effective Date'],
  pricingReviewDate: ['Pricing Review Date'],
  'Link to Operative A/c.': ['Link to Operative Account'],
  linkToOperativeAccount: ['Link to Operative A/c.', 'Link to Operative Account'],
  masterAccountNo: ['Master Account No.', 'Master Account Number'],
  'Document Code': ['Document Code'],
  'Due Date': ['Due Date'],
  scanDetails: ['Scan Details'],
  receivedDate: ['Received Date'],
  documentExpiryDate: ['Document Expiry Date', 'Doc. Expiry Date'],
  documentDate: ['Document Date'],
  'Limit Level Interest': ['A/c. Level Interest/Limit Level Interest'],
  'Penal Interest Start Date': ['Penal Interest Start Date'],
  accountLimitsSanctionLimit: ['Sanction Limit', 'Account Limits Sanction Limit'],
  limitReferenceNo: ['Limit Reference No.', 'Limit Reference No'],
  drawingPowerPercent: ['Drawing power percent', 'Drawing Power Percent', 'Drawing Power %'],
  drawingPower: ['Drawing power', 'Drawing Power'],
  'Occupation Code': ['Occupation Code'],
  subsectorCode: ['Subsector Code'],
  reportCode: ['Report Code'],
};

const FIELD_CONTROL_INDEX: Record<string, number> = {
  relativeToStaff: 0,
  'Collect Charges': 2,
  'Turnover Details': 3,
  statementFrequency: 0,
  statementWeek: 1,
  statementDay: 3,
  statementP: 4,
  statementG: 5,
  payInterest: 0,
  collectInterest: 1,
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
    lower === 'relatedtostaff' ||
    lower === 'chargelevelcode' ||
    lower === 'accountmanagerid' ||
    lower === 'preferentialcalendarbase' ||
    lower === 'collectcharges' ||
    lower === 'locationcode' ||
    lower === 'acreportcode'
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
    return 'Interest Details';
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
    lower.includes('autoclosure') ||
    lower.includes('safecustody') ||
    lower.includes('printreceipt') ||
    lower === 'ffdschemecode'
  ) {
    return 'Flexi-Deposit';
  }

  if (
    lower === 'interest method (dr.)' ||
    lower === 'interest method (dr.)_1'
  ) {
    return 'Scheme';
  }

  if (lower.includes('relatedparty') || lower.includes('relation') || lower === 'dsainformation' || lower === 'sourcingdealerid' || lower === 'disbursingdealerid') {
    return 'Related Party';
  }

  if (
    lower.includes('occupation') ||
    lower.includes('sector') ||
    lower.includes('subsector') ||
    lower.includes('reportcode')
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
    return 'Document Details';
  }

  if (
    lower.includes('accountlimits') ||
    lower.includes('drawingpower') ||
    lower.includes('penal') ||
    lower === 'limit level interest' ||
    lower === 'sanctionauthority' ||
    lower === 'limitreferenceno' ||
    lower === 'accountlimitsreviewdate' ||
    lower === 'documentdate'
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
    lower === 'ratecode' ||
    lower === 'externalsystempricingfor' ||
    lower === 'relationshippricingid' ||
    lower === 'pricingeffectivedate' ||
    lower === 'pricingreviewdate'
  ) {
    return 'Other Details';
  }

  return null;
}

function fieldTabMap(fieldName: string): string {
  if (/^MIS\s+Free\s+(?:Text|Code)\s+\d+$/i.test(fieldName)) return 'MIS Codes';
  if (/^Document\s+Free\s+(?:Text|Code)\s+\d+$/i.test(fieldName)) return 'Document Details';
  return inferTab(fieldName) ?? 'General Details';
}

function groupCurrentModifyData(rows: Record<string, string>[]): { main: Record<string, string>; related: Record<string, string>[] }[] {
  const groups: { main: Record<string, string>; related: Record<string, string>[] }[] = [];
  let current: { main: Record<string, string> | null; related: Record<string, string>[] } = { main: null, related: [] };
  for (const row of rows) {
    const sheet = (row.Sheet ?? '').trim().toLowerCase();
    const hasInstance = row.instance && String(row.instance).trim() !== '';
    const hasAccountId = row.accountId && String(row.accountId).trim() !== '';
    const isMain = sheet === 'main' || (sheet !== 'related party' && (hasInstance || hasAccountId));
    if (isMain) {
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

const CURRENT_MODIFY_DATA = groupCurrentModifyData(loadCurrentModifyData());
const TARGET_INSTANCE = process.env.INSTANCE ? String(process.env.INSTANCE).trim() : '';

const groupsToRun = TARGET_INSTANCE
  ? CURRENT_MODIFY_DATA.filter((g) => String(g.main.instance) === TARGET_INSTANCE)
  : CURRENT_MODIFY_DATA;

for (const group of groupsToRun) {
  const effectiveAccountId = group.main.accountId;
  const instance = String(group.main.instance);
  const row = group.main;
  const relatedPartyRows = group.related;

  test.describe('Current Account Modification - ' + effectiveAccountId, () => {
    test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

    let homePage: HomePage;
    let accountPage: AccountPage;

    test.beforeEach(async ({ page }) => {
      test.setTimeout(300000);
      ({ homePage } = await loginToFinacle(
        page,
        CREDENTIALS.credentials.username,
        CREDENTIALS.credentials.password
      ));
      accountPage = new AccountPage(page);
    });

    test('HACM - data-driven current account modification - ' + effectiveAccountId, async ({ page }) => {
      console.log('[Modification] Using Account ID: ' + effectiveAccountId);

      await accountPage.selectCoreServer();
      await page.waitForTimeout(3000);

      console.log('Searching for ' + COMMON_DATA.currentAccount.screens.modifyAndVerify + '...');
      await accountPage.searchMenu(COMMON_DATA.currentAccount.screens.modifyAndVerify);
      await page.waitForTimeout(3000);

      console.log('Selecting Modify function...');
      await accountPage.selectFunction('Modify');

      console.log('Entering account ID to modify: ' + effectiveAccountId + '...');
      await accountPage.enterHacmAccountId(effectiveAccountId);

      console.log('Clicking Go button...');
      await accountPage.clickGo();
      await page.waitForTimeout(3000);

      const fieldsToProcess = Object.keys(row).filter(
        (k) =>
          !IDENTITY_FIELDS.includes(k) &&
          !k.startsWith('__EMPTY') &&
          !k.startsWith('_') &&
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
      let espIsCharge = false;

      for (const tab of TAB_ORDER) {
        const tabFields = tabToFields.get(tab);
        if (!tabFields || tabFields.length === 0) continue;
        if (TABS_TO_SKIP.includes(tab)) {
          console.log(`[Tab] ${tab} - skipped per configuration`);
          continue;
        }

        if (tab === 'General Details') {
          const getPriority = (f: string) => GENERAL_DETAILS_FIELD_ORDER[f.replace(/[^a-z0-9]/gi, '').toLowerCase()] ?? 0;
          tabFields.sort((a, b) => getPriority(a) - getPriority(b));
        }

        console.log('[Tab] ' + tab + ' - ' + tabFields.length + ' field(s)');
        if (tab === 'General Details') {
          await accountPage.visitGeneralDetailsTab();
        } else if (tab === 'Interest Details') {
          await accountPage.visitInterestDetailsTab();
        } else if (tab === 'Scheme') {
          await accountPage.visitSchemeDetailsTab();
        } else if (tab === 'FFD Details') {
          await accountPage.visitTab('FFD Details');
        } else if (tab === 'Related Party') {
          await accountPage.visitRelatedPartyTab();
        } else if (tab === 'MIS Codes') {
          await accountPage.visitMiscodesTab();
        } else if (tab === 'Flexi-Deposit') {
          await accountPage.visitTab('Flexi-Deposit');
        } else if (tab === 'Other Details') {
          await accountPage.visitOthersTab();
        } else if (tab === 'Account Limits') {
          await accountPage.visitAccountLimitsTab();
        } else if (tab === 'Document Details') {
          await accountPage.visitDocumentDetailsTab();
        }
        await page.waitForTimeout(2000);

        for (const field of tabFields) {
          if (/^(?:MIS|Document)\s+Free\s+(?:Text|Code)\s+\d+$/i.test(field)) {
            continue;
          }
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

          if (field.toLowerCase() === 'externalsystempricingfor') {
            const espToken = expected.split('-')[0].trim().toLowerCase();
            espIsCharge = espToken === 'c';
            await accountPage.setCheckboxByLabel('External System Pricing', 'Yes');
            await page.waitForTimeout(1000);
            let selected = await accountPage.selectOptionByLabel('External System Pricing For', espToken);
            if (!selected) selected = await accountPage.selectOptionByLabel('Ext. System Pricing For', espToken);
            if (!selected) {
              await accountPage.selectExternalSystemPricingFor(expected);
            }
            const info = (await accountPage.getFieldValueByLabel('External System Pricing For')) ??
              (await accountPage.getFieldValueByLabel('Ext. System Pricing For')) ??
              { value: '' };
            const actual = info.value;
            const ok = selected || valuesMatch(expected, actual);
            results.push({ field, expected, actual, status: ok ? 'Updated' : 'NotFound' });
            if (ok) anyChanges = true;
            continue;
          }

          if (field === 'A/c. Status' || field === 'accountStatus') {
            const actual = (await accountPage.getAccountStatus()) ?? '';
            if (valuesMatch(expected, actual)) {
              results.push({ field, expected, actual, status: 'Skipped' });
            } else {
              const token = expected.split('-')[0].trim().toLowerCase() || 'active';
              const ok = await accountPage.selectAccountStatus(token as any);
              const actual2 = (await accountPage.getAccountStatus()) ?? '';
              const updated = ok && valuesMatch(expected, actual2);
              results.push({ field, expected, actual: actual2, status: updated ? 'Updated' : 'Failed' });
              if (updated) anyChanges = true;
            }
            continue;
          }

          if (field === 'accountMinBalanceIndicator') {
            const actual = (await accountPage.getAccountMinBalanceIndicator()) ?? '';
            if (valuesMatch(expected, actual)) {
              results.push({ field, expected, actual, status: 'Skipped' });
            } else {
              const ok = await accountPage.selectAccountMinBalanceIndicator(expected);
              const actual2 = (await accountPage.getAccountMinBalanceIndicator()) ?? '';
              const updated = ok && valuesMatch(expected, actual2);
              results.push({ field, expected, actual: actual2, status: updated ? 'Updated' : 'Failed' });
              if (updated) anyChanges = true;
            }
            continue;
          }

          if (field === 'Autoclosure') {
            const actual = (await accountPage.getAutoclosure()) ?? '';
            if (valuesMatch(expected, actual)) {
              results.push({ field, expected, actual, status: 'Skipped' });
            } else {
              const ok = await accountPage.selectAutoclosure(expected);
              const actual2 = (await accountPage.getAutoclosure()) ?? '';
              const updated = ok && valuesMatch(expected, actual2);
              results.push({ field, expected, actual: actual2, status: updated ? 'Updated' : 'Failed' });
              if (updated) anyChanges = true;
            }
            continue;
          }

          if (field === 'General Ledger Subhead Code' || field === 'glSubHeadCode') {
            const actual = (await accountPage.getGeneralLedgerSubheadCode()) ?? '';
            if (valuesMatch(expected, actual)) {
              results.push({ field, expected, actual, status: 'Skipped' });
            } else {
              results.push({ field, expected, actual, status: 'ReadOnly' });
            }
            continue;
          }

          if (
            field === 'Safe Custody' ||
            field === 'Print Receipt' ||
            field.toLowerCase().startsWith('print') ||
            field === 'Interest Certificate' ||
            field === 'Interest Rate Change Advice' ||
            field === 'foreignTaxReportable'
          ) {
            const labels = candidateLabels(field);
            const actual = (await accountPage.getYesNoByLabel(field, labels)) ?? '';
            if (valuesMatch(expected, actual)) {
              results.push({ field, expected, actual, status: 'Skipped' });
            } else {
              const ok = await accountPage.selectYesNoByLabel(field, expected, labels);
              const actual2 = (await accountPage.getYesNoByLabel(field, labels)) ?? '';
              const updated = ok && valuesMatch(expected, actual2);
              results.push({ field, expected, actual: actual2, status: updated ? 'Updated' : 'Failed' });
              if (updated) anyChanges = true;
            }
            continue;
          }

          if (
            (field === 'relationshipPricingId' || field === 'pricingEffectiveDate' || field === 'pricingReviewDate') &&
            !espIsCharge
          ) {
            console.log('Skipping ' + field + ' because External System Pricing For is not Charge');
            results.push({ field, expected, actual: '', status: 'Skipped' });
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

          if (field.replace(/\s+/g, '').toLowerCase() === 'nextprintdate') {
            let acStmtInfo: Awaited<ReturnType<AccountPage['getFieldValueByLabel']>> | null = null;
            for (const acStmtLabel of ['A/c. Statement', 'A/c Statement', 'A/cStatement']) {
              acStmtInfo = await accountPage.getFieldValueByLabel(acStmtLabel);
              if (acStmtInfo) break;
            }
            const acStmt = acStmtInfo?.value ?? '';
            const acStmtNorm = clean(stripCode(acStmt));
            const isStatementEnabled = acStmtNorm.includes('statement') || acStmtNorm.includes('both');
            if (!isStatementEnabled) {
              console.log('[Next Print Date] skipping because A/c Statement = "' + acStmt + '" (not Statement/Both)');
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

        if (tab === 'MIS Codes') {
          await accountPage.expandMISFreeText();
          await accountPage.fillDynamicFreeFields(row, 'MIS');
        }
        if (tab === 'Document Details') {
          await accountPage.fillDynamicFreeFields(row, 'Document');
        }

        if (tab === 'Interest Details') {
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
                !k.startsWith('_') &&
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
                throw new Error('Failed to set related party field "' + rpField + '" to "' + rpExpected + '"');
              }
            }
          }
        }

        const tabUpdated = results.filter((r) => r.status === 'Updated' && tabFields.includes(r.field));
        if (tabUpdated.length > 0) {
          console.log('[Tab Verify] ' + tab + ' - re-checking ' + tabUpdated.length + ' updated field(s)');
          for (const r of tabUpdated) {
            const matched = fieldLabels.get(r.field);
            if (!matched) continue;
            const verifyInfo = await accountPage.getFieldValueByLabel(matched, FIELD_CONTROL_INDEX[r.field], FIELD_CONTROL_ID[r.field]);
            const actual = verifyInfo ? verifyInfo.value : r.actual;
            if (!valuesMatch(r.expected, actual)) {
              console.log('[Tab Verify] ' + r.field + ' mismatch: expected "' + r.expected + '", got "' + actual + '"');
              r.status = 'Failed';
              r.actual = actual;
            } else {
              console.log('[Tab Verify] ' + r.field + ' = "' + actual + '" OK');
            }
          }
        }

        const tabFailures = results.filter((r) => r.status === 'Failed' && tabFields.includes(r.field));
        const tabNotFound = results.filter((r) => r.status === 'NotFound' && tabFields.includes(r.field));
        if (tabFailures.length > 0) {
          console.error('[Tab ' + tab + ' failures] ' + JSON.stringify(tabFailures));
        }
        if (tabNotFound.length > 0) {
          console.warn('[Tab ' + tab + ' not found] ' + JSON.stringify(tabNotFound));
        }
        expect(tabFailures, 'Tab "' + tab + '" has failed fields: ' + JSON.stringify(tabFailures)).toHaveLength(0);
      }

      console.log('=== Current Account Modification Field Results ===');
      console.log(JSON.stringify(results, null, 2));

      const failures = results.filter((r) => r.status === 'Failed');
      const notFound = results.filter((r) => r.status === 'NotFound');
      const updates = results.filter((r) => r.status === 'Updated');

      if (failures.length > 0) {
        console.error('[Failed] ' + JSON.stringify(failures));
      }
      if (notFound.length > 0) {
        console.warn('[NotFound] ' + JSON.stringify(notFound));
      }

      expect(failures, 'One or more fields failed to be updated: ' + JSON.stringify(failures)).toHaveLength(0);

      if (updates.length > 0) {
        console.log('Submitting modification for ' + updates.length + ' updated field(s)...');
        await accountPage.submitForm();

        const result = await accountPage.verifyAccountCreated();
        console.log('Exact result message:', result.message);

        expect(result.success, 'Expected successful modification but got: ' + result.message).toBe(true);
        expect(result.message).toBeTruthy();
        expect(result.message).toMatch(/(?:successfully|posted|completed|verified|authorized|authorised|approved|modified|deleted|created|added|disbursed|generated)/i);
      } else {
        console.log('No fields required modification; skipping submit.');
      }

      if (effectiveAccountId) {
        updateSharedState((state) => {
          if (!state.currentAccounts) state.currentAccounts = {};
          state.currentAccounts[instance] = effectiveAccountId;
          state.accountId = effectiveAccountId;
        });
        console.log(`[SharedState] Stored current account for instance ${instance}: ${effectiveAccountId}`);
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
