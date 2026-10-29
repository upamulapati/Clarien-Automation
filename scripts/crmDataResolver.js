const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { crm, inflate, modInflate } = require('./crmDataLayout');

const EXCEL = path.resolve(__dirname, '../data/test-data.xlsx');
const STEP_DATA = path.resolve(__dirname, '../data/crm-step-data.json');

/**
 * Read data/test-data.xlsx, find the requested row from the given sheet, and
 * write a full crmTestData-shaped JSON file that the specs can consume via crmTestData.ts.
 *
 * @param {string} customerType  'retail' or 'corporate'
 * @param {number} dataRowId     the instance number in the sheet
 * @param {string} sheet         'CRM' or 'CRM_Mod' (default 'CRM')
 * @returns {string} absolute path to the written step-data JSON
 */
function normalizeDates(ws, rows) {
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
      if (!cell) continue;
      const isDateCell =
        (cell.z && xlsx.SSF.is_date(cell.z)) ||
        (cell.w && /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(cell.w));
      if (cell.t !== 'n' || !isDateCell) continue;
      const header = headers[c];
      if (!header || !rows[rowIndex]) continue;
      rows[rowIndex][header] = xlsx.SSF.format('dd/mm/yyyy', cell.v);
    }
  }
}

function coerceAllToStrings(rows) {
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (row[key] == null) {
        row[key] = '';
      } else if (typeof row[key] !== 'string') {
        row[key] = String(row[key]);
      }
    }
  }
}

function attachRepeatableArrays(endToEnd, rows) {
  const repeatable = [
    { target: ['contactData', 'addresses'], key: 'addressType', fields: ['addressType','addressLabel','startDate','streetNo','streetName','houseNo','premiseName','buildingLevel','suburb','localityName','zip','addressLine1','city','state','country'] },
    { target: ['contactData', 'phones'], key: 'phoneType', fields: ['phoneType','countryCode','areaCode','phoneNumber'] },
    { target: ['contactData', 'emails'], key: 'email', fields: ['emailType','email'] },
    { target: ['documents'], key: 'uniqueId', fields: ['documentType','documentCode','uniqueId','placeOfIssue','issueDate','expiryDate','receivedOn','isPreferred','countryOfIssue','documentTypeDesc'] },
    { target: ['currencies'], key: 'ccy', fields: ['ccy','creditDiscountPcnt','debitDiscountPcnt','withholdingTaxPcnt','withholdingTaxFloorLimit','preferentialExpiryDate'] }
  ];
  for (const section of repeatable) {
    let target = endToEnd;
    for (const k of section.target.slice(0, -1)) target = target[k];
    const last = section.target[section.target.length - 1];
    const arr = [];
    for (const row of rows) {
      const keyValue = row[section.key];
      if (keyValue == null || String(keyValue).trim() === '') continue;
      const record = {};
      for (const f of section.fields) {
        record[f] = row[f] !== undefined ? row[f] : '';
      }
      arr.push(record);
    }
    target[last] = arr;
  }
}

function resolve(customerType, dataRowId, sheet = 'CRM') {
  if (!fs.existsSync(EXCEL)) {
    throw new Error(`CRM workbook not found: ${EXCEL}`);
  }

  const wb = xlsx.readFile(EXCEL);
  if (!wb.Sheets[sheet]) {
    throw new Error(`data/test-data.xlsx does not contain a "${sheet}" sheet`);
  }

  const ws = wb.Sheets[sheet];
  const rows = xlsx.utils.sheet_to_json(ws);

  // Normalize any date-formatted numeric cells to dd/mm/yyyy strings.
  // Excel may store typed-in dates as serial numbers; without this the resolver
  // would pass 26665/29221 etc. to the specs instead of 01/01/1973 etc.
  normalizeDates(ws, rows);

  // Ensure every Excel value is a string to avoid field mismatches.
  coerceAllToStrings(rows);

  const instanceRows = rows.filter(r => Number(r.instance) === Number(dataRowId));
  if (instanceRows.length === 0) {
    throw new Error(`No row with instance=${dataRowId} in sheet ${sheet}`);
  }

  let stepData;
  if (sheet === 'CRM_Mod') {
    stepData = modInflate(customerType, dataRowId, instanceRows[0]);
  } else {
    const newEndToEnd = inflate(customerType, dataRowId, instanceRows[0]);
    attachRepeatableArrays(newEndToEnd, instanceRows);
    stepData = JSON.parse(JSON.stringify(crm));
    stepData[customerType].endToEnd = newEndToEnd;
  }

  fs.writeFileSync(STEP_DATA, JSON.stringify(stepData, null, 2), 'utf8');
  return STEP_DATA;
}

module.exports = { resolve };
