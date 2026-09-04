const { spawn } = require('child_process');
const path = require('path');

const testOrder = require(path.resolve(__dirname, '../tests/config/testOrder.json'));
const suites = process.argv.slice(2);

if (suites.length === 0) {
  console.log('Usage: node scripts/runParallel.js <suite1> <suite2> ...');
  console.log(`Available suites: ${Object.keys(testOrder).join(', ')}`);
  console.log('Example: node scripts/runParallel.js crmCIFRetail crmCIFCorporate');
  process.exit(1);
}

for (const s of suites) {
  if (!testOrder[s]) {
    console.error(`Suite "${s}" not found. Available: ${Object.keys(testOrder).join(', ')}`);
    process.exit(1);
  }
}

console.log('='.repeat(70));
console.log('  PARALLEL SUITE RUNNER');
console.log('  Running suites in parallel, tests within each suite run serially');
console.log('='.repeat(70));
suites.forEach(s => {
  console.log(`\n  Suite: ${s}`);
  testOrder[s].forEach((f, i) => console.log(`    ${i + 1}. ${f}`));
});
console.log('\n' + '='.repeat(70) + '\n');

const cwd = path.resolve(__dirname, '..');
const results = {};
const startTime = Date.now();

const promises = suites.map(suite => {
  return new Promise((resolve) => {
    const files = testOrder[suite];
    const args = ['playwright', 'test', '--workers=1', ...files];
    const suiteStart = Date.now();

    console.log(`[${suite}] Starting... (${files.length} test files)`);

    const child = spawn('npx', args, {
      cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) console.log(`[${suite}] ${line}`);
      });
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) console.log(`[${suite}] ${line}`);
      });
      stderr += data.toString();
    });

    child.on('close', (code) => {
      const duration = ((Date.now() - suiteStart) / 1000).toFixed(1);
      results[suite] = { code, duration };
      console.log(`\n[${suite}] ${ code === 0 ? '✓ PASSED' : '✗ FAILED' } (${duration}s)\n`);
      resolve(code);
    });
  });
});

Promise.all(promises).then((codes) => {
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(70));
  console.log('  RESULTS SUMMARY');
  console.log('='.repeat(70));
  let allPassed = true;
  for (const suite of suites) {
    const r = results[suite];
    const status = r.code === 0 ? '✓ PASSED' : '✗ FAILED';
    console.log(`  ${status}  ${suite}  (${r.duration}s)`);
    if (r.code !== 0) allPassed = false;
  }
  console.log('-'.repeat(70));
  console.log(`  Total time: ${totalDuration}s (parallel)`);
  console.log(`  Overall: ${allPassed ? '✓ ALL PASSED' : '✗ SOME FAILED'}`);
  console.log('='.repeat(70));
  process.exit(allPassed ? 0 : 1);
});
