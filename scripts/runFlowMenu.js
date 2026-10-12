const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const readline = require('readline');
const { execSync } = require('child_process');

const EXCEL = path.resolve(__dirname, '../data/test-data.xlsx');
const categoryFilter = process.argv[2];

if (!fs.existsSync(EXCEL)) {
  console.error(`Workbook not found: ${EXCEL}`);
  process.exit(1);
}

const wb = xlsx.readFile(EXCEL);
if (!wb.Sheets['FlowConfig']) {
  console.error('data/test-data.xlsx does not contain a "FlowConfig" sheet');
  process.exit(1);
}

const rows = xlsx.utils.sheet_to_json(wb.Sheets['FlowConfig'], { defval: '' });

const flows = rows
  .filter(r => String(r.enabled).toUpperCase() !== 'N')
  .filter(r => !categoryFilter || String(r.customerType).toLowerCase() === categoryFilter.toLowerCase())
  .map(r => r.flowName)
  .filter((name, i, arr) => name && arr.indexOf(name) === i);

if (flows.length === 0) {
  console.error(`No enabled flows found${categoryFilter ? ` for category "${categoryFilter}"` : ''}.`);
  process.exit(1);
}

console.log('');
console.log('='.repeat(60));
console.log('  Available flows');
console.log('='.repeat(60));
flows.forEach((flow, i) => console.log(`  ${i + 1}. ${flow}`));
console.log('='.repeat(60));
console.log('');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Select a flow (number): ', (answer) => {
  const index = parseInt(answer.trim(), 10) - 1;

  if (Number.isNaN(index) || index < 0 || index >= flows.length) {
    console.error('Invalid selection.');
    rl.close();
    process.exit(1);
  }

  const selected = flows[index];
  console.log(`\nRunning flow: ${selected}\n`);

  const cwd = path.resolve(__dirname, '..');
  execSync(`node scripts/runOrdered.js ${selected}`, { stdio: 'inherit', cwd });

  rl.close();
});
