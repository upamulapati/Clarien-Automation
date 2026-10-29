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

const currentModifyFallback = ((COMMON_DATA.accountModification as any[]) || [])
  .filter((a: any) => a.type === 'current');
const currentModifyVerifyFallback = ((COMMON_DATA.accountVerification as any[]) || [])
  .filter((a: any) => a.type === 'current');
const savingsModifyFallback = ((COMMON_DATA.accountModification as any[]) || [])
  .filter((a: any) => a.type === 'savings');
const savingsModifyVerifyFallback = ((COMMON_DATA.accountVerification as any[]) || [])
  .filter((a: any) => a.type === 'savings');

// Current / savings / transfer account data.
export const CURRENT_ACCOUNT_DATA = loadSection(process.env.STEP_DATA, [], 'currentData', {
  flowName: 'currentaccount',
  enabled: 'Y',
});

export const SAVINGS_DATA = loadSection(process.env.STEP_DATA, savingsFallback, 'savingsData', {
  flowName: 'savingsaccount',
  enabled: 'Y',
});

export const CURRENT_MODIFY_DATA = loadSection(process.env.STEP_DATA, currentModifyFallback, 'currentModifyData', {
  flowName: 'currentaccountmodify',
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

export const DEFAULT_CUSTOMER = COMMON_DATA.defaultCustomer;

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
