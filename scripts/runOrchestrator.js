const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const {
  createInitialRun,
  initExecutionResults,
  updateRun,
  finalizeRun,
  addStepResults,
  readOrchestratorState,
  writeOrchestratorState,
  getFlowState,
  setFlowInstances,
  readJson,
  writeJson
} = require('./executionResults');

const { resolve: resolveCrmStep } = require('./crmDataResolver');
const { resolve: resolveFlowData } = require('./flowDataResolver');

const suiteName = process.argv[2];
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';
const DRY_FAIL_INSTANCES = (process.env.DRY_FAIL_INSTANCES || '').split(/[,\s;|]+/).filter(Boolean).map(String);
if (!suiteName || suiteName.startsWith('--')) {
  console.error('Usage: node scripts/runOrchestrator.js <suiteName> [--dry-run]');
  process.exit(1);
}

const cwd = path.resolve(__dirname, '..');
const REPORTS_DIR = path.resolve(cwd, 'reports');
const patchScript = path.resolve(__dirname, 'patch-fs.js').replace(/\\/g, '/');

const env = {
  ...process.env,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require "${patchScript}"`.trim(),
  PLAYWRIGHT_NO_CLEAR_ALLURE: '1',
  ORCHESTRATOR_RUN: '1',
};

if (suiteName === 'flow6' || suiteName === 'flow9') {
  env.APPLICATION_DATE = '01-10-2026';
}

const headed = process.env.CI ? '' : '--headed';
const resultsDir = path.resolve(cwd, 'reports', 'allureReports');
const sharedStateFile = path.resolve(cwd, 'data', 'shared-state.json');

function readSharedState() {
  try {
    if (!fs.existsSync(sharedStateFile)) return {};
    return JSON.parse(fs.readFileSync(sharedStateFile, 'utf8'));
  } catch {
    return {};
  }
}

function writeSharedState(state) {
  try {
    fs.writeFileSync(sharedStateFile, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.warn(`[runOrchestrator] Could not write shared-state: ${e.message}`);
  }
}

function getInstanceAccountId(state, suite, inst) {
  return state?.[suite]?.instances?.[inst]?.accountId;
}

function setInstanceResult(state, suite, inst, result) {
  if (!state[suite]) state[suite] = {};
  if (!state[suite].instances) state[suite].instances = {};
  const existing = state[suite].instances[inst] || {};
  const merged = { ...existing, ...result };
  if (result.status === 'passed') {
    delete merged.error;
    delete merged.reason;
    delete merged.upstreamError;
    delete merged.upstreamStatus;
  }
  state[suite].instances[inst] = merged;
}

function getNested(obj, keyPath) {
  if (!obj || !keyPath) return undefined;
  const parts = String(keyPath).split(/[.\/]/);
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

function setNested(obj, keyPath, value) {
  const parts = String(keyPath).split(/[.\/]/);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function readFlowConfig(excelPath) {
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel file not found: ${excelPath}`);
  }
  const wb = xlsx.readFile(excelPath);
  const sheetName = wb.Sheets['FlowConfig'] ? 'FlowConfig' : Object.keys(wb.Sheets).find(s => s.toLowerCase() === 'flowconfig');
  if (!sheetName) {
    throw new Error(`No FlowConfig sheet found in ${excelPath}`);
  }
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName]);
  return rows.filter(r => String(r.enabled).toUpperCase() !== 'N');
}

function getFlowSteps(config, flowName) {
  const steps = config
    .filter(r => String(r.flowName).toLowerCase() === flowName.toLowerCase())
    .sort((a, b) => Number(a.step) - Number(b.step));
  return steps;
}

function parseInstances(dataRowId) {
  if (dataRowId == null) return [];
  return String(dataRowId)
    .split(/[,\s;|]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter(n => Number.isInteger(n) && n > 0)
    .map(String);
}

function getAllureResultFiles() {
  if (!fs.existsSync(resultsDir)) return [];
  return fs.readdirSync(resultsDir).filter(f => f.endsWith('-result.json'));
}

function getPackageFile(result) {
  const getLabel = (name) => (result.labels || []).find(l => l.name === name)?.value || '';
  const suiteLabel = getLabel('suite') || '';
  if (suiteLabel && suiteLabel.includes('\\')) {
    return 'tests/' + suiteLabel.split('\\').join('/');
  }
  const packageLabel = getLabel('package') || '';
  if (packageLabel && packageLabel.includes('\\')) {
    return 'tests/' + packageLabel.split('\\').join('/');
  }
  if (packageLabel) {
    const parts = packageLabel.split('.');
    if (parts.length >= 3) {
      const fileName = parts.slice(-3, -2)[0] + '.spec.ts';
      const dir = parts.slice(0, -3).join('/');
      return 'tests/' + (dir ? dir + '/' : '') + fileName;
    }
  }
  return '';
}

function normalizeSpecPath(spec) {
  return spec.replace(/\\/g, '/').replace(/^tests\//, 'tests/');
}

function resultMatchesSpec(result, specPath) {
  const pkg = getPackageFile(result);
  const normalized = normalizeSpecPath(specPath);
  if (pkg === normalized || pkg.endsWith('/' + path.basename(normalized))) return true;

  // Fallback: the allure-playwright package label on some platforms is the spec file path.
  const fullName = (result.fullName || '').replace(/\\/g, '/');
  if (fullName.includes(normalized)) return true;

  // Fallback: match by file basename in test labels.
  const labels = result.labels || [];
  const basename = path.basename(normalized);
  for (const label of labels) {
    if (['package', 'testClass', 'suite'].includes(label.name)) {
      const value = String(label.value || '').replace(/\\/g, '/');
      if (value.includes(basename) || value.includes(normalized)) return true;
    }
  }

  return false;
}

function parseAllureResultsForSpec(spec, sinceTime) {
  const files = getAllureResultFiles();
  const parsed = [];
  for (const file of files) {
    const filePath = path.join(resultsDir, file);
    const mtime = fs.statSync(filePath).mtime.getTime();
    if (mtime < sinceTime) continue;
    try {
      const result = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!resultMatchesSpec(result, spec)) continue;
      parsed.push({ file, result, mtime });
    } catch (e) {
      console.warn(`[runOrchestrator] Could not parse ${file}: ${e.message}`);
    }
  }
  return parsed;
}

function getInstanceFromResult(result) {
  const labels = result.labels || [];
  const inst = labels.find(l => l.name === 'instance');
  if (inst && inst.value) return String(inst.value);

  const name = result.name || result.fullName || '';
  const m = name.match(/\[instance[:=]\s*(\d+)\]/i) || name.match(/\binstance\s*(\d+)\b/i);
  if (m) return m[1];

  const params = result.parameters || [];
  const p = params.find(x => x.name === 'instance');
  if (p && p.value) return String(p.value);

  return null;
}

function determineInstanceResults(spec, activeInstances, sinceTime) {
  const raw = parseAllureResultsForSpec(spec, sinceTime);
  const allureResults = {};

  for (const inst of activeInstances) {
    allureResults[inst] = null;
  }

  // Map each Allure result to an active instance.
  for (const { result } of raw) {
    let inst = getInstanceFromResult(result);
    if (!inst || !allureResults.hasOwnProperty(inst)) {
      // Fallback: if exactly one instance lacks a mapping, assign the unlabeled result to it.
      const unassigned = activeInstances.filter(i => !allureResults[i]);
      if (!inst && unassigned.length === 1) {
        inst = unassigned[0];
      } else {
        continue;
      }
    }

    const status = result.status || 'unknown';
    const start = result.start || 0;
    const stop = result.stop || start;
    const errorMessage = result.statusDetails?.message || result.statusDetails?.trace || '';

    allureResults[inst] = {
      status: status === 'passed' ? 'passed' : (status === 'skipped' ? 'skipped' : 'failed'),
      error: status === 'passed' ? null : errorMessage,
      startTime: start ? new Date(start).toISOString() : null,
      endTime: stop ? new Date(stop).toISOString() : null,
      durationMs: stop - start
    };
  }

  // Reconcile Allure results with the per-suite shared-state.
  // The shared-state is authoritative because each spec writes its own status,
  // accountId and exact error there during execution. Allure timestamps are used
  // when available. When a downstream test is skipped because its upstream
  // instance failed, the status is reported as SKIPPED with the upstream
  // reason preserved.
  const state = readSharedState();
  const results = {};

  for (const inst of activeInstances) {
    const allureRes = allureResults[inst];
    const sharedRes = state?.[suiteName]?.instances?.[inst];

    let status = 'skipped';
    let error = 'No test result found';
    let startTime = null;
    let endTime = null;
    let durationMs = 0;
    let accountId;

    if (allureRes?.status === 'skipped' || sharedRes?.status === 'SKIPPED') {
      // A skipped downstream test normally means the upstream flow did not pass.
      const reason =
        allureRes?.error ||
        sharedRes?.reason ||
        sharedRes?.error ||
        sharedRes?.upstreamError ||
        'Upstream Flow Failed';
      status = 'SKIPPED';
      error = reason;
      startTime = allureRes?.startTime || sharedRes?.startTime || new Date().toISOString();
      endTime = allureRes?.endTime || sharedRes?.endTime || new Date().toISOString();
      durationMs = allureRes?.durationMs || sharedRes?.durationMs || 0;
      accountId = sharedRes?.accountId;
    } else if (sharedRes?.status === 'passed' || sharedRes?.status === 'failed') {
      // Shared-state can be stale when the same suite runs multiple steps
      // (e.g. creation writes passed, then a later verification step fails).
      // Prefer the actual Allure result when it disagrees with the saved state.
      if (allureRes && allureRes.status !== sharedRes.status) {
        status = allureRes.status;
        error = allureRes.error || (status === 'failed' ? 'Unknown failure' : null);
        console.log(`[runOrchestrator] Reconciled instance ${inst} from Allure (${status}) because shared-state status was ${sharedRes.status}`);
      } else {
        status = sharedRes.status;
        error = sharedRes.error || allureRes?.error || (status === 'failed' ? 'Unknown failure' : null);
      }
      startTime = allureRes?.startTime || sharedRes.startTime || new Date().toISOString();
      endTime = allureRes?.endTime || sharedRes.endTime || new Date().toISOString();
      durationMs = allureRes?.durationMs || sharedRes.durationMs || 0;
      accountId = sharedRes.accountId;
    } else if (allureRes) {
      status = allureRes.status;
      error = allureRes.error;
      startTime = allureRes.startTime;
      endTime = allureRes.endTime;
      durationMs = allureRes.durationMs;
    }

    results[inst] = { status, error, startTime, endTime, durationMs };

    if (status === 'passed') {
      const passedResult = { status: 'passed' };
      if (accountId != null) passedResult.accountId = accountId;
      setInstanceResult(state, suiteName, inst, passedResult);
    } else if (status === 'failed') {
      setInstanceResult(state, suiteName, inst, { status: 'failed', error: error || 'Unknown failure' });
    } else if (status === 'SKIPPED') {
      // Preserve the existing upstream accountId and record the skip reason.
      const skippedResult = { status: 'SKIPPED', reason: error, error };
      if (accountId != null) skippedResult.accountId = accountId;
      setInstanceResult(state, suiteName, inst, skippedResult);
    }
  }

  writeSharedState(state);
  return results;
}

function filterStepDataByInstances(stepDataPath, instances) {
  if (!stepDataPath || !fs.existsSync(stepDataPath)) return stepDataPath;
  try {
    const content = JSON.parse(fs.readFileSync(stepDataPath, 'utf8'));
    const keys = Object.keys(content);
    for (const key of keys) {
      const arr = content[key];
      if (Array.isArray(arr)) {
        content[key] = arr.filter(row => {
          const inst = row.instance != null ? String(row.instance).trim() : '';
          return instances.includes(inst);
        });
      }
    }
    const filteredPath = stepDataPath.replace(/\.json$/, '-filtered.json');
    fs.writeFileSync(filteredPath, JSON.stringify(content, null, 2), 'utf8');
    return filteredPath;
  } catch (e) {
    console.warn(`[runOrchestrator] Could not filter ${stepDataPath}: ${e.message}`);
    return stepDataPath;
  }
}

function injectUpstreamOutputs(stepDataPath, instances, sharedStateIn, flowState) {
  if (!stepDataPath || !fs.existsSync(stepDataPath) || !sharedStateIn) return stepDataPath;
  try {
    const content = JSON.parse(fs.readFileSync(stepDataPath, 'utf8'));
    const keys = Object.keys(content);
    const outputs = flowState.successfulInstances || [];
    const instanceOutputs = flowState.instanceOutputs || {};

    for (const key of keys) {
      const arr = content[key];
      if (!Array.isArray(arr)) continue;
      for (const row of arr) {
        const inst = row.instance != null ? String(row.instance).trim() : '';
        if (instances.includes(inst) && instanceOutputs[inst]) {
          row[sharedStateIn] = instanceOutputs[inst];
          row.upstreamOutput = instanceOutputs[inst];
        }
      }
    }

    const injectedPath = stepDataPath.replace(/\.json$/, '-injected.json');
    fs.writeFileSync(injectedPath, JSON.stringify(content, null, 2), 'utf8');
    return injectedPath;
  } catch (e) {
    console.warn(`[runOrchestrator] Could not inject upstream outputs: ${e.message}`);
    return stepDataPath;
  }
}

function collectInstanceOutputs(activeInstances) {
  const state = readSharedState();
  const outputs = {};
  for (const inst of activeInstances) {
    const accountId = getInstanceAccountId(state, suiteName, inst);
    if (accountId != null) outputs[inst] = accountId;
  }
  return outputs;
}

function writeLastRunManifest(run, allResultFiles) {
  const manifest = {
    suite: run.flowName,
    startTime: new Date(run.startTime).getTime(),
    timestamp: new Date().toISOString(),
    specFiles: run.steps.map(s => s.spec),
    files: allResultFiles.sort()
  };
  fs.writeFileSync(path.join(REPORTS_DIR, '.last-run.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

function runSpec(file, childEnv, run, step, activeInstances, flowState) {
  const stepStart = Date.now();
  const command = `npx playwright test --workers=1 --retries=0 ${file} ${headed}`;

  let stepDataPath = null;
  const dataSheet = step.dataSheet;
  const dataRowId = activeInstances.length > 0 ? activeInstances.join(',') : step.dataRowId;

  if (dataSheet && activeInstances.length > 0) {
    if (dataSheet === 'CRM' && step.customerType) {
      // CRM resolver currently supports a single instance per invocation.
      const crmId = activeInstances.length === 1 ? Number(activeInstances[0]) : Number(activeInstances[0]);
      stepDataPath = resolveCrmStep(step.customerType, crmId);
    } else {
      stepDataPath = resolveFlowData(dataSheet, activeInstances.join(','), path.resolve(cwd, 'data', 'flow-step-data.json'));
    }
  }

  // Pass shared-state keys for specs that use the generic instance helpers.
  childEnv.SHARED_STATE_IN = step.sharedStateIn || '';
  childEnv.SHARED_STATE_OUT = step.sharedStateOut || '';

  // Inject upstream outputs and filter to active instances for downstream specs.
  if (stepDataPath && fs.existsSync(stepDataPath)) {
    stepDataPath = injectUpstreamOutputs(stepDataPath, activeInstances, step.sharedStateIn, flowState);
    stepDataPath = filterStepDataByInstances(stepDataPath, activeInstances);
  }

  if (stepDataPath) {
    if (dataSheet === 'CRM') childEnv.CRM_STEP_DATA = stepDataPath;
    else childEnv.STEP_DATA = stepDataPath;
  }

  childEnv.INSTANCE = activeInstances.length === 1 ? activeInstances[0] : '';
  childEnv.INSTANCES = activeInstances.join(',');

  // Clean stale Allure results for this spec so only current run results are parsed.
  const beforeFiles = new Set(getAllureResultFiles());

  let exitCode = 0;
  let errorOutput = '';

  if (DRY_RUN) {
    console.log(`[runOrchestrator] DRY RUN - Skipping: ${file} with instances [${activeInstances.join(', ')}]`);
  } else {
    try {
      console.log(`[runOrchestrator] Running: ${file} with instances [${activeInstances.join(', ')}]`);
      execSync(command, { cwd, stdio: 'inherit', env: childEnv });
    } catch (e) {
      exitCode = e.status || 1;
      errorOutput = e.message || '';
      console.error(`[runOrchestrator] Spec process exited with code ${exitCode}: ${file}`);
    }
  }

  const afterFiles = getAllureResultFiles().filter(f => !beforeFiles.has(f));
  const sinceTime = Math.min(stepStart, ...afterFiles.map(f => fs.statSync(path.join(resultsDir, f)).mtime.getTime()).filter(Boolean)) || stepStart;

  let instanceResults;
  if (DRY_RUN) {
    instanceResults = {};
    const state = readSharedState();
    for (const inst of activeInstances) {
      const upstream = state?.[suiteName]?.instances?.[inst];
      const isFirstStep = !upstream;
      const shouldFailFirstStep = isFirstStep && DRY_FAIL_INSTANCES.includes(inst);

      if (upstream?.status === 'failed' || upstream?.status === 'SKIPPED') {
        const reason = upstream.upstreamError || upstream.error || upstream.reason || 'Upstream Flow Failed';
        instanceResults[inst] = {
          status: 'SKIPPED',
          error: reason,
          startTime: new Date(stepStart).toISOString(),
          endTime: new Date().toISOString(),
          durationMs: 0
        };
        setInstanceResult(state, suiteName, inst, {
          status: 'SKIPPED',
          reason,
          error: reason,
          upstreamStatus: upstream.status,
          upstreamError: upstream.error
        });
      } else if (shouldFailFirstStep) {
        instanceResults[inst] = {
          status: 'failed',
          error: `Simulated failure for instance ${inst} in dry-run mode`,
          startTime: new Date(stepStart).toISOString(),
          endTime: new Date().toISOString(),
          durationMs: 100
        };
        setInstanceResult(state, suiteName, inst, {
          status: 'failed',
          error: `Simulated failure for instance ${inst} in dry-run mode`
        });
      } else {
        instanceResults[inst] = {
          status: 'passed',
          error: null,
          startTime: new Date(stepStart).toISOString(),
          endTime: new Date().toISOString(),
          durationMs: 100
        };
        setInstanceResult(state, suiteName, inst, {
          status: 'passed',
          accountId: `DRY-ACCOUNT-${inst}`
        });
      }
    }
    writeSharedState(state);
  } else {
    instanceResults = determineInstanceResults(file, activeInstances, sinceTime, step.sharedStateOut);
  }

  const stepResult = {
    spec: file,
    dataSheet: dataSheet || null,
    dataRowId: dataRowId != null ? String(dataRowId) : null,
    exitCode,
    startTime: new Date(stepStart).toISOString(),
    endTime: new Date().toISOString(),
    durationMs: Date.now() - stepStart,
    errorOutput: errorOutput || null,
    instanceResults
  };

  const successfulInstances = activeInstances.filter(inst => instanceResults[inst] && instanceResults[inst].status === 'passed');
  const outputs = collectInstanceOutputs(successfulInstances);
  const newFlowState = {
    activeInstances,
    successfulInstances,
    instanceOutputs: { ...flowState.instanceOutputs, ...outputs }
  };

  addStepResults(run.runId, stepResult, instanceResults, activeInstances);
  setFlowInstances(suiteName, activeInstances, successfulInstances, newFlowState.instanceOutputs);

  return { stepResult, newFlowState };
}

function cleanReports() {
  [path.resolve(cwd, 'reports/htmlReport'), resultsDir, path.resolve(cwd, 'reports/allure-report')]
    .forEach(dir => {
      if (fs.existsSync(dir)) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      }
    });

  // Remove stale orchestration manifests so the current run starts with clean metadata.
  for (const file of [path.resolve(cwd, 'reports/.last-run.json'), path.resolve(cwd, 'data/orchestrator-state.json')]) {
    if (fs.existsSync(file)) {
      try { fs.unlinkSync(file); } catch {}
    }
  }
}

function main() {
  const excelPath = process.env.FLOW_CONFIG_EXCEL
    ? path.resolve(cwd, process.env.FLOW_CONFIG_EXCEL)
    : path.resolve(cwd, 'data', 'test-data.xlsx');
  const config = readFlowConfig(excelPath);
  const steps = getFlowSteps(config, suiteName);

  if (steps.length === 0) {
    console.error(`[runOrchestrator] No enabled steps found for flow "${suiteName}" in ${excelPath}`);
    process.exit(1);
  }

  // Clear shared state so each orchestrated run starts fresh.
  if (fs.existsSync(sharedStateFile)) fs.unlinkSync(sharedStateFile);

  cleanReports();

  const ORCHESTRATOR_STATE_FILE = path.resolve(cwd, 'data/orchestrator-state.json');
  if (fs.existsSync(ORCHESTRATOR_STATE_FILE)) {
    try { fs.unlinkSync(ORCHESTRATOR_STATE_FILE); } catch {}
  }

  const run = createInitialRun(suiteName);
  initExecutionResults(run);

  let flowState = getFlowState(suiteName, readOrchestratorState());

  console.log(`\n[runOrchestrator] Executing flow "${suiteName}"`);
  console.log(`Steps: ${steps.map(s => path.basename(s.spec)).join(' -> ')}\n`);

  for (const step of steps) {
    const file = step.spec;
    if (!file || String(step.enabled).toUpperCase() === 'N') {
      console.log(`[runOrchestrator] Skipping disabled step: ${step.spec}`);
      continue;
    }

    // Each step uses its own configured dataRowId (Excel Enabled = Y), falling back
    // to the instances that succeeded in the previous step. This lets downstream
    // specs explicitly skip instances whose upstream flow failed and report them
    // as SKIPPED / Upstream Flow Failed.
    const stepInstances = step.dataRowId
      ? parseInstances(step.dataRowId)
      : flowState.successfulInstances.slice();

    if (stepInstances.length === 0) {
      console.warn(`[runOrchestrator] No active instances left for ${file}; skipping remaining steps.`);
      break;
    }

    const childEnv = {
      ...env,
      CIF_MOD_FLOW: suiteName,
      FLOW_NAME: suiteName,
      SUITE_NAME: suiteName
    };
    const { stepResult, newFlowState } = runSpec(file, childEnv, run, step, stepInstances, flowState);
    flowState = newFlowState;

    const instanceResults = stepResult.instanceResults || {};
    const passedCount = stepInstances.filter(inst => instanceResults[inst]?.status === 'passed').length;
    const failedCount = stepInstances.filter(inst => instanceResults[inst]?.status === 'failed').length;
    const skippedCount = stepInstances.filter(inst => instanceResults[inst]?.status === 'SKIPPED' || instanceResults[inst]?.status === 'skipped').length;
    console.log(`[runOrchestrator] Step complete: ${passedCount} passed, ${failedCount} failed, ${skippedCount} skipped out of ${stepInstances.length}`);

    if (flowState.successfulInstances.length === 0) {
      console.warn(`[runOrchestrator] No successful instances left; downstream verification steps will be skipped.`);
    } else {
      console.log(`[runOrchestrator] Instances eligible for next step: ${flowState.successfulInstances.join(', ')}`);
    }

    // Prepare active instances for next step when the next step has no dataRowId of its own.
    flowState.activeInstances = flowState.successfulInstances.slice();
  }

  finalizeRun(run.runId);

  // Collect all Allure result file names referenced by this run.
  const resultFiles = new Set();
  for (const step of run.steps) {
    const files = parseAllureResultsForSpec(step.spec, new Date(run.startTime).getTime()).map(p => p.file);
    for (const f of files) resultFiles.add(f);
  }
  writeLastRunManifest(run, Array.from(resultFiles));

  // Generate the consolidated execution PDF report.
  try {
    const reportScript = path.resolve(__dirname, 'generateExecutionReport.js');
    if (fs.existsSync(reportScript)) {
      const { execSync: execReport } = require('child_process');
      execReport(`node "${reportScript}"`, { cwd, stdio: 'inherit' });
    }
  } catch (e) {
    console.warn(`[runOrchestrator] Could not generate execution report: ${e.message}`);
  }

  const finalState = getFlowState(suiteName);
  console.log(`\n[runOrchestrator] Flow "${suiteName}" complete.`);
  console.log(`  Active instances: ${flowState.activeInstances.join(', ') || 'none'}`);
  console.log(`  Successful instances: ${flowState.successfulInstances.join(', ') || 'none'}`);
  console.log(`  Execution results: ${path.resolve(cwd, 'reports', 'execution-results.json')}`);
  console.log(`  Last run manifest: ${path.join(REPORTS_DIR, '.last-run.json')}`);
}

main();
