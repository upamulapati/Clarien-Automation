const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RESULTS_DIR = path.resolve('reports', 'allureReports');
const OUTPUT_DIR = path.resolve('reports');
const OUTPUT_HTML = path.join(OUTPUT_DIR, 'allure-pdf.html');
const OUTPUT_PDF = path.join(OUTPUT_DIR, 'allure-report.pdf');
const LAST_RUN_FILE = path.join(OUTPUT_DIR, '.last-run.json');
const TEST_ORDER_FILE = path.resolve(__dirname, '../tests/config/testOrder.json');

const SP_REGEX = /\[SP#\d+\]/i;

function escapeHtml(text) {
  if (text === undefined || text === null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getLabel(result, name) {
  const label = (result.labels || []).find(l => l.name === name);
  return label ? label.value : '';
}

function getPackageFile(result) {
  const suiteLabel = getLabel(result, 'suite') || '';
  if (suiteLabel && suiteLabel.includes('\\')) {
    return 'tests/' + suiteLabel.split('\\').join('/');
  }
  const packageLabel = getLabel(result, 'package') || '';
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

function resolveSuiteName(results, preferredSuite) {
  let testOrder;
  try {
    testOrder = require(TEST_ORDER_FILE);
  } catch (e) {
    return preferredSuite || 'Allure';
  }
  if (preferredSuite && testOrder[preferredSuite]) return preferredSuite;
  const resultFiles = new Set(results.map(getPackageFile).filter(Boolean));
  if (!resultFiles.size) return 'Allure';
  let best = 'Allure';
  let bestLen = Infinity;
  for (const [suiteName, files] of Object.entries(testOrder)) {
    if (Array.isArray(files) && [...resultFiles].every(f => files.includes(f))) {
      if (files.length < bestLen) {
        best = suiteName;
        bestLen = files.length;
      }
    }
  }
  if (best !== 'Allure') return best;
  const counts = {};
  for (const f of resultFiles) {
    const pathParts = f.split('/');
    if (pathParts.length >= 3) {
      const folder = pathParts[2];
      counts[folder] = (counts[folder] || 0) + 1;
    }
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries[0][0] : 'Allure';
}

function formatDuration(start, stop) {
  const ms = (stop || 0) - (start || 0);
  if (Number.isNaN(ms) || ms < 0) return 'N/A';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatLogContent(text) {
  const lines = text.split('\n');
  return lines
    .map(line => {
      const escaped = escapeHtml(line);
      const isSp = SP_REGEX.test(line);
      const cls = isSp ? 'line sp-line' : 'line';
      return `<div class="${cls}">${escaped}</div>`;
    })
    .join('');
}

function readAttachment(source) {
  const fullPath = path.join(RESULTS_DIR, source);
  if (!fs.existsSync(fullPath)) return null;
  try {
    return fs.readFileSync(fullPath);
  } catch (e) {
    return null;
  }
}

function collectAttachments(node, out = { images: [], logs: [], data: [] }) {
  for (const att of (node.attachments || [])) {
    const type = att.type || '';
    if (type.startsWith('image/')) {
      out.images.push(att);
    } else if (type.startsWith('text/')) {
      out.logs.push(att);
    } else if (type.includes('json')) {
      out.data.push(att);
    }
  }
  for (const step of (node.steps || [])) {
    collectAttachments(step, out);
  }
  return out;
}

function getAttachmentStep(name) {
  return String(name)
    .replace(/\s*-\s*screenshot\s*$/i, '')
    .replace(/\s*-\s*data\s*$/i, '')
    .trim();
}

function getAttachmentContent(att) {
  if (att.body) {
    return Buffer.from(att.body, 'base64').toString('utf8');
  }
  if (att.source) {
    const file = readAttachment(att.source);
    if (!file) return null;
    return file.toString('utf8');
  }
  return null;
}

function parseDataAttachment(att) {
  const content = getAttachmentContent(att);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

function renderDataPanel(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';
  const entries = Object.entries(data).filter(([k]) => k !== 'screenshot' && k !== 'timestamp');
  if (!entries.length) return '';
  const rows = entries.map(([k, v]) => {
    const value = v === undefined || v === null ? '' : String(v);
    const valueClass = value ? 'value-ok' : 'value-missing';
    return `<tr><td class="data-key">${escapeHtml(k)}</td><td class="data-value ${valueClass}">${escapeHtml(value)}</td></tr>`;
  }).join('');
  return `<div class="data-panel">
    <div class="data-title">Input Data</div>
    <table class="data-table">${rows}</table>
  </div>`;
}

function renderImageAttachment(att, data, status) {
  const file = readAttachment(att.source);
  if (!file) return '';
  const b64 = file.toString('base64');
  const action = escapeHtml(getAttachmentStep(att.name));
  const dataHtml = data ? renderDataPanel(data) : '';
  return `<div class="attachment screenshot status-${status}">
    <img src="data:${att.type};base64,${b64}" alt="${action}" />
    <div class="screenshot-caption">Action: ${action}</div>
    ${dataHtml}
  </div>`;
}

function renderTest(result) {
  const title = escapeHtml(result.name || 'Unnamed test');
  const suite = getLabel(result, 'suite') || 'Unknown suite';
  const duration = formatDuration(result.start, result.stop);
  const message = result.statusDetails && result.statusDetails.message ? escapeHtml(result.statusDetails.message) : '';
  const status = result.status || 'unknown';
  const { images, data } = collectAttachments(result);

  const dataByStep = new Map();
  for (const d of data) {
    const step = getAttachmentStep(d.name);
    dataByStep.set(step, parseDataAttachment(d));
  }

  // Deduplicate screenshots by action name, keeping the last (most recent) one.
  // This gives the final full-page state after the operation is complete.
  const imagesByStep = new Map();
  for (const att of images) {
    const step = getAttachmentStep(att.name);
    imagesByStep.set(step, att);
  }
  const actions = [...imagesByStep.keys()];

  const mainActionsHtml = actions.length
    ? `<div class="main-actions"><h3>Main Actions</h3><ol>${actions.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ol></div>`
    : '';
  const uniqueImages = [...imagesByStep.values()];
  const imgHtml = uniqueImages.map(img => renderImageAttachment(img, dataByStep.get(getAttachmentStep(img.name)), status)).join('');

  return `
    <section class="test">
      <h2 class="test-title">${title}</h2>
      <div class="test-meta">
        <span><strong>Suite:</strong> ${escapeHtml(suite)}</span>
        <span><strong>Duration:</strong> ${duration}</span>
      </div>
      ${message ? `<div class="message">${message}</div>` : ''}
      ${mainActionsHtml}
      ${imgHtml ? `<div class="screenshots-section"><h3>Screenshots</h3><div class="screenshot-gallery">${imgHtml}</div></div>` : ''}
    </section>`;
}

function detectLatestRun(parsed) {
  if (parsed.length <= 1) return parsed.map(p => p.file);

  const sorted = [...parsed].sort((a, b) => (a.start || a.mtime) - (b.start || b.mtime));
  const idles = [];
  let maxStopSoFar = sorted[0].stop || sorted[0].mtime;

  for (let i = 0; i < sorted.length - 1; i++) {
    maxStopSoFar = Math.max(maxStopSoFar, sorted[i].stop || sorted[i].mtime);
    const nextStart = sorted[i + 1].start || sorted[i + 1].mtime;
    const idle = Math.max(0, nextStart - maxStopSoFar);
    idles.push(idle);
  }

  if (idles.length === 1) {
    // Only two results total: keep only the newer one if there was a clear pause.
    return idles[0] > 60000 ? [sorted[1].file] : sorted.map(p => p.file);
  }

  // Find the last gap that is dramatically larger than the gap before it.
  // That last big gap marks the start of the latest run.
  const factor = 100;
  const minPrev = 1000; // 1s floor for the first comparison
  let boundaryIdx = -1;
  for (let i = 0; i < idles.length; i++) {
    const prev = i === 0 ? minPrev : idles[i - 1];
    if (idles[i] > Math.max(minPrev, prev) * factor) {
      boundaryIdx = i;
    }
  }

  if (boundaryIdx !== -1) {
    return sorted.slice(boundaryIdx + 1).map(p => p.file);
  }

  return sorted.map(p => p.file);
}

function renderDashboard(results) {
  if (!results.length) return '';
  const start = Math.min(...results.map(r => r.start || 0));
  const stop = Math.max(...results.map(r => r.stop || 0));
  const counts = { passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 };
  for (const r of results) {
    const status = r.status || 'unknown';
    counts[status] = (counts[status] || 0) + 1;
  }
  const total = results.length;
  const passed = counts.passed || 0;
  const successRate = total ? Math.round((passed / total) * 100) : 0;
  const statBox = (status, label) => {
    const count = counts[status] || 0;
    return count ? `<div class="dashboard-box stat-${status}"><span class="value">${count}</span><span class="label">${label}</span></div>` : '';
  };
  return `
    <section class="dashboard">
      <h2>Summary</h2>
      <div class="dashboard-grid">
        ${statBox('passed', 'Passed')}
        ${statBox('failed', 'Failed')}
        ${statBox('broken', 'Broken')}
        ${statBox('skipped', 'Skipped')}
        <div class="dashboard-box stat-total"><span class="value">${total}</span><span class="label">Total</span></div>
        <div class="dashboard-box stat-rate"><span class="value">${successRate}%</span><span class="label">Pass Rate</span></div>
        <div class="dashboard-box stat-duration"><span class="value">${formatDuration(start, stop)}</span><span class="label">Duration</span></div>
      </div>
    </section>`;
}

async function main() {
  if (!fs.existsSync(RESULTS_DIR)) {
    console.error(`Allure results directory not found: ${RESULTS_DIR}`);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith('-result.json'));
  if (allFiles.length === 0) {
    console.error(`No allure result files found in ${RESULTS_DIR}`);
    process.exit(1);
  }

  const parsed = allFiles.map(file => {
    const result = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf8'));
    const mtime = fs.statSync(path.join(RESULTS_DIR, file)).mtime.getTime();
    return {
      file,
      result,
      start: typeof result.start === 'number' ? result.start : mtime,
      stop: typeof result.stop === 'number' ? result.stop : mtime,
      mtime
    };
  });

  let testOrder = {};
  try { testOrder = require(TEST_ORDER_FILE); } catch (e) { testOrder = {}; }
  let manifest = null;
  let selectedFiles;
  if (fs.existsSync(LAST_RUN_FILE)) {
    manifest = JSON.parse(fs.readFileSync(LAST_RUN_FILE, 'utf8'));
    if (manifest && manifest.suite && Array.isArray(testOrder[manifest.suite])) {
      const suiteFiles = new Set(testOrder[manifest.suite]);
      const startTime = typeof manifest.startTime === 'number' ? manifest.startTime : 0;
      const relevant = parsed.filter(p => suiteFiles.has(getPackageFile(p.result)) && p.mtime >= startTime);
      selectedFiles = detectLatestRun(relevant);
      console.log(`Using suite ${manifest.suite}: ${selectedFiles.length} result(s)`);
    } else if (Array.isArray(manifest.files) && manifest.files.length) {
      const manifestMtime = fs.statSync(LAST_RUN_FILE).mtime.getTime();
      const newestResultMtime = Math.max(...parsed.map(p => p.mtime));
      const allManifestFilesExist = manifest.files.every(f => allFiles.includes(f));
      if (allManifestFilesExist && manifestMtime >= newestResultMtime) {
        selectedFiles = manifest.files;
        console.log(`Using run manifest: ${selectedFiles.length} result(s)`);
      } else {
        selectedFiles = detectLatestRun(parsed);
        console.log(`Detected latest run: ${selectedFiles.length} result(s)`);
      }
    } else {
      selectedFiles = detectLatestRun(parsed);
      console.log(`Detected latest run: ${selectedFiles.length} result(s)`);
    }
  } else {
    selectedFiles = detectLatestRun(parsed);
    console.log(`Detected latest run: ${selectedFiles.length} result(s)`);
  }

  const results = selectedFiles
    .map(f => parsed.find(p => p.file === f).result)
    .sort((a, b) => (a.start || 0) - (b.start || 0));

  const generated = new Date().toISOString().replace('T', ' ').replace(/\..*/, '');
  const testsHtml = results.map(renderTest).join('');
  const dashboardHtml = renderDashboard(results);
  const suiteName = resolveSuiteName(results, manifest ? manifest.suite : undefined);
  const pageTitle = `${suiteName} Test Report (PDF)`;
  const htmlTitle = `${suiteName} Test Report - PDF`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(htmlTitle)}</title>
  <style>
    @page { margin: 1cm; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #222; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    h2 { font-size: 14px; margin: 0 0 8px; }
    h3 { font-size: 12px; margin: 10px 0 6px; text-transform: uppercase; }
    .header { border-bottom: 2px solid #444; padding-bottom: 8px; margin-bottom: 16px; }
    .test { border: 1px solid #ccc; padding: 12px; margin-bottom: 16px; }
    .test:not(:first-of-type) { page-break-before: always; }
    .test-meta { color: #555; margin-bottom: 8px; }
    .test-meta span { display: inline-block; margin-right: 16px; }
    .status-icon { display: inline-block; padding: 2px 6px; border-radius: 3px; font-weight: bold; text-transform: uppercase; font-size: 10px; margin-right: 6px; color: #fff; }
    .status-icon.status-passed, .status-passed .status-icon { background: #2da94f; }
    .status-icon.status-failed, .status-failed .status-icon { background: #d00; }
    .status-icon.status-broken, .status-broken .status-icon { background: #f39c12; }
    .status-icon.status-skipped, .status-skipped .status-icon { background: #aaa; }
    .status-icon.status-unknown, .status-unknown .status-icon { background: #777; }
    .message { background: #ffecec; border-left: 4px solid #d00; padding: 8px; margin: 8px 0; font-weight: bold; }
    .trace pre { background: #f8f8f8; padding: 8px; overflow-wrap: break-word; white-space: pre-wrap; font-size: 9px; }
    .steps { margin-top: 8px; }
    .step { margin: 4px 0 4px 12px; }
    .level-0 { margin-left: 0; }
    .level-1 { margin-left: 12px; }
    .level-2 { margin-left: 24px; }
    .step-header { padding: 3px 0; }
    .step-name { font-weight: 600; }
    .step-duration { color: #666; margin-left: 8px; font-size: 10px; }
    .attachment { margin: 6px 0; }
    .attachment img { max-width: 100%; border: 1px solid #ddd; }
    .att-name { font-weight: bold; margin: 4px 0; }
    .main-actions { margin: 8px 0; }
    .main-actions ol { margin: 0 0 12px 18px; padding: 0; }
    .main-actions li { margin-bottom: 4px; }
    .screenshot-caption { margin-top: 6px; font-weight: 600; color: #333; }
    .data-panel { margin-top: 8px; padding: 6px; border: 1px solid #ccc; border-radius: 3px; background: #f9f9f9; }
    .data-title { font-weight: bold; font-size: 10px; margin-bottom: 4px; }
    .data-table { border-collapse: collapse; width: 100%; font-size: 9px; }
    .data-table td { padding: 3px 5px; border: 1px solid #ddd; }
    .data-key { font-weight: 600; color: #333; width: 30%; }
    .data-value { color: #222; }
    .value-ok { background: #d4edda; color: #155724; }
    .value-missing { background: #f8d7da; color: #721c24; }
    .attachment.status-passed img { border: 3px solid #2da94f; }
    .attachment.status-failed img { border: 3px solid #d00; }
    .attachment.status-broken img { border: 3px solid #f39c12; }
    .attachment.status-skipped img { border: 3px solid #aaa; }
    .log-block { background: #1e1e1e; color: #d4d4d4; padding: 8px; border-radius: 4px; font-family: Consolas, monospace; font-size: 9px; white-space: pre-wrap; }
    .line { padding: 1px 0; }
    .sp-line { background: #3c2a00; color: #ffdd57; font-weight: bold; }
    .note { font-style: italic; color: #555; }
    .dashboard { margin-bottom: 16px; }
    .dashboard h2 { margin-bottom: 10px; }
    .dashboard-grid { display: flex; flex-wrap: wrap; gap: 10px; }
    .dashboard-box { border: 1px solid #ccc; border-radius: 4px; padding: 10px; min-width: 90px; text-align: center; background: #fafafa; }
    .dashboard-box .value { display: block; font-size: 20px; font-weight: bold; color: #333; }
    .dashboard-box .label { display: block; font-size: 10px; text-transform: uppercase; color: #666; margin-top: 4px; }
    .stat-passed .value { color: #2da94f; }
    .stat-failed .value { color: #d00; }
    .stat-broken .value { color: #f39c12; }
    .stat-skipped .value { color: #aaa; }
    .stat-unknown .value { color: #777; }
    .stat-total .value, .stat-rate .value, .stat-duration .value { color: #333; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(pageTitle)}</h1>
    <div>Generated: ${generated} | Tests: ${results.length}</div>
  </div>
  ${dashboardHtml}
  ${testsHtml}
</body>
</html>`;

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
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

  console.log(`PDF report generated: ${OUTPUT_PDF}`);
}

main().catch(err => {
  console.error('Failed to generate PDF:', err);
  process.exit(1);
});
