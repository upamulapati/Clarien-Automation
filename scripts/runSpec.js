// Run a single Playwright spec with the basePage patch applied.
// Usage: node scripts/runSpec.js <spec-file> [extra-playwright-args...]
// Example: node scripts/runSpec.js tests/Finacle/sampleExcelLogin.spec.ts

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/runSpec.js <spec-file> [extra-args...]');
  process.exit(1);
}

const specFile = args[0];
const patchScript = path.resolve(__dirname, 'patch-fs.js').replace(/\\/g, '/');
const cwd = path.resolve(__dirname, '..');
const headed = process.env.CI ? '' : '--headed';

// Ensure shared-state.json is always present before test execution starts
const sharedStateFile = path.resolve(cwd, 'data', 'shared-state.json');
try {
  if (!fs.existsSync(path.dirname(sharedStateFile))) {
    fs.mkdirSync(path.dirname(sharedStateFile), { recursive: true });
  }
  if (!fs.existsSync(sharedStateFile)) {
    fs.writeFileSync(sharedStateFile, '{}', 'utf8');
    console.log(`[runSpec] Created shared state file: ${sharedStateFile}`);
  }
} catch (e) {
  console.warn(`[runSpec] Could not ensure shared state file: ${e}`);
}

function writeLastRunManifest() {
  const resultsDir = path.resolve(cwd, 'reports', 'allureReports');
  const files = fs.existsSync(resultsDir)
    ? fs.readdirSync(resultsDir).filter(f => f.endsWith('-result.json')).sort()
    : [];
  const manifest = { spec: specFile, timestamp: new Date().toISOString(), files, specFiles: [specFile] };
  fs.writeFileSync(path.resolve(cwd, 'reports', '.last-run.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

// Clean report directories to ensure fresh report for individual spec run
const htmlReportDir = path.resolve(cwd, 'reports', 'htmlReport');
const allureResultsDir = path.resolve(cwd, 'reports', 'allureReports');
const allureReportDir = path.resolve(cwd, 'reports', 'allure-report');
if (fs.existsSync(htmlReportDir)) {
  fs.rmSync(htmlReportDir, { recursive: true, force: true });
}
if (fs.existsSync(allureResultsDir)) {
  fs.rmSync(allureResultsDir, { recursive: true, force: true });
}
if (fs.existsSync(allureReportDir)) {
  fs.rmSync(allureReportDir, { recursive: true, force: true });
}
console.log('Cleaned previous report directories for fresh individual spec run.');

// Point Playwright at the resolved workbook step data so Retail/Corporate runtime values are used.
const stepDataFile = path.resolve(cwd, 'data', 'crm-step-data.json');
if (!process.env.CRM_STEP_DATA && fs.existsSync(stepDataFile)) {
  process.env.CRM_STEP_DATA = stepDataFile;
  console.log(`[runSpec] Using CRM step data: ${stepDataFile}`);
}

const command = `npx playwright test --workers=1 ${headed} ${args.join(' ')}`.trim();

console.log(`> ${command}\n`);

let exitCode = 0;
try {
  execSync(command, {
    stdio: 'inherit',
    cwd,
    env: {
      ...process.env,
      CRM_STEP_DATA: process.env.CRM_STEP_DATA,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require "${patchScript}"`.trim(),
    },
  });
} catch (_) {
  exitCode = 1;
} finally {
  writeLastRunManifest();
}
process.exit(exitCode);
