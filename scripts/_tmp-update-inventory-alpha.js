const xlsx = require('xlsx');
const path = require('path');

const excelPath = path.resolve(__dirname, '../data/test-data.xlsx');
const wb = xlsx.readFile(excelPath);
const ws = wb.Sheets['inventorymaintainence'];
if (!ws) {
  console.log('Sheet not found');
  process.exit(1);
}

// Add an 'InventoryAlpha' column after the existing last column.
const range = xlsx.utils.decode_range(ws['!ref']);
const newCol = range.e.c + 1;

// Set header in row 1 (row index 0).
const headerAddr = xlsx.utils.encode_cell({ r: 0, c: newCol });
ws[headerAddr] = { t: 's', v: 'InventoryAlpha' };

// Fill 7 in the double-lock scenario row (row index 2, which is Excel row 3).
const dataAddr = xlsx.utils.encode_cell({ r: 2, c: newCol });
ws[dataAddr] = { t: 'n', v: 7 };

// Extend the worksheet range to include the new column.
range.e.c = newCol;
ws['!ref'] = xlsx.utils.encode_range(range);

xlsx.writeFile(wb, excelPath);
console.log(`Added InventoryAlpha column with value 7 at ${dataAddr}`);
