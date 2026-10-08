const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { resolve: resolveCrmStep } = require('./crmDataResolver');

const suiteName = process.argv[2];

if (!suiteName) {
  console.error('Usage: node scripts/runOrdered.js <suiteName>');
  process.exit(1);
}

const testOrder = require(path.resolve(__dirname, '../tests/config/testOrder.json'));
const FLOW6_DATA = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/flow6.json'), 'utf8'));
const FLOW9_DATA = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/flow9.json'), 'utf8'));
const FLOW10_DATA = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/flow10.json'), 'utf8'));

const sharedStateFile = path.resolve(__dirname, '../data/shared-state.json');
if (fs.existsSync(sharedStateFile)) {
  fs.unlinkSync(sharedStateFile);
  console.log(`[runOrdered] Cleared stale shared state: ${sharedStateFile}`);
}


const headed = process.env.CI ? '' : '--headed';
const patchScript = path.resolve(__dirname, 'patch-fs.js').replace(/\\/g, '/');
const cwd = path.resolve(__dirname, '..');
const env = {
  ...process.env,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require "${patchScript}"`.trim(),
};

if (suiteName === 'flow6' || suiteName === 'flow9') {
  env.CLARIEN_MAKER = 'finacletest14';
  env.CLARIEN_CHECKER = 'finacle-test13';
  env.APPLICATION_DATE = '01-10-2026';
}

function readSharedStateJson() {
  try {
    return JSON.parse(fs.readFileSync(sharedStateFile, 'utf-8'));
  } catch {
    return {};
  }
}

function getFlow6StepEnv(file, state, htmOccurrence, modOccurrence, lastHtmOverrides) {
  const accountId = state?.accountId;
  const overrides = {};

  if (suiteName !== 'flow6') return overrides;

  if (file.includes('accountfundingcurrentaccount.spec.ts')) {
    const created = accountId ?? '__ACCOUNT__';
    if (htmOccurrence === 1) {
      overrides.FLOW6_HTM_DEBIT = FLOW6_DATA.htmAccounts.debit;
      overrides.FLOW6_HTM_CREDIT = created;
      overrides.FLOW6_HTM_AMOUNT = FLOW6_DATA.initialFundingAmount;
    } else if (htmOccurrence === 2) {
      overrides.FLOW6_HTM_DEBIT = created;
      overrides.FLOW6_HTM_CREDIT = FLOW6_DATA.htmAccounts.credit;
      overrides.FLOW6_HTM_AMOUNT = FLOW6_DATA.secondaryFundingAmount;
    }
    overrides.FLOW6_HTM_SOL_ID = FLOW6_DATA.currentAccounts[0].solId;
  }

  if (file.includes('transfermaintainenceverification.spec.ts') && lastHtmOverrides) {
    Object.assign(overrides, lastHtmOverrides);
  }

  if (file.includes('currentaccountmodification.spec.ts')) {
    overrides.FLOW6_DISPATCH_MODE = modOccurrence === 1 ? 'no dispatch' : 'email';
    overrides.FLOW6_ACCOUNT_STATUS = 'inactive';
  }

  if (file.includes('currentaccountmodifyverification.spec.ts')) {
    overrides.FLOW6_DISPATCH_MODE = modOccurrence === 1 ? 'no dispatch' : 'email';
    overrides.FLOW6_ACCOUNT_STATUS = 'inactive';
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

function getFlow10StepEnv(file) {
  if (suiteName !== 'flow10') return {};
  const overrides = {
    CIF_MOD_FLOW: 'flow10',
    CIF_ID: FLOW10_DATA.cifId,
    FLOW9_CIF_ID: FLOW10_DATA.cifId,
    FLOW9_LAST_NAME: FLOW10_DATA.lastName,
    FLOW9_PHONE_NO: FLOW10_DATA.phone.phoneNo,
    FLOW7_SAVINGS_DISPATCH: FLOW10_DATA.savingsDispatchMode,
    FLOW10_JOINT_HOLDERS: JSON.stringify(FLOW10_DATA.jointHolders),
  };
  if (file.includes('hpordm-remittance.spec.ts')) {
    // Let the spec read FLOW10_DATA directly via the CIF_MOD_FLOW env
    overrides.FLOW10_PAYMENT_ORDER_AMOUNTS = JSON.stringify(FLOW10_DATA.paymentOrderAmounts || {});
  }
  return overrides;
}

function getFlow9StepEnv(file, state, htmOccurrence, modOccurrence, lastHtmOverrides) {
  const accountId = state?.accountId;
  const overrides = {};

  if (suiteName !== 'flow9') return overrides;

  if (file.includes('currentaccountcreationverify.spec.ts')) {
    overrides.FLOW9_CURRENT_ACCOUNT_ID = accountId ?? '__ACCOUNT__';
  }

  if (file.includes('accountfundingcurrentaccount.spec.ts')) {
    const created = accountId ?? '__ACCOUNT__';
    if (htmOccurrence === 1) {
      overrides.FLOW9_HTM_DEBIT = FLOW9_DATA.htmAccounts.debit;
      overrides.FLOW9_HTM_CREDIT = created;
      overrides.FLOW9_HTM_AMOUNT = FLOW9_DATA.initialFundingAmount;
    } else if (htmOccurrence === 2) {
      overrides.FLOW9_HTM_DEBIT = created;
      overrides.FLOW9_HTM_CREDIT = FLOW9_DATA.htmAccounts.credit;
      overrides.FLOW9_HTM_AMOUNT = FLOW9_DATA.secondaryFundingAmount;
    }
    overrides.FLOW9_HTM_SOL_ID = FLOW9_DATA.currentAccounts[0].solId;
  }

  if (file.includes('transfermaintainenceverification.spec.ts') && lastHtmOverrides) {
    Object.assign(overrides, lastHtmOverrides);
  }

  if (file.includes('currentaccountmodification.spec.ts')) {
    overrides.FLOW9_DISPATCH_MODE = modOccurrence === 1 ? FLOW9_DATA.modification.dispatchMode : 'email';
    overrides.FLOW9_ACCOUNT_STATUS = FLOW9_DATA.modification.accountStatus || 'inactive';
  }

  if (file.includes('currentaccountmodifyverification.spec.ts')) {
    overrides.FLOW9_DISPATCH_MODE = modOccurrence === 1 ? FLOW9_DATA.modification.dispatchMode : 'email';
    overrides.FLOW9_ACCOUNT_STATUS = FLOW9_DATA.modification.accountStatus || 'inactive';
  }

  if (file.includes('Retailcifmodification.spec.ts')) {
    overrides.FLOW9_PHONE_NO = FLOW9_DATA.phone.phoneNo;
    overrides.FLOW9_STREET_NAME = FLOW9_DATA.address.streetName;
    overrides.FLOW9_POSTAL_CODE = FLOW9_DATA.address.postalCode;
    overrides.FLOW9_LAST_NAME = FLOW9_DATA.lastName;
    overrides.FLOW9_CIF_ID = FLOW9_DATA.cifId;
  }

  if (file.includes('hpordm-remittance.spec.ts')) {
    overrides.FLOW9_CURRENT_ACCOUNT_ID = accountId ?? FLOW9_DATA.htmAccounts.credit;
  }

  return overrides;
}

function getFlowFromExcel(suiteName) {
  const excelPath = path.resolve(__dirname, '../data/test-data.xlsx');
  if (!fs.existsSync(excelPath)) return null;
  const wb = xlsx.readFile(excelPath);
  if (!wb.Sheets['FlowConfig']) return null;

  const rows = xlsx.utils.sheet_to_json(wb.Sheets['FlowConfig']);
  const steps = rows.filter(
    r => r.flowName === suiteName && String(r.enabled).toUpperCase() !== 'N'
  );
  if (steps.length === 0) return null;

  const sorted = steps.sort((a, b) => Number(a.step) - Number(b.step));
  const files = sorted.map(s => s.spec);
  return { files, steps: sorted };
}

function resolveFlow(suiteName) {
  const fromExcel = getFlowFromExcel(suiteName);
  if (fromExcel) return fromExcel;
  if (testOrder[suiteName]) return { files: testOrder[suiteName] };
  console.error(`Suite "${suiteName}" not found in FlowConfig or testOrder.json.`);
  process.exit(1);
}

function writeLastRunManifest() {
  const resultsDir = path.resolve(cwd, 'reports', 'allureReports');
  const files = fs.existsSync(resultsDir)
    ? fs.readdirSync(resultsDir).filter(f => f.endsWith('-result.json')).sort()
    : [];
  const manifest = { suite: suiteName, startTime, timestamp: new Date().toISOString(), files };
  fs.writeFileSync(path.resolve(cwd, 'reports', '.last-run.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

// Clear shared state
if (fs.existsSync(sharedStateFile)) {
  fs.writeFileSync(sharedStateFile, '{}', 'utf8');
}

// Seed shared state for the data-driven flow10 suite
if (suiteName === 'flow10') {
  fs.writeFileSync(sharedStateFile, JSON.stringify({
    cifId: FLOW10_DATA.cifId,
    accountId: FLOW10_DATA.savingsAccountId,
  }, null, 2), 'utf8');
  console.log(`[runOrdered] Seeded flow10 shared state: cifId=${FLOW10_DATA.cifId}, accountId=${FLOW10_DATA.savingsAccountId}`);
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

const startTime = Date.now();
const flow = resolveFlow(suiteName);
const files = flow.files;
const steps = flow.steps || [];
console.log(`Running suite: ${suiteName} (${files.length} spec(s))\n`);
let exitCode = 0;
let failedFile = '';
let htmOccurrence = 1;
let savingsModOccurrence = 1;
let flow6HtmOccurrence = 1;
let lastHtmOverrides = null;
let flow6ModOccurrence = 1;
let lastFlow6HtmOverrides = null;
let flow9HtmOccurrence = 1;
let flow9ModOccurrence = 1;
let lastFlow9HtmOverrides = null;
for (let i = 0; i < files.length; i++) {
  const file = files[i];
  console.log(`[${i + 1}/${files.length}] ${file}`);
  const command=`npx playwright test --workers=1 ${file} ${headed}`;
  //const command=`npx playwright test --workers=1 ${file}`;
  env.CIF_MOD_FLOW = suiteName;

  const state = readSharedStateJson();
  const flow7Overrides = getFlow7StepEnv(file, state, htmOccurrence, savingsModOccurrence, lastHtmOverrides);
  const flow6Overrides = getFlow6StepEnv(file, state, flow6HtmOccurrence, flow6ModOccurrence, lastFlow6HtmOverrides);
  const flow9Overrides = getFlow9StepEnv(file, state, flow9HtmOccurrence, flow9ModOccurrence, lastFlow9HtmOverrides);
  const flow10Overrides = getFlow10StepEnv(file);
  const stepOverrides = { ...flow7Overrides, ...flow6Overrides, ...flow9Overrides, ...flow10Overrides };

  // Inject CRM step data for Excel-driven flows
  if (steps[i] && steps[i].dataSheet === 'CRM' && steps[i].customerType && steps[i].dataRowId != null) {
    const stepFile = resolveCrmStep(steps[i].customerType, Number(steps[i].dataRowId));
    stepOverrides.CRM_STEP_DATA = stepFile;
  } else {
    delete stepOverrides.CRM_STEP_DATA;
  }

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
  if (file.includes('accountfundingcurrentaccount.spec.ts')) {
    flow6HtmOccurrence++;
    lastFlow6HtmOverrides = flow6Overrides;
  }
  if (file.includes('currentaccountmodification.spec.ts')) {
    flow6ModOccurrence++;
  }
  if (file.includes('accountfundingcurrentaccount.spec.ts')) {
    flow9HtmOccurrence++;
    lastFlow9HtmOverrides = flow9Overrides;
  }
  if (file.includes('currentaccountmodification.spec.ts')) {
    flow9ModOccurrence++;
  }
}

writeLastRunManifest();

if (exitCode !== 0) {
  console.error(`\nFailed Spec: ${failedFile}`);
  process.exit(exitCode);
}
console.log('\nAll ordered specs executed successfully.');