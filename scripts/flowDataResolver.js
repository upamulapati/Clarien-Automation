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
      data[k] = tryParse(v);
    }
  }
  return { ...base, data };
}

function buildTransferDebits(data) {
  if (data == null) return;
  if (Array.isArray(data.debits)) return;
  if (typeof data.debits === 'string') {
    const parsed = tryParse(data.debits);
    if (Array.isArray(parsed)) {
      data.debits = parsed;
      return;
    }
  }
  const debitAccount = data.debitAccount || data.debitAcctId;
  const creditAccount = data.creditAccount || data.creditAcctId;
  const debitAmount = data.debitAmount || data.amount || data.refAmount;
  const creditAmount = data.creditAmount || data.amount || data.refAmount;
  if (!debitAccount || !debitAmount) return;
  const credits = [];
  if (creditAccount && creditAmount) {
    credits.push({ accountId: creditAccount, amount: creditAmount });
  }
  data.debits = [{ accountId: debitAccount, amount: debitAmount, credits }];
}

function buildTransferGroups(rows) {
  const groups = [];
  let current = null;
  for (const r of rows) {
    const instance = r.instance != null ? String(r.instance).trim() : '';
    if (instance !== '') {
      if (current) groups.push(current);
      current = { key: instance, base: r, rows: [r] };
    } else if (current) {
      current.rows.push(r);
    }
  }
  if (current) groups.push(current);
  return groups;
}

function buildDebitsFromRows(rows) {
  const debits = [];
  for (const r of rows) {
    const debitAccount = String(r.debitAccount || r.debitAcctId || '').trim();
    const creditAccount = String(r.creditAccount || r.creditAcctId || '').trim();
    const debitAmount = r.debitAmount || r.amount || r.refAmount;
    const creditAmount = r.creditAmount || r.amount || r.refAmount;
    if (debitAccount && debitAmount != null && String(debitAmount).trim() !== '') {
      debits.push({ accountId: debitAccount, amount: String(debitAmount), credits: [] });
    }
    if (creditAccount && creditAmount != null && String(creditAmount).trim() !== '') {
      if (debits.length === 0) continue;
      debits[debits.length - 1].credits.push({ accountId: creditAccount, amount: String(creditAmount) });
    }
  }
  return debits;
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
      if (!cell) continue;
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
  if (dataSheet === 'TransferMaintenanceData') {
    const allGroups = new Map(buildTransferGroups(rows).map(g => [g.key, g]));
    for (const id of ids) {
      const sId = String(id);
      const group = allGroups.get(sId);
      if (!group) {
        throw new Error(`No row or group with instance=${id} in sheet "${dataSheet}"`);
      }
      const product = toProductRow(group.base);
      product.data.debits = buildDebitsFromRows(group.rows);
      buildTransferDebits(product.data);
      selected.push(product);
    }
  } else {
    for (const id of ids) {
      const row = rows.find(r => Number(r.instance) === id);
      if (!row) {
        throw new Error(`No row with instance=${id} in sheet "${dataSheet}"`);
      }
      const product = toProductRow(row);
      selected.push(product);
    }
  }

  // Pick a stable data key that does not collide with flowX.json top-level keys.
  const dataKey =
    dataSheet === 'SavingsAccountData' ? 'savingsData' :
    dataSheet === 'CurrentAccountData' ? 'currentData' :
    dataSheet === 'CurrentAccountModifyData' ? 'currentModifyData' :
    dataSheet === 'CurrentAccountModifyVerifyData' ? 'currentModifyVerifyData' :
    dataSheet === 'SavingsAccountModifyData' ? 'savingsModifyData' :
    dataSheet === 'SavingsAccountModifyVerifyData' ? 'savingsModifyVerifyData' :
    dataSheet === 'TransferMaintenanceData' ? 'transferData' :
    dataSheet === 'retail_loans' ? 'retailLoansData' :
    dataSheet === 'retail_loans_mod' ? 'retailLoansModData' : 'data';
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

  let list;
  if (dataKey === 'transferData') {
    const groups = buildTransferGroups(selected);
    list = groups.map(g => {
      const base = {};
      const data = {};
      for (const [k, v] of Object.entries(g.base)) {
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
      data.debits = buildDebitsFromRows(g.rows);
      buildTransferDebits(data);
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
  } else {
    list = selected.map(r => {
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
  }

  fs.writeFileSync(outputPath, JSON.stringify({ [dataKey]: list }, null, 2), 'utf8');
  return outputPath;
}

module.exports = { resolve, resolveProduct };
