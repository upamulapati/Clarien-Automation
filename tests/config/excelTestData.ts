import * as fs from 'fs';

import COMMON_DATA from '../../data/common-data.json';
import DEFAULT_SAVINGS_DATA from '../../data/savings-account-test-data.json';
import FLOW7_DATA from '../../data/flow7.json';

const stepDataPath = process.env.STEP_DATA;

function normalizeRows(list: any[]): any[] {
  return list.map((row: any) => {
    const normalized: any = {};
    for (const [key, value] of Object.entries(row)) {
      if (value == null || (typeof value === 'string' && value.trim() === '')) {
        normalized[key] = undefined;
      } else {
        normalized[key] = String(value);
      }
    }
    return normalized;
  });
}

function loadStepData(sheetKey: string, fallback: any[]): any[] {
  if (!stepDataPath || !fs.existsSync(stepDataPath)) {
    return fallback;
  }
  const content = JSON.parse(fs.readFileSync(stepDataPath, 'utf8'));
  const list =
    content[sheetKey] ||
    content.data ||
    Object.values(content).find((v: any) => Array.isArray(v)) ||
    [];
  return normalizeRows(list);
}

const savingsFallback = process.env.CIF_MOD_FLOW
  ? FLOW7_DATA.savingsAccounts
  : DEFAULT_SAVINGS_DATA;

const currentModifyFallback = ((COMMON_DATA.accountModification as any[]) || [])
  .filter((a: any) => a.type === 'current');
const currentModifyVerifyFallback = ((COMMON_DATA.accountVerification as any[]) || [])
  .filter((a: any) => a.type === 'current');
const savingsModifyFallback = ((COMMON_DATA.accountModification as any[]) || [])
  .filter((a: any) => a.type === 'savings');
const savingsModifyVerifyFallback = ((COMMON_DATA.accountVerification as any[]) || [])
  .filter((a: any) => a.type === 'savings');

export const CURRENT_ACCOUNT_DATA = loadStepData('currentData', []);
export const SAVINGS_DATA = loadStepData('savingsData', savingsFallback);
export const CURRENT_MODIFY_DATA = loadStepData('currentModifyData', currentModifyFallback);
export const CURRENT_MODIFY_VERIFY_DATA = loadStepData('currentModifyVerifyData', currentModifyVerifyFallback);
export const SAVINGS_MODIFY_DATA = loadStepData('savingsModifyData', savingsModifyFallback);
export const SAVINGS_MODIFY_VERIFY_DATA = loadStepData('savingsModifyVerifyData', savingsModifyVerifyFallback);
export const TRANSFER_DATA = loadStepData('transferData', []);
export const DEFAULT_CUSTOMER = COMMON_DATA.defaultCustomer;
