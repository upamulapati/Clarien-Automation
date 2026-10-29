const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const JSZip = require('jszip');

const EXCEL = path.resolve(__dirname, '../data/test-data.xlsx');
const SRC = EXCEL + '.bak.dropdowns';
const SHEETS = ['SavingsAccountData', 'CurrentAccountData'];
const LIST_SHEET = '__dropdown_lists__';

const DROPDOWN_VALUES = {
  dispatchMode: [
    'Select',
    'A - Post and Email',
    'B - Special Delivery and Email',
    'C - Collect by Person',
    'D - Courier and Email',
    'E - Email Only',
    'N - No Dispatch',
    'P - Post',
    'Q - Courier',
    'S - Special Delivery',
  ],
  accountStatement: ['Select', 'B - Both', 'N - None', 'P - Pass Book', 'S - Statement'],
  payInterest: ['Yes', 'No'],
  collectInterest: ['Yes', 'No'],
  interestCreditAccount: [
    'Select',
    'O - Operative A/c.',
    'S - Original A/c.',
    'T - Payment System',
    'L - Parking A/c.',
  ],
  interestDebitAccount: [
    'Select',
    'O - Operative A/c.',
    'E - Operative or Original A/c.',
    'P - Operative/Parking A/c.',
    'S - Original A/c.',
    'L - Parking A/c.',
  ],
  accountPegged: ['Yes', 'No', 'Relative'],
  withholdingTaxBorneBy: ['None', 'Principal A/c. Holder Only'],
  nomination: ['Yes', 'No'],
  preferredNominationType: ['Simultaneous', 'Successive'],
  accountMinBalanceIndicator: ['Scheme', 'A/c'],
  externalSystemPricingFor: ['Select', 'C - Charge', 'N - None'],
  drawingPowerIndicator: ['Select', 'D - Derived', 'E - Equal', 'M - Maintained', 'P - Parent'],
  scanDetails: ['Select', 'Y - Scan Required', 'N - Scan not required', 'S - Scanned'],
  autoSweep: ['Yes', 'No'],
  sweepOutFrequency: ['daily', 'Fortnightly', 'half-yearly', 'monthly', 'quarterly', 'weekly', 'yearly'],
  autoRenewal: ['Select', 'L - Limited', 'N - No Autorenewal', 'U - Unlimited'],
  relationType: [
    'Select',
    'A - Authorized Signatory',
    'C - Co-Obligant',
    'D - DSA',
    'G - Guarantor',
    'H - Legal Heir',
    'J - Joint Holder',
    'L - Letter of Authority',
    'O - Others',
    'P - Power of Attorney',
    'S - Portfolio Statement',
    'V - LHV Hirer',
  ],
  foreignTaxReportable: ['Yes', 'No'],
  linkToOperativeAccount: ['Yes', 'No'],
  collectFee: ['Yes', 'No'],
};

function getColumnLetter(index) {
  let letter = '';
  let i = index;
  while (i > 0) {
    const rem = (i - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    i = Math.floor((i - 1) / 26);
  }
  return letter;
}

function escapeXmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHiddenSheetData() {
  const keys = Object.keys(DROPDOWN_VALUES);
  const maxLen = Math.max(...keys.map((k) => DROPDOWN_VALUES[k].length));
  const data = [keys];
  for (let i = 0; i < maxLen; i++) {
    const row = keys.map((k) => DROPDOWN_VALUES[k][i] || '');
    data.push(row);
  }
  return data;
}

function buildDefinedNamesXml() {
  const keys = Object.keys(DROPDOWN_VALUES);
  const entries = keys.map((k, i) => {
    const letter = getColumnLetter(i + 1);
    const len = DROPDOWN_VALUES[k].length;
    const ref = `${LIST_SHEET}!$${letter}$2:$${letter}$${len + 1}`;
    return `<definedName name="${k}_list">${ref}</definedName>`;
  });
  return `<definedNames count="${entries.length}">${entries.join('')}</definedNames>`;
}

function buildDataValidationsXml(headerMap) {
  const entries = [];
  for (const [key] of Object.entries(DROPDOWN_VALUES)) {
    const colNumber = headerMap[key];
    if (colNumber === undefined) continue;
    const letter = getColumnLetter(colNumber + 1);
    const sqref = `${letter}2:${letter}1048576`;
    entries.push(
      `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="stop" error="${escapeXmlAttr('Please select a value from the list')}" sqref="${sqref}"><formula1>=${key}_list</formula1></dataValidation>`
    );
  }
  if (entries.length === 0) return null;
  return `<dataValidations count="${entries.length}">${entries.join('')}</dataValidations>`;
}

async function main() {
  if (!fs.existsSync(SRC)) {
    throw new Error(`Backup not found: ${SRC}`);
  }

  const wb = XLSX.readFile(SRC);
  const listWs = XLSX.utils.aoa_to_sheet(buildHiddenSheetData());
  XLSX.utils.book_append_sheet(wb, listWs, LIST_SHEET);
  const listIdx = wb.SheetNames.indexOf(LIST_SHEET);
  wb.Workbook = wb.Workbook || {};
  wb.Workbook.Sheets = wb.Workbook.Sheets || [];
  wb.Workbook.Sheets[listIdx] = { Hidden: 1 };

  const xlsxBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  const zip = await JSZip.loadAsync(xlsxBuffer);

  let workbookXml = await zip.file('xl/workbook.xml').async('string');
  const definedNamesXml = buildDefinedNamesXml();
  workbookXml = workbookXml.replace('</workbook>', `${definedNamesXml}</workbook>`);
  zip.file('xl/workbook.xml', workbookXml);

  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');

  const nameToRid = {};
  let m;
  const sheetRegex = /<sheet[^>]+name="([^"]+)"[^>]*\s+r:id="([^"]+)"/g;
  while ((m = sheetRegex.exec(workbookXml)) !== null) {
    nameToRid[m[1]] = m[2];
  }

  const ridToPath = {};
  const relRegex = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g;
  while ((m = relRegex.exec(relsXml)) !== null) {
    ridToPath[m[1]] = m[2];
  }

  for (const sheetName of SHEETS) {
    const rid = nameToRid[sheetName];
    if (!rid) continue;
    const target = ridToPath[rid];
    if (!target) continue;
    const sheetPath = 'xl/' + target.replace(/^\/+/, '');

    const ws = wb.Sheets[sheetName];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const headerMap = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell && cell.v != null) headerMap[String(cell.v)] = c;
    }

    const dvXml = buildDataValidationsXml(headerMap);
    if (!dvXml) continue;

    const sheetXml = await zip.file(sheetPath).async('string');
    const idx = sheetXml.lastIndexOf('</sheetData>');
    if (idx === -1) {
      console.log(`Could not find </sheetData> in ${sheetPath}`);
      continue;
    }
    const newSheetXml = sheetXml.slice(0, idx + 12) + dvXml + sheetXml.slice(idx + 12);
    zip.file(sheetPath, newSheetXml);
    console.log(`Patched data validations: ${sheetName} (${sheetPath}) - ${dvXml.match(/<dataValidation /g).length} entries`);
  }

  const outBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  fs.writeFileSync(EXCEL, outBuffer);
  console.log(`Updated dropdowns in ${EXCEL}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
