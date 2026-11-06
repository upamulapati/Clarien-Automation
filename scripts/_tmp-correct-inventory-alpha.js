const xlsx = require('xlsx');
const path = require('path');

const excelPath = path.resolve(__dirname, '../data/test-data.xlsx');
const wb = xlsx.readFile(excelPath);
const ws = wb.Sheets['inventorymaintainence'];
if (!ws) {
  console.log('Sheet not found');
  process.exit(1);
}

const newCol = xlsx.utils.decode_range(ws['!ref']).e.c;

// Clear the value from the wrong row (row index 2, verify-vault).
const wrongAddr = xlsx.utils.encode_cell({ r: 2, c: newCol });
if (ws[wrongAddr]) {
  ws[wrongAddr] = { t: 's', v: '' };
}

// Set the value in the double-lock add row (row index 3, Excel row 4).
const rightAddr = xlsx.utils.encode_cell({ r: 3, c: newCol });
ws[rightAddr] = { t: 'n', v: 7 };

xlsx.writeFile(wb, excelPath);
console.log(`Corrected InventoryAlpha: 7 now at ${rightAddr}, cleared ${wrongAddr}`);
