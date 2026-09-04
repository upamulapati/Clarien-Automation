const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const suiteName = process.argv[2];

if (!suiteName) {
  console.error('Usage: node scripts/runOrdered.js <suiteName>');
  process.exit(1);
}

const testOrder = require(path.resolve(__dirname, '../tests/config/testOrder.json'));

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

function writeLastRunManifest() {
  const resultsDir = path.resolve(cwd, 'reports', 'allureReports');
  const files = fs.existsSync(resultsDir)
    ? fs.readdirSync(resultsDir).filter(f => f.endsWith('-result.json')).sort()
    : [];
  const manifest = { suite: suiteName, timestamp: new Date().toISOString(), files };
  fs.writeFileSync(path.resolve(cwd, 'reports', '.last-run.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

// Clear shared state
const sharedStateFile = path.resolve(cwd, 'data', 'shared-state.json');
if (fs.existsSync(sharedStateFile)) {
  fs.writeFileSync(sharedStateFile, '{}', 'utf8');
}

// Clean reports
const htmlReportDir = path.resolve(cwd, '../reports/htmlReport');
const allureResultsDir = path.resolve(cwd, 'reports/allureReports');
const allureReportDir = path.resolve(cwd, 'reports/allure-report');
[
  htmlReportDir,
  allureResultsDir,
  allureReportDir
].forEach(dir => {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
console.log('Previous reports cleaned.\n');

const files = testOrder[suiteName];
console.log(`Running suite: ${suiteName}\n`);
let exitCode = 0;
let failedFile = '';
for (let i = 0; i < files.length; i++) {
  const file = files[i];
  console.log(`[${i + 1}/${files.length}] ${file}`);
  const command=`npx playwright test --workers=1 ${file} ${headed}`;
  try {
    execSync(command, {
      cwd,
      stdio: 'inherit',
      env
    });
  } catch (e) {
    console.error(`\nExecution stopped.`);
    console.error(`Failed Spec: ${file}`);
    exitCode = 1;
    failedFile = file;
    break;
  }
}

writeLastRunManifest();

if (exitCode !== 0) {
  console.error(`\nFailed Spec: ${failedFile}`);
  process.exit(exitCode);
}
console.log('\nAll ordered specs executed successfully.');