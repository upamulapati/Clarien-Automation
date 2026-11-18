const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.resolve(__dirname, '../reports');
const EXECUTION_RESULTS_FILE = path.join(REPORTS_DIR, 'execution-results.json');
const ORCHESTRATOR_STATE_FILE = path.resolve(__dirname, '../data/orchestrator-state.json');

function ensureDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, defaultValue = {}) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn(`[executionResults] Could not read ${file}: ${e.message}`);
  }
  return defaultValue;
}

function writeJson(file, data) {
  ensureDir(file);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function createInitialRun(flowName) {
  const now = new Date().toISOString();
  return {
    runId: `${flowName}-${Date.now()}`,
    flowName,
    startTime: now,
    endTime: null,
    durationMs: 0,
    steps: [],
    overall: {
      totalSteps: 0,
      totalInstancesExecuted: 0,
      passedInstances: 0,
      failedInstances: 0,
      skippedInstances: 0,
      passPercentage: 0,
      failPercentage: 0,
      status: 'running'
    },
    instanceSummary: []
  };
}

function initExecutionResults(run) {
  const results = readJson(EXECUTION_RESULTS_FILE, { runs: [] });
  if (!Array.isArray(results.runs)) results.runs = [];
  results.runs.push(run);
  results.latestRunId = run.runId;
  writeJson(EXECUTION_RESULTS_FILE, results);
  return run;
}

function updateRun(runId, updater) {
  const results = readJson(EXECUTION_RESULTS_FILE, { runs: [] });
  const run = results.runs.find(r => r.runId === runId);
  if (!run) return null;
  updater(run);
  writeJson(EXECUTION_RESULTS_FILE, results);
  return run;
}

function finalizeRun(runId) {
  return updateRun(runId, (run) => {
    run.endTime = new Date().toISOString();
    run.durationMs = new Date(run.endTime).getTime() - new Date(run.startTime).getTime();
    const total = run.overall.totalInstancesExecuted || 0;
    run.overall.passPercentage = total ? Math.round((run.overall.passedInstances / total) * 10000) / 100 : 0;
    run.overall.failPercentage = total ? Math.round((run.overall.failedInstances / total) * 10000) / 100 : 0;
    if (run.overall.failedInstances === 0 && run.overall.passedInstances > 0) run.overall.status = 'Success';
    else if (run.overall.passedInstances > 0 && run.overall.failedInstances > 0) run.overall.status = 'Partial Success';
    else if (run.overall.passedInstances === 0 && run.overall.failedInstances > 0) run.overall.status = 'Failure';
    else run.overall.status = 'No Results';
  });
}

function addStepResults(runId, step, instanceResults, activeInstances) {
  return updateRun(runId, (run) => {
    run.steps.push(step);
    for (const inst of activeInstances) {
      const res = instanceResults[inst] || { status: 'skipped', error: 'No result recorded' };
      const existing = run.instanceSummary.find(i => i.flowName === run.flowName && i.instanceId === inst);
      if (existing) {
        existing.status = res.status;
        existing.error = res.error || null;
        existing.endTime = res.endTime || existing.endTime;
        existing.durationMs = res.durationMs || existing.durationMs;
        existing.downstreamStatus = res.downstreamStatus || existing.downstreamStatus;
      } else {
        run.instanceSummary.push({
          flowName: run.flowName,
          instanceId: inst,
          status: res.status,
          error: res.error || null,
          startTime: res.startTime || run.startTime,
          endTime: res.endTime || new Date().toISOString(),
          durationMs: res.durationMs || 0,
          downstreamStatus: res.downstreamStatus || 'pending'
        });
      }
      run.overall.totalInstancesExecuted += 1;
      if (res.status === 'passed') run.overall.passedInstances += 1;
      else if (res.status === 'failed') run.overall.failedInstances += 1;
      else run.overall.skippedInstances += 1;
    }
    run.overall.totalSteps += 1;
  });
}

function readOrchestratorState() {
  return readJson(ORCHESTRATOR_STATE_FILE, { flows: {} });
}

function writeOrchestratorState(state) {
  writeJson(ORCHESTRATOR_STATE_FILE, state);
}

function getFlowState(flowName, state = null) {
  const s = state || readOrchestratorState();
  if (!s.flows[flowName]) s.flows[flowName] = { activeInstances: [], successfulInstances: [], instanceOutputs: {} };
  return s.flows[flowName];
}

function setFlowInstances(flowName, activeInstances, successfulInstances, instanceOutputs) {
  const state = readOrchestratorState();
  state.flows[flowName] = { activeInstances, successfulInstances, instanceOutputs };
  writeOrchestratorState(state);
}

module.exports = {
  EXECUTION_RESULTS_FILE,
  ORCHESTRATOR_STATE_FILE,
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
};
