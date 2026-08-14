const { execSync } = require('child_process');
const path = require('path');

const suiteName = process.argv[2];

if (!suiteName) {
  console.error('Usage: node scripts/runOrdered.js <suiteName>');
  console.error('Available suites are defined in tests/config/testOrder.json');
  process.exit(1);
}

const testOrder = require(path.resolve(__dirname, '../tests/config/testOrder.json'));

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

const files = testOrder[suiteName];
console.log(`Running suite "${suiteName}" – ${files.length} spec(s) in order:`);
files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
console.log('');

// Run each spec file as a separate Playwright invocation so that:
//  1. Execution order is guaranteed (Playwright sorts files internally).
//  2. Each file gets a fresh browser context (no login state leaks).
for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const command = `npx playwright test --workers=1 ${file} ${headed}`.trim();
  console.log(`\n[${i + 1}/${files.length}] ${file}`);
  console.log(`> ${command}\n`);
  try {
    execSync(command, { stdio: 'inherit', cwd, env });
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
