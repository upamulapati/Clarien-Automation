const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const suiteName = process.argv[2];

if (!suiteName) {
  console.error('Usage: node scripts/runOrdered.js <suiteName>');
  console.error('Available suites are defined in tests/config/testOrder.json');
  process.exit(1);
}

const testOrder = require(path.resolve(__dirname, '../tests/config/testOrder.json'));

const sharedStateFile = path.resolve(__dirname, '../data/shared-state.json');
if (fs.existsSync(sharedStateFile)) {
  fs.unlinkSync(sharedStateFile);
  console.log(`[runOrdered] Cleared stale shared state: ${sharedStateFile}`);
}

if (!testOrder[suiteName]) {
  console.error(`Suite "${suiteName}" not found in testOrder.json`);
  console.error(`Available suites: ${Object.keys(testOrder).join(', ')}`);
  process.exit(1);
}

const headed = process.env.CI ? '' : '--headed';
const patchScript = path.resolve(__dirname, 'patch-fs.js').replace(/\\/g, '/');
const cwd = path.resolve(__dirname, '..');
const env = {
  ...process.env,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require "${patchScript}"`.trim()
};

function readSharedStateJson() {
  try {
    return JSON.parse(fs.readFileSync(sharedStateFile, 'utf-8'));
  } catch {
    return {};
  }
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
      overrides.FLOW7_HTM_DEBIT = '7710003367';
      overrides.FLOW7_HTM_CREDIT = created;
    } else if (htmOccurrence === 2) {
      overrides.FLOW7_HTM_DEBIT = created;
      overrides.FLOW7_HTM_CREDIT = '7500001512';
    } else if (htmOccurrence === 3) {
      // Assumption: third HTM moves back from 7500001512 to the created savings account.
      overrides.FLOW7_HTM_DEBIT = '7500001512';
      overrides.FLOW7_HTM_CREDIT = created;
    }
    overrides.FLOW7_HTM_AMOUNT = '100';
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

const files = testOrder[suiteName];
console.log(`Running suite "${suiteName}" – ${files.length} spec(s) in order:`);
files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
console.log('');

// Run each spec file as a separate Playwright invocation so that:
//  1. Execution order is guaranteed (Playwright sorts files internally).
//  2. Each file gets a fresh browser context (no login state leaks).
let htmOccurrence = 0;
let savingsModOccurrence = 0;
let lastHtmOverrides = {};

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const command = `npx playwright test --workers=1 ${file} ${headed}`.trim();
  console.log(`\n[${i + 1}/${files.length}] ${file}`);
  console.log(`> ${command}\n`);

  let stepEnv = env;
  if (suiteName === 'flow7') {
    if (file.includes('accountfundingsavingsaccount.spec.ts')) htmOccurrence++;
    if (file.includes('savingsaccountmodification.spec.ts')) savingsModOccurrence++;
    const state = readSharedStateJson();
    const overrides = getFlow7StepEnv(file, state, htmOccurrence, savingsModOccurrence, lastHtmOverrides);
    if (overrides.FLOW7_HTM_DEBIT) {
      lastHtmOverrides = { ...overrides };
    }
    stepEnv = { ...env, ...overrides };
    if (Object.keys(overrides).length > 0) {
      console.log(`[flow7] step env: ${JSON.stringify(overrides)}`);
    }
  }

  try {
    execSync(command, { stdio: 'inherit', cwd, env: stepEnv });
  } catch (_) {
    const remaining = files.length - i - 1;
    console.error(`\n✖ Suite "${suiteName}" aborted — spec [${i + 1}/${files.length}] failed: ${file}`);
    if (remaining > 0) {
      console.error(`  Skipping ${remaining} remaining spec(s):`);
      files.slice(i + 1).forEach((f, j) => console.error(`    ${i + 2 + j}. ${f}`));
    }
    process.exit(1);
  }
}
