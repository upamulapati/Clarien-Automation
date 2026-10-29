const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const EXCEL = path.resolve(__dirname, '../data/test-data.xlsx');
const BAK = EXCEL + '.bak.dropdowns';
const SHEETS = ['SavingsAccountData', 'CurrentAccountData'];

// Dropdown / radio option lists keyed by the camelCase Excel column header.
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
  'Print Statement': ['Yes', 'No'],
  'Print Advice for Standing Instruction': ['Yes', 'No'],
  'Print Deposit Notice': ['Yes', 'No'],
  'Print Loan Notice': ['Yes', 'No'],
  'Interest Certificate': ['Yes', 'No'],
  'Interest Rate Change Advice': ['Yes', 'No'],
  linkToOperativeAccount: ['Yes', 'No'],
  collectFee: ['Yes', 'No'],
  'Add related parties': ['Yes', 'No'],
  'Sheet': ['Main', 'Related Party'],
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

async function main() {
  if (!fs.existsSync(EXCEL)) {
    throw new Error(`Workbook not found: ${EXCEL}`);
  }

  // Back up the current workbook before modifying it.
  fs.copyFileSync(EXCEL, BAK);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL);

  // Apply data validation to matching columns in the target sheets.
  for (const sheetName of SHEETS) {
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) {
      console.log(`Sheet not found: ${sheetName}`);
      continue;
    }

    const headerRow = ws.getRow(1);
    const headerMap = {};
    let lastCol = 0;
    headerRow.eachCell((cell, colNumber) => {
      const val = cell.value;
      if (val != null) headerMap[String(val)] = colNumber;
      if (colNumber > lastCol) lastCol = colNumber;
    });

    // Add the dropdown source values as hidden columns on the far right of
    // the same sheet. This avoids creating a new worksheet that can trigger
    // Excel content-type issues.
    const listRefs = {};
    let listOffset = 1;
    for (const [key, values] of Object.entries(DROPDOWN_VALUES)) {
      const listCol = lastCol + listOffset;
      const listLetter = getColumnLetter(listCol);
      const listColumn = ws.getColumn(listCol);
      listColumn.values = values;
      listColumn.hidden = true;
      const lastRow = values.length;
      listRefs[key] = `=$${listLetter}$1:$${listLetter}$${lastRow}`;
      listOffset++;
    }

    for (const [key, values] of Object.entries(DROPDOWN_VALUES)) {
      const colNumber = headerMap[key];
      if (!colNumber) continue;
      const letter = getColumnLetter(colNumber);
      const range = `${letter}2:${letter}1048576`;
      ws.dataValidations.add(range, {
        type: 'list',
        allowBlank: true,
        showInputMessage: false,
        showErrorMessage: true,
        error: 'Please select a value from the list',
        errorStyle: 'stop',
        formulae: [listRefs[key]],
      });
      console.log(`Applied dropdown: ${sheetName}.${key} => ${listRefs[key]}`);
    }
  }

  await workbook.xlsx.writeFile(EXCEL);
  console.log(`Updated dropdowns in ${EXCEL}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
