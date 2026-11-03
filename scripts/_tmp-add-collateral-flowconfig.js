const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'data', 'test-data.xlsx');
if (!fs.existsSync(file)) {
  throw new Error(`Workbook not found: ${file}`);
}

const wb = xlsx.readFile(file);
const ws = wb.Sheets['FlowConfig'];
const existing = ws ? xlsx.utils.sheet_to_json(ws, { defval: '' }) : [];

// Remove any previous Collateral Lodgement flow rows to avoid duplicates.
const cleaned = existing.filter(
  (r) => String(r.flowName).toLowerCase() !== 'collaterallodgement'
);

const newRows = [
  {
    flowName: 'collaterallodgement',
    step: 1,
    spec: 'tests/Finacle/Collaterallodgement/collaterallodgement.spec.ts',
    dataSheet: 'collaterallodgement',
    dataRowId: '1,2,3,4,5,6,7,8,9',
    enabled: 'Y',
    sharedStateIn: '',
    sharedStateOut: 'collateralId',
    customerType: 'collaterallodgement',
  },
  {
    flowName: 'collaterallodgement',
    step: 2,
    spec: 'tests/Finacle/Collaterallodgement/collaterallodgementverification.spec.ts',
    dataSheet: 'collaterallodgement',
    dataRowId: '1',
    enabled: 'Y',
    sharedStateIn: 'collateralId',
    sharedStateOut: '',
    customerType: 'collaterallodgement',
  },
  {
    flowName: 'collaterallodgement',
    step: 3,
    spec: 'tests/Finacle/Collaterallodgement/collaterallodgementmodification.spec.ts',
    dataSheet: 'collaterallodgement',
    dataRowId: '1',
    enabled: 'Y',
    sharedStateIn: 'collateralId',
    sharedStateOut: '',
    customerType: 'collaterallodgement',
  },
  {
    flowName: 'collaterallodgement',
    step: 4,
    spec: 'tests/Finacle/Collaterallodgement/collaterallodgementmodifyverification.spec.ts',
    dataSheet: 'collaterallodgement',
    dataRowId: '1',
    enabled: 'Y',
    sharedStateIn: 'collateralId',
    sharedStateOut: '',
    customerType: 'collaterallodgement',
  },
  {
    flowName: 'collaterallodgement',
    step: 5,
    spec: 'tests/Finacle/Collaterallodgement/collaterallodgementlinking.spec.ts',
    dataSheet: 'collaterallodgement',
    dataRowId: '1',
    enabled: 'Y',
    sharedStateIn: 'collateralId',
    sharedStateOut: '',
    customerType: 'collaterallodgement',
  },
  {
    flowName: 'collaterallodgement',
    step: 6,
    spec: 'tests/Finacle/Collaterallodgement/collaterallodgementlinkingverification.spec.ts',
    dataSheet: 'collaterallodgement',
    dataRowId: '1',
    enabled: 'Y',
    sharedStateIn: 'collateralId',
    sharedStateOut: '',
    customerType: 'collaterallodgement',
  },
  {
    flowName: 'collaterallodgement',
    step: 7,
    spec: 'tests/Finacle/Collaterallodgement/collaterallodgementunlinking.spec.ts',
    dataSheet: 'collaterallodgement',
    dataRowId: '1',
    enabled: 'Y',
    sharedStateIn: 'collateralId',
    sharedStateOut: '',
    customerType: 'collaterallodgement',
  },
  {
    flowName: 'collaterallodgement',
    step: 8,
    spec: 'tests/Finacle/Collaterallodgement/collaterallodgementunlinkingverification.spec.ts',
    dataSheet: 'collaterallodgement',
    dataRowId: '1',
    enabled: 'Y',
    sharedStateIn: 'collateralId',
    sharedStateOut: '',
    customerType: 'collaterallodgement',
  },
  {
    flowName: 'collaterallodgement',
    step: 9,
    spec: 'tests/Finacle/Collaterallodgement/collaterallodgementspguarantee.spec.ts',
    dataSheet: 'collaterallodgement',
    dataRowId: '1',
    enabled: 'Y',
    sharedStateIn: 'collateralId',
    sharedStateOut: '',
    customerType: 'collaterallodgement',
  },
  {
    flowName: 'collaterallodgement',
    step: 10,
    spec: 'tests/Finacle/Collaterallodgement/collaterallodgementspimmovable.spec.ts',
    dataSheet: 'collaterallodgement',
    dataRowId: '1',
    enabled: 'Y',
    sharedStateIn: 'collateralId',
    sharedStateOut: '',
    customerType: 'collaterallodgement',
  },
  {
    flowName: 'collaterallodgement',
    step: 11,
    spec: 'tests/Finacle/Collaterallodgement/collaterallodgementspvalidations.spec.ts',
    dataSheet: 'collaterallodgement',
    dataRowId: '1',
    enabled: 'Y',
    sharedStateIn: 'collateralId',
    sharedStateOut: '',
    customerType: 'collaterallodgement',
  },
];

const combined = [...cleaned, ...newRows];
const newWs = xlsx.utils.json_to_sheet(combined);
wb.Sheets['FlowConfig'] = newWs;

xlsx.writeFile(wb, file);
console.log(`Added ${newRows.length} Collateral Lodgement steps to FlowConfig.`);
