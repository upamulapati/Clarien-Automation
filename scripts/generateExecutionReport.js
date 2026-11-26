const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const REPORTS_DIR = path.resolve('reports');
const EXECUTION_RESULTS_FILE = path.join(REPORTS_DIR, 'execution-results.json');

function escapeHtml(text) {
  if (text === undefined || text === null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readJson(file, defaultValue = null) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn(`[generateExecutionReport] Could not read ${file}: ${e.message}`);
  }
  return defaultValue;
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDate(iso) {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'Atlantic/Bermuda',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch {
    return iso;
  }
}

function normalizeStatus(status) {
  return String(status || '').toLowerCase();
}

function statusClass(status) {
  const s = normalizeStatus(status);
  if (s === 'passed' || s === 'success') return 'status-passed';
  if (s === 'failed' || s === 'failure') return 'status-failed';
  if (s === 'partial success') return 'status-partial';
  if (s === 'skipped') return 'status-skipped';
  return 'status-unknown';
}

function statusText(status) {
  const s = normalizeStatus(status);
  if (s === 'passed') return 'Passed';
  if (s === 'failed') return 'Failed';
  if (s === 'skipped') return 'Skipped';
  if (s === 'success') return 'Success';
  if (s === 'partial success') return 'Partial Success';
  if (s === 'failure') return 'Failure';
  return String(status || 'Unknown');
}

function renderExecutiveSummary(run) {
  const overall = run.overall || {};
  const total = overall.totalInstancesExecuted || 0;
  const passed = overall.passedInstances || 0;
  const failed = overall.failedInstances || 0;
  const skipped = overall.skippedInstances || 0;
  const passRate = total ? ((passed / total) * 100).toFixed(2) : '0.00';
  const failRate = total ? ((failed / total) * 100).toFixed(2) : '0.00';

  const statBox = (status, count, label) => {
    if (count <= 0) return '';
    return `<div class="dashboard-box stat-${status}"><span class="value">${count}</span><span class="label">${label}</span></div>`;
  };

  return `
    <section class="dashboard">
      <h2>Summary</h2>
      <div class="dashboard-grid">
        ${statBox('passed', passed, 'Passed')}
        ${statBox('failed', failed, 'Failed')}
        ${statBox('skipped', skipped, 'Skipped')}
        <div class="dashboard-box stat-total"><span class="value">${total}</span><span class="label">Total</span></div>
        <div class="dashboard-box stat-rate"><span class="value">${passRate}%</span><span class="label">Pass Rate</span></div>
        ${failed > 0 ? `<div class="dashboard-box stat-rate"><span class="value">${failRate}%</span><span class="label">Fail Rate</span></div>` : ''}
        <div class="dashboard-box stat-duration"><span class="value">${formatDuration(run.durationMs)}</span><span class="label">Duration</span></div>
      </div>
      <p><strong>Overall Status:</strong> ${statusText(overall.status)}</p>
      <p><strong>Flow Name:</strong> ${escapeHtml(run.flowName || 'N/A')}</p>
      <p><strong>Start Time:</strong> ${formatDate(run.startTime)}</p>
      <p><strong>End Time:</strong> ${formatDate(run.endTime)}</p>
    </section>`;
}

function renderFlowWiseSummary(run) {
  const steps = run.steps || [];
  if (steps.length === 0) return '';

  let rows = '';
  for (const step of steps) {
    const results = step.instanceResults || {};
    const instances = Object.keys(results);
    const passed = instances.filter(i => normalizeStatus(results[i].status) === 'passed').length;
    const failed = instances.filter(i => normalizeStatus(results[i].status) === 'failed').length;
    const skipped = instances.filter(i => normalizeStatus(results[i].status) === 'skipped').length;
    const total = instances.length;
    const rate = total ? ((passed / total) * 100).toFixed(2) : '0.00';
    const spec = escapeHtml(path.basename(step.spec || 'unknown'));
    rows += `<tr>
      <td>${escapeHtml(spec)}</td>
      <td>${escapeHtml(step.dataSheet || 'N/A')}</td>
      <td>${escapeHtml(String(step.dataRowId || 'N/A'))}</td>
      <td>${total}</td>
      <td class="status-passed">${passed}</td>
      <td class="status-failed">${failed}</td>
      <td class="status-skipped">${skipped}</td>
      <td>${rate}%</td>
    </tr>`;
  }

  return `
    <section class="flow-summary">
      <h2>Flow-wise Summary</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>Spec</th>
            <th>Data Sheet</th>
            <th>Data Row ID</th>
            <th>Total</th>
            <th>Passed</th>
            <th>Failed</th>
            <th>Skipped</th>
            <th>Success Rate</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function renderFlowLevelView(run) {
  const flowName = run.flowName || 'Flow';
  const summary = run.instanceSummary || [];
  if (summary.length === 0) return '';

  const steps = run.steps || [];
  const downstreamByInstance = {};
  for (const step of steps) {
    const results = step.instanceResults || {};
    for (const inst of Object.keys(results)) {
      if (!downstreamByInstance[inst]) downstreamByInstance[inst] = [];
      downstreamByInstance[inst].push(path.basename(step.spec || ''));
    }
  }

  let rows = '';
  for (const inst of summary) {
    const downstream = downstreamByInstance[inst.instanceId] || [];
    const downstreamText = downstream.length > 1
      ? 'Executed in: ' + downstream.slice(1).join(', ')
      : (inst.downstreamStatus === 'pending' ? 'Not reached' : String(inst.downstreamStatus || ''));
    const failureReason = inst.status === 'passed' ? '' : escapeHtml(inst.error || inst.upstreamError || '-');
    rows += `<tr class="${statusClass(inst.status)}">
      <td>${escapeHtml(inst.instanceId)}</td>
      <td>${statusText(inst.status)}</td>
      <td>${failureReason}</td>
      <td>${formatDate(inst.startTime)}</td>
      <td>${formatDate(inst.endTime)}</td>
      <td>${formatDuration(inst.durationMs)}</td>
      <td>${escapeHtml(downstreamText)}</td>
    </tr>`;
  }

  return `
    <section class="flow-level">
      <h2>Flow-Level View: ${escapeHtml(flowName)}</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>Instance ID</th>
            <th>Status</th>
            <th>Failure Reason</th>
            <th>Start Time</th>
            <th>End Time</th>
            <th>Duration</th>
            <th>Downstream Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function renderInstanceStatusMatrix(run) {
  const summary = run.instanceSummary || [];
  if (summary.length === 0) return '';

  let cells = '';
  for (const inst of summary) {
    cells += `<div class="matrix-cell ${statusClass(inst.status)}">${escapeHtml(inst.instanceId)}<br><small>${statusText(inst.status)}</small></div>`;
  }

  return `
    <section class="matrix">
      <h2>Instance-wise Status Matrix</h2>
      <div class="matrix-grid">${cells}</div>
    </section>`;
}

function normalizeStatusForFilter(status) {
  return String(status || '').toLowerCase();
}

function renderFailedInstanceDetails(run) {
  const failed = (run.instanceSummary || []).filter(i => normalizeStatusForFilter(i.status) === 'failed');
  if (failed.length === 0) {
    return `
      <section class="failed-details">
        <h2>Failed Instance Details</h2>
        <p class="note">No failed instances in this run.</p>
      </section>`;
  }

  let rows = '';
  for (const inst of failed) {
    rows += `<tr>
      <td>${escapeHtml(inst.instanceId)}</td>
      <td>${escapeHtml(inst.flowName || run.flowName || 'N/A')}</td>
      <td>${formatDate(inst.startTime)}</td>
      <td>${formatDate(inst.endTime)}</td>
      <td><pre>${escapeHtml(inst.error || 'No error message captured')}</pre></td>
    </tr>`;
  }

  return `
    <section class="failed-details">
      <h2>Failed Instance Details</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>Instance ID</th>
            <th>Flow Name</th>
            <th>Start Time</th>
            <th>End Time</th>
            <th>Failure Reason</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function renderSkippedInstanceDetails(run) {
  const skipped = (run.instanceSummary || []).filter(i => normalizeStatusForFilter(i.status) === 'skipped');
  if (skipped.length === 0) {
    return `
      <section class="skipped-details">
        <h2>Skipped Instance Details</h2>
        <p class="note">No skipped instances in this run.</p>
      </section>`;
  }

  let rows = '';
  for (const inst of skipped) {
    rows += `<tr>
      <td>${escapeHtml(inst.instanceId)}</td>
      <td>${escapeHtml(inst.flowName || run.flowName || 'N/A')}</td>
      <td>${formatDate(inst.startTime)}</td>
      <td>${formatDate(inst.endTime)}</td>
      <td><pre>${escapeHtml(inst.error || inst.upstreamError || 'No reason recorded')}</pre></td>
    </tr>`;
  }

  return `
    <section class="skipped-details">
      <h2>Skipped Instance Details</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>Instance ID</th>
            <th>Flow Name</th>
            <th>Start Time</th>
            <th>End Time</th>
            <th>Reason for Skip</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function renderRecommendations(run) {
  const overall = run.overall || {};
  const failed = (run.instanceSummary || []).filter(i => normalizeStatusForFilter(i.status) === 'failed');
  const skipped = (run.instanceSummary || []).filter(i => normalizeStatusForFilter(i.status) === 'skipped');
  let recommendations = '';

  if (overall.status === 'Success') {
    recommendations = '<li>All instances passed. Proceed with downstream regression or sign-off.</li>';
  } else if (overall.status === 'Partial Success') {
    recommendations = '<li>Review failed instances and re-run with corrected test data.</li><li>Skipped instances were excluded because their upstream flow did not pass; they may be re-attempted once upstream succeeds.</li>';
  } else if (overall.status === 'Failure') {
    recommendations = '<li>Investigate environment or application availability before re-running.</li><li>Check shared-state and data dependencies are correctly seeded.</li>';
  } else {
    recommendations = '<li>Validate FlowConfig and test data configuration.</li>';
  }

  if (failed.length > 0) {
    const reasons = {};
    for (const inst of failed) {
      const key = (inst.error || 'Unknown').split('\n')[0].substring(0, 80);
      reasons[key] = (reasons[key] || 0) + 1;
    }
    for (const [reason, count] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
      recommendations += `<li>${count} failure(s) related to: ${escapeHtml(reason)}</li>`;
    }
  }

  if (skipped.length > 0) {
    recommendations += `<li>${skipped.length} instance(s) skipped due to upstream failure.</li>`;
  }

  return `
    <section class="recommendations">
      <h2>Recommendations / Next Actions</h2>
      <ul>${recommendations}</ul>
    </section>`;
}

function renderBusinessDashboard(run) {
  return `
    <section class="dashboard">
      <h2>Business Dashboard</h2>
      ${renderExecutiveSummary(run)}
      ${renderFlowWiseSummary(run)}
      ${renderInstanceStatusMatrix(run)}
      ${renderFailedInstanceDetails(run)}
      ${renderSkippedInstanceDetails(run)}
      ${renderRecommendations(run)}
    </section>`;
}

function renderDetailedExecution(run) {
  const summary = run.instanceSummary || [];
  if (summary.length === 0) return '';

  let rows = '';
  for (const inst of summary) {
    const failureReason = inst.status === 'passed' ? '' : escapeHtml(inst.error || inst.upstreamError || '-');
    rows += `<tr class="${statusClass(inst.status)}">
      <td>${escapeHtml(inst.flowName || run.flowName || 'N/A')}</td>
      <td>${escapeHtml(inst.instanceId)}</td>
      <td>${statusText(inst.status)}</td>
      <td>${failureReason}</td>
      <td>${formatDate(inst.startTime)}</td>
      <td>${formatDate(inst.endTime)}</td>
      <td>${formatDuration(inst.durationMs)}</td>
      <td>${escapeHtml(inst.downstreamStatus || 'pending')}</td>
    </tr>`;
  }

  return `
    <section class="detailed">
      <h2>Detailed Execution Section</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>Flow Name</th>
            <th>Instance ID</th>
            <th>Status</th>
            <th>Failure Reason</th>
            <th>Start Time</th>
            <th>End Time</th>
            <th>Duration</th>
            <th>Downstream Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

async function main() {
  const results = readJson(EXECUTION_RESULTS_FILE, null);
  if (!results || !Array.isArray(results.runs) || results.runs.length === 0) {
    console.error('No execution results found. Run the orchestrator first.');
    process.exit(1);
  }

  const run = results.runs[results.runs.length - 1];
  const suiteName = run.flowName || 'Execution';
  const totalTests = (run.instanceSummary || []).length || (run.overall && run.overall.totalInstancesExecuted) || 0;
  const generated = formatDate(new Date().toISOString());

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(suiteName)} Test Report - PDF</title>
  <style>
    @page { margin: 1cm; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #222; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    h2 { font-size: 14px; margin: 16px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    h3 { font-size: 12px; margin: 10px 0 6px; text-transform: uppercase; }
    .header { border-bottom: 2px solid #444; padding-bottom: 8px; margin-bottom: 16px; }
    section { margin-bottom: 16px; }
    .status-banner { padding: 8px 12px; border-radius: 4px; font-weight: bold; margin-bottom: 12px; }
    .status-passed { background: #d4edda; color: #155724; }
    .status-failed { background: #f8d7da; color: #721c24; }
    .status-partial { background: #fff3cd; color: #856404; }
    .status-skipped { background: #e2e3e5; color: #383d41; }
    .status-unknown { background: #f2f2f2; color: #555; }
    .dashboard-grid { display: flex; flex-wrap: nowrap; gap: 6px; margin-bottom: 12px; }
    .dashboard-box { flex: 1 1 0; min-width: 0; border: 1px solid #ccc; border-radius: 4px; padding: 8px 4px; text-align: center; background: #fafafa; overflow-wrap: break-word; }
    .dashboard-box .value { display: block; font-size: 18px; font-weight: bold; color: #333; }
    .dashboard-box .label { display: block; font-size: 9px; text-transform: uppercase; color: #666; margin-top: 4px; }
    .stat-total { background: #e6f2ff; border-color: #b3d7ff; }
    .stat-passed { background: #d4edda; border-color: #c3e6cb; }
    .stat-passed .value { color: #155724; }
    .stat-failed { background: #f8d7da; border-color: #f5c6cb; }
    .stat-failed .value { color: #721c24; }
    .stat-skipped { background: #e2e3e5; border-color: #d6d8db; }
    .stat-skipped .value { color: #383d41; }
    .stat-rate { background: #fff3cd; border-color: #ffeeba; }
    .stat-duration { background: #d1ecf1; border-color: #bee5eb; }
    .data-table { border-collapse: collapse; width: 100%; font-size: 10px; margin-bottom: 12px; }
    .data-table th, .data-table td { border: 1px solid #ddd; padding: 5px; text-align: left; }
    .data-table th { background: #f5f5f5; font-weight: bold; }
    .data-table tr.status-passed { background: #d4edda; }
    .data-table tr.status-failed { background: #f8d7da; }
    .data-table tr.status-partial { background: #fff3cd; }
    .data-table tr.status-skipped { background: #e2e3e5; }
    .matrix-grid { display: flex; flex-wrap: wrap; gap: 6px; }
    .matrix-cell { border: 1px solid #ccc; border-radius: 4px; padding: 8px; min-width: 70px; text-align: center; font-size: 10px; }
    .note { font-style: italic; color: #555; }
    pre { white-space: pre-wrap; word-wrap: break-word; background: #f8f8f8; padding: 6px; border-radius: 3px; margin: 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(suiteName)} Test Report (PDF)</h1>
    <div>Generated (Bermuda time): ${generated} | Tests: ${totalTests}</div>
  </div>
  ${renderExecutiveSummary(run)}
  ${renderFlowLevelView(run)}
  ${renderDetailedExecution(run)}
  ${renderBusinessDashboard(run)}
</body>
</html>`;

  const outputName = `${suiteName} execution report`;
  const OUTPUT_HTML = path.join(REPORTS_DIR, `${outputName}.html`);
  const OUTPUT_PDF = path.join(REPORTS_DIR, `${outputName}.pdf`);

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_HTML, html, 'utf8');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const fileUrl = 'file:///' + OUTPUT_HTML.replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'load' });
  await page.pdf({
    path: OUTPUT_PDF,
    format: 'A4',
    printBackground: true,
    margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
  });
  await browser.close();

  console.log(`Execution PDF report generated: ${OUTPUT_PDF}`);
}

main().catch(err => {
  console.error('Failed to generate execution report:', err);
  process.exit(1);
});
