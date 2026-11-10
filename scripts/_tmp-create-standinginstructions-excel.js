const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const excelPath = path.resolve(__dirname, '../data/test-data.xlsx');

if (!fs.existsSync(excelPath)) {
  throw new Error(`Workbook not found: ${excelPath}`);
}

const wb = xlsx.readFile(excelPath);

const rows = [
  {
    instance: 1,
    flowName: 'standinginstructions',
    name: 'HSSIM - add standing instruction',
    sharedKey: 'standingInstructionId',
    menuOption: 'HSSIM',
    function: 'Add',
    enabled: 'Y',
    solId: '100',
    cifCode: '0005000599',
    siType: 'customer',
    siFreqType: 'Monthly',
    siFreqStartDD: '01',
    siFreqHldyStat: 'S - Skip',
    siFreqCalBase: 'Gregorian',
    executionTime: 'Before Change of Date',
    nextExecutionDate: '05-12-2026',
    validateCcyHoliday: 'No',
    autopost: 'Yes',
    carryFrwdIfFailed: 'Yes',
    acceptanceEvent: 'SET_UP SI',
    headerDebitAccountId: '7500001482',
    collectChargesForModification: 'No',
    createMemoPadEntry: 'No',
    debitAccount: '7500001482',
    creditAccount: '7500001474',
    currency: 'BMD',
    amount: '500',
    debitCollectFees: 'yes',
    creditCollectFees: 'no',
  },
  {
    instance: 2,
    flowName: 'standinginstructions',
    name: 'HSSIM - verify standing instruction',
    sharedKey: 'standingInstructionId',
    menuOption: 'HSSIM',
    function: 'Verify',
    enabled: 'Y',
    siSerialNumber: '',
  },
  {
    instance: 3,
    flowName: 'standinginstructions',
    name: 'HSSIM - probe menu codes',
    sharedKey: '',
    menuOption: 'HSSIM',
    function: 'Probe',
    enabled: 'Y',
    menuProbeCandidates: JSON.stringify(['HSIM', 'HSTM', 'HSTD', 'HSTDM', 'STDM', 'HSTDI', 'HSIMM', 'HSSM']),
    targetMenuLabel: 'Standing Instruction',
  },
  {
    instance: 4,
    flowName: 'standinginstructions',
    name: 'HAFSM/HSTM - SI not suspended when account freeze is cancelled',
    sharedKey: '',
    menuOption: 'HAFSM',
    function: 'Freeze/Cancel/Inquire',
    enabled: 'Y',
    accountId: '7710003367',
    freezeCode: 'Total Freeze',
    freezeReasonCode: '31015',
    freezeMenuOption: 'HAFSM',
    inquiryMenuOption: 'HSTM',
  },
];

const ws = xlsx.utils.json_to_sheet(rows);
wb.Sheets['standinginstructions'] = ws;

// Ensure the sheet is included in the workbook's SheetNames list.
if (!wb.SheetNames.includes('standinginstructions')) {
  wb.SheetNames.push('standinginstructions');
}

xlsx.writeFile(wb, excelPath);
console.log(`Created/updated 'standinginstructions' sheet in ${excelPath}`);
