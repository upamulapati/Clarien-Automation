const xlsx = require('xlsx');
const path = require('path');

const XLSX_FILE = path.resolve('data/test-data.xlsx');
const wb = xlsx.readFile(XLSX_FILE);

function toJsonArr(sheet) {
  return xlsx.utils.sheet_to_json(sheet, { header: 1 });
}

function findColIdx(headers, keyword) {
  const k = String(keyword || '').toLowerCase();
  return headers.findIndex((h) => h && String(h).toLowerCase().includes(k));
}

// ===================== retail_loans =====================
const rlSheet = wb.Sheets['retail_loans'];
const rlHeaders = toJsonArr(rlSheet)[0];
const emptyBase = Object.fromEntries(rlHeaders.map((h) => [h, '']));

function rowByInstance(instance) {
  const rows = xlsx.utils.sheet_to_json(rlSheet);
  return rows.find((r) => String(r.instance) === String(instance));
}

function addRow(values) {
  return { ...emptyBase, ...values };
}

let rlRows = xlsx.utils.sheet_to_json(rlSheet);

// 1. Update full-creation row (instance 1) -> LNCCS, 2000
const fullCreate = rlRows.find((r) => String(r.instance) === '1');
if (fullCreate) {
  fullCreate['Scheme Code'] = 'LNCCS';
  fullCreate['Loan Amount'] = 2000;
  fullCreate['sharedKey'] = '1';
  fullCreate['A/c Statement'] = 'None';
}

// 2. Update full-disbursement row (instance 7) -> 2000
const fullDisb = rlRows.find((r) => String(r.instance) === '7');
if (fullDisb) {
  fullDisb['Disbursement Amount'] = 2000;
}

// 3. Update partial-disbursement row (instance 9) -> 1000
const partialDisb = rlRows.find((r) => String(r.instance) === '9');
if (partialDisb) {
  partialDisb['Disbursement Amount'] = 1000;
  partialDisb['Partial'] = 'Y';
}

// 4. Add partial-creation row (instance 20)
rlRows.push(
  addRow({
    instance: 20,
    flowName: 'retailloan',
    name: 'Create Retail Loan - Partial',
    sharedKey: 'partial',
    menuOption: 'HOAACLA',
    function: 'Open',
    enabled: 'Y',
    Currency: 'BMD',
    'Sol Id': 100,
    'CIF Id': '0005000599',
    'Scheme Code': 'LNPEM',
    'Operative A/c Id': 4600000119,
    'Loan Amount': 2000,
    'Loan Period (Months)': 12,
    'No. Of Instalments': 12,
    'A/c Statement': 'None',
  })
);

// 5. Add partial-disbursement-verification row (instance 19)
rlRows.push(
  addRow({
    instance: 19,
    flowName: 'retailloan',
    name: 'Verify Partial Retail Loan Disbursement',
    sharedKey: 'partial',
    menuOption: 'HLADISB',
    function: 'Verify',
    enabled: 'Y',
    'Transaction Type': 'Transfer',
  })
);

wb.Sheets['retail_loans'] = xlsx.utils.json_to_sheet(rlRows);

// ===================== FlowConfig =====================
const fcSheet = wb.Sheets['FlowConfig'];
const fcRows = toJsonArr(fcSheet);
const fcHeaders = fcRows[0];
const flowIdx = findColIdx(fcHeaders, 'flowName');

const newFlow = [
  ['retailloan', 1, 'tests/Finacle/Retailloans/Retailloancreation.spec.ts', 'retail_loans', 1, 'Y', '', '', '', 'Create Retail Loan'],
  ['retailloan', 2, 'tests/Finacle/Retailloans/Retailloanverification.spec.ts', 'retail_loans', 2, 'Y', '', '', '', 'Verify Retail Loan'],
  ['retailloan', 3, 'tests/Finacle/Retailloans/addrelatedpartydetailsforretailloanaccount.spec.ts', 'retail_loans', 3, 'Y', '', '', '', 'Add Related Party'],
  ['retailloan', 4, 'tests/Finacle/Retailloans/addrelatedpartyverificationforretailloanaccount.spec.ts', 'retail_loans', 4, 'Y', '', '', '', 'Verify Added Related Party'],
  ['retailloan', 5, 'tests/Finacle/Retailloans/DeleteRelatedpartydetailsforretailloanaccount.spec.ts', 'retail_loans', 5, 'Y', '', '', '', 'Delete Related Party'],
  ['retailloan', 6, 'tests/Finacle/Retailloans/verifyDeletedRelatedpartydetailsforretailloanaccount.spec.ts', 'retail_loans', 6, 'Y', '', '', '', 'Verify Deleted Related Party'],
  ['retailloan', 7, 'tests/Finacle/Retailloans/retailloandisbursement.spec.ts', 'retail_loans', 7, 'Y', '', '', '', 'Disbursement'],
  ['retailloan', 8, 'tests/Finacle/Retailloans/retailloandisbursementverification.spec.ts', 'retail_loans', 8, 'Y', '', '', '', 'Verify Disbursement'],
  ['retailloan', 9, 'tests/Finacle/Retailloans/retailloanpartialdisbursement.spec.ts', 'retail_loans', 9, 'Y', '', '', '', 'Partial Disbursement'],
  ['retailloan', 10, 'tests/Finacle/Retailloans/retailloandisbursementverification.spec.ts', 'retail_loans', 19, 'Y', '', '', '', 'Verify Partial Disbursement'],
  ['retailloan', 11, 'tests/Finacle/Retailloans/Retailloanmodification.spec.ts', 'retail_loans_mod', 1, 'Y', '', '', '', 'Modify Retail Loan'],
  ['retailloan', 12, 'tests/Finacle/Retailloans/Retailloanmodifyverification.spec.ts', 'retail_loans_mod', 2, 'Y', '', '', '', 'Verify Modification'],
  ['retailloan', 13, 'tests/Finacle/Retailloans/retailloanrescheduling.spec.ts', 'retail_loans', 16, 'Y', '', '', '', 'Rescheduling'],
  ['retailloan', 14, 'tests/Finacle/Retailloans/retailloanreschedulingverification.spec.ts', 'retail_loans', 17, 'Y', '', '', '', 'Verify Rescheduling'],
  ['retailloan', 15, 'tests/Finacle/Retailloans/retailloanpayoff.spec.ts', 'retail_loans', 10, 'Y', '', '', '', 'Payoff'],
  ['retailloan', 16, 'tests/Finacle/Retailloans/retailloanpayoffverification.spec.ts', 'retail_loans', 11, 'Y', '', '', '', 'Verify Payoff'],
  ['retailloan', 17, 'tests/Finacle/Retailloans/retailloanchargeoff.spec.ts', 'retail_loans', 12, 'Y', '', '', '', 'Chargeoff'],
  ['retailloan', 18, 'tests/Finacle/Retailloans/retailloanchargeoffverification.spec.ts', 'retail_loans', 13, 'Y', '', '', '', 'Verify Chargeoff'],
  ['retailloan', 19, 'tests/Finacle/Retailloans/retailloanchargeoffrecovery.spec.ts', 'retail_loans', 14, 'Y', '', '', '', 'Chargeoff Recovery'],
  ['retailloan', 20, 'tests/Finacle/Retailloans/retailloanchargeoffrecoveryverification.spec.ts', 'retail_loans', 15, 'Y', '', '', '', 'Verify Chargeoff Recovery'],
  ['retailloan', 21, 'tests/Finacle/Retailloans/spcaacla.spec.ts', 'retail_loans', 18, 'Y', '', '', '', 'SPC AACLA'],
];

// Find the retailloan block and replace it in place.
let start = -1;
let end = -1;
for (let i = 1; i < fcRows.length; i++) {
  const v = flowIdx === -1 ? '' : String(fcRows[i][flowIdx] || '').toLowerCase().trim();
  if (v === 'retailloan') {
    if (start === -1) start = i;
    end = i;
  }
}

if (start !== -1) {
  fcRows.splice(start, end - start + 1, ...newFlow);
} else {
  // If not found, append after the header.
  fcRows.splice(1, 0, ...newFlow);
}

wb.Sheets['FlowConfig'] = xlsx.utils.aoa_to_sheet(fcRows);

// Preserve column widths where available (best effort).
['FlowConfig', 'retail_loans'].forEach((name) => {
  const ws = wb.Sheets[name];
  if (ws && ws['!cols']) {
    // keep existing
  }
});

xlsx.writeFile(wb, XLSX_FILE);
console.log(`Updated ${XLSX_FILE}`);
console.log(`retail_loans rows now: ${rlRows.length}`);
console.log(`FlowConfig retailloan block at rows ${start}-${end} replaced with ${newFlow.length} rows.`);
