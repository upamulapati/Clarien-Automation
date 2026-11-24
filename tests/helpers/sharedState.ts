import * as fs from 'fs';
import * as path from 'path';

// =====================================================================
// sharedState — single runtime JSON file for all generated test data.
//
// Any data produced by one spec and consumed by another is written here
// instead of scattered JSON files under data/. The file is git-ignored.
// =====================================================================

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');
export const SHARED_STATE_FILE = path.join(DATA_DIR, 'shared-state.json');
const CIF_POOL_FILE = path.join(DATA_DIR, 'cif-pool.json');

export interface CifEntry {
  cifId: string;
  savedAt: string;
}

export interface SharedState {
  accountId?: string;
  relatedPartyAddedForSavings?: boolean;
  cifId?: string;
  loanCifId?: string;
  loanAccountId?: string;
  transactionId?: string | null;
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
    termDepositPremature?: string;
    topUpDeposit?: string;
    topUpDepositPartial?: string;
  };
  chargeoffLoanAccountId?: string;
  payoffLoanAccountId?: string;
  loanAccountNumber?: string;
  savingsAccounts?: Record<string, string>;
  currentAccounts?: Record<string, string>;
  loanAccounts?: Record<string, string>;
  modifiedSavingsAccountId?: string;
  demandDraftId?: string;
  demandDraftCancellationId?: string;
  inventoryVaultId?: string;
  inventoryDoubleLockId?: string;
  inventoryVaultDate?: string;
  inventoryDoubleLockDate?: string;
  hpordmId?: string;
  [suiteName: string]: any;
}

export function readSharedState(): SharedState {
  let state: any = {};
  if (fs.existsSync(SHARED_STATE_FILE)) {
    try {
      const raw = fs.readFileSync(SHARED_STATE_FILE, 'utf8');
      state = JSON.parse(raw);
    } catch (e) {
      console.log(`[sharedState] Could not read ${SHARED_STATE_FILE}: ${e}`);
      state = {};
    }
  }
  normalizeSharedState(state);
  addLegacyCompatKeys(state);
  return state as SharedState;
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
    normalizeSharedState(merged);
    // Do not persist the in-memory legacy compatibility keys.
    delete merged.accountId;
    delete merged.savingsAccounts;
    delete merged.currentAccounts;
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
// Shared-state normalization / compatibility
// The persisted file always uses the per-suite / per-instance structure.
// Legacy keys (savingsAccounts, currentAccounts, accountId) are rebuilt
// in memory after reading so existing specs can continue using them.
// ----------------------------------------------------------------------

function isNumericKey(key: string): boolean {
  return /^\d+$/.test(key);
}

function applyInstanceResult(
  state: any,
  suite: string,
  instance: string | number,
  result: Partial<InstanceResult>
): void {
  if (!state[suite]) state[suite] = {};
  if (!state[suite].instances) state[suite].instances = {};
  const existing = state[suite].instances[String(instance)] || {};
  const merged = { ...existing, ...result };
  if (result.status === 'passed') {
    delete (merged as any).error;
    delete (merged as any).reason;
    delete (merged as any).upstreamError;
    delete (merged as any).upstreamStatus;
  }
  state[suite].instances[String(instance)] = merged;
}

function normalizeSharedState(state: any): void {
  if (!state || typeof state !== 'object') return;

  const legacyContainers: Record<string, string> = {
    savingsAccounts: 'savingsAccount',
    currentAccounts: 'currentAccount',
  };

  for (const [legacyKey, suiteName] of Object.entries(legacyContainers)) {
    const container = state[legacyKey];
    if (container && typeof container === 'object' && !Array.isArray(container)) {
      for (const [inst, accountId] of Object.entries(container)) {
        if (
          isNumericKey(inst) &&
          typeof accountId === 'string' &&
          accountId.trim() !== ''
        ) {
          applyInstanceResult(state, suiteName, inst, {
            status: 'passed',
            accountId,
          });
        }
      }
      delete state[legacyKey];
    }
  }

  if (typeof state.accountId === 'string' && state.accountId.trim() !== '') {
    const hasAccount = Object.values(state).some(
      (suite: any) =>
        suite &&
        typeof suite === 'object' &&
        suite.instances &&
        Object.values(suite.instances).some(
          (inst: any) =>
            inst &&
            typeof inst === 'object' &&
            typeof inst.accountId === 'string' &&
            inst.accountId.trim() !== ''
        )
    );
    if (!hasAccount) {
      applyInstanceResult(state, getSuiteName('default'), '1', {
        status: 'passed',
        accountId: state.accountId,
      });
    }
    delete state.accountId;
  }
}

function addLegacyCompatKeys(state: any): void {
  if (!state || typeof state !== 'object') return;

  const suiteToLegacy: Record<string, string> = {
    savingsAccount: 'savingsAccounts',
    currentAccount: 'currentAccounts',
  };

  for (const [suiteName, legacyKey] of Object.entries(suiteToLegacy)) {
    const suite = state[suiteName];
    if (suite?.instances) {
      const container: Record<string, string> = {};
      for (const [inst, res] of Object.entries(suite.instances)) {
        if (
          res &&
          typeof res === 'object' &&
          typeof (res as InstanceResult).accountId === 'string'
        ) {
          container[inst] = (res as InstanceResult).accountId as string;
        }
      }
      if (Object.keys(container).length > 0) {
        state[legacyKey] = container;
      }
    }
  }

  // Rebuild top-level accountId from the current suite, or any passed instance.
  const currentSuite = getSuiteName('default');
  const current = state[currentSuite];
  let accountId: string | undefined;
  if (current?.instances) {
    const passed = Object.values(current.instances).find(
      (inst: any) =>
        inst &&
        inst.status === 'passed' &&
        typeof inst.accountId === 'string' &&
        inst.accountId.trim() !== ''
    ) as InstanceResult | undefined;
    accountId = passed?.accountId;
  }

  if (!accountId) {
    for (const value of Object.values(state)) {
      const suite = value as any;
      if (suite && typeof suite === 'object' && suite.instances) {
        const passed = Object.values(suite.instances).find(
          (inst: any) =>
            inst &&
            inst.status === 'passed' &&
            typeof inst.accountId === 'string' &&
            inst.accountId.trim() !== ''
        ) as InstanceResult | undefined;
        if (passed?.accountId) {
          accountId = passed.accountId;
          break;
        }
      }
    }
  }

  if (accountId) {
    state.accountId = accountId;
  }
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

// The collateral records are pushed in worksheet order, but each new record is
// unshifted to the front, so the first-created (worksheet row 1) record is at
// the end of the array.
export function readFirstCollateralRecord(): { type: string; id: string } | undefined {
  const records = readCollateralRecords();
  return records[records.length - 1];
}

export function readFirstCollateralId(): string | undefined {
  return readFirstCollateralRecord()?.id;
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
  | 'termDepositPremature'
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

// ----------------------------------------------------------------------
// Per-suite, per-instance helpers (requested structure)
// {
//   "suitename": {
//     "instances": {
//       "1": { "status": "passed", "accountId": "750000XXXX" },
//       "2": { "status": "failed", "error": "Invalid CIF Data" }
//     }
//   }
// }
// ----------------------------------------------------------------------

export interface InstanceResult {
  status: string;
  accountId?: string;
  error?: string;
  [key: string]: any;
}

export interface SuiteState {
  instances: Record<string, InstanceResult>;
}

export function getSuiteName(defaultSuite?: string): string {
  return (
    process.env.FLOW_NAME ||
    process.env.CIF_MOD_FLOW ||
    defaultSuite ||
    'default'
  );
}

export function getSuiteState(suiteName: string): SuiteState | undefined {
  const state = readSharedState() as any;
  return state[suiteName] as SuiteState | undefined;
}

export function getInstanceResult(
  instance: string | number,
  suiteName?: string
): InstanceResult | undefined {
  const suite = suiteName || getSuiteName();
  const state = readSharedState() as any;
  return state[suite]?.instances?.[String(instance)] as
    | InstanceResult
    | undefined;
}

export function saveInstanceResult(
  instance: string | number,
  result: Partial<InstanceResult>,
  suiteName?: string
): void {
  const suite = suiteName || getSuiteName();
  updateSharedState((state: any) => {
    applyInstanceResult(state, suite, instance, result);
  });
}

export function getInstanceAccountId(
  instance: string | number,
  suiteName?: string
): string | undefined {
  return getInstanceResult(instance, suiteName)?.accountId;
}

export function isDownstreamEligible(
  instance: string | number,
  suiteName?: string
): boolean {
  const result = getInstanceResult(instance, suiteName);
  return result?.status === 'passed' && !!result?.accountId;
}

export function markInstanceSkipped(
  instance: string | number,
  reason?: string,
  suiteName?: string
): void {
  const existing = getInstanceResult(instance, suiteName);
  const upstreamStatus = existing?.status;
  const upstreamError = existing?.error;
  const effectiveReason = reason || upstreamError || 'Upstream Flow Failed';
  saveInstanceResult(
    instance,
    {
      status: 'SKIPPED',
      reason: effectiveReason,
      error: effectiveReason,
      upstreamStatus,
      upstreamError
    },
    suiteName
  );
}

export function saveInstanceAccountId(
  instance: string | number,
  accountId: string,
  suiteName?: string
): void {
  saveInstanceResult(
    instance,
    { status: 'passed', accountId },
    suiteName
  );
}

export function updateInstanceStatus(
  instance: string | number,
  status: string,
  error?: string,
  suiteName?: string
): void {
  saveInstanceResult(instance, { status, error }, suiteName);
}

// ----------------------------------------------------------------------
// Legacy per-instance helpers (kept for compatibility)
// ----------------------------------------------------------------------
function pickInstanceKey(envKey: string | undefined, fallback: string): string {
  return envKey && String(envKey).trim() !== '' ? String(envKey).trim() : fallback;
}

export function getSharedInstanceValue<T = any>(
  instance: string | number,
  key?: string,
  fallbackKey?: string
): T | undefined {
  const state = readSharedState() as any;
  const k = pickInstanceKey(key || process.env.SHARED_STATE_IN, fallbackKey || 'accountId');
  const container = state[k];
  if (container && typeof container === 'object') {
    const v = container[String(instance)];
    if (v !== undefined) return v as T;
  }
  // Fallback to legacy single value when only one instance was processed
  return state[k] as T | undefined;
}

export function saveSharedInstanceValue<T = any>(
  instance: string | number,
  value: T,
  key?: string,
  fallbackKey?: string
): void {
  const k = pickInstanceKey(key || process.env.SHARED_STATE_OUT, fallbackKey || 'accountId');
  updateSharedState((state: any) => {
    if (!state[k] || typeof state[k] !== 'object') state[k] = {};
    state[k][String(instance)] = value;
  });
}
