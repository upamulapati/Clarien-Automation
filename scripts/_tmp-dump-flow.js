const xlsx = require('xlsx');
const path = require('path');
const wb = xlsx.readFile(path.resolve('data/test-data.xlsx'));

function toJson(sheet) {
  return xlsx.utils.sheet_to_json(sheet, { header: 1 });
}

function findColIdx(headers, keyword) {
  const k = String(keyword || '').toLowerCase();
  return headers.findIndex(
    (h) => h && String(h).toLowerCase().includes(k)
  );
}

const fcRows = toJson(wb.Sheets['FlowConfig']);
const fcHeaders = fcRows[0] || [];
const suiteIdx = findColIdx(fcHeaders, 'flowName');
const stepIdx = findColIdx(fcHeaders, 'step');
const fileIdx = findColIdx(fcHeaders, 'file');
const dataSheetIdx = findColIdx(fcHeaders, 'datasheet');
const dataRowIdIdx = findColIdx(fcHeaders, 'datarowid');
const enabledIdx = findColIdx(fcHeaders, 'enabled');

console.log('--- FlowConfig headers ---');
console.log(JSON.stringify(fcHeaders));

console.log('\n--- FlowConfig retailloan rows ---');
const dataRowIds = [];
for (let i = 1; i < fcRows.length; i++) {
  const r = fcRows[i];
  if (suiteIdx === -1) continue;
  const suite = String(r[suiteIdx] || '').toLowerCase().trim();
  if (suite === 'retailloan') {
    console.log(i + 1, JSON.stringify(r));
    const rowId = r[dataRowIdIdx];
    if (rowId !== undefined && rowId !== null && rowId !== '') {
      dataRowIds.push(String(rowId));
    }
  }
}

const rlRows = toJson(wb.Sheets['retail_loans']);
const rlHeaders = rlRows[0] || [];
const instanceIdx = findColIdx(rlHeaders, 'instance');

console.log('\n--- retail_loans headers ---');
console.log(JSON.stringify(rlHeaders));

console.log('\n--- retail_loans rows for retailloan dataRowIds ---');
for (let i = 1; i < rlRows.length; i++) {
  const r = rlRows[i];
  const instance = instanceIdx === -1 ? undefined : String(r[instanceIdx] || '');
  if (dataRowIds.includes(instance)) {
    console.log(i + 1, JSON.stringify(r));
  }
}

const flowNames = new Set();
for (let i = 1; i < fcRows.length; i++) {
  if (suiteIdx !== -1) {
    const v = String(fcRows[i][suiteIdx] || '').trim();
    if (v) flowNames.add(v);
  }
}
console.log('\nUnique FlowConfig flowName values:', [...flowNames].sort());

console.log('\n--- FlowConfig rows mentioning retail/loan (case-insensitive) ---');
for (let i = 1; i < fcRows.length; i++) {
  const r = fcRows[i];
  if (JSON.stringify(r).toLowerCase().includes('retail') || JSON.stringify(r).toLowerCase().includes('loan')) {
    console.log(i + 1, JSON.stringify(r));
  }
}

console.log('\nDataRowIds used by retailloan:', dataRowIds);
