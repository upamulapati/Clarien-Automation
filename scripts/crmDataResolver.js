const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { crm, getCustomerLayout, inflate } = require('./crmDataLayout');

const EXCEL = path.resolve(__dirname, '../data/test-data.xlsx');
const STEP_DATA = path.resolve(__dirname, '../data/crm-step-data.json');

/**
 * Read data/test-data.xlsx, find the requested CRM row, and write a full
 * crmTestData-shaped JSON file that the specs can consume via crmTestData.ts.
 *
 * @param {string} customerType  'retail' or 'corporate'
 * @param {number} dataRowId     the instance number in the CRM sheet
 * @returns {string} absolute path to the written step-data JSON
 */
function resolve(customerType, dataRowId) {
  if (!fs.existsSync(EXCEL)) {
    throw new Error(`CRM workbook not found: ${EXCEL}`);
  }

  const layout = getCustomerLayout(customerType, dataRowId);
  if (!layout) {
    throw new Error(`No CRM layout for ${customerType} / ${dataRowId}`);
  }

  const wb = xlsx.readFile(EXCEL);
  if (!wb.Sheets['CRM']) {
    throw new Error('data/test-data.xlsx does not contain a "CRM" sheet');
  }

  const ws = wb.Sheets['CRM'];
  const rows = xlsx.utils.sheet_to_json(ws);

  // Normalize any date-formatted numeric cells to dd/mm/yyyy strings.
  // Excel may store typed-in dates as serial numbers; without this the resolver
  // would pass 26665/29221 etc. to the specs instead of 01/01/1973 etc.
  const range = xlsx.utils.decode_range(ws['!ref']);
  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[xlsx.utils.encode_cell({ r: range.s.r, c })];
    headers.push(cell ? cell.v : null);
  }
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const rowIndex = r - 1;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[xlsx.utils.encode_cell({ r, c })];
      const isDateCell =
        (cell.z && xlsx.SSF.is_date(cell.z)) ||
        (cell.w && /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(cell.w));
      if (!cell || cell.t !== 'n' || !isDateCell) continue;
      const header = headers[c];
      if (!header || !rows[rowIndex]) continue;
      rows[rowIndex][header] = xlsx.SSF.format('dd/mm/yyyy', cell.v);
    }
  }

  const flatRow = rows.find(r => Number(r.instance) === Number(dataRowId));
  if (!flatRow) {
    throw new Error(`No CRM row with instance=${dataRowId}`);
  }

  const newEndToEnd = inflate(customerType, dataRowId, flatRow);

  // Build a full crmTestData-shaped object while keeping everything outside endToEnd untouched.
  const stepData = JSON.parse(JSON.stringify(crm));
  stepData[customerType].endToEnd = newEndToEnd;

  fs.writeFileSync(STEP_DATA, JSON.stringify(stepData, null, 2), 'utf8');
  return STEP_DATA;
}

module.exports = { resolve };
