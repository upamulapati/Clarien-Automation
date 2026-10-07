const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const INPUT_HTML = path.resolve(__dirname, '../docs/automation-proposal.html');
const OUTPUT_DIR = path.resolve(__dirname, '../docs');
const OUTPUT_PDF = path.join(OUTPUT_DIR, 'automation-proposal.pdf');

(async () => {
  if (!fs.existsSync(INPUT_HTML)) {
    console.error(`HTML source not found: ${INPUT_HTML}`);
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const fileUrl = 'file:///' + INPUT_HTML.replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.pdf({
    path: OUTPUT_PDF,
    format: 'A4',
    printBackground: true,
    margin: { top: '1.5cm', right: '1.5cm', bottom: '1.5cm', left: '1.5cm' }
  });
  await browser.close();

  console.log(`PDF generated: ${OUTPUT_PDF}`);
})().catch(err => {
  console.error('Failed to generate PDF:', err);
  process.exit(1);
});
