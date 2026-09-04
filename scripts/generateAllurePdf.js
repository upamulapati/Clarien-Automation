const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RESULTS_DIR = path.resolve('reports', 'allureReports');
const OUTPUT_DIR = path.resolve('reports');
const OUTPUT_HTML = path.join(OUTPUT_DIR, 'allure-pdf.html');
const OUTPUT_PDF = path.join(OUTPUT_DIR, 'allure-report.pdf');
const LAST_RUN_FILE = path.join(OUTPUT_DIR, '.last-run.json');

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

function formatDuration(start, stop) {
  const ms = stop - start;
  if (Number.isNaN(ms) || ms < 0) return 'N/A';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
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

function renderSteps(steps, level = 0) {
  if (!steps || steps.length === 0) return '';
  const items = steps.map(step => {
    const status = step.status || 'unknown';
    const name = escapeHtml(step.name || 'unnamed step');
    const duration = formatDuration(step.start, step.stop);
    const children = renderSteps(step.steps, level + 1);
    const attachments = (step.attachments || []).map(att => {
      const file = readAttachment(att.source);
      if (!file) return '';
      if ((att.type || '').startsWith('image/')) {
        const b64 = file.toString('base64');
        return `<div class="attachment"><img src="data:${att.type};base64,${b64}" alt="${escapeHtml(att.name)}" /></div>`;
      }
      if ((att.type || '').startsWith('text/')) {
        const text = file.toString('utf8');
        return `<div class="attachment log"><div class="att-name">${escapeHtml(att.name)} (${att.type})</div><div class="log-block">${formatLogContent(text)}</div></div>`;
      }
      return `<div class="attachment note">Attachment: ${escapeHtml(att.name)} (${escapeHtml(att.type)})</div>`;
    }).join('');
    return `
      <div class="step level-${level} status-${status}">
        <div class="step-header">
          <span class="status-icon">${status}</span>
          <span class="step-name">${name}</span>
          <span class="step-duration">${duration}</span>
        </div>
        ${attachments}
        ${children}
      </div>`;
  }).join('');
  return `<div class="steps">${items}</div>`;
}

function renderTest(result) {
  const status = result.status || 'unknown';
  const title = escapeHtml(result.name || 'Unnamed test');
  const suite = getLabel(result, 'suite') || 'Unknown suite';
  const duration = formatDuration(result.start, result.stop);
  const message = result.statusDetails && result.statusDetails.message ? escapeHtml(result.statusDetails.message) : '';
  const trace = result.statusDetails && result.statusDetails.trace ? escapeHtml(result.statusDetails.trace) : '';

  const topAttachments = (result.attachments || []).map(att => {
    const file = readAttachment(att.source);
    if (!file) return '';
    if ((att.type || '').startsWith('image/')) {
      const b64 = file.toString('base64');
      return `<div class="attachment"><img src="data:${att.type};base64,${b64}" alt="${escapeHtml(att.name)}" /></div>`;
    }
    if ((att.type || '').startsWith('text/')) {
      const text = file.toString('utf8');
      return `<div class="attachment log"><div class="att-name">${escapeHtml(att.name)} (${att.type})</div><div class="log-block">${formatLogContent(text)}</div></div>`;
    }
    return `<div class="attachment note">Attachment: ${escapeHtml(att.name)} (${escapeHtml(att.type)})</div>`;
  }).join('');

  return `
    <section class="test status-${status}">
      <h2 class="test-title">
        <span class="status-icon">${status}</span>
        ${title}
      </h2>
      <div class="test-meta">
        <span><strong>Suite:</strong> ${escapeHtml(suite)}</span>
        <span><strong>Status:</strong> ${status}</span>
        <span><strong>Duration:</strong> ${duration}</span>
      </div>
      ${message ? `<div class="message">${message}</div>` : ''}
      ${trace ? `<div class="trace"><strong>Trace:</strong><pre>${trace}</pre></div>` : ''}
      ${topAttachments ? `<div class="top-attachments">${topAttachments}</div>` : ''}
      ${renderSteps(result.steps)}
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

  let selectedFiles;
  if (fs.existsSync(LAST_RUN_FILE)) {
    const manifest = JSON.parse(fs.readFileSync(LAST_RUN_FILE, 'utf8'));
    const manifestFiles = Array.isArray(manifest.files) ? manifest.files : [];
    const manifestMtime = fs.statSync(LAST_RUN_FILE).mtime.getTime();
    const newestResultMtime = Math.max(...parsed.map(p => p.mtime));
    const allManifestFilesExist = manifestFiles.every(f => allFiles.includes(f));
    if (manifestFiles.length > 0 && allManifestFilesExist && manifestMtime >= newestResultMtime) {
      selectedFiles = manifestFiles;
      console.log(`Using run manifest: ${selectedFiles.length} result(s)`);
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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Allure Report - PDF</title>
  <style>
    @page { margin: 1cm; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #222; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    h2 { font-size: 14px; margin: 0 0 8px; }
    .header { border-bottom: 2px solid #444; padding-bottom: 8px; margin-bottom: 16px; }
    .test { border: 1px solid #ccc; padding: 12px; margin-bottom: 16px; }
    .test:not(:first-of-type) { page-break-before: always; }
    .test-meta { color: #555; margin-bottom: 8px; }
    .test-meta span { display: inline-block; margin-right: 16px; }
    .status-icon { display: inline-block; padding: 2px 6px; border-radius: 3px; font-weight: bold; text-transform: uppercase; font-size: 10px; margin-right: 6px; color: #fff; }
    .status-passed .status-icon, .status-passed { background: #2da94f; }
    .status-failed .status-icon, .status-failed { background: #d00; }
    .status-broken .status-icon, .status-broken { background: #f39c12; }
    .status-skipped .status-icon, .status-skipped { background: #aaa; }
    .status-unknown .status-icon, .status-unknown { background: #777; }
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
    .log-block { background: #1e1e1e; color: #d4d4d4; padding: 8px; border-radius: 4px; font-family: Consolas, monospace; font-size: 9px; white-space: pre-wrap; }
    .line { padding: 1px 0; }
    .sp-line { background: #3c2a00; color: #ffdd57; font-weight: bold; }
    .note { font-style: italic; color: #555; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Allure Test Report (PDF)</h1>
    <div>Generated: ${generated} | Tests: ${results.length}</div>
  </div>
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
