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

const files = testOrder[suiteName].join(' ');
const headed = process.env.CI ? '' : '--headed';
const command = `npx playwright test --workers=1 ${files} ${headed}`.trim();

console.log(`Running suite "${suiteName}" in order:`);
testOrder[suiteName].forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
console.log(`\n> ${command}\n`);

execSync(command, { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
