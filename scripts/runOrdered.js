const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const suiteName = process.argv[2];

if (!suiteName) {
  console.error('Usage: node scripts/runOrdered.js <suiteName>');
  process.exit(1);
}

const testOrder = require(path.resolve(__dirname, '../tests/config/testOrder.json'));
const flow6Data = require(path.resolve(__dirname, '../data/flow6.json'));

const sharedStateFile = path.resolve(__dirname, '../data/shared-state.json');
if (fs.existsSync(sharedStateFile)) {
  fs.unlinkSync(sharedStateFile);
  console.log(`[runOrdered] Cleared stale shared state: ${sharedStateFile}`);
}

if (!testOrder[suiteName]) {
  console.error(`Suite "${suiteName}" not found.`);
  process.exit(1);
}

const headed = process.env.CI ? '' : '--headed';
const patchScript = path.resolve(__dirname, 'patch-fs.js').replace(/\\/g, '/');
const cwd = path.resolve(__dirname, '..');
const env = {
  ...process.env,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require "${patchScript}"`.trim(),
};

if (suiteName === 'flow6') {
  env.CLARIEN_MAKER = 'clariantest13';
  env.CLARIEN_CHECKER = 'clariantest14';
}

function readSharedStateJson() {
  try {
    return JSON.parse(fs.readFileSync(sharedStateFile, 'utf-8'));
  } catch {
    return {};
  }
}

function getFlow6StepEnv(file, state, htmOccurrence) {
  const overrides = {};
  if (suiteName !== 'flow6') return overrides;
  const currentAccountId = state?.accountId;
  if (!currentAccountId) return overrides;

  const accounts = flow6Data.htmAccounts || { debit: '6000123165', credit: '4600000119' };
  const amounts = flow6Data.htmDownstreamAmounts || { initialFunding: '1000', debit: '100' };

  const usesCurrentAccount =
    file.includes('currentaccountcreationverify.spec.ts') ||
    file.includes('currentaccountmodification.spec.ts') ||
    file.includes('currentaccountmodifyverification.spec.ts') ||
    file.includes('accountfundingcurrentaccount.spec.ts') ||
    file.includes('transfermaintainenceverification.spec.ts') ||
    file.includes('hpordm-remittance.spec.ts');

  if (usesCurrentAccount) {
    overrides.FLOW6_CURRENT_ACCOUNT_ID = currentAccountId;
  }

  if (file.includes('accountfundingcurrentaccount.spec.ts') || file.includes('transfermaintainenceverification.spec.ts')) {
    const direction = htmOccurrence === 1 ? 'credit' : 'debit';
    const external = direction === 'credit' ? accounts.debit : accounts.credit;
    const amount = direction === 'credit' ? amounts.initialFunding : amounts.debit;
    overrides.FLOW6_HTM_SOL_ID = flow6Data.currentAccounts?.[0]?.solId ?? '100';
    overrides.FLOW6_HTM_AMOUNT = amount;
    overrides.FLOW6_HTM_DEBIT = direction === 'credit' ? external : currentAccountId;
    overrides.FLOW6_HTM_CREDIT = direction === 'credit' ? currentAccountId : external;
  }

  return overrides;
}

function getFlow7StepEnv(file, state, htmOccurrence, savingsModOccurrence, lastHtmOverrides) {
  const accountId = state?.accountId;
  const overrides = {};

  if (file.includes('savingsaccountcreationverify.spec.ts')) {
    overrides.FLOW7_CREATION_VERIFY_ACCOUNT = accountId ?? '__ACCOUNT__';
    overrides.FLOW7_CREATION_VERIFY_SCREEN = 'HOAACVSB';
  }

  if (file.includes('accountfundingsavingsaccount.spec.ts')) {
    const created = accountId ?? '__ACCOUNT__';
    if (htmOccurrence === 1) {
      // Keep the spec defaults (6000123165 debit, created credit); initial funding uses flow7.json.
    } else if (htmOccurrence === 2) {
      overrides.FLOW7_HTM_DEBIT = created;
      overrides.FLOW7_HTM_CREDIT = '7500001512';
      overrides.FLOW7_HTM_AMOUNT = '100';
    } else if (htmOccurrence === 3) {
      // Assumption: third HTM moves back from 7500001512 to the created savings account.
      overrides.FLOW7_HTM_DEBIT = '7500001512';
      overrides.FLOW7_HTM_CREDIT = created;
      overrides.FLOW7_HTM_AMOUNT = '100';
    }
    overrides.FLOW7_HTM_CCY = 'BMD';
    overrides.FLOW7_HTM_SOL_ID = '100';
  }

  if (file.includes('transfermaintainenceverification.spec.ts') && lastHtmOverrides) {
    Object.assign(overrides, lastHtmOverrides);
  }

  if (file.includes('savingsaccountmodification.spec.ts')) {
    overrides.FLOW7_SAVINGS_DISPATCH = savingsModOccurrence === 1 ? 'no dispatch' : 'email';
  }

  return overrides;
}

function writeLastRunManifest() {
  const resultsDir = path.resolve(cwd, 'reports', 'allureReports');
  const files = fs.existsSync(resultsDir)
    ? fs.readdirSync(resultsDir).filter(f => f.endsWith('-result.json')).sort()
    : [];
  const manifest = { suite: suiteName, timestamp: new Date().toISOString(), files };
  fs.writeFileSync(path.resolve(cwd, 'reports', '.last-run.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

// Clear shared state
if (fs.existsSync(sharedStateFile)) {
  fs.writeFileSync(sharedStateFile, '{}', 'utf8');
}

// Clean reports
const htmlReportDir = path.resolve(cwd, 'reports/htmlReport');
const allureResultsDir = path.resolve(cwd, 'reports/allureReports');
const allureReportDir = path.resolve(cwd, 'reports/allure-report');
[
  htmlReportDir,
  allureResultsDir,
  allureReportDir
].forEach(dir => {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[runOrdered] Warning: could not clean ${dir} - ${err.code}: ${err.message}`);
    }
  }
});
console.log('Previous reports cleaned.\n');

const files = testOrder[suiteName];
console.log(`Running suite: ${suiteName}\n`);
let exitCode = 0;
let failedFile = '';
let htmOccurrence = 1;
let savingsModOccurrence = 1;
let flow6HtmOccurrence = 1;
let lastHtmOverrides = null;
for (let i = 0; i < files.length; i++) {
  const file = files[i];
  console.log(`[${i + 1}/${files.length}] ${file}`);
  const command=`npx playwright test --workers=1 ${file} ${headed}`;
  //const command=`npx playwright test --workers=1 ${file}`;
  env.CIF_MOD_FLOW = suiteName;

  const state = readSharedStateJson();
  const stepOverrides = {
    ...getFlow7StepEnv(file, state, htmOccurrence, savingsModOccurrence, lastHtmOverrides),
    ...getFlow6StepEnv(file, state, flow6HtmOccurrence),
  };
  const childEnv = { ...env, ...stepOverrides };

  try {
    execSync(command, {
      cwd,
      stdio: 'inherit',
      env: childEnv
    });
  } catch (e) {
    console.error(`\nExecution stopped.`);
    console.error(`Failed Spec: ${file}`);
    exitCode = 1;
    failedFile = file;
    break;
  }

  if (file.includes('accountfundingsavingsaccount.spec.ts')) {
    htmOccurrence++;
    lastHtmOverrides = stepOverrides;
  }
  if (file.includes('savingsaccountmodification.spec.ts')) {
    savingsModOccurrence++;
  }
  if (suiteName === 'flow6' && file.includes('transfermaintainenceverification.spec.ts')) {
    flow6HtmOccurrence++;
  }
}

writeLastRunManifest();

if (exitCode !== 0) {
  console.error(`\nFailed Spec: ${failedFile}`);
  process.exit(exitCode);
}
console.log('\nAll ordered specs executed successfully.');