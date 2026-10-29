const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { LAYOUT, flatten, MOD_LAYTOUT, modFlatten } = require('./crmDataLayout');

const OUT = path.resolve(__dirname, '../data/test-data.xlsx');

// CRM creation sheet
const crmRows = LAYOUT.map(l => flatten(l.customerType, l.instance));
const crmHeaderOrder = Array.from(new Set(['instance', ...crmRows.flatMap(r => Object.keys(r))]));
const crmWsData = [crmHeaderOrder, ...crmRows.map(r => crmHeaderOrder.map(h => (r[h] !== undefined ? r[h] : '')))];
const crmWs = xlsx.utils.aoa_to_sheet(crmWsData);

// CRM modification sheet
const modRows = MOD_LAYTOUT.map(l => modFlatten(l.customerType, l.instance));
const modHeaderOrder = Array.from(new Set(['instance', ...modRows.flatMap(r => Object.keys(r))]));
const modWsData = [modHeaderOrder, ...modRows.map(r => modHeaderOrder.map(h => (r[h] !== undefined ? r[h] : '')))];
const modWs = xlsx.utils.aoa_to_sheet(modWsData);

// HPORDM payment-order sheet
const HPORDM_JSON = path.resolve(__dirname, '../tests/config/hpordmTestData.json');
const hpordm = JSON.parse(fs.readFileSync(HPORDM_JSON, 'utf8'));
const hpordmRows = (hpordm.paymentOrderTestData || []).map(r => ({ ...r }));
const hpordmHeaderOrder = Array.from(new Set(['instance', ...hpordmRows.flatMap(r => Object.keys(r))]));
const hpordmWsData = [hpordmHeaderOrder, ...hpordmRows.map(r => hpordmHeaderOrder.map(h => (r[h] !== undefined ? r[h] : '')))];
const hpordmWs = xlsx.utils.aoa_to_sheet(hpordmWsData);

// Term deposit sheet
const TERM_DEPOSIT_JSON = path.resolve(__dirname, '../tests/config/termDepositTestData.json');
const termDeposit = JSON.parse(fs.readFileSync(TERM_DEPOSIT_JSON, 'utf8'));
const termDepositRows = (termDeposit.termDepositTestData || []).map(r => ({ ...r }));
const tdHeaderOrder = Array.from(new Set(['instance', ...termDepositRows.flatMap(r => Object.keys(r))]));

function toCellValue(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

const tdWsData = [tdHeaderOrder, ...termDepositRows.map(r => tdHeaderOrder.map(h => toCellValue(r[h])))];
const tdWs = xlsx.utils.aoa_to_sheet(tdWsData);

const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, crmWs, 'CRM');
xlsx.utils.book_append_sheet(wb, modWs, 'CRM_Mod');
xlsx.utils.book_append_sheet(wb, hpordmWs, 'HPORDM');
xlsx.utils.book_append_sheet(wb, tdWs, 'term_deposits');

// FlowConfig sheet: menu-driven flow declarations aligned with the proposal.
const flowConfigHeaders = [
  'flowName', 'step', 'spec', 'dataSheet', 'dataRowId', 'enabled',
  'sharedStateIn', 'sharedStateOut', 'customerType'
];

function flowStep(flowName, customerType, step, spec, dataSheet, instance) {
  return [flowName, step, spec, dataSheet, instance, 'Y', '', '', customerType];
}

const tdSpecList = [
  'tests/Finacle/Termdeposits/termdepositscreation.spec.ts',
  'tests/Finacle/Termdeposits/termdepositsverification.spec.ts',
  'tests/Finacle/Termdeposits/termdepositsmodification.spec.ts',
  'tests/Finacle/Termdeposits/addrelatedpartydetailsfortermdeposits.spec.ts',
  'tests/Finacle/Termdeposits/verifyaddrelatedpartydetailsfortermdeposits.spec.ts',
  'tests/Finacle/Termdeposits/deleterelatedpartydetailsfortermdeposits.spec.ts',
  'tests/Finacle/Termdeposits/verifydeletedrelatedpartydetailsfortermdeposits.spec.ts',
  'tests/Finacle/Termdeposits/termdepositspartialclosure.spec.ts',
  'tests/Finacle/Termdeposits/termdepositspartialclosureverification.spec.ts',
  'tests/Finacle/Termdeposits/termdepositsprematureclosure.spec.ts',
  'tests/Finacle/Termdeposits/termdepositsprematureclosureverification.spec.ts',
  'tests/Finacle/Termdeposits/termdepositsrenewal.spec.ts',
  'tests/Finacle/Termdeposits/termdepositsrenewalverification.spec.ts',
  'tests/Finacle/Termdeposits/termdepositsspcreditfrozen.spec.ts',
  'tests/Finacle/Termdeposits/termdepositsspflow.spec.ts',
  'tests/Finacle/Termdeposits/termdepositssphtditci.spec.ts'
];

const flowConfigRows = [
  // Retail creation
  ...LAYOUT.filter(l => l.customerType === 'retail').map(l => flowStep('crmCIFRetail', 'retail', 1, 'tests/Finacle/crmCIFRetail/crmCIFEndtoEnd.spec.ts', 'CRM', l.instance)),
  ...LAYOUT.filter(l => l.customerType === 'retail').map(l => flowStep('crmCIFRetail', 'retail', 2, 'tests/Finacle/crmCIFRetail/crmCIFSuspend.spec.ts', 'CRM', l.instance)),
  ...LAYOUT.filter(l => l.customerType === 'retail').map(l => flowStep('crmCIFRetail', 'retail', 3, 'tests/Finacle/crmCIFRetail/crmCIFUndoSuspend.spec.ts', 'CRM', l.instance)),
  // Corporate creation
  ...LAYOUT.filter(l => l.customerType === 'corporate').map(l => flowStep('crmCIFCorporate', 'corporate', 1, 'tests/Finacle/crmCIFCorporate/crmCIFCorpEndtoEnd.spec.ts', 'CRM', l.instance)),
  // Modification
  ...MOD_LAYTOUT.filter(l => l.customerType === 'retail' && l.instance === 3).map(l => flowStep('crmCIFModification', 'retail', 1, 'tests/Finacle/crmCIFRetail/combinedcifmodification_flow.spec.ts', 'CRM_Mod', l.instance)),
  // Payment order (HPORDM) data-driven via Excel
  flowStep('paymentorder', 'paymentorder', 1, 'tests/Finacle/paymentorder/hpordm-remittance.spec.ts', 'HPORDM', 1),
  // Term deposit data-driven via Excel
  ...tdSpecList.map((spec, idx) => flowStep('termdeposit', 'termdeposit', idx + 1, spec, 'term_deposits', 1))
];

const flowWs = xlsx.utils.aoa_to_sheet([flowConfigHeaders, ...flowConfigRows]);
xlsx.utils.book_append_sheet(wb, flowWs, 'FlowConfig');

xlsx.writeFile(wb, OUT);

console.log(`Wrote ${OUT} with CRM (${crmRows.length} rows, ${crmHeaderOrder.length} cols), CRM_Mod (${modRows.length} rows, ${modHeaderOrder.length} cols), HPORDM (${hpordmRows.length} rows, ${hpordmHeaderOrder.length} cols), term_deposits (${termDepositRows.length} rows, ${tdHeaderOrder.length} cols) and FlowConfig (${flowConfigRows.length} rows).`);
