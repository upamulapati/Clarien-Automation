// Preload script: filter out inaccessible "basePage" from directory listings.
// Intercepts the internal Node.js binding so ALL fs variants are covered.
const path = require('path');
const TESTS_DIR = path.resolve(__dirname, '..', 'tests');

// Intercept at the lowest level: the internal fs binding
try {
  const binding = process.binding('fs');
  if (binding && binding.readdir) {
    const origBinding = binding.readdir;
    binding.readdir = function (...args) {
      const p = String(args[0] || '');
      if (p.replace(/\\/g, '/').replace(/\/$/, '').endsWith('/tests/basePage') ||
          p.replace(/\\/g, '/') === 'tests/basePage' ||
          path.resolve(p) === path.join(TESTS_DIR, 'basePage')) {
        // Throw ENOENT so the fs layer treats it as "directory not found"
        const err = new Error(`ENOENT: no such file or directory, scandir '${p}'`);
        err.code = 'ENOENT';
        err.errno = -2;
        err.syscall = 'scandir';
        err.path = p;
        throw err;
      }
      return origBinding.apply(this, args);
    };
  }
} catch (_) {}

// Also patch at the JS level for all fs module variants
const fs = require('fs');
const BLOCKED = 'basePage';
const IS_WIN = process.platform === 'win32';
function normPath(p) { const r = path.resolve(String(p)); return IS_WIN ? r.toLowerCase() : r; }
const TESTS_DIR_NORM = normPath(TESTS_DIR);
function isTestsDir(dir) { return normPath(dir) === TESTS_DIR_NORM; }
function strip(entries) {
  return entries.filter(e => (typeof e === 'string' ? e : e.name) !== BLOCKED);
}
function isBasePagePath(p) {
  return normPath(p) === normPath(path.join(TESTS_DIR, BLOCKED));
}

// Patch readdirSync
const origReaddirSync = fs.readdirSync;
fs.readdirSync = function (dir, opts) {
  if (isBasePagePath(dir)) return [];
  const result = origReaddirSync.call(fs, dir, opts);
  return isTestsDir(dir) ? strip(result) : result;
};

// Patch readdir (callback)
const origReaddir = fs.readdir;
fs.readdir = function (dir, optsOrCb, cb) {
  if (isBasePagePath(dir)) {
    const callback = typeof optsOrCb === 'function' ? optsOrCb : cb;
    if (typeof callback === 'function') return callback(null, []);
    return;
  }
  const callback = typeof optsOrCb === 'function' ? optsOrCb : cb;
  const opts = typeof optsOrCb === 'function' ? undefined : optsOrCb;
  return origReaddir.call(fs, dir, opts, (err, entries) => {
    if (!err && isTestsDir(dir)) entries = strip(entries);
    callback(err, entries);
  });
};

// Patch opendirSync
const origOpendirSync = fs.opendirSync;
if (origOpendirSync) {
  fs.opendirSync = function (dir, opts) {
    if (isBasePagePath(dir)) {
      // Return a Dir-like that immediately returns null
      return { readSync() { return null; }, closeSync() {}, [Symbol.asyncIterator]: async function*(){} };
    }
    const d = origOpendirSync.call(fs, dir, opts);
    if (!isTestsDir(dir)) return d;
    const origRS = d.readSync.bind(d);
    d.readSync = function () {
      while (true) {
        const e = origRS();
        if (!e) return null;
        if (e.name === BLOCKED) continue;
        return e;
      }
    };
    return d;
  };
}

// Patch promises.readdir
if (fs.promises) {
  const origPR = fs.promises.readdir;
  fs.promises.readdir = async function (dir, opts) {
    if (isBasePagePath(dir)) return [];
    const result = await origPR.call(fs.promises, dir, opts);
    return isTestsDir(dir) ? strip(result) : result;
  };
}

// -------------------------------------------------------------------
// Flow data override.
// When CIF_MOD_FLOW=flowX, any data/*.json file is merged with the
// values from data/flowX.json so each flow uses its own data.
// CLARIEN_MAKER / CLARIEN_CHECKER still swap credentials.
// -------------------------------------------------------------------
const CLARIEN_MAKER = process.env.CLARIEN_MAKER;
const CLARIEN_CHECKER = process.env.CLARIEN_CHECKER;
const CIF_MOD_FLOW = process.env.CIF_MOD_FLOW;
const DATA_DIR = path.resolve(__dirname, '../data');
const DATA_DIR_NORM = normPath(DATA_DIR);
const FLOW_X_PATH = CIF_MOD_FLOW ? path.resolve(DATA_DIR, `${CIF_MOD_FLOW}.json`) : null;

const origReadFileSync = fs.readFileSync;
const COMMON_DATA_PATH = path.resolve(__dirname, '../data/common-data.json');
const CRM_TEST_DATA_PATH = path.resolve(__dirname, '../tests/config/crmTestData.json');

let FLOW_X_DATA = null;
if (FLOW_X_PATH) {
  try {
    FLOW_X_DATA = JSON.parse(origReadFileSync(FLOW_X_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[patch-fs] Could not load ${CIF_MOD_FLOW}.json: ${err.message}`);
    }
  }
}

function applyDataOverride(p, raw) {
  const str = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  const norm = normPath(p);

  // Runtime/persisted state files must not be merged with flow data.
  if (norm.endsWith(normPath(path.resolve(DATA_DIR, 'shared-state.json'))) ||
      norm.endsWith(normPath(path.resolve(DATA_DIR, 'cif-pool.json')))) {
    return str;
  }

  // Active flow data is merged into every data/*.json read.
  if (FLOW_X_DATA && norm.startsWith(DATA_DIR_NORM) && norm.endsWith('.json') && !norm.endsWith(normPath(FLOW_X_PATH))) {
    const original = JSON.parse(str);
    const merged = { ...original, ...FLOW_X_DATA };

    // Map common-data defaultCustomer from the active flow cif/account details.
    if (norm.endsWith(normPath(COMMON_DATA_PATH))) {
      if (merged.defaultCustomer) {
        merged.defaultCustomer.cifCode = FLOW_X_DATA.cifId || merged.defaultCustomer.cifCode;
        const accounts = FLOW_X_DATA.currentAccounts || FLOW_X_DATA.savingsAccounts;
        if (accounts && accounts[0]) {
          const acc = accounts[0];
          merged.defaultCustomer.ccy = acc.currency || merged.defaultCustomer.ccy;
          merged.defaultCustomer.solId = acc.solId || merged.defaultCustomer.solId;
          merged.defaultCustomer.functionOption = acc.functionOption || merged.defaultCustomer.functionOption;
          merged.defaultCustomer.dispatchMode = acc.dispatchMode || merged.defaultCustomer.dispatchMode;
        }
      }
      const current = FLOW_X_DATA.currentAccounts;
      const savings = FLOW_X_DATA.savingsAccounts;
      if (current && current[0]) {
        merged.currentAccountSchemes = [current[0].schemeCode, ...(merged.currentAccountSchemes || [])];
      }
      if (savings && savings[0]) {
        merged.savingsAccountSchemes = [savings[0].schemeCode, ...(merged.savingsAccountSchemes || [])];
      }
      if (CLARIEN_MAKER && CLARIEN_CHECKER) {
        merged.credentials = merged.credentials || {};
        merged.credentials.username = CLARIEN_MAKER;
        merged.secondCredentials = merged.secondCredentials || {};
        merged.secondCredentials.username = CLARIEN_CHECKER;
        merged.verifierCredentials = merged.verifierCredentials || {};
        merged.verifierCredentials.username = CLARIEN_CHECKER;
        merged.thirdCredentials = merged.thirdCredentials || {};
        merged.thirdCredentials.username = CLARIEN_MAKER;
      }
    }

    return JSON.stringify(merged);
  }

  // crmTestData.json credentials are swapped when requested.
  if (CLARIEN_MAKER && CLARIEN_CHECKER && norm.endsWith(normPath(CRM_TEST_DATA_PATH))) {
    const obj = JSON.parse(str);
    obj.common = obj.common || {};
    obj.common.credentials = obj.common.credentials || {};
    obj.common.credentials.primary = obj.common.credentials.primary || {};
    obj.common.credentials.primary.username = CLARIEN_MAKER;
    obj.common.credentials.verification = obj.common.credentials.verification || {};
    obj.common.credentials.verification.username = CLARIEN_CHECKER;
    return JSON.stringify(obj);
  }

  return str;
}

fs.readFileSync = function (p, options) {
  const file = String(p);
  const result = origReadFileSync.apply(fs, arguments);
  const norm = normPath(file);
  const isFlowDataTarget = FLOW_X_DATA && norm.startsWith(DATA_DIR_NORM) && norm.endsWith('.json') && !norm.endsWith(normPath(FLOW_X_PATH));
  const isCredentialTarget = (CLARIEN_MAKER && CLARIEN_CHECKER) &&
    (norm.endsWith(normPath(COMMON_DATA_PATH)) || norm.endsWith(normPath(CRM_TEST_DATA_PATH)));
  if (isFlowDataTarget || isCredentialTarget) {
    const overridden = applyDataOverride(file, result);
    if (options === 'utf8' || (options && options.encoding === 'utf8')) {
      return overridden;
    }
    return Buffer.from(overridden, 'utf8');
  }
  return result;
};
