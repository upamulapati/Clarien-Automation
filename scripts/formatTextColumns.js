const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const JSZip = require('jszip');

const EXCEL = path.resolve(__dirname, '../data/test-data.xlsx');
const SHEETS = ['SavingsAccountData', 'CurrentAccountData'];
const TEXT_COLUMNS = ['cifCode', 'relatedPartyCifId', 'sectorCode', 'subsectorCode'];
const TEXT_NUM_FMT_ID = 164;
const TEXT_FORMAT_CODE = '@';

function addTextStyle(stylesXml) {
  const textNumFmt = `<numFmt numFmtId="${TEXT_NUM_FMT_ID}" formatCode="${TEXT_FORMAT_CODE}" />`;

  if (!stylesXml.includes(`<numFmt numFmtId="${TEXT_NUM_FMT_ID}"`)) {
    if (stylesXml.includes('<numFmts')) {
      stylesXml = stylesXml.replace(/<numFmts count="(\d+)"\s*>(.*?)<\/numFmts>/, (m, count, inner) => {
        return `<numFmts count="${parseInt(count, 10) + 1}">${inner}${textNumFmt}</numFmts>`;
      });
    } else {
      stylesXml = stylesXml.replace('<fonts', `<numFmts count="1">${textNumFmt}</numFmts><fonts`);
    }
  }

  const cellXfsMatch = stylesXml.match(/<cellXfs count="(\d+)"\s*>(.*?)<\/cellXfs>/);
  let textStyleIndex;
  const textXf = `<xf numFmtId="${TEXT_NUM_FMT_ID}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" />`;

  if (!cellXfsMatch) {
    textStyleIndex = 0;
    stylesXml = stylesXml.replace('<cellStyles', `<cellXfs count="1">${textXf}</cellXfs><cellStyles`);
  } else {
    const xfs = [...cellXfsMatch[2].matchAll(/<xf[^>]*\/>/g)];
    const existing = xfs.findIndex((match) => match[0].includes(`numFmtId="${TEXT_NUM_FMT_ID}"`));
    if (existing !== -1) {
      textStyleIndex = existing;
    } else {
      textStyleIndex = xfs.length;
      stylesXml = stylesXml.replace(/<cellXfs count="(\d+)"\s*>(.*?)<\/cellXfs>/, (m, count, inner) => {
        return `<cellXfs count="${parseInt(count, 10) + 1}">${inner}${textXf}</cellXfs>`;
      });
    }
  }

  return { stylesXml, textStyleIndex };
}

function mergeTextFormatCols(sheetXml, colIndexes, textStyleIndex) {
  if (colIndexes.length === 0) return sheetXml;

  const textStyleAttr = ` style="${textStyleIndex}" customFormat="1"`;

  if (sheetXml.indexOf('<cols>') !== -1) {
    return sheetXml.replace(/<cols>(.*?)<\/cols>/, (match, inner) => {
      const seen = new Set();
      const cols = [];
      const colRegex = /<col[^>]*\/>/g;
      let m;
      while ((m = colRegex.exec(inner)) !== null) {
        let col = m[0];
        const minMatch = col.match(/\smin="(\d+)"/);
        if (!minMatch) continue;
        const min = parseInt(minMatch[1], 10);
        if (seen.has(min)) continue;
        seen.add(min);

        if (colIndexes.includes(min)) {
          col = col
            .replace(/\sstyle="[^"]*"/, '')
            .replace(/\scustomFormat="[^"]*"/, '')
            .replace('/>', `${textStyleAttr} />`);
        }
        cols.push(col);
      }

      for (const c of colIndexes) {
        if (!seen.has(c)) {
          cols.push(`<col min="${c}" max="${c}"${textStyleAttr} />`);
          seen.add(c);
        }
      }

      cols.sort((a, b) => {
        const am = parseInt(a.match(/\smin="(\d+)"/)[1], 10);
        const bm = parseInt(b.match(/\smin="(\d+)"/)[1], 10);
        return am - bm;
      });

      return `<cols>${cols.join('')}</cols>`;
    });
  }

  const cols = colIndexes
    .map((c) => `<col min="${c}" max="${c}"${textStyleAttr} />`)
    .join('');
  return sheetXml.replace('<sheetData>', `<cols>${cols}</cols><sheetData>`);
}

async function main() {
  const wb = XLSX.readFile(EXCEL);
  const zip = await JSZip.loadAsync(fs.readFileSync(EXCEL));

  const workbookXml = await zip.file('xl/workbook.xml').async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');

  const nameToRid = {};
  let m;
  const sheetRegex = /<sheet[^>]+name="([^"]+)"[^>]*\s+r:id="([^"]+)"/g;
  while ((m = sheetRegex.exec(workbookXml)) !== null) {
    nameToRid[m[1]] = m[2];
  }

  const ridToPath = {};
  const relRegex = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g;
  while ((m = relRegex.exec(relsXml)) !== null) {
    ridToPath[m[1]] = m[2];
  }

  const stylesXml = await zip.file('xl/styles.xml').async('string');
  const { stylesXml: newStylesXml, textStyleIndex } = addTextStyle(stylesXml);
  zip.file('xl/styles.xml', newStylesXml);

  for (const sheetName of SHEETS) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const colIndexes = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (!cell || cell.v == null) continue;
      if (TEXT_COLUMNS.includes(String(cell.v))) {
        colIndexes.push(c + 1);
      }
    }
    if (colIndexes.length === 0) continue;

    const rid = nameToRid[sheetName];
    if (!rid) continue;
    const target = ridToPath[rid];
    if (!target) continue;
    const sheetPath = 'xl/' + target.replace(/^\/+/, '');

    const sheetXml = await zip.file(sheetPath).async('string');
    const newSheetXml = mergeTextFormatCols(sheetXml, colIndexes, textStyleIndex);
    if (newSheetXml !== sheetXml) {
      zip.file(sheetPath, newSheetXml);
      console.log(`Formatted as text: ${sheetName} - columns ${colIndexes.join(', ')} (style index ${textStyleIndex})`);
    } else {
      console.log(`Text columns already formatted: ${sheetName}`);
    }
  }

  const outBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  fs.writeFileSync(EXCEL, outBuffer);
  console.log(`Updated text formatting in ${EXCEL}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
