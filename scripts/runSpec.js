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

function writeLastRunManifest() {
  const resultsDir = path.resolve(cwd, 'reports', 'allureReports');
  const files = fs.existsSync(resultsDir)
    ? fs.readdirSync(resultsDir).filter(f => f.endsWith('-result.json')).sort()
    : [];
  const manifest = { spec: specFile, timestamp: new Date().toISOString(), files };
  fs.writeFileSync(path.resolve(cwd, 'reports', '.last-run.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

// Clean report directories to ensure fresh report for individual spec run
const htmlReportDir = path.resolve(cwd, '..', 'reports', 'htmlReport');
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

const command = `npx playwright test --workers=1 ${headed} ${args.join(' ')}`.trim();

console.log(`> ${command}\n`);

let exitCode = 0;
try {
  execSync(command, {
    stdio: 'inherit',
    cwd,
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require "${patchScript}"`.trim(),
    },
  });
} catch (_) {
  exitCode = 1;
} finally {
  writeLastRunManifest();
}
process.exit(exitCode);
