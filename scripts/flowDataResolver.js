const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const EXCEL = path.resolve(__dirname, '../data/test-data.xlsx');
const ROW_KEYS = ['instance', 'flowName', 'name', 'sharedKey', 'menuOption', 'function', 'enabled'];

function tryParse(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      return JSON.parse(s);
    } catch {
      return v;
    }
  }
  return v;
}

function toProductRow(raw) {
  const base = {};
  const data = {};
  for (const [k, v] of Object.entries(raw)) {
    if (ROW_KEYS.includes(k)) {
      base[k] = v;
    } else {
      data[k] = v;
    }
  }
  return { ...base, data };
}

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
      const isDateCell =
        (cell.z && xlsx.SSF.is_date(cell.z)) ||
        (cell.w && /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(cell.w));
      if (!cell || cell.t !== 'n' || !isDateCell) continue;
      const header = headers[c];
      if (!header || !rows[rowIndex]) continue;
      rows[rowIndex][header] = xlsx.SSF.format('dd/mm/yyyy', cell.v);
    }
  }
}

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
    selected.push(toProductRow(row));
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

/**
 * Resolve all enabled rows for a product sheet (filtered by flowName) into a JSON file.
 *
 * @param {string} sheet
 * @param {string} flowName
 * @param {string} outputPath
 * @param {string} dataKey
 * @param {object} defaults  Defaults for flowName, menuOption, function, enabled
 * @returns {string} outputPath
 */
function resolveProduct(sheet, flowName, outputPath, dataKey, defaults = {}) {
  if (!fs.existsSync(EXCEL)) {
    throw new Error(`Workbook not found: ${EXCEL}`);
  }

  const wb = xlsx.readFile(EXCEL);
  if (!wb.Sheets[sheet]) {
    throw new Error(`data/test-data.xlsx does not contain a "${sheet}" sheet`);
  }

  const ws = wb.Sheets[sheet];
  const rows = xlsx.utils.sheet_to_json(ws);
  normalizeDates(ws, rows);

  let selected = rows.filter(r =>
    r.enabled == null || String(r.enabled).toUpperCase() !== 'N'
  );

  if (flowName) {
    selected = selected.filter(r =>
      r.flowName == null || String(r.flowName) === flowName
    );
  }

  const list = selected.map(r => {
    const base = {};
    const data = {};
    for (const [k, v] of Object.entries(r)) {
      const parsed = tryParse(v);
      if (ROW_KEYS.includes(k)) {
        base[k] = parsed;
      } else {
        data[k] = parsed;
      }
    }

    const {
      flowName: defaultFlowName = 'unknown',
      menuOption: defaultMenuOption = '',
      function: defaultFunction = 'Add',
      enabled: defaultEnabled = 'Y',
    } = defaults;

    return {
      instance: base.instance,
      name: base.name,
      sharedKey: base.sharedKey,
      flowName: base.flowName ?? defaultFlowName,
      menuOption: base.menuOption ?? defaultMenuOption,
      function: base.function ?? defaultFunction,
      enabled: base.enabled ?? defaultEnabled,
      data,
    };
  });

  fs.writeFileSync(outputPath, JSON.stringify({ [dataKey]: list }, null, 2), 'utf8');
  return outputPath;
}

module.exports = { resolve, resolveProduct };
