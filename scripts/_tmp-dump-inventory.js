const xlsx = require('xlsx');
const path = require('path');

const excelPath = path.resolve(__dirname, '../data/test-data.xlsx');
const wb = xlsx.readFile(excelPath);
const ws = wb.Sheets['inventorymaintainence'];
if (!ws) {
  console.log('Sheet not found');
  process.exit(1);
}

const rows = xlsx.utils.sheet_to_json(ws, { defval: '', header: 1 });
console.log(JSON.stringify(rows, null, 2));
