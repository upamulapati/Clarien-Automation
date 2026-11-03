import * as fs from 'fs';
import * as path from 'path';

import COMMON_DATA from '../../data/common-data.json';
import DEFAULT_SAVINGS_DATA from '../../data/savings-account-test-data.json';
import FLOW7_DATA from '../../data/flow7.json';
import DEFAULT_HPORDM_DATA from './hpordmTestData.json';
import DEFAULT_TERM_DEPOSIT_DATA from './termDepositTestData.json';
import DEFAULT_TOP_UP_DEPOSIT_DATA from './topUpDepositTestData.json';

const ROW_KEYS = ['instance', 'flowName', 'name', 'sharedKey', 'menuOption', 'function', 'enabled'];

function tryParse(v: any): any {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      return JSON.parse(s);
    } catch {
      return v;
    }
  }
  return v;
}

function extractList(content: any, key: string): any[] {
  if (content == null) return [];
  if (Array.isArray(content)) return content;
  if (content[key] && Array.isArray(content[key])) return content[key];
  const arr = Object.values(content).find((v: any) => Array.isArray(v));
  return arr ? (arr as any[]) : [];
}

function normalizeRow(row: any, defaults: Record<string, any> = {}): any {
  const base: any = {};
  let data: any = {};
  for (const [k, v] of Object.entries(row ?? {})) {
    const parsed = tryParse(v);
    if (ROW_KEYS.includes(k)) {
      base[k] = parsed;
    } else if (k === 'data' && typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null) {
      data = { ...data, ...parsed };
    } else {
      data[k] = parsed;
    }
  }
  // Copy base keys into data so specs that merge row properties still get identifiers.
  for (const key of ROW_KEYS) {
    if (base[key] !== undefined) data[key] = base[key];
  }
  // Apply defaults for both the base and the data payload.
  for (const [key, value] of Object.entries(defaults)) {
    if (base[key] === undefined) base[key] = value;
    if (data[key] === undefined) data[key] = value;
  }
  return { ...base, data };
}

function normalizeRows(list: any[], defaults: Record<string, any> = {}): any[] {
  return list.map((row) => normalizeRow(row, defaults));
}

const xlsx = require('xlsx');

function loadSavingsFromExcel(): any[] | null {
  try {
    const excelPath = path.resolve(__dirname, '../../data/test-data.xlsx');
    if (!fs.existsSync(excelPath)) return null;
    const wb = xlsx.readFile(excelPath);
    const ws = wb.Sheets['SavingsAccountData'];
    if (!ws) return null;
    const rows = xlsx.utils.sheet_to_json(ws, { defval: '' }) as any[];
    return rows.filter((r) => r.enabled == null || String(r.enabled).toUpperCase() !== 'N');
  } catch {
    return null;
  }
}

function loadCurrentFromExcel(): any[] | null {
  try {
    const excelPath = path.resolve(__dirname, '../../data/test-data.xlsx');
    if (!fs.existsSync(excelPath)) return null;
    const wb = xlsx.readFile(excelPath);
    const ws = wb.Sheets['CurrentAccountData'];
    if (!ws) return null;
    // Read the sheet as an array of arrays so duplicate headers can be disambiguated.
    const raw = xlsx.utils.sheet_to_json(ws, { defval: '', header: 1 }) as any[][];
    if (raw.length === 0) return [];
    const rawHeaders = raw[0].map((h) => String(h).trim());
    const headers: string[] = [];
    let section = '';
    for (const h of rawHeaders) {
      const hl = h.toLowerCase().replace(/\s+/g, '');
      if (hl.includes('document')) {
        section = 'Document';
      }
      if (hl.includes('occupation') || hl.includes('sectorcode') || hl.includes('subsectorcode') || h.toLowerCase().startsWith('free code')) {
        section = 'MIS';
      }
      // Free Text/Free Code fields exist in multiple tabs, so prefix them by section.
      // This also supports future Free Text/Free Code 3, 4, etc.
      const freeFieldMatch = h.match(/^Free (Text|Code)\s+(\d+)$/i);
      if (freeFieldMatch && section) {
        headers.push(`${section} ${h}`);
      } else {
        headers.push(h);
      }
    }
    const rows = raw.slice(1).map((r) => {
      const obj: any = {};
      for (let i = 0; i < headers.length; i++) {
        let v = r[i] ?? '';
        if (typeof v === 'string') v = v.replace(/\s+/g, ' ').trim();
        obj[headers[i]] = v;
      }
      return obj;
    });
    return rows.filter((r) => r.enabled == null || String(r.enabled).toUpperCase() !== 'N');
  } catch {
    return null;
  }
}

function loadSection(
  envVar: string | undefined,
  fallback: any,
  sheetKey: string,
  defaults: Record<string, any> = {}
): any[] {
  if (envVar && fs.existsSync(envVar)) {
    const content = JSON.parse(fs.readFileSync(envVar, 'utf8'));
    return normalizeRows(extractList(content, sheetKey), defaults);
  }
  return normalizeRows(extractList(fallback, sheetKey), defaults);
}

const savingsExcel = loadSavingsFromExcel();
const savingsFallback = process.env.CIF_MOD_FLOW
  ? FLOW7_DATA.savingsAccounts
  : (savingsExcel ?? DEFAULT_SAVINGS_DATA);

const currentModifyVerifyFallback = ((COMMON_DATA.accountVerification as any[]) || [])
  .filter((a: any) => a.type === 'current');
const savingsModifyFallback = ((COMMON_DATA.accountModification as any[]) || [])
  .filter((a: any) => a.type === 'savings');
const savingsModifyVerifyFallback = ((COMMON_DATA.accountVerification as any[]) || [])
  .filter((a: any) => a.type === 'savings');

const currentExcel = loadCurrentFromExcel();

// Current / savings / transfer account data.
export const CURRENT_ACCOUNT_DATA = loadSection(process.env.STEP_DATA, currentExcel ?? [], 'currentData', {
  flowName: 'currentaccount',
  enabled: 'Y',
});

export const SAVINGS_DATA = loadSection(process.env.STEP_DATA, savingsFallback, 'savingsData', {
  flowName: 'savingsaccount',
  enabled: 'Y',
});

export const CURRENT_MODIFY_VERIFY_DATA = loadSection(process.env.STEP_DATA, currentModifyVerifyFallback, 'currentModifyVerifyData', {
  flowName: 'currentaccountmodify',
  enabled: 'Y',
});

export const SAVINGS_MODIFY_DATA = loadSection(process.env.STEP_DATA, savingsModifyFallback, 'savingsModifyData', {
  flowName: 'savingsaccountmodify',
  enabled: 'Y',
});

export const SAVINGS_MODIFY_VERIFY_DATA = loadSection(process.env.STEP_DATA, savingsModifyVerifyFallback, 'savingsModifyVerifyData', {
  flowName: 'savingsaccountmodify',
  enabled: 'Y',
});

export const TRANSFER_DATA = loadSection(process.env.STEP_DATA, [], 'transferData', {
  flowName: 'transfermaintenance',
  enabled: 'Y',
});

export const DEFAULT_CUSTOMER = COMMON_DATA.defaultCustomer as any;

// Retail loan data.
export const RETAIL_LOAN_DATA = loadSection(process.env.STEP_DATA, [], 'retailLoansData', {
  flowName: 'retailloan',
  menuOption: 'HOAACLA',
  function: 'Open',
  enabled: 'Y',
});

export const RETAIL_LOAN_MODIFY_DATA = loadSection(process.env.STEP_DATA, [], 'retailLoansModData', {
  flowName: 'retailloanmodification',
  menuOption: 'HACMLA',
  function: 'Modify',
  enabled: 'Y',
});

// HPORDM payment order data.
const hpordmRows = loadSection(process.env.HPORDM_STEP_DATA, DEFAULT_HPORDM_DATA, 'paymentOrderTestData', {
  flowName: 'paymentorder',
  menuOption: 'HPORDM',
  function: 'Add',
  enabled: 'Y',
});
export const HPORDM_TEST_DATA = { paymentOrderTestData: hpordmRows };

// Term deposit data.
const termDepositRows = loadSection(process.env.TERM_DEPOSIT_STEP_DATA, DEFAULT_TERM_DEPOSIT_DATA, 'termDepositTestData', {
  flowName: 'termdeposit',
  menuOption: 'HOAACTD',
  function: 'Add',
  enabled: 'Y',
});
export const TERM_DEPOSIT_TEST_DATA = { termDepositTestData: termDepositRows };
export const TERM_DEPOSIT_DATA = termDepositRows[0]?.data ?? {};

export function getTermDepositScenario(flowName: string): any | undefined {
  return termDepositRows.find((r) => r.flowName === flowName);
}

// Top-up deposit data.
const topUpDepositRows = loadSection(process.env.TOP_UP_DEPOSIT_STEP_DATA, DEFAULT_TOP_UP_DEPOSIT_DATA, 'topUpDepositTestData', {
  flowName: 'topupdeposit',
  menuOption: 'HOAACTU',
  function: 'Add',
  enabled: 'Y',
});
export const TOP_UP_DEPOSIT_TEST_DATA = { topUpDepositTestData: topUpDepositRows };
export const TOP_UP_DEPOSIT_DATA = topUpDepositRows[0]?.data ?? {};

export function getTopUpDepositScenario(flowName: string): any | undefined {
  return topUpDepositRows.find((r) => r.flowName === flowName);
}

function loadCollateralFromExcel(): any[] | null {
  try {
    const excelPath = path.resolve(__dirname, '../../data/test-data.xlsx');
    if (!fs.existsSync(excelPath)) return null;
    const wb = xlsx.readFile(excelPath);
    const ws = wb.Sheets['collaterallodgement'];
    if (!ws) return null;
    const rows = xlsx.utils.sheet_to_json(ws, { defval: '' }) as any[];
    return rows.filter((r) => r.enabled == null || String(r.enabled).toUpperCase() !== 'N');
  } catch {
    return null;
  }
}

const collateralExcel = loadCollateralFromExcel();

const collateralLodgementRows = loadSection(
  process.env.COLLATERAL_LODGEMENT_STEP_DATA || process.env.STEP_DATA,
  collateralExcel ?? [],
  'collateralLodgementTestData',
  {
  flowName: 'collaterallodgement',
  menuOption: 'HCLM',
  function: 'Lodge',
  enabled: 'Y',
});

export const COLLATERAL_LODGEMENT_DATA = { collateralLodgementTestData: collateralLodgementRows };

export function getCollateralScenario(flowName: string, type?: string): any | undefined {
  return collateralLodgementRows.find((r) =>
    r.flowName === flowName &&
    (type == null ||
      r.data?.collateralType === type ||
      r.data?.type === type ||
      r.name?.includes(type))
  );
}
