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
// Temporary credential override for a flow6 run.
// When CLARIEN_MAKER / CLARIEN_CHECKER are set in the environment, the
// common-data.json and crmTestData.json credential fields are swapped at
// read time so the test specs use the requested users without edits.
// -------------------------------------------------------------------
const CLARIEN_MAKER = process.env.CLARIEN_MAKER;
const CLARIEN_CHECKER = process.env.CLARIEN_CHECKER;

if (CLARIEN_MAKER && CLARIEN_CHECKER) {
  function applyCredentialOverride(p, raw) {
    const str = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
    const obj = JSON.parse(str);
    const norm = normPath(p);

    if (norm.endsWith(normPath(path.resolve(__dirname, '../data/common-data.json')))) {
      obj.credentials = obj.credentials || {};
      obj.credentials.username = CLARIEN_MAKER;
      obj.secondCredentials = obj.secondCredentials || {};
      obj.secondCredentials.username = CLARIEN_CHECKER;
      obj.verifierCredentials = obj.verifierCredentials || {};
      obj.verifierCredentials.username = CLARIEN_CHECKER;
    }

    if (norm.endsWith(normPath(path.resolve(__dirname, '../tests/config/crmTestData.json')))) {
      obj.common = obj.common || {};
      obj.common.credentials = obj.common.credentials || {};
      obj.common.credentials.primary = obj.common.credentials.primary || {};
      obj.common.credentials.primary.username = CLARIEN_MAKER;
      obj.common.credentials.verification = obj.common.credentials.verification || {};
      obj.common.credentials.verification.username = CLARIEN_CHECKER;
    }

    return JSON.stringify(obj);
  }

  const origReadFileSync = fs.readFileSync;
  fs.readFileSync = function (p, options) {
    const file = String(p);
    const result = origReadFileSync.apply(fs, arguments);
    const norm = normPath(file);
    if (norm.endsWith(normPath(path.resolve(__dirname, '../data/common-data.json'))) ||
        norm.endsWith(normPath(path.resolve(__dirname, '../tests/config/crmTestData.json')))) {
      const overridden = applyCredentialOverride(file, result);
      if (options === 'utf8' || (options && options.encoding === 'utf8')) {
        return overridden;
      }
      return Buffer.from(overridden, 'utf8');
    }
    return result;
  };
}
