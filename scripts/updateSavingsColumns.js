const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const EXCEL = path.resolve(__dirname, '../data/test-data.xlsx');
const BAK = EXCEL + '.bak';

// Unique camelCase headers for the SavingsAccountData sheet.
const SAVINGS_EXTRA_COLUMNS = [
  // General Details
  'relativeToStaff',
  'relativeStaffId',
  'chargeLevelCode',
  'accountManagerId',
  'accountStatement',
  // Interest Details
  'payInterest',
  'collectInterest',
  'interestCreditAccount',
  'interestDebitAccount',
  'interestRateCode',
  'interestCreditAccountId',
  'accountPegged',
  'peggingReviewDate',
  'nextInterestCalculationDateCr',
  'peggingFrequencyMonths',
  'peggingFrequencyDays',
  'taxCategory',
  'withholdingTaxLevel',
  'withholdingTaxFloorLimit',
  'withholdingTaxPercent',
  'withholdingTaxBorneBy',
  'tdsOperativeAccountId',
  // Scheme Details
  'nomination',
  'preferredNominationType',
  'debitBalanceLimit',
  'maxAllowedLimit',
  'schemeSanctionLimit',
  'schemeExpiryDate',
  'accountMinBalanceIndicator',
  'accountMinBalance',
  'sweepInMinBalance',
  // Others Details
  'externalSystemPricingFor',
  'relationshipPricingId',
  'pricingEffectiveDate',
  'pricingReviewDate',
  'dsaInformation',
  'sourcingDealerId',
  'disbursingDealerId',
  // Account Limits
  'accountLimitsSanctionLimit',
  'sanctionDate',
  'accountLimitsReviewDate',
  'sanctionAuthority',
  'limitReferenceNo',
  'accountLimitsExpiryDate',
  'documentDate',
  'drawingPowerIndicator',
  'drawingPowerPercent',
  'drawingPower',
  // Document Details
  'scanDetails',
  'receivedDate',
  'documentExpiryDate',
  // FFD Parameters
  'ffdSchemeCode',
  'autoSweep',
  'sweepOutInMultiplesOf',
  'sweepOutDepositPeriodMonths',
  'sweepOutDepositPeriodDays',
  'sweepOutFrequency',
  'autoRenewal',
  'maxRenewalAllowed',
  'autoRenewalPeriodMonths',
  'autoRenewalPeriodDays',
  'autoRenewalScheme',
  'linkToOperativeAccount',
  'masterAccountNo',
  // Related Party Details
  'relationType',
  'relatedPartyCifId',
  // Print / advice preferences
  'Print Statement',
  'Print Advice for Standing Instruction',
  'Print Deposit Notice',
  'Print Loan Notice',
  'Interest Certificate',
  'Interest Rate Change Advice',
  'foreignTaxReportable',
  'taxReportingCountry',
  'taxReportingStatus',
  'lastTaxReportingReviewDate',
  'nextTaxReportingReviewDate',
  // Payment System
  'paymentSystemAccountId',
  'amountType',
  'paymentSystemPercent',
  'paymentSystemAmount',
  'roundOffIndicator',
  'roundOffAmount',
  'collectFee',
  'rateCode',
  'reportCode',
  // MIS Codes
  'sectorCode',
  'subsectorCode',
];

const NEW_COLUMNS = [
  'Print Statement',
  'Print Advice for Standing Instruction',
  'Print Deposit Notice',
  'Print Loan Notice',
  'Interest Certificate',
  'Interest Rate Change Advice',
];

const LEGACY_COLUMNS = [
  'printStatement',
  'printAdviceForStandingInstruction',
  'printDepositNotice',
  'printLoanNotice',
  'interestCertificate',
  'interestRateChangeAdvice',
];

function insertAndFillPrintColumns(wb) {
  const ws = wb.Sheets['SavingsAccountData'];
  if (!ws) {
    console.log('Sheet not found: SavingsAccountData');
    return;
  }

  const aoa = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (aoa.length === 0) {
    console.log('SavingsAccountData: empty sheet');
    return;
  }

  const oldHeaders = aoa[0];
  const relatedIndex = oldHeaders.indexOf('relatedPartyCifId');
  if (relatedIndex < 0) {
    console.log('SavingsAccountData: relatedPartyCifId column not found');
    return;
  }

  const newColSet = new Set(NEW_COLUMNS);
  const legacyColSet = new Set(LEGACY_COLUMNS);
  const newAoa = [];

  for (let r = 0; r < aoa.length; r++) {
    const oldRow = aoa[r];
    const newRow = [];

    // Keep columns up to and including relatedPartyCifId, dropping any stray duplicates.
    for (let c = 0; c <= relatedIndex; c++) {
      const h = oldHeaders[c];
      if (newColSet.has(h) || legacyColSet.has(h)) continue;
      newRow.push(oldRow[c]);
    }

    // Insert the six print/advice columns with No values for data rows.
    for (const col of NEW_COLUMNS) {
      newRow.push(r === 0 ? col : 'No');
    }

    // Keep the remaining columns, dropping any old/new duplicates.
    for (let c = relatedIndex + 1; c < oldRow.length; c++) {
      const h = oldHeaders[c];
      if (newColSet.has(h) || legacyColSet.has(h)) continue;
      newRow.push(oldRow[c]);
    }

    newAoa.push(newRow);
  }

  wb.Sheets['SavingsAccountData'] = xlsx.utils.aoa_to_sheet(newAoa);
  console.log(`SavingsAccountData: inserted/updated ${NEW_COLUMNS.length} columns after relatedPartyCifId and set all rows to No`);
}

function insertNewSavingsColumns(wb) {
  const ws = wb.Sheets['SavingsAccountData'];
  if (!ws) {
    console.log('Sheet not found: SavingsAccountData');
    return;
  }

  const aoa = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (aoa.length === 0) {
    console.log('SavingsAccountData: empty sheet');
    return;
  }

  const newCols = [
    'Location Code',
    'Add related parties',
    'Sheet',
    'Relation Code',
    'Designation Code',
  ];

  // Save existing values and remove any stray occurrences of the new columns.
  const saved = {};
  for (const col of newCols) {
    const idx = aoa[0].indexOf(col);
    if (idx >= 0) {
      saved[col] = aoa.map((row) => row[idx]);
      for (const row of aoa) row.splice(idx, 1);
    }
  }

  const functionIdx = aoa[0].indexOf('functionOption');
  const masterAccountNoIdx = aoa[0].indexOf('masterAccountNo');
  const relationIdx = aoa[0].indexOf('relationType');

  const insertions = [];
  if (functionIdx >= 0) {
    insertions.push({
      after: functionIdx,
      col: 'Location Code',
      values: saved['Location Code'] || aoa.map(() => ''),
    });
  }
  if (masterAccountNoIdx >= 0) {
    insertions.push({
      after: masterAccountNoIdx,
      col: 'Add related parties',
      values: saved['Add related parties'] || aoa.map(() => ''),
    });
    insertions.push({
      after: masterAccountNoIdx,
      col: 'Sheet',
      values: saved['Sheet'] || aoa.map(() => ''),
    });
  }
  if (relationIdx >= 0) {
    insertions.push({
      after: relationIdx,
      col: 'Relation Code',
      values: saved['Relation Code'] || aoa.map(() => ''),
    });
    insertions.push({
      after: relationIdx,
      col: 'Designation Code',
      values: saved['Designation Code'] || aoa.map(() => ''),
    });
  }

  const newAoa = aoa.map((row, r) => {
    const newRow = [];
    for (let c = 0; c < row.length; c++) {
      newRow.push(row[c]);
      for (const ins of insertions) {
        if (ins.after === c) {
          newRow.push(r === 0 ? ins.col : (ins.values[r] ?? ''));
        }
      }
    }
    return newRow;
  });

  wb.Sheets['SavingsAccountData'] = xlsx.utils.aoa_to_sheet(newAoa);
  console.log(
    'SavingsAccountData: inserted Location Code after functionOption, Add related parties/Sheet after masterAccountNo, and Relation Code/Designation Code after relationType'
  );
}

if (fs.existsSync(EXCEL) && !fs.existsSync(BAK)) {
  fs.copyFileSync(EXCEL, BAK);
  console.log(`Backed up workbook to ${BAK}`);
}

const wb = xlsx.readFile(EXCEL);
insertNewSavingsColumns(wb);
insertAndFillPrintColumns(wb);

xlsx.writeFile(wb, EXCEL, { bookType: 'xlsx' });
console.log(`Updated ${EXCEL}`);
