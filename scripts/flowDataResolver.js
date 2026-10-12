const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const EXCEL = path.resolve(__dirname, '../data/test-data.xlsx');

/**
 * Resolve one or more instance rows from a given Excel sheet into a JSON file.
 *
 * @param {string} dataSheet
 * @param {string|number} dataRowId  One instance or a comma-separated list, e.g. "1,2,3"
 * @param {string} outputPath
 * @returns {string} outputPath
 */
function resolve(dataSheet, dataRowId, outputPath) {
  if (!fs.existsSync(EXCEL)) {
    throw new Error(`Workbook not found: ${EXCEL}`);
  }

  const wb = xlsx.readFile(EXCEL);
  if (!wb.Sheets[dataSheet]) {
    throw new Error(`data/test-data.xlsx does not contain a "${dataSheet}" sheet`);
  }

  const ws = wb.Sheets[dataSheet];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });

  const ids = String(dataRowId)
    .split(/[,\s;|]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter(n => Number.isInteger(n) && n > 0);

  if (ids.length === 0) {
    throw new Error(`No valid dataRowId values found for sheet "${dataSheet}" (got: ${dataRowId})`);
  }

  const selected = [];
  for (const id of ids) {
    const row = rows.find(r => Number(r.instance) === id);
    if (!row) {
      throw new Error(`No row with instance=${id} in sheet "${dataSheet}"`);
    }
    selected.push(row);
  }

  // Pick a stable data key that does not collide with flowX.json top-level keys.
  const dataKey =
    dataSheet === 'SavingsAccountData' ? 'savingsData' :
    dataSheet === 'CurrentAccountData' ? 'currentData' :
    dataSheet === 'CurrentAccountModifyData' ? 'currentModifyData' :
    dataSheet === 'CurrentAccountModifyVerifyData' ? 'currentModifyVerifyData' :
    dataSheet === 'SavingsAccountModifyData' ? 'savingsModifyData' :
    dataSheet === 'SavingsAccountModifyVerifyData' ? 'savingsModifyVerifyData' :
    dataSheet === 'TransferMaintenanceData' ? 'transferData' : 'data';
  const content = { [dataKey]: selected };

  fs.writeFileSync(outputPath, JSON.stringify(content, null, 2), 'utf8');
  return outputPath;
}

module.exports = { resolve };
