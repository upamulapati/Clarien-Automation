import * as fs from 'fs';
import * as path from 'path';

// =====================================================================
// sharedState — single runtime JSON file for all generated test data.
//
// Any data produced by one spec and consumed by another is written here
// instead of scattered JSON files under data/. The file is git-ignored.
// =====================================================================

const DATA_DIR = path.resolve(__dirname, '../../data');
export const SHARED_STATE_FILE = path.join(DATA_DIR, 'shared-state.json');
const CIF_POOL_FILE = path.join(DATA_DIR, 'cif-pool.json');

export interface CifEntry {
  cifId: string;
  savedAt: string;
}

export interface SharedState {
  cifs?: {
    retail?: CifEntry;
    corporate?: CifEntry;
  };
  collateralIds?: {
    latest?: string;
    ids: string[];
  };
  collateralRecords?: { type: string; id: string }[];
  transactionIds?: string[];
  termDepositAccounts?: Record<string, string>;
  topUpDepositAccounts?: Record<string, string>;
  closedAccounts?: {
    termDepositPartial?: string;
    topUpDeposit?: string;
    topUpDepositPartial?: string;
  };
  loanAccountNumber?: string;
  loanAccountId?: string;
  accountId?: string;
  savingsAccounts?: Record<string, string>;
  transactionId?: string;
  demandDraftId?: string;
  demandDraftCancellationId?: string;
  inventoryVaultId?: string;
  inventoryDoubleLockId?: string;
  inventoryVaultDate?: string;
  inventoryDoubleLockDate?: string;
  hpordmId?: string;
  cifId?: string;
}

export function readSharedState(): SharedState {
  if (!fs.existsSync(SHARED_STATE_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(SHARED_STATE_FILE, 'utf8');
    return JSON.parse(raw) as SharedState;
  } catch (e) {
    console.log(`[sharedState] Could not read ${SHARED_STATE_FILE}: ${e}`);
    return {};
  }
}

export function writeSharedState(state: Partial<SharedState>): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const current = readSharedState();
    const merged: Record<string, any> = { ...current, ...state };
    // merge nested objects (cifs, collateralIds, etc.) instead of overwriting them
    for (const key of Object.keys(state)) {
      const newVal = (state as any)[key];
      const curVal = (current as any)[key];
      if (
        newVal &&
        typeof newVal === 'object' &&
        !Array.isArray(newVal) &&
        curVal &&
        typeof curVal === 'object' &&
        !Array.isArray(curVal)
      ) {
        merged[key] = { ...curVal, ...newVal };
      }
    }
    fs.writeFileSync(SHARED_STATE_FILE, JSON.stringify(merged, null, 2), 'utf8');
  } catch (e) {
    console.log(`[sharedState] Could not write ${SHARED_STATE_FILE}: ${e}`);
  }
}

export function updateSharedState(updater: (state: SharedState) => void): void {
  const state = readSharedState();
  updater(state);
  writeSharedState(state);
}

// ----------------------------------------------------------------------
// CIF helpers
// ----------------------------------------------------------------------
export type CifSection = 'retail' | 'corporate';

function readCifPool(): Record<CifSection, CifEntry | undefined> {
  if (!fs.existsSync(CIF_POOL_FILE)) return {} as Record<CifSection, CifEntry | undefined>;
  try {
    return JSON.parse(fs.readFileSync(CIF_POOL_FILE, 'utf8')) as Record<CifSection, CifEntry | undefined>;
  } catch (e) {
    return {} as Record<CifSection, CifEntry | undefined>;
  }
}

function writeCifPool(section: CifSection, cifId: string): void {
  const pool = readCifPool();
  pool[section] = { cifId, savedAt: new Date().toISOString() };
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(CIF_POOL_FILE, JSON.stringify(pool, null, 2), 'utf8');
}

export function getCif(section: CifSection): string | undefined {
  // cif-pool.json is the persistent, user-editable source of truth.
  // saveCif() always keeps this in sync, so it takes precedence over transient shared-state.
  const pool = readCifPool();
  if (pool[section]?.cifId) {
    return pool[section].cifId;
  }
  const state = readSharedState();
  return state.cifs?.[section]?.cifId;
}

export function saveCif(section: CifSection, cifId: string): void {
  if (!cifId) return;
  updateSharedState((state) => {
    if (!state.cifs) state.cifs = {};
    state.cifs[section] = { cifId, savedAt: new Date().toISOString() };
  });
  writeCifPool(section, cifId);
  console.log(`[sharedState] Saved ${section} CIF ID "${cifId}" (persisted to cif-pool)`);
}

// ----------------------------------------------------------------------
// Collateral ID helpers
// ----------------------------------------------------------------------
export function getCollateralIds(): { latest?: string; ids: string[] } {
  const state = readSharedState();
  return state.collateralIds ?? { ids: [] };
}

export function readLatestCollateralId(): string | undefined {
  return getCollateralIds().latest;
}

export function readCollateralIds(): string[] {
  return getCollateralIds().ids;
}

export function recordCollateralId(id: string, type?: string): void {
  if (!id || id.trim() === '') return;
  updateSharedState((state) => {
    const existing = state.collateralIds ?? { ids: [] };
    state.collateralIds = {
      latest: id,
      ids: [id, ...(existing.ids ?? []).filter((existingId) => existingId !== id)],
    };
    const records = state.collateralRecords ?? [];
    if (!records.some((r) => r.id === id)) {
      records.unshift({ type: type ?? 'Unknown', id });
    }
    state.collateralRecords = records;
  });
  console.log(`[sharedState] Persisted collateral id: ${id}`);
}

export function resetCollateralIds(): void {
  updateSharedState((state) => {
    state.collateralIds = { ids: [] };
    state.collateralRecords = [];
  });
  console.log('[sharedState] Cleared persisted collateral ids and records');
}

export function readCollateralRecords(): { type: string; id: string }[] {
  const state = readSharedState();
  return state.collateralRecords ?? [];
}

// ----------------------------------------------------------------------
// Transaction ID helpers
// ----------------------------------------------------------------------
export function getTransactionIds(): string[] {
  const state = readSharedState();
  return (state.transactionIds ?? []).filter((id): id is string => typeof id === 'string');
}

export function readTransactionIds(): string[] {
  return getTransactionIds();
}

export function recordTransactionId(id: string): void {
  updateSharedState((state) => {
    const ids = state.transactionIds ?? [];
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
    state.transactionIds = ids;
  });
}

export function resetTransactionIds(): void {
  updateSharedState((state) => {
    state.transactionIds = [];
  });
}

export function saveTransactionIds(ids: string[]): void {
  updateSharedState((state) => {
    state.transactionIds = ids;
  });
}

// ----------------------------------------------------------------------
// Term deposit account helpers
// ----------------------------------------------------------------------
export interface TermDepositAccount {
  schemeCode: string;
  accountNumber: string;
}

export function getTermDepositAccounts(): Record<string, string> {
  const state = readSharedState();
  return state.termDepositAccounts ?? {};
}

export function readTermDepositAccounts(): TermDepositAccount[] {
  const data = getTermDepositAccounts();
  return Object.entries(data)
    .filter(([, acct]) => acct && acct.trim() !== '')
    .map(([schemeCode, accountNumber]) => ({ schemeCode, accountNumber }));
}

export function readTermDepositAccountByScheme(schemeCode: string): TermDepositAccount | undefined {
  const data = getTermDepositAccounts();
  const accountNumber = data[schemeCode];
  if (!accountNumber || accountNumber.trim() === '') return undefined;
  return { schemeCode, accountNumber };
}

export function readFirstTermDepositAccount(): TermDepositAccount | undefined {
  return readTermDepositAccounts()[0];
}

export function saveTermDepositAccount(schemeCode: string, accountNumber: string): void {
  updateSharedState((state) => {
    if (!state.termDepositAccounts) state.termDepositAccounts = {};
    state.termDepositAccounts[schemeCode] = accountNumber;
  });
}

export function saveTermDepositAccounts(accounts: Record<string, string>): void {
  updateSharedState((state) => {
    state.termDepositAccounts = accounts;
  });
}

// ----------------------------------------------------------------------
// Top-up deposit account helpers
// ----------------------------------------------------------------------
export function getTopUpDepositAccounts(): Record<string, string> {
  const state = readSharedState();
  return state.topUpDepositAccounts ?? {};
}

export function saveTopUpDepositAccount(schemeCode: string, accountNumber: string): void {
  updateSharedState((state) => {
    if (!state.topUpDepositAccounts) state.topUpDepositAccounts = {};
    state.topUpDepositAccounts[schemeCode] = accountNumber;
  });
}

export function saveTopUpDepositAccounts(accounts: Record<string, string>): void {
  updateSharedState((state) => {
    state.topUpDepositAccounts = accounts;
  });
}

// ----------------------------------------------------------------------
// Closed account ID helpers (used by closure verifications)
// ----------------------------------------------------------------------
export type ClosedAccountType =
  | 'termDepositPartial'
  | 'topUpDeposit'
  | 'topUpDepositPartial';

export function getClosedAccountId(type: ClosedAccountType): string | undefined {
  const state = readSharedState();
  return state.closedAccounts?.[type];
}

export function saveClosedAccountId(type: ClosedAccountType, accountId: string): void {
  updateSharedState((state) => {
    if (!state.closedAccounts) state.closedAccounts = {};
    state.closedAccounts[type] = accountId;
  });
  console.log(`[sharedState] Saved ${type} closed account id: ${accountId}`);
}

// ----------------------------------------------------------------------
// Loan account helpers
// ----------------------------------------------------------------------
export function readLatestLoanAccount(): string | undefined {
  const state = readSharedState();
  return state.loanAccountNumber ?? (state as any).loanAccountId;
}

export function saveLoanAccount(accountNumber: string): void {
  updateSharedState((state) => {
    state.loanAccountNumber = accountNumber;
  });
  console.log(`[sharedState] Saved loan account number: ${accountNumber}`);
}

// ----------------------------------------------------------------------
// Generic helpers for ad-hoc shared values
// ----------------------------------------------------------------------
export function getSharedValue<T = any>(key: string): T | undefined;
export function getSharedValue<T = any>(getter: (state: SharedState) => T | undefined): T | undefined;
export function getSharedValue<T = any>(
  keyOrGetter: string | ((state: SharedState) => T | undefined)
): T | undefined {
  const state = readSharedState();
  if (typeof keyOrGetter === 'function') {
    return keyOrGetter(state);
  }
  return (state as any)[keyOrGetter] as T | undefined;
}

export function setSharedValue<T>(
  setter: (state: SharedState, value: T) => void,
  value: T
): void {
  updateSharedState((state) => setter(state, value));
}
